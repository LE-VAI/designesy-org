#!/usr/bin/env node
/**
 * Formula plate gate: on every engine page the method's formula plate keeps
 * its contents inside its edge, and an item that sits beside another is on
 * one line.
 *
 * WHY THIS EXISTS
 * The plate (.eg-formula in app/engine.css, rendered by EngineMethod in
 * app/lib/engine/engine-page.tsx) holds a formula, on most pages the letter
 * scale or a second formula beside it, and a note under both. It was a
 * two-column grid with one width threshold (44rem) for every page, and the
 * pages' formulas differ in length. Where the method was wider than the
 * threshold and narrower than the row, the second item was squeezed into
 * what the formula left: it broke over two to five lines on six pages,
 * across viewport widths 767 to 1069 on /report, and from 767 to 790
 * /report's last grade ran up to 24px past the plate's right edge.
 * Nothing clips there, so the edge contract's CUT check did not see it,
 * and no source check models wrapping. Only a browser that lays the page
 * out can.
 *
 * WHAT IT ASSERTS
 * Every route whose page passes formula= to EngineMethod (read from app/,
 * so a new engine page is covered without an edit here), at each width in
 * WIDTHS, dark theme unless --theme says light, 900px tall, reduced motion, fonts loaded:
 *   P1 EDGE. No item of the plate, and no child of an item, ends past the
 *      plate's right edge or starts before its left edge by more than half
 *      a pixel, and the plate has no horizontal scroll width of its own.
 *   P2 ROW. Two items that share a row are each on one line. An item on a
 *      row of its own may wrap; a formula longer than a phone is wide does.
 *   P3 NOTE. The last item starts under every item before it: the note
 *      never runs on after the formula.
 * A route with no plate, or a plate with fewer than two items, fails, so the
 * gate cannot pass by finding nothing.
 *
 * The widths are the boundaries of the measurement that found the defect
 * (all ten routes at every viewport width from 320 to 1100, /score/contract
 * to 1920): phones (320, 390), the last width under the 44rem floor and the
 * first over it (766, 767), a tablet's width (768), widths inside the old
 * overflow and squeezed bands and at their ends (771, 780, 834, 900, 1024,
 * 1070), and desktop (1280, 1440, 1596, 1920; at 1596 /score/contract's
 * own old threshold failed with tracking 0).
 *
 * --letter-spacing <value> sets body { letter-spacing: <value> } before
 * measuring. A row's width follows the tracking, so a threshold that holds
 * at one tracking can fail at another: with 0, the grid held /readiness'
 * scale on two lines from 767 to 770. --style <css> adds any other rules
 * the same way, such as a wider face for the operator glyph
 * (".eg-op { font-family: Consolas }"), and --theme light measures the
 * light theme.
 *
 * PROVING IT CAN FAIL
 * Against the build before the wrapping row (the two-column grid) the gate
 * exits 1: /report fails P1 at 767, 768, 771 and 780 and P2 from 767 to
 * 1024, and /score, /compare, /monitor, /drift and /readiness fail P2.
 * --break puts that grid back over a fixed build and the gate must exit 1.
 *
 * Usage:
 *   node scripts/check-formula-plate.js --base http://127.0.0.1:3422 --channel chrome
 *   node scripts/check-formula-plate.js --base ... --executable <path to a Chromium>
 *   node scripts/check-formula-plate.js --base ... --letter-spacing 0
 *   node scripts/check-formula-plate.js --base ... --style ".eg-op { font-family: Consolas }" --theme light
 *   node scripts/check-formula-plate.js --base ... --routes /report --widths 768,780
 *   node scripts/check-formula-plate.js --base ... --widths 320-1100 --json
 *        a range is every width in it; --json adds each plate's shape at each
 *        width (its height, and each item's offset, line count and whether it
 *        sits beside another), so two builds can be compared width by width
 *   node scripts/check-formula-plate.js --base ... --break          (must exit 1)
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const BASE = arg('--base', '').replace(/\/$/, '');
const CHANNEL = arg('--channel', undefined);
const EXECUTABLE = arg('--executable', null);
const TRACKING = arg('--letter-spacing', null);
const STYLE = arg('--style', '');
const THEME = arg('--theme', 'dark');
const BREAK = args.includes('--break');
const AS_JSON = args.includes('--json');

if (!BASE) {
  console.error(
    'usage: node scripts/check-formula-plate.js --base http://127.0.0.1:3422 [--channel chrome | --executable path] ' +
      '[--letter-spacing 0] [--style css] [--theme dark|light] [--routes /a,/b] [--widths 768,780 | 320-1100] [--break] [--json]',
  );
  process.exit(2);
}
if (TRACKING !== null && !/^-?[0-9.]+(px|em|rem)?$/.test(TRACKING)) {
  console.error('check-formula-plate: --letter-spacing takes a length, such as 0 or -0.003em');
  process.exit(2);
}

if (THEME !== 'dark' && THEME !== 'light') {
  console.error('check-formula-plate: --theme takes dark or light');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('check-formula-plate: playwright is not installed');
    process.exit(2);
  }
}

const APP = path.join(__dirname, '..', 'app');
const HEIGHT = 900;
const WIDTHS = [320, 390, 766, 767, 768, 771, 780, 834, 900, 1024, 1070, 1280, 1440, 1596, 1920];
const EDGE_TOLERANCE = 0.5;

// The layout this gate exists for: the two-column grid and its one threshold.
const BROKEN =
  '.eg-formula { display: grid !important; grid-template-columns: minmax(0, max-content) minmax(0, 1fr) !important; } ' +
  '.eg-formula > :last-child { grid-column: 1 / -1; } ' +
  '@container method (width < 44rem) { .eg-formula { grid-template-columns: minmax(0, 1fr) !important; } }';

/** Every static route whose page.tsx passes formula= to EngineMethod. */
function plateRoutes() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'page.tsx' && /\bformula=\{/.test(fs.readFileSync(full, 'utf8'))) {
        const route = '/' + path.relative(APP, dir).split(path.sep).join('/');
        if (!/[[(]/.test(route)) out.push(route);
      }
    }
  })(APP);
  return out.sort();
}

