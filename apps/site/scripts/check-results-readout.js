#!/usr/bin/env node
/**
 * Results readout gate: the readout reads as one voice, the count lines hold
 * one line, and no results text drops below 12px.
 *
 * WHY THIS EXISTS
 * The results audit of 2026-10-10 measured the old result card: the grade
 * letter in a box in its own face and size beside the numeral, category
 * counts set in a narrow fourth column where 7 of 14 rows wrapped at 1440,
 * and legend, tile and tick text at 9.6 to 11.2px. The approved readout (B′)
 * fixes all three, and each is easy to lose again in one CSS edit that every
 * static check passes: a font shorthand on the letter, a longer count line,
 * a "smaller" label. Only a browser that lays the page out can see them.
 *
 * WHAT IT ASSERTS
 * On the score form (/ and /score/lovable), the report (/score/report) and the
 * four-engine form (/score), each loaded with a mocked result whose count
 * lines include the longest the engine can produce, at 390 and 1440 wide:
 *   R1. the grade letter (.rs-grade) and the numeral (.rs-num) share one
 *       font family, size and weight, and their baselines sit within 2px;
 *   R2. every count line (.rs-detail, and the engine tiles' line on /score),
 *       the list's legend and each status filter tab stay on one line, and
 *       none is clipped (the plain status names are long: "Needs a browser
 *       run" broke onto three lines in a 105px tab, and ran into the next
 *       tab at 390, before the tabs took their labels' width);
 *   R3. no visible text in the result (.rs) or the engine tiles is set below
 *       12px.
 *
 * PROVING IT CAN FAIL
 * Against the build before the B′ readout, R1 fails (no letter set in the
 * numeral's voice) and R3 fails on the tiles. --break injects three later
 * regressions into a fixed build, one per check, and the gate must exit 1:
 * the letter set smaller than the numeral, the count line squeezed to 8ch,
 * and the scale's ticks set at 11px.
 *
 * Usage:
 *   node scripts/check-results-readout.js --base http://127.0.0.1:3422 --channel chrome
 *   node scripts/check-results-readout.js --base ... --cdp http://127.0.0.1:9337 [--break] [--json]
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('--base', '').replace(/\/$/, '');
const CHANNEL = arg('--channel', undefined);
const CDP = arg('--cdp', null);
const BREAK = args.includes('--break');
const AS_JSON = args.includes('--json');

if (!BASE) {
  console.error('usage: node scripts/check-results-readout.js --base http://127.0.0.1:3422 [--channel chrome | --cdp URL] [--break] [--json]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('check-results-readout: playwright is not installed');
    process.exit(2);
  }
}

// ── The mocked result ─────────────────────────────────────────────────────
// Every count line the engine can write, including the longest: a category
// with a failed check, checks that need work and one that needs a browser run
// (only the browser-audit checks v02, v04 and v21 are ever manual; v04 sits in
// poise, beside checks that can fail).
const CATS = {
  cadence: { score: 41.7, weight: 18, pass: 1, fail: 2, warn: 10, skip: 0, manual: 0 },
  accessibility: { score: 50, weight: 15, pass: 1, fail: 1, warn: 3, skip: 2, manual: 0 },
  semantic: { score: 100, weight: 12, pass: 3, fail: 0, warn: 0, skip: 0, manual: 0 },
  motion: { score: 50, weight: 10, pass: 1, fail: 1, warn: 1, skip: 2, manual: 0 },
  tokens: { score: null, weight: 9, pass: 0, fail: 0, warn: 0, skip: 2, manual: 0 },
  takt: { score: 75, weight: 8, pass: 2, fail: 0, warn: 1, skip: 0, manual: 0 },
  copywriting: { score: 87.5, weight: 8, pass: 3, fail: 0, warn: 1, skip: 0, manual: 0 },
  poise: { score: 37.5, weight: 7, pass: 1, fail: 1, warn: 2, skip: 0, manual: 1 },
  identity: { score: 100, weight: 6, pass: 4, fail: 0, warn: 0, skip: 0, manual: 0 },
  interaction: { score: 0, weight: 6, pass: 0, fail: 2, warn: 0, skip: 0, manual: 0 },
  performance: { score: null, weight: 6, pass: 0, fail: 0, warn: 0, skip: 0, manual: 1 },
  security: { score: 100, weight: 5, pass: 2, fail: 0, warn: 0, skip: 0, manual: 0 },
  spec: { score: null, weight: 4, pass: 0, fail: 0, warn: 0, skip: 1, manual: 0 },
  responsive: { score: null, weight: 3, pass: 0, fail: 0, warn: 0, skip: 0, manual: 1 },
};
const checks = [];
let n = 0;
for (const [category, c] of Object.entries(CATS)) {
  for (const [status, count] of [['PASS', c.pass], ['FAIL', c.fail], ['WARN', c.warn], ['SKIP', c.skip], ['MANUAL', c.manual]]) {
    for (let i = 0; i < count; i++) {
      n++;
      checks.push({ id: `v${String(n).padStart(2, '0')}`, item: `Readout probe check ${n}`, category, status, detail: 'Readout probe.', weight: 1 });
    }
  }
}
const tally = (s) => checks.filter((c) => c.status === s).length;
const SCORE = {
  ok: true,
  contractVersion: 'v0.4.3',
  score: 67.9,
  grade: 'D',
  pass: tally('PASS'),
  fail: tally('FAIL'),
  warn: tally('WARN'),
  skip: tally('SKIP'),
  manual: tally('MANUAL'),
  total: checks.length,
  scored: checks.length - tally('SKIP') - tally('MANUAL'),
  scope: 'universal',
  a11yFloorApplied: false,
  hardFailCeilingApplied: false,
  hardFailCeilingReason: null,
  categoryScores: CATS,
  checks,
  tokensExtracted: 120,
  slop: { total: 0, findings: [], convergences: '' },
  originality: { points: 0, signals: [], summary: '', slopGateApplied: false },
};
const engine = (score, grade, pass, warn, fail, prefix) => ({
  ok: true,
  url: 'https://example.com/',
  scope: 'universal',
  score,
  grade,
  pass,
  warn,
  fail,
  skip: 0,
  total: pass + warn + fail,
  checks: Array.from({ length: pass + warn + fail }, (_, i) => ({
    id: `${prefix}${String(i + 1).padStart(2, '0')}`,
    item: `Readout probe ${prefix} check ${i + 1}`,
    category: 'tokens',
    status: i < pass ? 'PASS' : i < pass + warn ? 'WARN' : 'FAIL',
    detail: 'Readout probe.',
  })),
});
const DRIFT = engine(33, 'F', 3, 2, 7, 'd');
const READY = engine(35, 'F', 3, 1, 6, 'r');
const REPORT = {
  ok: true,
  url: 'https://example.com/',
  compositeScore: 51,
  compositeGrade: 'F',
  score: SCORE,
  drift: DRIFT,
  readiness: READY,
  totalChecks: SCORE.total + DRIFT.total + READY.total,
  totalPass: SCORE.pass + DRIFT.pass + READY.pass,
  totalWarn: SCORE.warn + DRIFT.warn + READY.warn,
  totalFail: SCORE.fail + DRIFT.fail + READY.fail,
  totalSkip: SCORE.skip,
  totalManual: SCORE.manual,
  checks: [{ id: 'rp01', item: 'Target URL fetched and validated', status: 'PASS', detail: 'Readout probe.' }],
  synthesis: [],
};
const GUARD = { ...engine(100, 'A', 6, 0, 0, 'g'), bundle: {} };

const submit = (label) => async (page) => {
  const field = page.getByRole('textbox', { name: label });
  await field.fill('example.com');
  await field.press('Enter');
};

const SURFACES = [
  { name: 'score form (/)', route: '/', mocks: { '/api/score': SCORE }, trigger: submit('Site URL to score'), readout: true },
  { name: 'score form (/score/lovable)', route: '/score/lovable', mocks: { '/api/score': SCORE }, trigger: submit('Site URL to score'), readout: true },
  { name: 'report (/score/report)', route: '/score/report?url=example.com', mocks: { '/api/score': SCORE }, readout: true },
  {
    name: 'four-engine form (/score)',
    route: '/score',
    mocks: { '/api/report': REPORT, '/api/guardrails': GUARD },
    trigger: submit('Site URL to verify'),
    readout: false,
  },
];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

const BREAK_CSS = `
  .rs-grade { font-size: 2.5rem !important; }
  .rs-detail { display: block; max-width: 8ch !important; }
  .rs-ticks, .rs-ticks b { font-size: 11px !important; }
`;

/** Runs in the page: R1 to R3 on what is laid out now. */
function measure() {
  const out = { readout: null, lines: [], small: [] };
  const visible = (el) => {
    if (!el || el.closest('.sr-only')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const baseline = (el) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    el.insertBefore(probe, el.firstChild);
    const y = probe.getBoundingClientRect().bottom;
    probe.remove();
    return y;
  };

  const grade = document.querySelector('.rs-grade');
  const num = document.querySelector('.rs-num');
  if (grade && num) {
    const g = getComputedStyle(grade);
    const v = getComputedStyle(num);
    out.readout = {
      grade: { family: g.fontFamily, size: g.fontSize, weight: g.fontWeight, baseline: baseline(grade) },
      num: { family: v.fontFamily, size: v.fontSize, weight: v.fontWeight, baseline: baseline(num) },
    };
  }

  // One line: every run of text sits on one line (the vertical centres of its
  // text boxes agree within half the font size; a legend's swatches are not
  // text and do not count), and nothing is cut off.
  for (const el of document.querySelectorAll('.rs-detail, .rs-legend, .score-engine-tile-pwf, .score-filter-tab')) {
    if (!visible(el)) continue;
    const centres = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) if (r.width > 0) centres.push((r.top + r.bottom) / 2);
    }
    const tol = parseFloat(getComputedStyle(el).fontSize) / 2;
    centres.sort((a, b) => a - b);
    let lines = centres.length ? 1 : 0;
    for (let i = 1; i < centres.length; i++) if (centres[i] - centres[i - 1] > tol) lines++;
    out.lines.push({
      cls: el.className,
      text: el.textContent.trim(),
      lines,
      clipped: el.scrollWidth > el.clientWidth + 1,
    });
  }

  // Every visible text node in the result and the engine tiles, at 12px or more.
  for (const root of document.querySelectorAll('.rs, .score-engine-tile')) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      if (!visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) out.small.push({ cls: el.className || el.tagName.toLowerCase(), text: t.textContent.trim().slice(0, 40), size });
    }
  }
  return out;
}

