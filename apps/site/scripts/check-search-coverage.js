#!/usr/bin/env node
/**
 * search coverage gate — Find's full-text index is loaded, and it holds pages.
 *
 * WHY THIS EXISTS
 * Full-text search never worked in production, and nothing said so. The
 * palette loaded Pagefind with `import(/* @vite-ignore *\/ url)`, a comment
 * only Vite reads. Next builds with webpack, which compiled that call into an
 * empty context module that always throws "Cannot find module"; the loader's
 * `.catch(() => null)` swallowed it, so every search fell back to the curated
 * INDEX while a deployed 372-page index went unrequested.
 *
 * Underneath it sat a second defect that the first one hid. postbuild-pagefind
 * walked .next/server/app for *.json "endpoints", but the only JSON files there
 * are Next's *.nft.json file-trace manifests. It indexed 281 of them: lists of
 * node_modules paths with titles like "contracts · design-system · page.js.nft",
 * boosted over real pages and published as public fragments. Fixing the import
 * alone would have put that junk straight into Find.
 *
 * Both defects were invisible in the build log and in the source review. They
 * live in the BUILD OUTPUT, so this gate reads the build output:
 *
 *   * native-pagefind-import  the client chunk that builds the pagefind.js URL
 *                             hands it to a native import(), not to a webpack
 *                             module call (the empty-context stub is named in
 *                             the finding when it is the cause);
 *   * index-present           pagefind.js, pagefind-entry.json and fragments
 *                             exist (a gate that passes because there was no
 *                             index measured nothing);
 *   * no-trace-manifests      no indexed url or title names a *.nft.json trace;
 *   * fragments-are-routes    every indexed document maps to exactly one
 *                             prerendered public route (a page, or a JSON
 *                             endpoint named by its wrapper's `href` meta);
 *   * page-count-ratio        page_count <= 1.2 x the public route count.
 *   * routes-findable         every public app/**\/page.tsx route can be found:
 *                             it is in the full-text index, or it is in the
 *                             palette's curated INDEX (app/lib/command-palette
 *                             .tsx). A dynamic route ([slug]) counts as found
 *                             when any found route fills its pattern. The
 *                             index alone cannot cover everything: the tool
 *                             pages (/score, /drift, ...) render per request
 *                             and the /blog routes redirect to dev.to, so
 *                             neither is ever prerendered.
 *
 * Exempt from routes-findable, each on purpose (FIND_EXEMPT below):
 *   /test          a scratch page with robots noindex; not for visitors.
 *   /score/report  renders only with ?url= and errors without one; it is
 *                  reached from a score result, and a bare Find row to it
 *                  would land on that error.
 *
 * Reported, not gated: prerendered pages missing from the index. Pagefind drops
 * every page without data-pagefind-body once any page has one, so this list is
 * where an unmarked page shows up.
 *
 * Runs in the build chain right after postbuild-pagefind.js. That script exits
 * 0 when Pagefind itself fails, so a broken indexer does not stop the build at
 * its own step; this gate does, because a site that ships without its index
 * ships a Find that cannot find body copy.
 *
 * Usage:  node scripts/check-search-coverage.js [--json] [--next <dir>]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const APP = path.join(__dirname, '..');

/** page_count may exceed the public route count by this factor, no more. */
const PAGE_COUNT_RATIO = 1.2;

/** Where postbuild-pagefind.js writes the index, relative to the build dir. */
const PAGEFIND_REL = path.join('static', 'chunks', 'app', 'pagefind');

/** The loader's URL literal: present in the client chunk that loads Pagefind. */
const URL_MARK = '/pagefind.js?v=';

/** The palette whose curated INDEX is Find's second source. */
const PALETTE = path.join(APP, 'app', 'lib', 'command-palette.tsx');

/** Public page routes Find does not have to reach, each with its reason. */
const FIND_EXEMPT = {
  '/test': 'scratch page, robots noindex (app/test/page.tsx)',
  '/score/report': 'renders only with ?url= (errors without one); reached from a score result',
};

const TRACE = /\.nft(?:\.json)?(?:\.html)?$/i;
const INTERNAL_ROUTE = /^\/(?:_not-found|_error|404|500)$/;

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * The public routes Next prerendered, from its own manifest: pages (those with
 * an RSC data route) and JSON endpoints (route handlers serving *.json).
 * Independent of what was staged for Pagefind, so it can judge the staging.
 */
