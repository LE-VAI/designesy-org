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

const ROOT = path.resolve(__dirname, '..'); // package root (apps/site), not scripts/
const SITE_DIR = path.join(ROOT, '.next');
const OUT_DIR = path.join(ROOT, '.next', 'static', 'chunks', 'app', 'pagefind');

// Staging directory that mirrors the PUBLIC route tree. Pagefind stores the
// file path of each indexed document as its result `url`, so a clean route
// tree -> clean result URLs (e.g. /work/continuity, not /_next/static/chunks/
// app/server/app/work/continuity.html). Eliminates the query-time prefix
// rewrite in cleanHref() — the index is born with canonical URLs.
const STAGE_DIR = path.join(ROOT, '.next', 'search-stage');

// Next.js internal pages under server/app/ that are NOT real routes and must
// not appear in search results. The glob already restricts to *.html, but
// the postbuild copies anything matching, so filter these out explicitly.
const INTERNAL_PATTERNS = [
  /^_not-found\.html$/i,
  /^_error\.html$/i,
  /^(404|500)\.html$/i,
  // Metadata-route handlers (only relevant if glob is widened beyond *.html)
  /^(icon|apple-icon|favicon|opengraph-image|twitter-image|sitemap|robots|manifest)\./i,
];

/** Walk a directory tree, returning every file path relative to root. */
function walkFiles(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

/** Build a clean route-shaped staging dir from .next/server/app/*.html.
 *  Each <route>.html becomes search-stage/<route>.html so Pagefind stores
 *  /<route>.html as the URL (and with the default keep_index_url:false, the
 *  trailing .html is stripped -> /<route>). Nested index.html files map to
 *  their parent dir. Internal pages (_not-found, _error, 404/500) are
 *  skipped so they never enter the index. */
function buildStageIndex() {
  const srcDir = path.join(SITE_DIR, 'server', 'app');
  if (!fs.existsSync(srcDir)) {
    console.warn('[postbuild-pagefind] no .next/server/app — skipping stage build');
    return false;
  }
  // Clean any prior stage dir so stale pages don't linger from a previous build.
  if (fs.existsSync(STAGE_DIR)) fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  const files = walkFiles(srcDir);
  let copied = 0, skipped = 0;
  for (const rel of files) {
    // Only stage HTML documents (skip .txt/.json/.png route-handler outputs).
    if (!rel.endsWith('.html')) continue;
    // Skip internal Next.js pages by filename (relative to server/app).
    const basename = path.basename(rel);
    if (INTERNAL_PATTERNS.some((re) => re.test(basename))) { skipped++; continue; }
    // Skip metadata-route handler dirs (icon/, opengraph-image/, etc.).
    if (/(^|\/)(icon|apple-icon|favicon|opengraph-image|twitter-image)(\/|$)/.test(rel)) { skipped++; continue; }

    // Map the on-disk path to a clean route path:
    //   work/continuity.html    -> work/continuity.html     (route /work/continuity)
    //   foo/index.html          -> foo.html                (route /foo, not /foo/index)
    //   index.html              -> .html (root)            (handled: "" -> keep as "" = root)
    let routeRel = rel;
    if (/\/index\.html$/i.test(routeRel)) routeRel = routeRel.replace(/\/index\.html$/i, '.html');
    else if (routeRel === 'index.html') routeRel = '.html';

    // Root page: index.html -> ".html" so Pagefind stores URL "/". An empty
    // filename would be skipped by Pagefind, so write to a sentinel the
    // Pagefind glob catches and let cleanHref's /index.html->/ handle it.
    // Simpler: write root as index.html at stage root (route "/").
    if (routeRel === '.html') routeRel = 'index.html';

    const dest = path.join(STAGE_DIR, routeRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(srcDir, rel), dest);
    copied++;
  }
  console.log(`[postbuild-pagefind] staged ${copied} route HTML(s) to ${path.relative(ROOT, STAGE_DIR)} (${skipped} internal skipped)`);

  // Also stage JSON contract/endpoint files as searchable HTML wrappers.
  // Pagefind only indexes HTML, so we wrap each JSON file's content in a
  // minimal HTML document with data-pagefind-body so token names, values,
  // and endpoints become searchable in the command palette.
  let jsonCount = 0;
  const jsonSrcDir = path.join(SITE_DIR, 'server', 'app');
  for (const rel of walkFiles(jsonSrcDir)) {
    if (!rel.endsWith('.json')) continue;
    // Skip metadata-route JSON (icon, manifest, etc.)
    if (INTERNAL_PATTERNS.some((re) => re.test(path.basename(rel)))) continue;

    // Read the JSON content
    let jsonContent;
    try {
      jsonContent = fs.readFileSync(path.join(jsonSrcDir, rel), 'utf8');
    } catch { continue; }

    // Build a minimal HTML wrapper so Pagefind indexes the JSON tokens
    const title = rel.replace(/\.json$/, '').replace(/\//g, ' · ');
    const wrapper = `<!DOCTYPE html><html><head><title>${title}</title></head><body data-pagefind-body><pre>${jsonContent.replace(/</g, '&lt;')}</pre></body></html>`;

    // Map to a clean route path (same logic as HTML files above)
    let routeRel = rel;
    if (/\/index\.json$/i.test(routeRel)) routeRel = routeRel.replace(/\/index\.json$/i, '.json');
    else if (routeRel === 'index.json') routeRel = '.json';
    if (routeRel === '.json') routeRel = 'index.json';

    // Write as .html so Pagefind picks it up
    const dest = path.join(STAGE_DIR, routeRel.replace(/\.json$/, '.json.html'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, wrapper);
    jsonCount++;
  }
  if (jsonCount > 0) {
    console.log(`[postbuild-pagefind] staged ${jsonCount} JSON endpoint(s) as searchable HTML wrappers`);
  }

  return true;
}

function main() {
  if (!fs.existsSync(SITE_DIR)) {
    // No build output (e.g. `next dev`). The palette falls back to the curated
    // INDEX filter. Skip gracefully rather than fail the build.
    console.warn('[postbuild-pagefind] no .next — skipping index build');
    return;
  }

  // Stage a clean route-shaped index dir so Pagefind stores canonical URLs.
  if (!buildStageIndex()) return;

  const pagefindBin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'pagefind.cmd' : 'pagefind'
  );

  const args = [
    // Index the STAGED route tree (not .next/server/app), so result URLs are
    // clean routes (e.g. /work/continuity) instead of build-chunk paths.
    '--site', STAGE_DIR,
    '--output-path', OUT_DIR,
  ];

  console.log(`[postbuild-pagefind] indexing ${path.relative(ROOT, STAGE_DIR)} -> ${path.relative(ROOT, OUT_DIR)}`);
  try {
    execFileSync(pagefindBin, args, { stdio: 'inherit' });
    // Sanity: report how many fragments were written so a silent empty index is
    // visible in the build log rather than discovered as 404s in the browser.
    try {
      const files = fs.readdirSync(OUT_DIR);
      const frags = files.filter((f) => f.endsWith('.pf_fragment') || f.endsWith('.pf_index')).length;
      console.log(`[postbuild-pagefind] index written — ${files.length} files, ${frags} shard(s)`);
    } catch { /* index dir may not exist on failure — already logged by pagefind */ }

    // Patch pagefind.js to append a cache-busting query param to the Worker
    // URL and all WASM shard fetches. Pagefind constructs the Worker URL as
    // `${basePath}pagefind-worker.js` — without a cache-buster, the browser
    // serves a stale cached Worker from a prior deployment that carried an
    // older CSP. We append ?v=<hash> where <hash> is derived from the build
    // ID so every new deployment gets a unique cache-buster.
    const BUILD_ID = (() => {
      try {
        return fs.readFileSync(path.join(SITE_DIR, 'BUILD_ID'), 'utf8').trim();
      } catch {
        return String(Date.now());
      }
    })();
    try {
      const pfJsPath = path.join(OUT_DIR, 'pagefind.js');
      let pfJs = fs.readFileSync(pfJsPath, 'utf8');
      pfJs = pfJs.replace(
        'pagefind-worker.js',
        `pagefind-worker.js?v=${BUILD_ID}`
      );
      fs.writeFileSync(pfJsPath, pfJs);
      console.log(`[postbuild-pagefind] patched pagefind.js with worker cache-buster ?v=${BUILD_ID}`);
    } catch (e) {
      console.warn(`[postbuild-pagefind] could not patch pagefind.js: ${e.message}`);
    }

    // Write a version pointer file so the client can append the same
    // cache-buster to the import() URL for pagefind.js itself. Without this,
    // the browser serves a stale cached pagefind.js from a prior deploy that
    // carried an older CSP — the Worker cache-buster inside pagefind.js
    // would never be reached because the old pagefind.js (without the patch)
    // would run first.
    try {
      fs.writeFileSync(
        path.join(OUT_DIR, 'pagefind-version.json'),
        JSON.stringify({ buildId: BUILD_ID })
      );
      console.log(`[postbuild-pagefind] wrote pagefind-version.json (buildId: ${BUILD_ID})`);
    } catch (e) {
      console.warn(`[postbuild-pagefind] could not write pagefind-version.json: ${e.message}`);
    }
  } catch (err) {
    // A Pagefind failure must not break the deploy — search degrades to the
    // curated INDEX. Surface the error loudly but exit 0.
    console.error('[postbuild-pagefind] pagefind failed — search will fall back to INDEX:', err.message);
  }
}

main();
