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
 * A third defect sat beside them. Everything under /_next/static is served
 * with `Cache-Control: public, max-age=31536000, immutable`. The two scripts
 * Find loads from the index, pagefind.js and pagefind-worker.js, ask for two
 * files at an address with no hash in the name and no query, as Pagefind
 * writes them: the worker script and the WebAssembly engine
 * (wasm.<language>.pagefind). postbuild-pagefind.js gave the worker's address
 * ?v=<build id>, and its comment said the engine's had it too. The engine's
 * had none, so a browser that had searched once could keep its engine file
 * for a year, while the index beside it is new with every build. An engine
 * from Pagefind 1.5.2 cannot read an index written by 1.6.0: it logs
 * "Pagefind: WASM Error (No pointer)", every search finishes with no
 * full-text rows, and the curated rows still show. The first Pagefind
 * upgrade would have taken the full-text rows from every returning visitor
 * whose browser still held the engine file, and a browser with an empty
 * cache would have shown nothing wrong.
 *
 * The id itself was the next defect. With a deployment id set, Next writes
 * the same .next/BUILD_ID on every build, and Vercel sets one for skew
 * protection, so production gave the same ?v=<id> to the 1.5.2 files and to
 * the 1.6.0 files that replaced them. The id is now a hash of the Pagefind
 * files as served (lib/pagefind-index-id.js), and this gate computes it again.
 *
 * None of these showed in the build log or in the source review. They
 * live in the BUILD OUTPUT, so this gate reads the build output:
 *
 *   * native-pagefind-import  the client chunk that builds the pagefind.js URL
 *                             hands it to a native import(), not to a webpack
 *                             module call (the empty-context stub is named in
 *                             the finding when it is the cause);
 *   * index-present           pagefind.js, pagefind-entry.json and fragments
 *                             exist (a gate that passes because there was no
 *                             index measured nothing);
 *   * engine-address-build-id every engine address an emitted script writes
 *                             as the template wasm.${language}.pagefind ends
 *                             ?v=<index id>, the id being pf- and 20 hex
 *                             digits hashed from the files as served,
 *                             computed again here from the files, in the
 *                             index and in its deployed copy. Any other
 *                             string with .pagefind before a quote or a "?"
 *                             fails, and so does a script that must load
 *                             the engine and holds no address written as
 *                             the template;
 *   * worker-address-build-id the address pagefind.js starts the worker at
 *                             ends the same way (a worker script kept from an
 *                             older build would ask for the engine under the
 *                             older address);
 *   * loaders-parse           pagefind.js still parses as a module and
 *                             pagefind-worker.js as a classic script, in the
 *                             index and in its deployed copy (a patch that
 *                             broke one would leave its addresses reading
 *                             right in a script no browser can run);
 *   * index-files-known       every file and directory at the top level of
 *                             the index is on this gate's list (INDEX_FILES,
 *                             INDEX_FILE_PATTERNS), and inside fragment/,
 *                             index/ and filter/ every entry is a file named
 *                             with a hash (INDEX_DIR_PATTERNS), so a file a
 *                             later Pagefind adds under a fixed name stops
 *                             the build until someone has read how it is
 *                             asked for;
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
 *                             pages (/score, /drift, ...) render per request,
 *                             so they are never prerendered.
 *
 * Exempt from routes-findable, each on purpose (FIND_EXEMPT below):
 *   /test          a scratch page with robots noindex; not for visitors.
 *   /score/report  renders only with ?url= and errors without one; it is
 *                  reached from a score result, and a bare Find row to it
 *                  would land on that error.
 *   /score/contract  built in parts and unlinked until its launch change,
 *                  which adds its Find entry, removes this exemption and
 *                  drops the page's robots noindex.
 *
 * Reported, not gated: prerendered pages missing from the index. Pagefind drops
 * every page without data-pagefind-body once any page has one, so this list is
 * where an unmarked page shows up.
 *
 * Not checked, so a fault in any of these can pass: what a script does with
 * an address after writing it. The two address findings read each address
 * as it is written, up to its closing quote, and run nothing. The one thing
 * read after the quote is the first character past any white space: a "."
 * or a "[", or "?." not followed by a digit (an optional chain), fails,
 * since the address read would not be the one asked for. Anything else
 * there passes, a concatenation or a comment before a call included. Also
 * not checked: an engine address built with no .pagefind before a quote or
 * a "?", which is not read at all (a build with one fails only when
 * pagefind.js or pagefind-worker.js then holds no address written as the
 * template); and whether the engine files are on disk.
 *
 * Runs in the build chain right after postbuild-pagefind.js. That script exits
 * 0 when Pagefind itself fails, so a broken indexer does not stop the build at
 * its own step; this gate does, because a site that ships without its index
 * ships a Find that cannot find body copy.
 *
 * Before it reads the build it runs its self-test: the index-id helper's
 * cases (lib/pagefind-index-id.js), then this gate's own over small indexes
 * built in a temporary directory, one with nothing wrong and at least one
 * for each check the address, parse, name and directory findings make, the
 * directory findings read through check() itself (see selfTest). A failing
 * self-test fails the gate, since a clean result from a broken check would
 * prove nothing, and so does a self-test that checked another number of
 * cases than SELF_TEST_CASES. Every run prints
 * "search-coverage: self-test OK (<n> cases)", so a build log shows the
 * self-test ran.
 *
 * Usage:  node scripts/check-search-coverage.js [--json] [--next <dir>] [--self-test]
 * --self-test runs the self-test alone. With --json the self-test line goes
 * to stderr. Exits 1 on any finding or a failed self-test, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const indexId = require('./lib/pagefind-index-id');
