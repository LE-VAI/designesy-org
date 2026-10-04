#!/usr/bin/env node
/**
 * touched-routes — the route set a commit's diff actually affects.
 *
 * Feeds the incremental a11y sweep (a11y-sweep.js) in the visual-gates job.
 * The operator's rule for the sweep (2026-10-04): measure the routes a commit
 * TOUCHES, nothing else. The mapping:
 *
 *   apps/site/app/<...>/page.tsx      -> that page's route
 *   apps/site/app/page.tsx            -> '/'
 *   apps/site/app/frameworks/[slug]   -> '/frameworks' (the index; slug rows
 *                                        are data of one template)
 *   apps/site/next.config.ts          -> FULL (rewrites/redirects serve every
 *                                        route)
 *   apps/site/public/*                -> FULL (assets render wherever they are
 *                                        referenced)
 *   any OTHER file under apps/site/app (globals.css, layout.tsx, lib/*,
 *   per-family css)                   -> FULL set (a shared surface touches
 *                                        every route; measuring all of them is
 *                                        the conservative, correct direction —
 *                                        a false-positive sweep is cheap, a
 *                                        false-negative one is the failure
 *                                        this gate exists to kill)
 *   anything else (scripts, .github)  -> nothing (no rendered surface)
 *
 * USAGE
 *   node scripts/touched-routes.js --base-sha <sha>   # git diff <sha>...HEAD
 * Prints comma-separated routes, or nothing when the diff has no rendered
 * surface. Exits 0 either way — an empty list means the CI step skips the
 * sweep, and a skipped sweep for a scripts-only commit is correct.
 */

const ARGS = process.argv.slice(2);
const i = ARGS.indexOf('--base-sha');
const baseSha = i !== -1 ? ARGS[i + 1] : null;
if (!baseSha) {
  console.error('[touched-routes] --base-sha <sha> is required');
  process.exit(2);
}

const cp = require('node:child_process');
let files;
try {
  files = cp
    .execSync(`git diff --name-only ${baseSha}...HEAD`, { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
} catch (e) {
  console.error(`[touched-routes] git diff failed: ${String(e.message || e).slice(0, 200)}`);
  process.exit(2);
}

if (!files.length) {
  console.log('');
  process.exit(0);
}

const APP = 'apps/site/app/';
let full = false;
const routes = new Set();
for (const f of files) {
  // Shared surface outside app/: next.config.ts rewrites/redirects serve
  // every route, and public/* assets render on any page that references them.
  if (f === 'apps/site/next.config.ts' || f.startsWith('apps/site/public/')) {
    full = true;
    continue;
  }
  if (!f.startsWith(APP)) continue;
  const rel = f.slice(APP.length);
  const pageMatch = rel.match(/^(.*\/)?page\.tsx$/);
  if (pageMatch && !rel.includes('[')) {
    const dir = pageMatch[1] ? pageMatch[1].replace(/\/$/, '') : '';
    routes.add(dir ? '/' + dir : '/');
    continue;
  }
  if (rel.includes('[slug]')) {
    routes.add('/frameworks');
    continue;
  }
  // Everything else under app/ is shared surface or per-family css.
  full = true;
}

if (full) {
  // The caller resolves FULL itself against next.config.ts; printing the
  // marker keeps the mapping logic here and the route derivation there.
  console.log('FULL');
} else {
  console.log([...routes].join(','));
}
process.exit(0);
