#!/usr/bin/env node
/**
 * Phase 3.4 (esy-search) — Pagefind postbuild indexer.
 *
 * Runs INSIDE the `build` script (`next build && node postbuild-pagefind.js`).
 * This is load-bearing: Vercel's build orchestrator sweeps `.next` before the
 * npm `postbuild` lifecycle hook fires, so a `postbuild` script finds no `.next`
 * and skips. Running it chained directly after `next build` is the only moment
 * `.next` provably still exists on Vercel. The script always exits 0 on error,
 * so a Pagefind failure degrades the search (curated-INDEX fallback) without
 * ever failing the deploy.
 *
 * Pagefind needs final prerendered HTML documents on disk. We index the WHOLE
 * `.next` build dir — Pagefind walks it and recovers the prerendered HTML
 * bodies, emitting into `.next/static/chunks/app/pagefind` so Vercel serves the
 * index as static chunks at `/_next/static/chunks/app/pagefind/pagefind.js`.
 * All content routes are `○` static-prerendered (verified in the build table),
 * so their HTML is present in `.next`. Pagefind only indexes HTML files by
 * default, so the JS/CSS chunks under `.next/static` are ignored automatically.
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
