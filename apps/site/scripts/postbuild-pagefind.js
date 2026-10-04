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

// Next's file-trace manifests (page.js.nft.json, route.js.nft.json). Build
// metadata, never content: they must not enter the index under any name.
const TRACE_MANIFEST = /\.nft\.json$/i;

// The public JSON endpoints Find may index: route (as served) and the title a
// result row shows, matching the palette's curated INDEX rows. Add an endpoint
// here, never by walking the build output (see buildStageIndex).
const JSON_ENDPOINTS = [
  { route: '/open.json', title: 'open.json' },
  { route: '/.well-known/agent.json', title: 'agent.json' },
  { route: '/contracts/design-system.json', title: 'design-system.json' },
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

  // Also stage the public JSON endpoints as searchable HTML wrappers, so their
  // keys and values reach Find. Pagefind only indexes HTML, so each body is
  // wrapped in a minimal document.
  //
  // An explicit ALLOWLIST, never a walk. The only *.json files Next writes
  // under server/app are its *.nft.json file-trace manifests (lists of
  // node_modules paths). Walking them indexed 281 junk "pages" (page_count 372
  // against ~91 real ones), boosted their titles over real pages, and published
  // the path lists as public fragments. A static route handler's response is
  // prerendered to <route>.body; a force-dynamic one (design-system.json
  // negotiates on Accept) has no body at build time, is skipped here, and is
  // reached through the palette's curated INDEX instead.
  let jsonCount = 0;
  const jsonSrcDir = path.join(SITE_DIR, 'server', 'app');
  for (const { route, title } of JSON_ENDPOINTS) {
    if (TRACE_MANIFEST.test(route)) continue; // never a build trace, whatever the list says
    const bodyPath = path.join(jsonSrcDir, `${route.replace(/^\//, '')}.body`);
    let jsonContent;
    try {
      jsonContent = fs.readFileSync(bodyPath, 'utf8');
    } catch {
      console.log(`[postbuild-pagefind] ${route}: no prerendered body (dynamic route), not indexed`);
      continue;
    }

    // The staged file is not a route, so the wrapper names its real one in
    // meta (`href`), which the palette navigates to. lang="en" puts it in the
    // same language index as the pages; without it Pagefind files it under an
    // "unknown" index that searches from English pages never load.
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const wrapper =
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title></head>` +
      `<body data-pagefind-body data-pagefind-meta="href:${esc(route)}"><h1>${esc(title)}</h1>` +
      `<pre>${esc(jsonContent)}</pre></body></html>`;

    // Staged under endpoints/ with a .json.html name: if the meta were ever
    // lost, cleanHref() drops a *.json route instead of offering a dead link.
    const dest = path.join(STAGE_DIR, 'endpoints', `${path.basename(route)}.html`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, wrapper);
    jsonCount++;
  }
  console.log(`[postbuild-pagefind] staged ${jsonCount} of ${JSON_ENDPOINTS.length} allowlisted JSON endpoint(s) as searchable HTML wrappers`);

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

  // Run Pagefind's own entry script with this node, not the .bin shim: since
  // Node 20.12 / 22 (CVE-2024-27980) spawning a .cmd without a shell throws
  // EINVAL on Windows, and a shell would need every path quoted. The shim is
  // a one-line wrapper around this same file.
  const pagefindEntry = path.join(ROOT, 'node_modules', 'pagefind', 'lib', 'runner', 'bin.cjs');

  const args = [
    // Index the STAGED route tree (not .next/server/app), so result URLs are
    // clean routes (e.g. /work/continuity) instead of build-chunk paths.
    '--site', STAGE_DIR,
    '--output-path', OUT_DIR,
  ];

  console.log(`[postbuild-pagefind] indexing ${path.relative(ROOT, STAGE_DIR)} -> ${path.relative(ROOT, OUT_DIR)}`);
  try {
    execFileSync(process.execPath, [pagefindEntry, ...args], { stdio: 'inherit' });
    // Sanity: report how many fragments were written so a silent empty index is
    // visible in the build log rather than discovered as 404s in the browser.
    // Pagefind 1.x writes page fragments and index shards into fragment/ and
    // index/, so the top level alone always counted 0 of either.
    const countIn = (sub) => {
      try { return fs.readdirSync(path.join(OUT_DIR, sub)).length; } catch { return 0; }
    };
    console.log(
      `[postbuild-pagefind] index written: ${countIn('fragment')} page fragment(s), ${countIn('index')} index shard(s)`
    );

    // Junk guard: about one document per real public route. More than 1.2x
    // means something other than pages was staged (the *.nft.json walk did
    // exactly that). Warn here, where the cause is; check-search-coverage.js,
    // the next build step, fails the build on it.
    try {
      const { publicRoutes, indexedPageCount, PAGE_COUNT_RATIO } = require('./check-search-coverage.js');
      const { pages, jsonEndpoints } = publicRoutes(SITE_DIR);
      const real = pages.length + jsonEndpoints.length;
      const indexed = indexedPageCount(OUT_DIR);
      const line = `page_count ${indexed} against ${real} public route(s) (${pages.length} page(s) + ${jsonEndpoints.length} JSON endpoint(s)); ceiling ${Math.floor(PAGE_COUNT_RATIO * real)}`;
      if (indexed > PAGE_COUNT_RATIO * real) console.warn(`[postbuild-pagefind] WARNING ${line}: the index holds more than pages`);
      else console.log(`[postbuild-pagefind] ${line}`);
    } catch (e) {
      console.warn(`[postbuild-pagefind] could not measure page_count against the route count: ${e.message}`);
    }

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