/** In the page: the findings for every plate at the current width. */
function measure(tolerance) {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const px = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}px`;
  const words = (el) => {
    const t = [...el.childNodes].map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    return JSON.stringify(t.length > 36 ? `${t.slice(0, 33)}...` : t);
  };
  // The lines an item's text sits on: its text nodes' boxes, grouped by
  // their vertical middle (an operator glyph's box is not the figures').
  const lines = (el) => {
    const slack = (parseFloat(getComputedStyle(el).lineHeight) || 16) * 0.4;
    const mids = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue;
        const mid = (r.top + r.bottom) / 2;
        if (!mids.some((m) => Math.abs(m - mid) < slack)) mids.push(mid);
      }
    }
    return mids.length;
  };
  return frame().then(() => {
    const plates = [...document.querySelectorAll('.eg-formula')];
    if (!plates.length) return { shapes: [], findings: ['no .eg-formula on the page'] };
    const findings = [];
    const shapes = [];
    for (const plate of plates) {
      const edge = plate.getBoundingClientRect();
      const items = [...plate.children];
      if (items.length < 2) {
        findings.push(`the plate has ${items.length} item(s); a formula and a note are expected`);
        continue;
      }
      // P1 EDGE
      for (const el of items.flatMap((item) => [item, ...item.children])) {
        const box = el.getBoundingClientRect();
        if (box.width === 0) continue;
        if (box.right - edge.right > tolerance) findings.push(`P1 EDGE ${words(el)} ends ${px(box.right - edge.right)} past the plate's right edge`);
        if (edge.left - box.left > tolerance) findings.push(`P1 EDGE ${words(el)} starts ${px(edge.left - box.left)} before the plate's left edge`);
      }
      if (plate.scrollWidth > plate.clientWidth) findings.push(`P1 EDGE the plate scrolls sideways (${plate.scrollWidth}px of content in ${plate.clientWidth}px)`);
      // P2 ROW
      const boxes = items.map((item) => item.getBoundingClientRect());
      const shares = (a, b) => Math.min(boxes[a].bottom, boxes[b].bottom) - Math.max(boxes[a].top, boxes[b].top) > 1;
      const shape = { height: edge.height, items: [] };
      items.forEach((item, i) => {
        const beside = items.some((_, j) => j !== i && shares(i, j));
        const n = lines(item);
        shape.items.push({ x: boxes[i].left - edge.left, y: boxes[i].top - edge.top, lines: n, beside });
        if (beside && n > 1) findings.push(`P2 ROW ${words(item)} is on ${n} lines beside another item`);
      });
      shapes.push(shape);
      // P3 NOTE
      const last = boxes[boxes.length - 1];
      const above = Math.max(...boxes.slice(0, -1).map((b) => b.bottom));
      if (above - last.top > tolerance) findings.push(`P3 NOTE the last item starts ${px(above - last.top)} above the end of the items before it`);
    }
    return { shapes, findings };
  });
}