async function probe(browser, surface, vp) {
  const label = `${surface.name} @${vp.w}`;
  const failures = [];
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.w < 768 ? 3 : 1, reducedMotion: 'reduce' });
  try {
    if (BREAK) {
      await ctx.addInitScript((css) => {
        const add = () => {
          const s = document.createElement('style');
          s.textContent = css;
          document.head.appendChild(s);
        };
        if (document.head) add();
        else document.addEventListener('DOMContentLoaded', add);
      }, BREAK_CSS);
    }
    for (const [path, body] of Object.entries(surface.mocks)) {
      await ctx.route(new RegExp(`${path.replace(/\//g, '\\/')}(\\?.*)?$`), (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
          : route.continue(),
      );
    }
    const page = await ctx.newPage();
    await page.goto(BASE + surface.route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (surface.trigger) await surface.trigger(page);
    await page.waitForSelector(surface.readout ? '.rs-readout, .rs-row' : '.score-engine-tile-grade:not(.is-empty)', { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const m = await page.evaluate(measure);

    if (surface.readout) {
      if (!m.readout) {
        failures.push('R1 no readout: the grade letter is not set beside the numeral as .rs-grade and .rs-num');
      } else {
        const { grade: g, num: v } = m.readout;
        for (const k of ['family', 'size', 'weight']) {
          if (g[k] !== v[k]) failures.push(`R1 the letter's font ${k} is ${g[k]}, the numeral's ${v[k]}`);
        }
        const d = Math.abs(g.baseline - v.baseline);
        if (d > 2) failures.push(`R1 the letter's baseline sits ${d.toFixed(1)}px from the numeral's (at most 2)`);
      }
      if (!m.lines.some((l) => /rs-detail/.test(l.cls))) failures.push('R2 no count lines (.rs-detail) were drawn');
    }
    for (const l of m.lines) {
      if (l.lines > 1) failures.push(`R2 wraps to ${l.lines} lines: "${l.text}" (${l.cls})`);
      else if (l.clipped) failures.push(`R2 clipped: "${l.text}" (${l.cls})`);
    }
    const small = new Map();
    for (const s of m.small) small.set(`${s.cls}|${s.size}`, s);
    for (const s of small.values()) failures.push(`R3 ${s.size}px text: "${s.text}" (${s.cls})`);
    return { surface: label, failures, lines: m.lines.length, readout: m.readout };
  } catch (e) {
    return { surface: label, failures: [`fatal: ${e.message.split('\n')[0]}`], fatal: true };
  } finally {
    await ctx.close();
  }
}

(async () => {
  let browser;
  try {
    browser = CDP ? await chromium.connectOverCDP(CDP) : await chromium.launch({ headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) });
  } catch (e) {
    console.error(`check-results-readout: cannot reach a browser: ${e.message}`);
    process.exit(2);
  }
  const results = [];
  for (const surface of SURFACES) for (const vp of VIEWPORTS) results.push(await probe(browser, surface, vp));
  if (!CDP) await browser.close();

  const failed = results.filter((r) => r.failures.length);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, break: BREAK, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`  ${r.failures.length ? 'FAIL' : 'ok  '} ${r.surface}: ${r.lines} one-line checks`);
      for (const f of r.failures) console.log(`         ${f}`);
    }
  }
  if (results.some((r) => r.fatal)) process.exit(2);
  if (failed.length) {
    console.error(`\nResults readout gate FAILED on ${failed.length} of ${results.length} surface widths.`);
    process.exit(1);
  }
  if (!AS_JSON) console.log(`Results readout gate passed on ${results.length} surface widths.`);
  // A browser reached over --cdp stays connected, and the open socket would
  // keep this process alive.
  process.exit(0);
})();
