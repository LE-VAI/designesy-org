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
 * with `Cache-Control: public, max-age=31536000, immutable`, and two Pagefind
 * files keep their names from one build to the next: the worker script and the
 * WebAssembly engine (wasm.<language>.pagefind). postbuild-pagefind.js gave the
 * worker's address ?v=<build id>, and its comment said the engine's had it
 * too. The engine's had none, so a browser that had searched once kept its
 * engine file for a year, while the index beside it is new with every build.
 * An engine from Pagefind 1.5.2 cannot read an index written by 1.6.0: it logs
 * "Pagefind: WASM Error (No pointer)" and no search returns. The first
 * Pagefind upgrade would have taken the full-text rows from every returning
 * visitor, and a browser with an empty cache would have shown nothing wrong.
 *
 * None of the three showed in the build log or in the source review. They
 * live in the BUILD OUTPUT, so this gate reads the build output:
 *
 *   * native-pagefind-import  the client chunk that builds the pagefind.js URL
 *                             hands it to a native import(), not to a webpack
 *                             module call (the empty-context stub is named in
 *                             the finding when it is the cause);
 *   * index-present           pagefind.js, pagefind-entry.json and fragments
 *                             exist (a gate that passes because there was no
 *                             index measured nothing);
 *   * engine-address-build-id every address an emitted script builds for an
 *                             engine file ends ?v=<build id>, the id being
 *                             this build's (.next/BUILD_ID), in the index and
 *                             in its deployed copy; a script that must load
 *                             the engine and holds no address this gate can
 *                             read fails too;
 *   * worker-address-build-id the address pagefind.js starts the worker at
 *                             ends the same way (a worker script kept from an
 *                             older build would ask for the engine under the
 *                             older address);
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

/** The emitted scripts that load the engine: the page's own copy (used when no
 *  worker can start) and the worker's. Each must hold an engine address. */
const ENGINE_LOADERS = ['pagefind.js', 'pagefind-worker.js'];

/** An engine address as Pagefind writes it: wasm.<language>.pagefind, the
 *  language a template expression (`wasm.${language}.pagefind`, one address
 *  for every language the build wrote) or a literal code. */
const ENGINE_ADDRESS = /wasm\.(?:\$\{[^}]*\}|[\w-]+)\.pagefind/g;

/** The end of any string that names a .pagefind file, with or without a
 *  query after it: an engine address in whatever form. One that ENGINE_ADDRESS
 *  does not match is reported as unread, so a new way of writing the address
 *  cannot pass unseen. */
const ENGINE_SUFFIX = /\.pagefind(?=[`"'?])/g;

/** The worker script's name, wherever pagefind.js writes it. */
const WORKER_ADDRESS = /pagefind-worker\.js/g;

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
 * The addresses the scripts in one Pagefind directory build for the two files
 * that keep their names from build to build, read against this build's id.
 * `engine` and `worker` list what is wrong, one line each; `ok` counts the
 * addresses that end ?v=<build id>.
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
    engine.push('pagefind-version.json holds no build id, so there is no id for an address to carry');
    return { engine, worker, ok };
  }
  let built = null;
  try { built = fs.readFileSync(path.join(nextDir, 'BUILD_ID'), 'utf8').trim(); } catch { /* no BUILD_ID file */ }
  if (built !== null && built !== id) {
    engine.push(`pagefind-version.json says build id ${JSON.stringify(id)} but this build's is ${JSON.stringify(built)} (.next/BUILD_ID), so the addresses would not change with the build`);
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
      if (tail === want) ok.engine++;
      else engine.push(`${name} asks for ${m[0]}${tail}, without this build's id (want ${m[0]}${want})`);
    }
    for (const m of code.matchAll(ENGINE_SUFFIX)) {
      if (ends.has(m.index + '.pagefind'.length)) continue;
      engine.push(`${name} holds a string ending in .pagefind that is not written as wasm.<language>.pagefind: ${JSON.stringify(code.slice(Math.max(0, m.index - 48), m.index + 24))}`);
    }
    if (ENGINE_LOADERS.includes(name) && ends.size === 0) {
      engine.push(`${name} holds no engine address written as wasm.<language>.pagefind, so what it asks for could not be read`);
    }

    if (name !== 'pagefind.js') continue;
    const starts = [...code.matchAll(WORKER_ADDRESS)];
    for (const m of starts) {
      const tail = addressTail(code, m.index + m[0].length);
      if (tail === want) ok.worker++;
      else worker.push(`${name} starts the worker at ${m[0]}${tail}, without this build's id (want ${m[0]}${want})`);
    }
    if (starts.length === 0) worker.push(`${name} does not name pagefind-worker.js, so the worker's address could not be read`);
  }
  return { engine, worker, ok };
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

  // 2b. With a deployment adapter (.next/output exists) the index must be in
  // the adapter's static output too: that copy is what is deployed, and it was
  // taken before postbuild-pagefind.js ran.
  const adapterStatic = path.join(nextDir, 'output', 'static');
  const indexDirs = [pagefindDir];
  if (fs.existsSync(adapterStatic)) {
    const deployed = path.join(adapterStatic, '_next', PAGEFIND_REL);
    const absent = ['pagefind.js', 'pagefind-entry.json', 'fragment'].filter((f) => !fs.existsSync(path.join(deployed, f)));
    if (absent.length) {
      add(
        'index-deployed',
        `A deployment adapter's output exists (.next/output/static) but the index is not in it (${path.relative(nextDir, deployed)}, missing: ${absent.join(', ')}). The deployment would answer 404 for the index and Find would serve only the curated INDEX.`,
        'postbuild-pagefind.js copies the index into .next/output/static/_next/static/chunks/app/pagefind; read its log lines.'
      );
    } else {
      indexDirs.push(deployed);
    }
  }

  // 2c. A returning browser gets this build's engine. The engine file and the
  // worker script keep their names from build to build and are cached for a
  // year, so every address the emitted scripts build for them must end
  // ?v=<build id>: in the index, and in the deployed copy when there is one.
  for (const dir of indexDirs) {
    const where = path.relative(nextDir, dir).split(path.sep).join('/');
    const { engine, worker, ok } = addressProblems(dir, nextDir);
    if (engine.length) {
      add(
        'engine-address-build-id',
        `${where}: ${engine.join('; ')}. A browser that kept an engine file (wasm.<language>.pagefind) from an older build would run it on this build's index. When the two come from different Pagefind versions the engine may be unable to read the index (1.5.2 cannot read one written by 1.6.0), and Find loses its full-text rows for that visitor.`,
        'postbuild-pagefind.js appends ?v=<build id> to each engine address before it copies the index; read its [postbuild-pagefind] lines in the build log. If Pagefind now writes the address another way, change the strings that script replaces and the patterns here (ENGINE_ADDRESS, ENGINE_SUFFIX) together.'
      );
    }
    if (worker.length) {
      add(
        'worker-address-build-id',
        `${where}: ${worker.join('; ')}. A browser that kept pagefind-worker.js from an older build would run that copy, which asks for the engine under the older build's address.`,
        'postbuild-pagefind.js appends ?v=<build id> to the worker address in pagefind.js; read its [postbuild-pagefind] lines in the build log. If Pagefind now writes the address another way, change the string that script replaces and WORKER_ADDRESS here together.'
      );
    }
    if (!engine.length && !worker.length) {
      notes.push(`${where}: ${ok.engine} engine address(es) and ${ok.worker} worker address(es) end ?v=${ok.id}`);
    }
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
