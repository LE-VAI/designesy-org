#!/usr/bin/env node
/**
 * Word-boundary render gate: every space the search index adds between two
 * elements' text must sit where a reader already sees two words.
 *
 * WHY THIS EXISTS
 * scripts/lib/word-boundaries.js adds a space to the copy of each page Pagefind
 * indexes wherever a letter or digit meets a letter or digit across element
 * tags ("Score it again" + "Visit" was indexed as "againVisit"). That is right
 * only where the page shows the two sides apart: on another line, or with a
 * visible gap. Where they render touching, the markup split one word
 * (<em>un</em>believable, de<mark>sign</mark>) and a space in the index would
 * make two words of it. The module's rules leave inline formatting, sup, sub,
 * abbr and CJK alone; this gate checks the rest against the rendered page, so
 * a new component that splits a word with a span fails the build instead of
 * reaching the index.
 *
 * WHAT IT DOES
 *   1. Self-test on fixtures: a word split by two inline spans (renders
 *      touching) must be caught, and the formatting cases get no space at all.
 *      A gate that cannot fail proves nothing.
 *   2. For every page in the search index: the served HTML (.next/server/app)
 *      gets a marker comment at each point separateWords would add a space.
 *      Comments change neither layout nor selector matching. The page is loaded
 *      from the server with that HTML and JavaScript off (so the DOM is the
 *      served markup, not a hydrated variant), at 1440 and at 390. For each
 *      marker the last character before it and the first after it are
 *      measured: apart (another line, or a gap of 1px or more), between two
 *      table cells (separate by structure, however the table is drawn), not
 *      rendered, or touching. One touching marker fails the gate.
 *
 * Usage:  node scripts/check-word-boundaries-render.js --base http://127.0.0.1:3422 [--channel chrome] [--json]
 * Runs after `next build` and postbuild-pagefind, against `next start`.
 * Exits 1 on a touching boundary or a failed self-test.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { separationPoints, insertAt, separateWords } = require('./lib/word-boundaries');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg('--base', null);
const CHANNEL = arg('--channel', undefined);
const AS_JSON = process.argv.includes('--json');
if (!BASE) {
  console.error('usage: node scripts/check-word-boundaries-render.js --base http://127.0.0.1:3422 [--channel chrome] [--json]');
  process.exit(2);
}

const APP = path.join(__dirname, '..');
const NEXT = path.join(APP, '.next');
const STAGE = path.join(NEXT, 'search-stage');
const SERVED = path.join(NEXT, 'server', 'app');
const MARK = 'word-sep';
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

/** Indexed page routes and their served HTML file. */
function indexedPages() {
  if (!fs.existsSync(STAGE)) throw new Error(`no ${path.relative(APP, STAGE)}: run after next build and postbuild-pagefind`);
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (path.relative(STAGE, p) !== 'endpoints') walk(p);
        continue;
      }
      if (!e.name.endsWith('.html')) continue;
      const rel = path.relative(STAGE, p).split(path.sep).join('/');
      const file = [path.join(SERVED, rel), path.join(SERVED, rel.replace(/\.html$/, ''), 'index.html')].find(
        (f) => fs.existsSync(f) && fs.statSync(f).isFile()
      );
      if (!file) continue;
      const route = rel === 'index.html' ? '/' : `/${rel.replace(/\.html$/, '')}`;
      out.push({ route, file });
    }
  })(STAGE);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** In the page: classify the two sides of every marker comment. */
function measure(mark) {
  const nodes = [];
  const tw = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
  const isText = (n) => n.nodeType === 3 && n.nodeValue.trim();
  const charRect = (node, fromEnd) => {
    const t = node.nodeValue;
    let i = fromEnd ? t.length - 1 : 0;
    while (i >= 0 && i < t.length && /\s/.test(t[i])) i += fromEnd ? -1 : 1;
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + 1);
    const rects = r.getClientRects();
    return rects.length && rects[0].width + rects[0].height > 0 ? rects[0] : null;
  };
  const out = [];
  nodes.forEach((n, k) => {
    if (n.nodeType !== 8 || n.nodeValue !== mark) return;
    let i = k - 1;
    while (i >= 0 && !isText(nodes[i])) i -= 1;
    let j = k + 1;
    while (j < nodes.length && !isText(nodes[j])) j += 1;
    if (i < 0 || j >= nodes.length) return out.push({ seen: 'unpaired' });
    const left = nodes[i];
    const right = nodes[j];
    const a = charRect(left, true);
    const b = charRect(right, false);
    // Two table cells are two items by structure, however narrow the table
    // draws them (at 390 a rank column can sit flush against the next one).
    const cellA = left.parentElement?.closest('td,th');
    const cellB = right.parentElement?.closest('td,th');
    let seen = 'hidden';
    if (cellA && cellB && cellA !== cellB) seen = 'cells';
    else if (a && b) {
      const sameLine = Math.abs(a.top - b.top) < Math.max(4, Math.min(a.height, b.height) / 2);
      const gap = b.left - a.right;
      seen = sameLine && gap < 1 && gap > -2 ? 'touching' : 'apart';
    }
    out.push({
      seen,
      tail: (left.nodeValue.match(/(\S{1,30})\s*$/) || ['', ''])[1],
      head: (right.nodeValue.match(/^\s*(\S{1,30})/) || ['', ''])[1],
      where: `${left.parentElement?.tagName.toLowerCase()}.${(left.parentElement?.className || '').toString().split(' ')[0]} | ${right.parentElement?.tagName.toLowerCase()}.${(right.parentElement?.className || '').toString().split(' ')[0]}`,
    });
  });
  return out;
}