function publicRoutes(nextDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(nextDir, 'prerender-manifest.json'), 'utf8'));
  const pages = [];
  const jsonEndpoints = [];
  for (const [route, info] of Object.entries(manifest.routes || {})) {
    if (INTERNAL_ROUTE.test(route) || TRACE.test(route)) continue;
    if (info && info.dataRoute) pages.push(route);
    else if (/\.json$/i.test(route)) jsonEndpoints.push(route);
  }
  return { pages, jsonEndpoints };
}

/**
 * Every page route the source declares: app/**\/page.(tsx|ts|jsx|js|mdx), with
 * route groups "(x)" dropped and private "_x", parallel "@x" and api folders
 * skipped. Read from the source, not the build, so a page that is never
 * prerendered (rendered per request, or a redirect) is still counted.
 */
function appPageRoutes(appDir) {
  const out = [];
  for (const file of walkFiles(appDir)) {
    if (!/^page\.(?:tsx|ts|jsx|js|mdx)$/.test(path.basename(file))) continue;
    const segs = path.relative(appDir, path.dirname(file)).split(path.sep).filter(Boolean);
    if (segs.some((g) => g.startsWith('_') || g.startsWith('@') || g === 'api')) continue;
    const route = '/' + segs.filter((g) => !/^\(.*\)$/.test(g)).join('/');
    out.push({ route, file: path.relative(APP, file).split(path.sep).join('/') });
  }
  return out;
}

/** The hrefs in the palette's curated INDEX, or null if it cannot be found. */
function curatedIndexHrefs(paletteFile) {
  const src = fs.readFileSync(paletteFile, 'utf8');
  const start = src.indexOf('const INDEX: SearchItem[] = [');
  const end = start === -1 ? -1 : src.indexOf('\n];', start);
  if (start === -1 || end === -1) return null;
  return [...src.slice(start, end).matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** A route pattern as a matcher: [x] fills one segment, [...x] / [[...x]] any. */
function routeMatcher(route) {
  if (!route.includes('[')) return (r) => r === route;
  const re = route
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (/^\[\[\.\.\..+\]\]$/.test(seg)) return '(?:/.*)?';
      if (/^\[\.\.\..+\]$/.test(seg)) return '/.+';
      if (/^\[.+\]$/.test(seg)) return '/[^/]+';
      return '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const rx = new RegExp(`^${re || '/'}$`);
  return (r) => rx.test(r);
}

/** page_count summed over every language in pagefind-entry.json. */
function indexedPageCount(pagefindDir) {
  const entry = JSON.parse(fs.readFileSync(path.join(pagefindDir, 'pagefind-entry.json'), 'utf8'));
  return Object.values(entry.languages || {}).reduce((n, l) => n + (l.page_count || 0), 0);
}

/**
 * Every indexed document, decoded. Pagefind 1.x writes each fragment gzipped,
 * as the signature "pagefind_dcd" followed by the document's JSON.
 */
function readFragments(pagefindDir) {
  const dir = path.join(pagefindDir, 'fragment');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.pf_fragment'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f));
      let text;
      try { text = zlib.gunzipSync(raw).toString('utf8'); } catch { text = raw.toString('utf8'); }
      const doc = JSON.parse(text.slice(text.indexOf('{')));
      return { file: f, url: String(doc.url || ''), meta: doc.meta || {} };
    });
}