const { pagefindIndexId, PLACEHOLDER, ID_FORMAT } = indexId;

const APP = path.join(__dirname, '..');

/** page_count may exceed the public route count by this factor, no more. */
const PAGE_COUNT_RATIO = 1.2;

/** Where postbuild-pagefind.js writes the index, relative to the build dir. */
const PAGEFIND_REL = path.join('static', 'chunks', 'app', 'pagefind');

/** The loader's URL literal: present in the client chunk that loads Pagefind. */
const URL_MARK = '/pagefind.js?v=';

/** The emitted scripts that load the engine: the page's own copy (used when no
 *  worker starts, or when the worker's init fails or takes more than five
 *  seconds) and the worker's. Each must hold an engine address. */
const ENGINE_LOADERS = ['pagefind.js', 'pagefind-worker.js'];

/** An engine address as Pagefind writes it: the template
 *  `wasm.${language}.pagefind`, one address for every engine file the build
 *  wrote. The expression must be a name. An address written for one language
 *  (wasm.en.pagefind, or a literal in the expression) would never ask for
 *  the other engine files, so it is reported as unread. */
const ENGINE_ADDRESS = /wasm\.\$\{[\w$.]+\}\.pagefind/g;

/** ".pagefind" before a quote or a "?": the end of a string that names a
 *  .pagefind file, with or without a query after it. One that ENGINE_ADDRESS
 *  does not match is reported as unread. An engine address built with no
 *  .pagefind before a quote or a "?", such as
 *  this.basePath + ["wasm", language, "pagefind"].join("."), is not read at
 *  all (see Not checked in the header). */
