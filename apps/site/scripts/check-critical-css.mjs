#!/usr/bin/env node
/**
 * Critical CSS gate. Runs AFTER `next build`.
 *
 * The root layout inlines a subset of globals.css (the rules in
 * app/critical-css.manifest.json) and loads the whole sheet without blocking
 * first paint (scripts/critical-css.mjs explains why and how). That is only safe
 * while the subset covers every rule the server-rendered pages use: a rule the
 * manifest lacks is missing from the first paint and pops in when the whole
 * sheet lands, which is a flash of unstyled content and, for a layout rule, a
 * layout shift.
 *
 * FAILS when:
 *   1. a prerendered page uses a globals.css rule the manifest lacks;
 *   2. a Next CSS chunk still carries globals.css (someone imported it again, so
 *      it would block first paint once more, and ship twice);
 *   3. the build did not wire the inline style and the loader into the pages
 *      (the layout change was reverted or the generated file was stale).
 * REPORTS (does not fail) manifest rules that no longer exist in globals.css.
 *
 *   node scripts/check-critical-css.mjs                 check
 *   node scripts/check-critical-css.mjs --update        rewrite the manifest
 *   ... --base http://localhost:3000                     also read the dynamic
 *                                                        routes from a running
 *                                                        `next start`
 *
 *   ... --base <url> --hydrated [--channel chrome]      also match the DOM of
 *                                                        every page after it
 *                                                        hydrates, in headless
 *                                                        Chrome at 390 and 1440
 *
 * --update ADDS what the pages use. It drops a listed rule only on a full read
 * (--base and --hydrated), because a narrower read cannot see the dynamic routes
 * (/score, /score/report) or the hydrated DOM, and would drop rules they use.
 *
 * --hydrated covers elements that exist only after hydration (the Back pill,
 * the definition copy badges, the report's error state ...). They are never in
 * the first paint, but if the whole sheet were slower than hydration they would
 * show unstyled for a moment; with their rules inlined they cannot. The update
 * the manifest ships with was made with --hydrated. The build-time check reads
 * server HTML only (no browser in the build), so it does not re-verify them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGlobalsCss, parseCss, ruleKey, matchRules, loadDoc, prerenderedPages, MANIFEST } from './critical-css.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const baseIdx = args.indexOf('--base');
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : null;
const HYDRATED = args.includes('--hydrated');
const chIdx = args.indexOf('--channel');
const CHANNEL = chIdx >= 0 ? args[chIdx + 1] : 'chrome';
if (HYDRATED && !BASE) { console.error('[critical-css] --hydrated needs --base <url of a running next start>'); process.exit(2); }
const DYNAMIC_ROUTES = ['/score', '/score/report', '/score/report?url=example.com'];

const failures = [];
const full = await buildGlobalsCss(SITE);
const root = parseCss(SITE, full);
const present = new Set();
root.walkRules((r) => { present.add(ruleKey(r)); });

const pages = prerenderedPages(SITE);
if (!pages.length) {
  console.error('[critical-css] no prerendered pages under .next/server/app: run `next build` first.');
  process.exit(1);
}
const docs = pages.map((p) => ({ name: p.name, html: fs.readFileSync(p.file, 'utf8') }));
if (BASE) {
  for (const r of DYNAMIC_ROUTES) {
    const res = await fetch(BASE + r, { headers: { accept: 'text/html' } });
    if (!res.ok) { console.error(`[critical-css] ${BASE}${r} answered ${res.status}`); process.exit(1); }
    docs.push({ name: r, html: await res.text() });
  }
}

// 3. The build wired it: every page carries the inline subset and the loader,
//    and no page links a stylesheet under /_css/ as render-blocking.
const generated = JSON.parse(fs.readFileSync(path.join(SITE, 'app/lib/critical-css.generated.json'), 'utf8'));
// Redirect-only routes (redirect() in a page, e.g. /blog) prerender Next's bare
// error shell, <html id="__next_error__">, which renders no layout and no content.
const rendered = docs.filter((d) => !d.html.includes('<html id="__next_error__">'));
const unwired = rendered.filter((d) => !d.html.includes('data-href="globals-critical"') || !d.html.includes(generated.href));
if (unwired.length) failures.push(`${unwired.length} page(s) lack the inline critical CSS or the loader for ${generated.href}, e.g. ${unwired.slice(0, 5).map((d) => d.name).join(', ')}`);
if (!fs.existsSync(path.join(SITE, 'public', generated.href))) failures.push(`${generated.href} is referenced but not in public/`);
const blockingGlobals = docs.filter((d) => /<link[^>]*rel="stylesheet"[^>]*href="\/_css\//.test(d.html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')));
if (blockingGlobals.length) failures.push(`${blockingGlobals.length} page(s) link /_css/ as a render-blocking stylesheet, e.g. ${blockingGlobals[0].name}`);

// --hydrated: the DOM after hydration, for coverage only (not the wiring checks:
// a serialised DOM is not what the server sent).
const hydratedDocs = [];
if (HYDRATED) {
  const { createRequire } = await import('node:module');
  const { chromium } = createRequire(import.meta.url)('playwright-core');
  const browser = await chromium.launch({ channel: CHANNEL, headless: true });
  const routes = [...rendered.map((d) => (d.name === '/_not-found' ? '/__critical-css-not-found' : d.name)), ...(BASE ? DYNAMIC_ROUTES : [])];
  const uniq = [...new Set(routes)];
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext(width < 768 ? { viewport: { width, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });
    await ctx.route('**/api/**', (r) => r.abort());
    await ctx.route('**/_vercel/**', (r) => r.abort());
    const page = await ctx.newPage();
    for (const r of uniq) {
      try {
        await page.goto(BASE + r, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(1500);
        hydratedDocs.push({ name: `${r} (hydrated, ${width})`, html: await page.content() });
      } catch (e) { console.error(`[critical-css] hydrated ${r} at ${width}: ${e.message.split('\n')[0]}`); }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`[critical-css] ${hydratedDocs.length} hydrated page snapshots`);
}

// 2. No Next CSS chunk carries globals.css. Its first rule, the tuned Fraunces
//    fallback face, is a marker no other sheet declares.
const cssDir = path.join(SITE, '.next', 'static', 'css');
const marker = 'Fraunces Fallback Tuned;src:';
if (fs.existsSync(cssDir)) {
  for (const f of fs.readdirSync(cssDir)) {
    if (f.endsWith('.css') && fs.readFileSync(path.join(cssDir, f), 'utf8').includes(marker)) {
      failures.push(`.next/static/css/${f} contains globals.css: it is imported again somewhere, so it blocks first paint and ships twice`);
    }
  }
}

// 1. Coverage.
const t0 = Date.now();
const { keys: used, firstDoc } = matchRules(root, [...docs, ...hydratedDocs].map((d) => ({ name: d.name, ...loadDoc(d.html) })));
const manifestPath = path.join(SITE, MANIFEST);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const listed = new Set(manifest.rules);
const missing = [...used].filter((k) => !listed.has(k));
const stale = manifest.rules.filter((k) => !present.has(k));

console.log(`[critical-css] ${docs.length} pages${BASE ? ` (incl. ${DYNAMIC_ROUTES.length} dynamic from ${BASE})` : ' (prerendered; dynamic routes not read)'}, ${present.size} globals rules, ${used.size} used, manifest ${listed.size}, ${(Date.now() - t0) / 1000}s`);

if (UPDATE) {
  const next = new Set(used);
  // Only a full read (dynamic routes AND hydrated DOM) may drop a rule; any
  // narrower read keeps every listed rule that still exists.
  if (!(BASE && HYDRATED)) for (const k of manifest.rules) if (present.has(k)) next.add(k);
  const rules = [...next].sort();
  const out = {
    about: 'Rules of app/globals.css that the root layout inlines for first paint. Generated: npm run update-critical-css (after a build). See scripts/critical-css.mjs.',
    rules,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(out, null, 1) + '\n');
  console.log(`[critical-css] manifest written: ${rules.length} rules (+${rules.filter((k) => !listed.has(k)).length} / -${manifest.rules.filter((k) => !next.has(k)).length})`);
  process.exit(0);
}

if (missing.length) {
  failures.push(`${missing.length} rule(s) used by a page are not in the critical manifest, so they would pop in after first paint:\n` +
    missing.slice(0, 25).map((k) => `      ${k}    (first on ${firstDoc.get(k)})`).join('\n') +
    (missing.length > 25 ? `\n      ... and ${missing.length - 25} more` : '') +
    '\n    Fix: build, then `npm run update-critical-css` and commit app/critical-css.manifest.json.' +
    '\n    (A full refresh, which also drops rules no page uses: `next start`, then' +
    '\n    `node scripts/check-critical-css.mjs --update --base http://localhost:3000 --hydrated`.)');
}
if (stale.length) console.log(`[critical-css] note: ${stale.length} manifest rule(s) no longer exist in globals.css (harmless; \`npm run update-critical-css\` drops them).`);

if (failures.length) {
  console.error('[critical-css] FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[critical-css] PASS: every rule the pages use is inlined, globals.css is in no blocking chunk, and every page is wired.');