async function main() {
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) });
  const failures = [];
  const totals = {};
  try {
    // ── 1. Self-test ─────────────────────────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: WIDTHS[0], javaScriptEnabled: false });
      const page = await ctx.newPage();
      const touchingWord = '<p style="font:16px/1.5 sans-serif"><span>un</span><span>believable</span></p>';
      const at = separationPoints(touchingWord);
      if (at.length !== 1) failures.push(`self-test: expected one separation point in ${touchingWord}, got ${at.length}`);
      await page.setContent(insertAt(touchingWord, at, `<!--${MARK}-->`));
      const seen = await page.evaluate(measure, MARK);
      if (seen.length !== 1 || seen[0].seen !== 'touching') failures.push(`self-test: a word split by two inline spans was not caught (${JSON.stringify(seen)})`);
      const apartWords = '<div><span style="display:block">Score it again</span><span style="display:block">Visit</span></div>';
      await page.setContent(insertAt(apartWords, separationPoints(apartWords), `<!--${MARK}-->`));
      const apart = await page.evaluate(measure, MARK);
      if (apart.length !== 1 || apart[0].seen !== 'apart') failures.push(`self-test: two block spans were not measured apart (${JSON.stringify(apart)})`);
      for (const html of ['<p><em>un</em>believable</p>', '<p>x<sup>2</sup></p>', '<p>de<mark>sign</mark></p>', '<p><span>设计</span><span>系统</span></p>']) {
        if (separateWords(html).inserted !== 0) failures.push(`self-test: a space would be added inside ${html}`);
      }
      await ctx.close();
      if (!AS_JSON) console.log(`  self-test: ${failures.length ? 'FAIL' : 'ok'} (a split word is caught, block spans read apart, formatting and CJK get no space)${failures.map((f) => `\n    ${f}`).join('')}`);
    }

    // ── 2. Every indexed page ────────────────────────────────────────────
    const pages = indexedPages();
    if (pages.length < 50) failures.push(`only ${pages.length} indexed page(s) found`);
    for (const size of WIDTHS) {
      const ctx = await browser.newContext({ viewport: size, javaScriptEnabled: false, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      let markers = 0;
      const counts = { apart: 0, hidden: 0, cells: 0, touching: 0, unpaired: 0 };
      for (const { route, file } of pages) {
        const html = fs.readFileSync(file, 'utf8');
        const at = separationPoints(html);
        if (!at.length) continue;
        const marked = insertAt(html, at, `<!--${MARK}-->`);
        await page.route(`${BASE}${route}`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: marked }));
        await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 60000 });
        await page.unroute(`${BASE}${route}`);
        const seen = await page.evaluate(measure, MARK);
        markers += at.length;
        if (seen.length !== at.length) failures.push(`${route} @${size.width}: ${at.length} separation point(s) in the HTML, ${seen.length} marker(s) in the DOM`);
        for (const s of seen) {
          counts[s.seen] += 1;
          if (s.seen === 'touching') failures.push(`${route} @${size.width}: "${s.tail}" and "${s.head}" render touching (${s.where}): a space here would split one word`);
          if (s.seen === 'unpaired') failures.push(`${route} @${size.width}: a separation point with no text on one side`);
        }
      }
      totals[size.width] = { pages: pages.length, markers, ...counts };
      if (!AS_JSON) console.log(`  ${size.width}: ${markers} space(s) on ${pages.length} pages: ${counts.apart} apart, ${counts.cells} between table cells, ${counts.hidden} not rendered, ${counts.touching} touching`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  if (AS_JSON) console.log(JSON.stringify({ ok: failures.length === 0, totals, failures }, null, 2));
  else if (failures.length) {
    console.log(`\n${failures.length} problem(s):\n  ${failures.slice(0, 40).join('\n  ')}${failures.length > 40 ? `\n  ... ${failures.length - 40} more` : ''}`);
  } else console.log('\nword-boundaries render: every added space sits where the page already shows two words');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
