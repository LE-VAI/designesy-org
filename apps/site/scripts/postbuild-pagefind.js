#!/usr/bin/env node
/**
 * Phase 3.4 (esy-search) — Pagefind postbuild indexer.
 *
 * Runs after `next build`. Pagefind needs final prerendered HTML documents on
 * disk. On Vercel the intermediate `.next/server/app` tree is cleaned before a
 * `postbuild` script executes (Vercel translates `.next` → Build Output API v3),
 * so we index the WHOLE `.next` build dir — Pagefind walks it and recovers the
 * prerendered HTML bodies. This is the canonical Next.js recipe (pagefind#611,
 * Pagefind-maintainer-endorsed): `--site .next`, output under
 * `.next/static/chunks/app/pagefind` so the client import resolves at
 * `/_next/static/chunks/app/pagefind/pagefind.js`.
 *
 * All content routes here are `○` static-prerendered (verified in the build
 * table), so `.next` contains their final HTML. Internal artifacts
 * (404/_not-found/_error) ship without a public route and are excluded below
 * via `--exclude-selectors` is not needed — Pagefind only indexes files it can
 * map to a URL; the palette ignores RSC payloads because it searches by title
 * and body text.
 *
 * Output: `.next/static/chunks/app/pagefind/` (WASM stub + lazy shards), served
 * by Vercel as static chunks and lazy-loaded by the command palette on first
 * keystroke — zero cost until the user actually searches.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SITE_DIR = path.join(ROOT, '.next');
const OUT_DIR = path.join(ROOT, '.next', 'static', 'chunks', 'app', 'pagefind');

function main() {
  if (!fs.existsSync(SITE_DIR)) {
    // No build output (e.g. `next dev`). The palette falls back to the curated
    // INDEX filter. Skip gracefully rather than fail the build.
    console.warn('[postbuild-pagefind] no .next — skipping index build');
    return;
  }

  const pagefindBin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'pagefind.cmd' : 'pagefind'
  );

  const args = [
    '--site', SITE_DIR,
    '--output-path', OUT_DIR,
    // Exclude Next internals that are not public content.
    '--exclude-selectors', 'script,noscript',
  ];

  console.log(`[postbuild-pagefind] indexing .next -> ${path.relative(ROOT, OUT_DIR)}`);
  try {
    execFileSync(pagefindBin, args, { stdio: 'inherit' });
    // Sanity: report how many fragments were written so a silent empty index is
    // visible in the build log rather than discovered as 404s in the browser.
    try {
      const files = fs.readdirSync(OUT_DIR);
      const frags = files.filter((f) => f.endsWith('.pf_fragment') || f.endsWith('.pf_index')).length;
      console.log(`[postbuild-pagefind] index written — ${files.length} files, ${frags} shard(s)`);
    } catch { /* index dir may not exist on failure — already logged by pagefind */ }
  } catch (err) {
    // A Pagefind failure must not break the deploy — search degrades to the
    // curated INDEX. Surface the error loudly but exit 0.
    console.error('[postbuild-pagefind] pagefind failed — search will fall back to INDEX:', err.message);
  }
}

main();