const ENGINE_SUFFIX = /\.pagefind(?=[`"'?])/g;

/** The worker script's name, wherever pagefind.js writes it. */
const WORKER_ADDRESS = /pagefind-worker\.js/g;

/** What Pagefind 1.5.2 and 1.6.0 write at the top level of the index when
 *  not asked for a playground/ directory (pagefind/src/output/mod.rs in
 *  Pagefind's source), and the version file postbuild-pagefind.js adds, each
 *  with what keeps a copy a browser holds for a year from being used on a
 *  later build:
 *    pagefind.js             the loader imports it with ?v=<index id>. When
 *                            pagefind-version.json does not answer, the
 *                            loader asks for ?v=noversion-<time>, an address
 *                            no other page load uses, so no kept copy is
 *                            used. Nothing here checks the loader's choice
 *    pagefind-worker.js      started at ?v=<index id> (worker-address-build-id)
 *    wasm.<code>.pagefind    asked for at ?v=<index id> (engine-address-build-id)
 *    pagefind-version.json   the loader fetches it with cache: 'no-store'
 *    pagefind-entry.json     Pagefind fetches it with ?ts=<time>
 *    pagefind.<hash>.pf_meta and what fragment/, index/ and filter/ hold
 *                            the name is a hash of the content
 *    pagefind-highlight.js, and the three UI scripts and their style sheets
 *                            the site loads none of them
 *  Any other name at the top level fails the gate (index-files-known). */
const INDEX_FILES = [
  'pagefind.js', 'pagefind-worker.js', 'pagefind-version.json', 'pagefind-entry.json',
  'fragment', 'index', 'filter',
  'pagefind-highlight.js', 'pagefind-ui.js', 'pagefind-ui.css', 'pagefind-modular-ui.js',
  'pagefind-modular-ui.css', 'pagefind-component-ui.js', 'pagefind-component-ui.css',
];
const INDEX_FILE_PATTERNS = [/^wasm\.[\w-]+\.pagefind$/, /^pagefind\.[\w-]+\.pf_meta$/];

/** What Pagefind writes inside fragment/, index/ and filter/: files named by
 *  language and a hash of the content, which a browser cannot hold stale.
 *  Anything else there, a subdirectory included, fails index-files-known. */
const INDEX_DIR_PATTERNS = {
  fragment: /^[\w-]+_[0-9a-f]{7,}\.pf_fragment$/,
  index: /^[\w-]+_[0-9a-f]{7,}\.pf_index$/,
  filter: /^[\w-]+_[0-9a-f]{7,}\.pf_filter$/,
};

/** The palette whose curated INDEX is Find's second source. */
const PALETTE = path.join(APP, 'app', 'lib', 'command-palette.tsx');

/** Public page routes Find does not have to reach, each with its reason. */
const FIND_EXEMPT = {
  '/score/report': 'renders only with ?url= (errors without one); reached from a score result',
  '/score/contract': 'built ahead of its launch and not linked anywhere yet; the launch change adds its Find entry, drops this line and drops the page\'s robots noindex',
};

const TRACE = /\.nft(?:\.json)?(?:\.html)?$/i;
// _global-error is Next 16's prerendered fallback for the global error boundary;
// it is an internal page (a direct request answers 500), never a public route.
const INTERNAL_ROUTE = /^\/(?:_not-found|_error|_global-error|404|500)$/;

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
function loaderSites(staticDir) {
  const chunksDir = staticDir;
  const sites = [];
  const skip = path.join(staticDir, 'chunks', 'app', 'pagefind') + path.sep;
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

/** What follows an address, up to the end of the string that holds it. */
function addressTail(code, from) {
  const rest = code.slice(from, from + 160);
  const end = rest.search(/[`"']/);
  return end === -1 ? `${rest.slice(0, 40)}...` : rest.slice(0, end);
}

/**
 * What the index directory holds that this gate does not know: a top-level
 * name on neither INDEX_FILES nor INDEX_FILE_PATTERNS, and anything inside
 * fragment/, index/ or filter/ not named by a hash (INDEX_DIR_PATTERNS),
 * a subdirectory included.
 */
function unknownIndexEntries(dir) {
  const entries = fs.readdirSync(dir).sort();
  const unknown = entries.filter((f) => !INDEX_FILES.includes(f) && !INDEX_FILE_PATTERNS.some((re) => re.test(f)));
  for (const [sub, re] of Object.entries(INDEX_DIR_PATTERNS)) {
    if (!entries.includes(sub)) continue;
    for (const e of fs.readdirSync(path.join(dir, sub), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory() || !re.test(e.name)) unknown.push(`${sub}/${e.name}${e.isDirectory() ? '/' : ''}`);
    }
  }
  return unknown;
}

/**
 * The index directories the address, parse and name checks read: the one
 * postbuild-pagefind.js writes, and, when .next/output/static exists, the
 * copy in that deployment adapter's output, since the copy is what is
 * deployed. absent names what the copy lacks; a copy that lacks any of it is
 * a finding (index-deployed), not a directory to read.
 */
function indexDirsOf(nextDir) {
  const dirs = [path.join(nextDir, PAGEFIND_REL)];
  const adapterStatic = path.join(nextDir, 'output', 'static');
  if (!fs.existsSync(adapterStatic)) return { dirs, deployed: null, absent: [] };
  const deployed = path.join(adapterStatic, '_next', PAGEFIND_REL);
  const absent = ['pagefind.js', 'pagefind-entry.json', 'fragment'].filter((f) => !fs.existsSync(path.join(deployed, f)));
  if (!absent.length) dirs.push(deployed);
  return { dirs, deployed, absent };
}

/**
 * What follows the closing quote of the string an address is in, past any
 * white space: "?." when an optional chain starts there ("?." not followed
 * by a digit, since "?.5" is a conditional), else the first
 * character. A ".", "[" or "?." there means the script changes the string
 * before it asks for it (a .replace, .slice or .split, or an index, with or
 * without "?"), so the address read is not the one asked for. Pagefind 1.5.2
 * and 1.6.0 end each address with a ";".
 */
function afterAddress(code, from) {
  const rest = code.slice(from, from + 160);
  const end = rest.search(/[`"']/);
  if (end === -1) return '';
  const m = code.slice(from + end + 1, from + end + 41).match(/^\s*(\?\.(?!\d)|\S)/);
  return m ? m[1] : '';
}
const CHANGES_STRING = new Set(['.', '[', '?.']);

/**
 * The addresses the scripts in one Pagefind directory build for the engine
 * file and the worker script, read against the index id. `engine` and
 * `worker` list what is wrong, one line each; `ok` counts the addresses that
 * end ?v=<index id>. Each address is read as it is written, up to its closing
 * quote, and then what afterAddress reads past the quote. Nothing is run, so
 * anything else a script does with an address after writing it is not seen,
 * and an engine address built with no .pagefind before a quote or a "?" is
 * not read.
 */
function addressProblems(pagefindDir, nextDir) {
  const engine = [];
  const worker = [];
  const ok = { engine: 0, worker: 0, id: null };

  // The id the loader puts on pagefind.js, which must be this build's.
  let id = null;
  try {
    id = JSON.parse(fs.readFileSync(path.join(pagefindDir, 'pagefind-version.json'), 'utf8')).buildId;
  } catch { /* reported just below */ }
  if (typeof id !== 'string' || id === '') {
    engine.push('pagefind-version.json holds no id, so there is no id for an address to carry');
    return { engine, worker, ok };
  }
  // The id is a hash of the files as served (lib/pagefind-index-id.js). Read
  // it again from the files here, each ?v=<id> read as the placeholder, so an
  // id that stays the same while the files change cannot pass. A build id
  // cannot stand in for it: with a deployment id set, Next writes the same
  // build id on every build.
  if (!ID_FORMAT.test(id) || id === PLACEHOLDER) {
    engine.push(`pagefind-version.json says ${JSON.stringify(id)}, which is not an index id (pf- and 20 hex digits, not the placeholder ${PLACEHOLDER})`);
    return { engine, worker, ok };
  }
  const files = pagefindIndexId(pagefindDir, id);
  if (files !== id) {
    engine.push(`pagefind-version.json says ${JSON.stringify(id)} but the files in this index give ${JSON.stringify(files)}, so the addresses would not change when the files do`);
    return { engine, worker, ok };
  }
  ok.id = id;
  const want = `?v=${id}`;

  const scripts = fs.readdirSync(pagefindDir).filter((f) => f.endsWith('.js')).sort();
  for (const name of ENGINE_LOADERS) {
    if (!scripts.includes(name)) engine.push(`${name} is missing, so what it asks for could not be read`);
  }
  for (const name of scripts) {
    const code = fs.readFileSync(path.join(pagefindDir, name), 'utf8');

    const ends = new Set();
    for (const m of code.matchAll(ENGINE_ADDRESS)) {
      const end = m.index + m[0].length;
      ends.add(end);
      const tail = addressTail(code, end);
      const next = afterAddress(code, end);
      if (tail !== want) engine.push(`${name} asks for ${m[0]}${tail}, without the index id (want ${m[0]}${want})`);
      else if (CHANGES_STRING.has(next)) engine.push(`${name} writes ${m[0]}${tail} and then changes the string ("${next}" after its closing quote), so the address it asks for could not be read`);
      else ok.engine++;
    }
    for (const m of code.matchAll(ENGINE_SUFFIX)) {
      if (ends.has(m.index + '.pagefind'.length)) continue;
      engine.push(`${name} holds a string ending in .pagefind that is not the template wasm.\${language}.pagefind: ${JSON.stringify(code.slice(Math.max(0, m.index - 48), m.index + 24))}`);
    }
    if (ENGINE_LOADERS.includes(name) && ends.size === 0) {
      engine.push(`${name} holds no engine address written as the template wasm.\${language}.pagefind, so what it asks for could not be read`);
    }

    if (name !== 'pagefind.js') continue;
    const starts = [...code.matchAll(WORKER_ADDRESS)];
    for (const m of starts) {
      const tail = addressTail(code, m.index + m[0].length);
      const next = afterAddress(code, m.index + m[0].length);
      if (tail !== want) worker.push(`${name} starts the worker at ${m[0]}${tail}, without the index id (want ${m[0]}${want})`);
      else if (CHANGES_STRING.has(next)) worker.push(`${name} writes ${m[0]}${tail} and then changes the string ("${next}" after its closing quote), so the worker address it starts could not be read`);
      else ok.worker++;
    }
    if (starts.length === 0) worker.push(`${name} does not name pagefind-worker.js, so the worker's address could not be read`);
  }
  return { engine, worker, ok };
}

/**
 * What is wrong with an emitted loader's syntax, or null when it parses. The
 * post-build step rewrites both loaders, and a rewrite that broke one would
 * leave its addresses reading right in a script no browser can run.
 * pagefind.js is loaded with import(), so `node --check` reads it as a
 * module: it parses and runs nothing. pagefind-worker.js is started with
 * new Worker(url), so it is compiled, and not run, as a classic script.
 */
function parseProblem(name, code) {
  if (name !== 'pagefind.js') {
    try {
      new vm.Script(code, { filename: name });
      return null;
    } catch (e) {
      return `does not parse as a classic script (${e.name}: ${e.message})`;
    }
  }
  // A SyntaxError line is a verdict. Anything else (the check was killed, or
  // could not start) is tried once more and then reported, never passed.
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check', '-'], { input: code, encoding: 'utf8' });
    if (r.status === 0) return null;
    const line = String(r.stderr || '').split(/\r?\n/).find((l) => /^SyntaxError:/.test(l));
    if (line) return `does not parse as a module (${line.trim()})`;
    if (attempt === 2) return `could not be checked as a module: node --check gave no verdict twice (${r.error ? r.error.message : `exit ${r.status}`})`;
  }
}

/** How each loader in ENGINE_LOADERS in one index directory parses. A
 *  missing loader is skipped here: addressProblems reports it. */
function loaderParse(dir) {
  const parsed = [];
  const unparsed = [];
  for (const name of ENGINE_LOADERS) {
    let code;
    try { code = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
    const problem = parseProblem(name, code);
    if (problem) unparsed.push(`${name} ${problem}`);
    else parsed.push(`${name} parses as ${name === 'pagefind.js' ? 'a module' : 'a classic script'}`);
  }
  return { parsed, unparsed };
}

/**
 * What to do about the names index-files-known reports, by where they are.
 * INDEX_FILES and INDEX_FILE_PATTERNS are read only at the top level; inside
 * fragment/, index/ and filter/ only INDEX_DIR_PATTERNS is, and a
 * subdirectory there is always reported.
 */
function unknownEntriesFix(unknown) {
  const top = unknown.filter((u) => !u.includes('/'));
  const inner = unknown.filter((u) => u.includes('/'));
  const fix = [];
  if (top.length) {
    fix.push('For a name at the top level: find what asks for it in pagefind.js and pagefind-worker.js. If the address has no hash in the name and no query, give it ?v=<index id> in postbuild-pagefind.js (ADDRESS_PATCHES) and check it here first. Then add the name to INDEX_FILES, or a pattern for it to INDEX_FILE_PATTERNS, with the reason it is safe.');
  }
  if (inner.length) {
    fix.push("For a name inside fragment/, index/ or filter/: INDEX_FILES is not read there. Confirm that the file's address changes with every build, and only then widen that directory's pattern in INDEX_DIR_PATTERNS. A subdirectory there cannot be allowed without changing unknownIndexEntries.");
  }
  return fix.join(' ');
}

/**
 * check()'s findings about the index directories, steps 2b and 2c: the
 * deployed copy is complete (index-deployed), and in each directory
 * indexDirsOf picks, the engine and worker addresses carry the index id,
 * both loaders parse and every name is known. Returns the findings and the
 * notes in the order check() reports them.
 */
function indexDirFindings(nextDir) {
  const findings = [];
  const notes = [];
  const add = (id, why, fix) => findings.push({ id, why, fix });

  // 2b. With a deployment adapter (.next/output exists) the index must be in
  // the adapter's static output too: that copy is what is deployed, and it was
  // taken before postbuild-pagefind.js ran.
  const { dirs: indexDirs, deployed, absent } = indexDirsOf(nextDir);
  if (absent.length) {
    add(
      'index-deployed',
      `A deployment adapter's output exists (.next/output/static) but the index is not in it (${path.relative(nextDir, deployed)}, missing: ${absent.join(', ')}). The deployment would answer 404 for the index and Find would serve only the curated INDEX.`,
      'postbuild-pagefind.js copies the index into .next/output/static/_next/static/chunks/app/pagefind; read its log lines.'
    );
  }

  // 2c. The engine and worker addresses carry the index id. Pagefind
  // writes both with no hash in the name and no query, and a browser may keep
  // either file for a year, so every address the emitted scripts build for
  // them must end ?v=<index id>. addressProblems reads the ones it can (see
  // Not checked in the header), in the index and in the deployed copy when
  // there is one. Both loaders must still parse after the patch, and the
  // index must hold nothing this gate does not know.
  for (const dir of indexDirs) {
    const where = path.relative(nextDir, dir).split(path.sep).join('/');
    const { engine, worker, ok } = addressProblems(dir, nextDir);
    if (engine.length) {
      add(
        'engine-address-build-id',
        `${where}: ${engine.join('; ')}. A browser that kept an engine file (wasm.<language>.pagefind) from an older build would run it on this build's index. When the two come from different Pagefind versions the engine may be unable to read the index (1.5.2 cannot read one written by 1.6.0), and Find loses its full-text rows for that visitor.`,
        'postbuild-pagefind.js appends ?v=<index id> to each engine address before it copies the index; read its [postbuild-pagefind] lines in the build log. If Pagefind now writes the address another way, change the strings that script replaces and the patterns here (ENGINE_ADDRESS, ENGINE_SUFFIX) together.'
      );
    }
    if (worker.length) {
      add(
        'worker-address-build-id',
        `${where}: ${worker.join('; ')}. A browser that kept pagefind-worker.js from an older build would run that copy, which asks for the engine under the older build's address.`,
        'postbuild-pagefind.js appends ?v=<index id> to the worker address in pagefind.js; read its [postbuild-pagefind] lines in the build log. If Pagefind now writes the address another way, change the string that script replaces and WORKER_ADDRESS here together.'
      );
    }
    if (!engine.length && !worker.length) {
      notes.push(`${where}: ${ok.engine} engine address(es) and ${ok.worker} worker address(es) end ?v=${ok.id}`);
    }

    const { parsed, unparsed } = loaderParse(dir);
    if (unparsed.length) {
      add(
        'loaders-parse',
        `${where}: ${unparsed.join('; ')}. A browser that cannot parse pagefind.js loads no index, and Find serves only the curated INDEX to every visitor. One that cannot parse pagefind-worker.js cannot start the worker.`,
        'postbuild-pagefind.js rewrites the addresses in both scripts (ADDRESS_PATCHES); read what it puts in place of each string. If the scripts fail as Pagefind wrote them, how they are loaded has changed: parseProblem() here reads pagefind.js as a module and pagefind-worker.js as a classic script.'
      );
    }

    const entries = fs.readdirSync(dir).sort();
    const unknown = unknownIndexEntries(dir);
    if (unknown.length) {
      add(
        'index-files-known',
        `${where}: ${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not on this gate's list of what the index holds (INDEX_FILES, and inside fragment/, index/ and filter/ a name with a hash, INDEX_DIR_PATTERNS). A browser may keep anything under /_next/static for a year, so a file that keeps its name from build to build is safe only when nothing the site loads asks for it, or when its address changes with every build. No one has checked that for ${unknown.length === 1 ? 'this one' : 'these'}.`,
        unknownEntriesFix(unknown)
      );
    }
    if (parsed.length === ENGINE_LOADERS.length && !unknown.length) {
      notes.push(`${where}: ${parsed.join(' and ')}; ${entries.length} top-level entries, all on the gate's list`);
    }
  }
  return { findings, notes };
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
  // All of .next/static, not only static/chunks: with immutable assets (a
  // deployment adapter's default) the client chunks sit under static/immutable.
  const sites = loaderSites(path.join(nextDir, 'static'));
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

  // 2b and 2c. The deployed copy, and the addresses, loaders and names in
  // each index directory (indexDirFindings). The self-test reaches these
  // findings through check() itself.
  const dirChecks = indexDirFindings(nextDir);
  findings.push(...dirChecks.findings);
  notes.push(...dirChecks.notes);

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

// ---- self-test --------------------------------------------------------------

/** How many cases selfTest() checks, the helper's included. main() fails
 *  when the count is another, so a self-test that is emptied, cut short or
 *  skips a loop cannot pass. Adding or removing a case on purpose changes
 *  this number with it. */
const SELF_TEST_CASES = 93;

/**
 * The helper's cases, then the gate's own on small indexes built in a
 * temporary directory: a correct one, which must pass with every address
 * counted, and at least one case for each check in addressProblems,
 * loaderParse, unknownEntriesFix and unknownIndexEntries (each directory's
 * pattern, a subdirectory, a top-level name). Then check() itself runs on
 * small .next directories that hold the index and a deployment adapter's
 * copy: each of its five findings about the index directories must be
 * raised for the copy, and engine-address-build-id and index-files-known
 * for the written index too. A pair with one fault in one directory must
 * raise that one finding for that directory and nothing else. Some faults
 * are seen by one check only: a changed fragment or engine under the old
 * id by the hash; an address left with the placeholder by the address
 * reading, since the hash reads ?v=<id> as the placeholder; a build id or
 * the placeholder as the id by the format pin. A check can hold a part no
 * case tries: no case puts a "[" or white space after an address's closing
 * quote. Returns how many cases it checked and what failed.
 */
function selfTest() {
  const os = require('node:os');
  const helper = indexId.selfTest();
  let cases = helper.cases;
  const bad = helper.bad.map((b) => `index id: ${b}`);
  const failIf = (broken, what) => { cases++; if (broken) bad.push(what); };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'search-coverage-'));
  const built = (name, edit = null) => {
    const dir = path.join(root, name);
    indexId.writeFixtureIndex(dir);
    if (edit) edit(dir);
    const id = pagefindIndexId(dir);
    indexId.stampIndexId(dir, id);
    fs.writeFileSync(path.join(dir, indexId.VERSION_FILE), JSON.stringify({ buildId: id }));
    return { dir, id };
  };
  const problems = (dir) => {
    const r = addressProblems(dir, null);
    return [...r.engine, ...r.worker];
  };
  try {
    const good = built('good');
    const r = addressProblems(good.dir, null);
    const wrong = [...r.engine, ...r.worker];
    failIf(wrong.length, `a correct index was rejected: ${wrong[0]}`);
    failIf(r.ok.engine !== 2 || r.ok.worker !== 1, `a correct index counted ${r.ok.engine} engine and ${r.ok.worker} worker address(es), not 2 and 1`);

    const fragment = built('fragment');
    fs.appendFileSync(path.join(fragment.dir, 'fragment', 'en_bbbbbbb.pf_fragment'), ' changed');
    failIf(!problems(fragment.dir).some((m) => m.includes('the files in this index give')), 'a changed fragment under the old id passed');

    const engine = built('engine');
    const wasm = path.join(engine.dir, 'wasm.en.pagefind');
    const bytes = fs.readFileSync(wasm);
    bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(wasm, bytes);
    failIf(!problems(engine.dir).some((m) => m.includes('the files in this index give')), 'a changed engine under the old id passed');

    const unstamped = built('unstamped');
    const worker = path.join(unstamped.dir, 'pagefind-worker.js');
    fs.writeFileSync(worker, fs.readFileSync(worker, 'utf8').split(`?v=${unstamped.id}`).join(`?v=${PLACEHOLDER}`));
    failIf(!problems(unstamped.dir).some((m) => m.startsWith('pagefind-worker.js')), 'an engine address left with the placeholder passed');

    const workerUnstamped = built('worker-unstamped');
    const loaderJs = path.join(workerUnstamped.dir, 'pagefind.js');
    fs.writeFileSync(loaderJs, fs.readFileSync(loaderJs, 'utf8').replace(`pagefind-worker.js?v=${workerUnstamped.id}`, `pagefind-worker.js?v=${PLACEHOLDER}`));
    failIf(!problems(workerUnstamped.dir).some((m) => m.startsWith('pagefind.js starts the worker at')), 'a worker address left with the placeholder passed');

    const known = unknownIndexEntries(good.dir);
    failIf(known.length, `a correct index holds names this gate does not know: ${known.join(', ')}`);
    for (const [n, [what, rel]] of [
      ['a fixed name in fragment/', 'fragment/stale.pf_fragment'],
      ['a fixed name in index/', 'index/en.pf_index'],
      ['a fixed name in filter/', 'filter/en.pf_filter'],
      ['a subdirectory in index/', 'index/old/en_1234567.pf_index'],
      ['an unknown top-level file', 'pagefind-extra.js'],
      ['a top-level name that starts as the meta file does', 'pagefind.extra.js'],
      ['a top-level name that starts as an engine does', 'wasm.en.pagefind.map'],
    ].entries()) {
      const odd = built(`names-${n}`);
      fs.mkdirSync(path.dirname(path.join(odd.dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(odd.dir, rel), 'x');
      failIf(!unknownIndexEntries(odd.dir).length, `${what} passed`);
    }

    const changed = built('changed', (dir) => {
      const loader = path.join(dir, 'pagefind-worker.js');
      fs.writeFileSync(loader, fs.readFileSync(loader, 'utf8').replace(`pagefind?v=${PLACEHOLDER}\`;`, `pagefind?v=${PLACEHOLDER}\`.replace("?", "&");`));
    });
    failIf(!problems(changed.dir).some((m) => m.includes('then changes the string')), 'an engine address changed after its closing quote passed');

    const optional = built('optional', (dir) => {
      const loader = path.join(dir, 'pagefind-worker.js');
      fs.writeFileSync(loader, fs.readFileSync(loader, 'utf8').replace(`pagefind?v=${PLACEHOLDER}\`;`, `pagefind?v=${PLACEHOLDER}\`?.replace("?", "&");`));
    });
    failIf(!problems(optional.dir).some((m) => m.includes('("?." after its closing quote)')), 'an engine address changed by an optional chain after its closing quote passed');

    const workerChanged = built('worker-changed', (dir) => {
      const loader = path.join(dir, 'pagefind.js');
      fs.writeFileSync(loader, fs.readFileSync(loader, 'utf8').replace(`pagefind-worker.js?v=${PLACEHOLDER}\`;`, `pagefind-worker.js?v=${PLACEHOLDER}\`.replace("?", "&");`));
    });
    failIf(!problems(workerChanged.dir).some((m) => m.includes('the worker address it starts could not be read')), 'a worker address changed after its closing quote passed');

    const workerOptional = built('worker-optional', (dir) => {
      const loader = path.join(dir, 'pagefind.js');
      fs.writeFileSync(loader, fs.readFileSync(loader, 'utf8').replace(`pagefind-worker.js?v=${PLACEHOLDER}\`;`, `pagefind-worker.js?v=${PLACEHOLDER}\`?.replace("?", "&");`));
    });
    failIf(!problems(workerOptional.dir).some((m) => m.includes('("?." after its closing quote), so the worker address it starts could not be read')), 'a worker address changed by an optional chain after its closing quote passed');

    // Each check only one line of addressProblems makes: a string ending in
    // .pagefind that is not the template (before a quote, and before a
    // query), a loader whose engine address is not written as the template,
    // a missing loader, and a pagefind.js that does not name the worker.
    const stray = built('stray', (dir) => fs.appendFileSync(path.join(dir, 'pagefind.js'), 'export const extra = `${this.basePath}wasm.en.pagefind`;\n'));
    failIf(!problems(stray.dir).some((m) => m.includes('that is not the template')), 'a string ending in .pagefind that is not the template passed');
    const strayQuery = built('stray-query', (dir) => fs.appendFileSync(path.join(dir, 'pagefind.js'), 'export const extra = "wasm.en.pagefind?v=pf-0123456789abcdef0123";\n'));
    failIf(!problems(strayQuery.dir).some((m) => m.includes('that is not the template')), 'a string ending in .pagefind before a query that is not the template passed');
    // The expression in the template must be a name: a literal there writes
    // an address for one language, even with the index id after it.
    const literal = built('literal', (dir) => fs.appendFileSync(path.join(dir, 'pagefind.js'), 'export const one = `${this.basePath}wasm.${"en"}.pagefind?v=' + PLACEHOLDER + '`;\n'));
    failIf(!problems(literal.dir).some((m) => m.includes('that is not the template')), 'an engine address with a literal language in the template passed');
    for (const name of ['pagefind.js', 'pagefind-worker.js']) {
      const joined = built(`joined-${name}`, (dir) => {
        const loader = path.join(dir, name);
        const slotted = `${indexId.ENGINE_TEMPLATE.slice(0, -1)}?v=${PLACEHOLDER}\``;
        fs.writeFileSync(loader, fs.readFileSync(loader, 'utf8').replace(slotted, '[this.basePath + "wasm", language, "pagefind"].join(".")'));
      });
      failIf(!problems(joined.dir).some((m) => m.startsWith(`${name} holds no engine address`)), `a ${name} with no engine address written as the template passed`);
    }
    // Every script is read, not only the loaders, and every worker address
    // in pagefind.js, not only the first.
    const otherScript = built('other-script', (dir) => fs.appendFileSync(path.join(dir, 'pagefind-ui.js'), 'export const engine = `${this.basePath}wasm.${language}.pagefind`;\n'));
    failIf(!problems(otherScript.dir).some((m) => m.startsWith('pagefind-ui.js asks for')), 'an engine address without the index id in a script other than the loaders passed');
    const secondWorker = built('second-worker', (dir) => fs.appendFileSync(path.join(dir, 'pagefind.js'), 'export const again = `${basePath}pagefind-worker.js`;\n'));
    failIf(!problems(secondWorker.dir).some((m) => m.startsWith('pagefind.js starts the worker at pagefind-worker.js,')), 'a second worker address without the index id passed');
    const noWorker = built('no-worker', (dir) => fs.rmSync(path.join(dir, 'pagefind-worker.js')));
    failIf(!problems(noWorker.dir).some((m) => m.startsWith('pagefind-worker.js is missing')), 'an index without pagefind-worker.js passed');
    const split = built('split', (dir) => {
      const loader = path.join(dir, 'pagefind.js');
      fs.writeFileSync(loader, fs.readFileSync(loader, 'utf8').replace('pagefind-worker.js?v=', 'pagefind-` + `worker.js?v='));
    });
    failIf(!problems(split.dir).some((m) => m.includes('does not name pagefind-worker.js')), 'a pagefind.js that does not name pagefind-worker.js passed');

    // The loaders parse, read through ENGINE_LOADERS as check() reads them.
    const goodParse = loaderParse(good.dir);
    failIf(goodParse.unparsed.length || goodParse.parsed.length !== 2, `a correct index's loaders gave ${goodParse.parsed.length} parsed of 2: ${goodParse.unparsed.join('; ')}`);
    for (const name of ['pagefind.js', 'pagefind-worker.js']) {
      const broke = built(`parse-${name}`, (dir) => fs.appendFileSync(path.join(dir, name), '\n})(\n'));
      failIf(!loaderParse(broke.dir).unparsed.some((u) => u.startsWith(`${name} does not parse`)), `a ${name} that does not parse passed`);
    }

    // The fix index-files-known gives depends on where the name is.
    const topFix = unknownEntriesFix(['pagefind-extra.js']);
    const innerFix = unknownEntriesFix(['fragment/stale.pf_fragment']);
    failIf(!topFix.includes('INDEX_FILE_PATTERNS') || topFix.includes('INDEX_DIR_PATTERNS') || !innerFix.includes('INDEX_DIR_PATTERNS') || innerFix.includes('INDEX_FILE_PATTERNS'), 'the index-files-known fix does not depend on where the name is');

    // A deployment adapter's copy is read as well: a changed engine there
    // fails while the index the post-build step wrote is correct. Then
    // check() itself, on small .next directories that hold the index and the
    // copy. A small .next has no client chunk and no prerender manifest, so
    // check() also raises native-pagefind-import and index-readable there;
    // dirFindings leaves out those two and keeps every other finding.
    const SMALL_NEXT = new Set(['native-pagefind-import', 'index-readable']);
    const dirFindings = (n) => check(n).findings.filter((f) => !SMALL_NEXT.has(f.id));
    const next = path.join(root, 'next');
    const copy = path.join(next, 'output', 'static', '_next', PAGEFIND_REL);
    const copyWhere = path.relative(next, copy).split(path.sep).join('/');
    fs.cpSync(good.dir, path.join(next, PAGEFIND_REL), { recursive: true });
    fs.cpSync(good.dir, copy, { recursive: true });
    const clean = dirFindings(next);
    failIf(clean.length, `a correct .next and its deployed copy gave ${clean.map((f) => f.id).join(', ')}`);
    const copied = path.join(copy, 'wasm.en.pagefind');
    const copiedBytes = fs.readFileSync(copied);
    copiedBytes[copiedBytes.length - 1] ^= 1;
    fs.writeFileSync(copied, copiedBytes);
    failIf(!indexDirsOf(next).dirs.includes(copy), "a deployment adapter's copy of the index was not read");
    failIf(!problems(copy).some((m) => m.includes('the files in this index give')), 'a changed engine in the deployed copy passed');
    failIf(!dirFindings(next).some((f) => f.id === 'engine-address-build-id' && f.why.startsWith(`${copyWhere}: `)), 'a changed engine in the deployed copy raised no engine-address-build-id for that copy');
    fs.rmSync(path.join(copy, 'pagefind.js'));
    failIf(!indexDirsOf(next).absent.includes('pagefind.js'), 'a deployed copy without pagefind.js passed');
    failIf(!dirFindings(next).some((f) => f.id === 'index-deployed'), 'a deployed copy without pagefind.js raised no index-deployed');

    // Unknown names raise index-files-known in check(), not only in
    // unknownIndexEntries.
    const named = built('names-check', (dir) => {
      fs.writeFileSync(path.join(dir, 'pagefind-extra.js'), 'x');
      fs.writeFileSync(path.join(dir, 'fragment', 'stale.pf_fragment'), 'x');
    });
    const namedNext = path.join(root, 'next-names');
    fs.cpSync(named.dir, path.join(namedNext, PAGEFIND_REL), { recursive: true });
    const namedFound = dirFindings(namedNext);
    failIf(!namedFound.some((f) => f.id === 'index-files-known' && f.why.includes('pagefind-extra.js') && f.why.includes('fragment/stale.pf_fragment')), `an unknown top-level name and an unknown name in fragment/ did not both raise index-files-known (findings: ${namedFound.map((f) => f.id).join(', ') || 'none'})`);

    // Pairs of a written index and a copy with one fault between them: the
    // copy's worker address, loaders and names are read, and so is the
    // written index while a copy exists. Each pair must raise its one
    // finding for that directory alone.
    const writtenWhere = PAGEFIND_REL.split(path.sep).join('/');
    const pair = (name, written, copied) => {
      const n = path.join(root, name);
      fs.cpSync(written, path.join(n, PAGEFIND_REL), { recursive: true });
      fs.cpSync(copied, path.join(n, 'output', 'static', '_next', PAGEFIND_REL), { recursive: true });
      return dirFindings(n);
    };
    const namedOne = built('names-one', (dir) => fs.writeFileSync(path.join(dir, 'pagefind-extra.js'), 'x'));
    const unparsedCopy = built('copy-unparsed', (dir) => fs.appendFileSync(path.join(dir, 'pagefind.js'), '\n})(\n'));
    for (const [what, found, id, where] of [
      ['a worker address left with the placeholder in the deployed copy', pair('pair-worker', good.dir, workerUnstamped.dir), 'worker-address-build-id', copyWhere],
      ['a pagefind.js that does not parse in the deployed copy', pair('pair-parse', good.dir, unparsedCopy.dir), 'loaders-parse', copyWhere],
      ['an unknown name in the deployed copy', pair('pair-names', good.dir, namedOne.dir), 'index-files-known', copyWhere],
      ['a changed engine in the written index while a copy exists', pair('pair-written', engine.dir, good.dir), 'engine-address-build-id', writtenWhere],
    ]) {
      const alone = found.length === 1 && found[0].id === id && found[0].why.startsWith(`${where}: `);
      failIf(!alone, `${what} gave ${found.map((x) => `${x.id} for ${x.why.split(': ')[0]}`).join(', ') || 'no finding'}, not ${id} for ${where} alone`);
    }

    for (const [n, [what, id]] of [['a build id', 'build-TfctsWXpff2fKS'], ['the placeholder', PLACEHOLDER]].entries()) {
      const v = built(`id-${n}`);
      fs.writeFileSync(path.join(v.dir, indexId.VERSION_FILE), JSON.stringify({ buildId: id }));
      failIf(!problems(v.dir).some((m) => m.includes('which is not an index id')), `${what} as the id passed`);
    }
    const noId = built('no-id');
    fs.rmSync(path.join(noId.dir, indexId.VERSION_FILE));
    failIf(!problems(noId.dir).some((m) => m.includes('holds no id')), 'an index without pagefind-version.json passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return { cases, bad };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const { cases, bad } = selfTest();
  const broken = cases === SELF_TEST_CASES ? bad : [...bad, `the self-test checked ${cases} case(s), not ${SELF_TEST_CASES}: a case was added, removed or skipped (SELF_TEST_CASES)`];
  if (argv.includes('--self-test')) {
    for (const b of broken) console.error(`  [self-test] FAIL ${b}`);
    console.log(`search-coverage: self-test ${broken.length ? `FAILED (${broken.length} failure(s), ${cases} cases)` : `OK (${cases} cases)`}`);
    process.exit(broken.length ? 1 : 0);
  }
  if (broken.length) {
    console.error('search-coverage: the self-test failed, so a clean result would prove nothing:');
    for (const b of broken) console.error(`  ${b}`);
    process.exit(1);
  }
  // Every run says that the self-test ran and how many cases it checked. With
  // --json the line goes to stderr, so stdout stays one JSON document.
  (asJson ? console.error : console.log)(`search-coverage: self-test OK (${cases} cases)`);
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

module.exports = { publicRoutes, indexedPageCount, readFragments, routeOf, appPageRoutes, curatedIndexHrefs, routeMatcher, selfTest, FIND_EXEMPT, PAGE_COUNT_RATIO };

if (require.main === module) main();
