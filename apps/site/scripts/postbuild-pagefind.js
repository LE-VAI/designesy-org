#!/usr/bin/env node
/**
 * Phase 3.4 (esy-search) — Pagefind postbuild indexer.
 *
 * Runs after `next build`. Pagefind needs final prerendered HTML documents on
 * disk; Next's App Router (Node-server build) emits them under
 * `.next/server/app/**\/*.html` alongside internal artifacts we must NOT index
 * (404, _not-found, _error). This script stages only real page documents, then
 * invokes Pagefind against the clean staging dir so the search index contains
 * exactly the site's public pages — no cache, no internals, no duplicates.
 *
 * Output: `public/pagefind/` (WASM stub + lazy shards), served as static
 * assets and lazy-loaded by the command palette on first keystroke.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const APP_HTML_DIR = path.join(ROOT, '.next', 'server', 'app');
const STAGE_DIR = path.join(ROOT, '.pagefind-stage');
const OUT_DIR = path.join(ROOT, 'public', 'pagefind');

// Internal Next artifacts that live beside real pages but are not content.
const EXCLUDE_BASENAMES = new Set([
  '404.html',
  '500.html',
  '_not-found.html',
  '_error.html',
  'index.html', // root shell — the homepage is staged explicitly below from '/'
]);

/** Recursively collect *.html files, returning absolute paths. */
function collectHtml(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectHtml(full, acc);
    else if (e.isFile() && e.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

function main() {
  if (!fs.existsSync(APP_HTML_DIR)) {
    // Not a prerendered Node-server build (e.g. output:'export', or a dev
    // build). Pagefind has nothing to stage — skip gracefully rather than
    // fail the build. The palette falls back to the curated INDEX filter.
    console.warn('[postbuild-pagefind] no .next/server/app — skipping index build');
    return;
  }

  // Clean staging dir.
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  const all = collectHtml(APP_HTML_DIR);
  const pages = all.filter((f) => {
    const rel = path.relative(APP_HTML_DIR, f);
    const base = path.basename(f);
    const segments = rel.split(path.sep);
    // Keep only real page documents: a .html at depth>=1 whose basename is not
    // an internal artifact. Next names a page's HTML file after its route
    // segment (e.g. /score -> score.html, /contracts/a11y -> contracts/a11y.html).
    return segments.length >= 1 && !EXCLUDE_BASENAMES.has(base) && !base.startsWith('_');
  });

  if (pages.length === 0) {
    console.warn('[postbuild-pagefind] no page HTML found — skipping index build');
    return;
  }

  // Stage each page under a clean route-shaped path so Pagefind's inferred URL
  // matches the live route (dir/name.html -> /dir/name). Strip the .html so
  // Pagefind emits clean trailing-slash-less URLs that match our routes.
  for (const f of pages) {
    const rel = path.relative(APP_HTML_DIR, f);
    const noExt = rel.replace(/\.html$/, '');
    const dest = path.join(STAGE_DIR, `${noExt}.html`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f, dest);
  }

  // Index the staging dir. --site <stage> treats staged paths as the site root,
  // producing URLs like /contracts/a11y that match the deployed routes.
  const pagefindBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'pagefind.cmd' : 'pagefind');
  const args = ['--site', STAGE_DIR, '--output-path', OUT_DIR];
  console.log(`[postbuild-pagefind] indexing ${pages.length} pages -> ${path.relative(ROOT, OUT_DIR)}`);
  try {
    execFileSync(pagefindBin, args, { stdio: 'inherit' });
  } catch (err) {
    // On Vercel the binary is freshly installed; a failure here should not
    // fail the whole deploy (search degrades to the curated INDEX). Surface
    // the error loudly but exit 0.
    console.error('[postbuild-pagefind] pagefind failed — search will fall back to INDEX:', err.message);
  } finally {
    fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  }
}

main();