async function runRoute(browser, route, widths) {
  const ctx = await browser.newContext({
    viewport: { width: widths[0], height: HEIGHT },
    colorScheme: THEME,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  });
  const failures = [];
  const shapes = {};
  try {
    const page = await ctx.newPage();
    const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 });
    if (!res || !res.ok()) return { route, widths: 0, failures: [{ width: null, text: `HTTP ${res ? res.status() : 'no response'}` }], shapes };
    const css = (TRACKING !== null ? `body { letter-spacing: ${TRACKING}; } ` : '') + `${STYLE} ` + (BREAK ? BROKEN : '');
    if (css.trim()) await page.addStyleTag({ content: css });
    await page.evaluate(async () => {
      try { await document.fonts.ready; } catch { /* no FontFaceSet */ }
    });
    for (const width of widths) {
      await page.setViewportSize({ width, height: HEIGHT });
      const got = await page.evaluate(measure, EDGE_TOLERANCE);
      for (const text of got.findings) failures.push({ width, text });
      if (AS_JSON) shapes[width] = got.shapes;
    }
  } catch (e) {
    failures.push({ width: null, text: `could not be measured: ${e.message.split('\n')[0]}` });
  } finally {
    await ctx.close();
  }
  return { route, widths: widths.length, failures, shapes };
}

(async () => {
  const started = Date.now();
  let routes = plateRoutes();
  if (!routes.length) {
    console.error('check-formula-plate: no page under app/ passes formula= to EngineMethod');
    process.exit(2);
  }
  const only = arg('--routes', null);
  if (only) routes = only.split(',').map((r) => r.trim()).filter(Boolean);
  let widths = WIDTHS;
  const onlyWidths = arg('--widths', null);
  if (onlyWidths) {
    widths = onlyWidths.split(',').flatMap((part) => {
      const [from, to = from] = part.split('-').map(Number);
      return Number.isInteger(from) && Number.isInteger(to) && to >= from ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [NaN];
    });
    if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 200)) {
      console.error('check-formula-plate: --widths takes comma-separated pixel widths or ranges, such as 768,780 or 320-1100');
      process.exit(2);
    }
  }

  let browser;
  try {
    browser = await chromium.launch(
      EXECUTABLE ? { executablePath: EXECUTABLE, headless: true } : { headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) },
    );
  } catch (e) {
    console.error(`check-formula-plate: cannot launch a browser: ${e.message.split('\n')[0]}`);
    process.exit(2);
  }
  const results = [];
  for (const route of routes) results.push(await runRoute(browser, route, widths));
  await browser.close();

  const failed = results.filter((r) => r.failures.length);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, base: BASE, break: BREAK, letterSpacing: TRACKING, style: STYLE, theme: THEME, widths, seconds, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`  ${r.failures.length ? 'FAIL' : 'ok  '} ${r.route}: ${r.widths} widths`);
      for (const f of r.failures) console.log(`         ${f.width === null ? '' : `@${f.width} `}${f.text}`);
    }
  }
  const note = (TRACKING !== null ? `, body letter-spacing ${TRACKING}` : '') + (STYLE ? ', --style set' : '') + (THEME === 'light' ? ', light theme' : '');
  if (failed.length) {
    console.error(`\nFormula plate gate FAILED on ${failed.length} of ${results.length} routes (${seconds}s${note}).`);
    process.exit(1);
  }
  if (BREAK) {
    console.error('\nFormula plate gate passed with --break set: it cannot see the defect it exists for.');
    process.exit(1);
  }
  if (!AS_JSON) console.log(`\nFormula plate gate passed on ${results.length} routes at ${widths.length} widths (${seconds}s${note}).`);
  process.exit(0);
})();