/** The route a fragment stands for: its wrapper's href meta, else its url. */
function routeOf(fragment) {
  const own = fragment.meta.href;
  if (typeof own === 'string' && own.startsWith('/')) return own;
  let r = fragment.url.split(/[?#]/)[0];
  try { r = decodeURIComponent(r); } catch { /* keep as-is */ }
  r = r.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (r.length > 1) r = r.replace(/\/$/, '');
  return r || '/';
}

/**
 * Each place a client chunk builds the pagefind.js URL, and what it does with
 * it. The window covers the promise step that holds the URL literal: from the
 * step's own `.then(` (at most 200 chars back) to the next `.then(`, so an
 * import() elsewhere in the chunk cannot satisfy it. The look-back matters
 * because the production minifier inlines the URL variable into the call,
 * emitting `.then(t=>import("".concat(e,"/pagefind.js?v=").concat(t)))` with
 * the import( BEFORE the literal.
 */
function loaderSites(chunksDir) {
  const sites = [];
  const skip = path.join(chunksDir, 'app', 'pagefind') + path.sep;
  for (const file of walkFiles(chunksDir)) {
    if (!file.endsWith('.js') || file.startsWith(skip)) continue;
    const code = fs.readFileSync(file, 'utf8');
    for (let i = code.indexOf(URL_MARK); i !== -1; i = code.indexOf(URL_MARK, i + 1)) {
      const prev = code.lastIndexOf('.then(', i);
      const start = prev !== -1 && i - prev <= 200 ? prev + '.then('.length : i;
      const end = code.indexOf('.then(', i);
      const win = code.slice(start, end === -1 ? i + 400 : Math.min(end, i + 400));
      const native = win.search(/\bimport\s*\(/);
      const wp = win.match(/\b[A-Za-z_$][\w$]*\((\d+)\)\(/);
      const wpAt = wp ? wp.index : -1;
      let stub = false;
      if (wp) {
        // The empty-context module webpack emits for an unresolvable import():
        // `<id>:e=>{function t(e){...Error("Cannot find module '"+e+"'")...`
        const def = new RegExp(`[{,]${wp[1]}:[^{]{0,40}\\{[\\s\\S]{0,240}?Cannot find module`);
        stub = def.test(code);
      }
      sites.push({
        file: path.relative(chunksDir, file),
        ok: native !== -1 && (wpAt === -1 || native < wpAt),
        moduleCall: wp ? wp[0].slice(0, -1) : null,
        stub,
        excerpt: win.slice(0, 160),
      });
    }
  }
  return sites;
}

function check(nextDir) {
  const findings = [];
  const notes = [];
  const add = (id, why, fix) => findings.push({ id, why, fix });

  if (!fs.existsSync(nextDir)) {
    add('build-present', `No build output at ${nextDir}.`, 'Run this after `next build` and postbuild-pagefind.js.');
    return { findings, notes };
  }

  // 1. The loader is a native import().
  const sites = loaderSites(path.join(nextDir, 'static', 'chunks'));
  if (sites.length === 0) {
    add(
      'native-pagefind-import',
      `No client chunk contains the loader's URL literal "${URL_MARK}", so the loader could not be checked.`,
      'If the loader in app/lib/command-palette.tsx changed how it builds the pagefind.js URL, update URL_MARK here to match.'
    );
  }
  for (const s of sites.filter((x) => !x.ok)) {
    add(
      'native-pagefind-import',
      `${s.file}: the pagefind.js URL is not handed to a native import()` +
        (s.moduleCall ? `; it goes to the webpack module call ${s.moduleCall}` : '') +
        (s.stub ? ', an empty-context stub that always throws "Cannot find module". Full-text search cannot load.' : '.') +
        ` Near: ${JSON.stringify(s.excerpt)}`,
      'Load it with import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) in loadPagefind() (app/lib/command-palette.tsx).'
    );
  }

  // 2. The index exists.
  const pagefindDir = path.join(nextDir, PAGEFIND_REL);
  const missing = ['pagefind.js', 'pagefind-entry.json', 'fragment'].filter((f) => !fs.existsSync(path.join(pagefindDir, f)));
  if (missing.length) {
    add(
      'index-present',
      `The Pagefind index is incomplete at ${path.relative(nextDir, pagefindDir)} (missing: ${missing.join(', ')}). Find would serve only the curated INDEX.`,
      'Read the [postbuild-pagefind] lines in the build log: it exits 0 when Pagefind fails, so its error is printed there, not raised.'
    );
    return { findings, notes, sites };
  }

  let fragments;
  let pageCount;
  let routes;
  try {
    fragments = readFragments(pagefindDir);
    pageCount = indexedPageCount(pagefindDir);
    routes = publicRoutes(nextDir);
  } catch (e) {
    add('index-readable', `Could not read the index or the prerender manifest: ${e.message}`, 'Rebuild; if it persists, the Pagefind fragment format may have changed (see readFragments).');
    return { findings, notes, sites };
  }

  // 3. No trace manifests.
  const traces = fragments.filter((f) => TRACE.test(f.url) || TRACE.test(String(f.meta.title || '').trim()));
  if (traces.length) {
    add(
      'no-trace-manifests',
      `${traces.length} indexed document(s) are Next file-trace manifests, e.g. ${traces.slice(0, 3).map((f) => JSON.stringify(f.meta.title || f.url)).join(', ')}.`,
      'postbuild-pagefind.js must stage JSON endpoints from its JSON_ENDPOINTS allowlist only, never by walking .next/server/app.'
    );
  }

  // 4. Every document is one real route.
  const real = new Set([...routes.pages, ...routes.jsonEndpoints]);
  const byRoute = new Map();
  for (const f of fragments) {
    const r = routeOf(f);
    byRoute.set(r, (byRoute.get(r) || 0) + 1);
  }
  const strays = fragments.filter((f) => !real.has(routeOf(f)) && !traces.includes(f));
  if (strays.length) {
    add(
      'fragments-are-routes',
      `${strays.length} indexed document(s) map to no prerendered public route: ${strays.slice(0, 6).map((f) => routeOf(f)).join(', ')}${strays.length > 6 ? ', ...' : ''}.`,
      'Stage only route HTML and allowlisted endpoints. A wrapper must carry data-pagefind-meta="href:<route>" naming a prerendered route.'
    );
  }
  const repeats = [...byRoute].filter(([, n]) => n > 1).map(([r]) => r);
  if (repeats.length) {
    add('fragments-are-routes', `Route(s) indexed more than once: ${repeats.slice(0, 6).join(', ')}.`, 'Stage each route once.');
  }

  // 5. page_count against the route count.
  const routeCount = routes.pages.length + routes.jsonEndpoints.length;
  const ceiling = PAGE_COUNT_RATIO * routeCount;
  if (pageCount > ceiling) {
    add(
      'page-count-ratio',
      `page_count ${pageCount} exceeds ${PAGE_COUNT_RATIO} x ${routeCount} public routes (${Math.floor(ceiling)}). The index holds more than pages.`,
      'Find what postbuild-pagefind.js staged beyond route HTML and the JSON_ENDPOINTS allowlist (.next/search-stage).'
    );
  }

  // 6. Every public page route can be found: indexed, or in the curated INDEX.
  const curated = curatedIndexHrefs(PALETTE);
  if (curated === null) {
    add(
      'routes-findable',
      `Could not read the curated INDEX in ${path.relative(APP, PALETTE)} (looked for "const INDEX: SearchItem[] = [" ... "];"), so route coverage was not measured.`,
      'If the INDEX declaration changed shape, update curatedIndexHrefs() here to match.'
    );
  } else {
    const findable = new Set([...fragments.map(routeOf), ...curated]);
    const declared = appPageRoutes(path.join(APP, 'app'));
    const lost = declared.filter(({ route }) => {
      if (Object.prototype.hasOwnProperty.call(FIND_EXEMPT, route)) return false;
      const match = routeMatcher(route);
      for (const r of findable) if (match(r)) return false;
      return true;
    });
    if (lost.length) {
      add(
        'routes-findable',
        `${lost.length} public page route(s) are neither in the full-text index nor in the curated INDEX, so Find cannot reach them: ${lost.map((x) => `${x.route} (${x.file})`).join(', ')}.`,
        "Add data-pagefind-body to the page's <main> if it is prerendered, or an INDEX entry in app/lib/command-palette.tsx if it is not (rendered per request, or a redirect). Exempting it from Find needs a reason in FIND_EXEMPT here."
      );
    }
    notes.push(`routes-findable: ${declared.length} page route(s) declared, ${Object.keys(FIND_EXEMPT).length} exempt (${Object.keys(FIND_EXEMPT).join(', ')}), ${curated.length} curated INDEX entr${curated.length === 1 ? 'y' : 'ies'}, ${lost.length} unreachable`);
  }

  // Reported, not gated.
  const covered = new Set(fragments.map(routeOf));
  const unindexed = routes.pages.filter((p) => !covered.has(p)).sort();
  notes.push(`page_count ${pageCount} (${fragments.length} fragment(s)) against ${routeCount} public route(s): ${routes.pages.length} page(s) + ${routes.jsonEndpoints.length} JSON endpoint(s)`);
  notes.push(`endpoint wrapper(s) indexed: ${fragments.filter((f) => f.meta.href).map((f) => f.meta.href).join(', ') || 'none'}`);
  if (unindexed.length) notes.push(`${unindexed.length} prerendered page(s) not in the index: ${unindexed.join(', ')}`);

  return { findings, notes, sites, pageCount, routeCount, fragments: fragments.length, unindexed };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const at = argv.indexOf('--next');
  const nextDir = at !== -1 && argv[at + 1] ? path.resolve(argv[at + 1]) : path.join(APP, '.next');

  const result = check(nextDir);
  const { findings, notes } = result;

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, checked: nextDir, ...result }, null, 2));
  } else {
    for (const n of notes) console.log(`search-coverage: ${n}`);
    if (findings.length === 0) {
      console.log(`search-coverage: OK — native import in ${result.sites.length} loader site(s); index holds pages only`);
    } else {
      console.error(`search-coverage: ${findings.length} finding(s)\n`);
      for (const f of findings) {
        console.error(`  [${f.id}]`);
        console.error(`    why: ${f.why}`);
        console.error(`    fix: ${f.fix}\n`);
      }
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

module.exports = { publicRoutes, indexedPageCount, readFragments, routeOf, appPageRoutes, curatedIndexHrefs, routeMatcher, FIND_EXEMPT, PAGE_COUNT_RATIO };

if (require.main === module) main();
