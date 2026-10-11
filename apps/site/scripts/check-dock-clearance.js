#!/usr/bin/env node
/**
 * Dock clearance gate: the floating Studio and Back pills never cover
 * readable content or a control, at any width, at any scroll position.
 *
 * WHY THIS EXISTS
 * On a phone (390px, dark, X's in-app browser) the Studio pill sat over the
 * right end of the stripe.com score's category bars and hid the value
 * "Tokens 100". The pacing (lib/director-dock) brought the pill up on any
 * scroll up, mid-page, where no room is kept for it, so it landed on whatever
 * the bottom corner held. No source check can see that, and no rendered check
 * looked: the overlap exists only at a scroll position, after a scroll
 * direction. This walks the page and measures it.
 *
 * WHAT IT ASSERTS
 * Every route (MARKDOWN_ROUTES in next.config.ts plus the dynamic surfaces,
 * the set the a11y sweep uses) at 320x568, 390x844 and 768x1024 (mobile,
 * touch) and 1440x900, dark and light. Two score results states as well:
 * /api/score is mocked (page.route) with a full result shaped like
 * stripe.com's (every registered check, the 14-category spread of a live
 * stripe.com run, Tokens 100, slop and originality signals), rendered by the
 * home form and by /score/report. Each page is reached from another page, so
 * the Back pill exists too (from 721px; phones drop it by design).
 * First one pass down the page a viewport at a time, so every reveal has run.
 * Then the walk: down and back up in steps of 1.8 viewports (each step moves
 * the pacing one way or the other; the sweep below covers the positions
 * between stops), the last 72px on the way down in 6px steps (where the pill
 * first comes up at the end of the page), and on a results page the owner's
 * own move: each category row brought to the bottom corner by a scroll up.
 * At each stop, after the pacing's frame, a pill counts as shown when it is
 * rendered (checkVisibility, opacity and visibility included) and on screen.
 *   C1 CLEAR. A shown pill's border box meets no text (the line boxes of each
 *      non-blank text node), no control (links, buttons, fields, summary,
 *      ARIA widgets, tab stops) and no value cell (td, th, dd, output, meter,
 *      progress, ARIA cells, classes ending -score, -value, -val, -num,
 *      -count, -pct), by more than half a pixel either way. Each box is first
 *      cut to its clipping ancestors, so text scrolled out of a scroll box or
 *      held in an sr-only clip is not under the pill. Between two stops at
 *      which a pill is shown at the same screen position, the page passes
 *      under it continuously: the in-flow boxes are also tested against the
 *      pill swept over that whole range, not only at the stops.
 *   C2 REACHABLE. The pill is not tucked away for good, which would pass C1
 *      vacuously. From 1320px CSS parks it in the gutter, so it is shown at
 *      every stop; narrower, it is shown at the end of the page.
 * Transitions and animations on the two pills are switched off for the
 * measurement, so every stop reads the pill's settled state. The pacing, the
 * page and the motion preference are otherwise as a visitor has them.
 *
 * PROVING IT CAN FAIL
 * Against the build before the fix (main at e87ec83e, 2026-10-10: the pill
 * came up on any scroll up) 378 of 560 pages fail C1: all 140 at 320, 134 at
 * 390, 104 at 768, none at 1440, where the gutter was already clear; both
 * results states fail at every touch width. --break holds both pills shown at
 * every stop at every width, the defect at its broadest, and the gate must
 * exit 1 (it fails all 420 pages below 1320px).
 *
 * Usage:
 *   node scripts/check-dock-clearance.js --base http://127.0.0.1:3422 --channel chrome
 *   node scripts/check-dock-clearance.js --base ... --routes /,/docs --widths 390 --themes dark
 *   node scripts/check-dock-clearance.js --base ... --results-only --json
 *   node scripts/check-dock-clearance.js --base ... --concurrency 8 --verbose
 *   node scripts/check-dock-clearance.js --base ... --safe-area 34   (an iPhone's bottom inset)
 *   node scripts/check-dock-clearance.js --base ... --break          (must exit 1)
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('--base', '').replace(/\/$/, '');
const CHANNEL = opt('--channel', 'chrome');
const AS_JSON = args.includes('--json');
const BREAK = args.includes('--break');
const RESULTS_ONLY = args.includes('--results-only');
const CONCURRENCY = Math.max(1, Number(opt('--concurrency', '4')) || 4);
const VERBOSE = args.includes('--verbose');
// A phone's bottom safe-area inset (an iPhone's home indicator is 34px),
// emulated on the touch widths, where env(safe-area-inset-bottom) lifts the
// pill. Chrome reports no inset of its own, so without this the inset is 0.
const SAFE_AREA = Number(opt('--safe-area', '0')) || 0;

if (!BASE) {
  console.error(
    'usage: node scripts/check-dock-clearance.js --base http://127.0.0.1:3422 [--channel chrome] ' +
      '[--routes /a,/b] [--widths 320,390] [--themes dark,light] [--results-only] [--break] [--json]',
  );
  process.exit(2);
}

const VIEWPORTS = [
  { w: 320, h: 568, mobile: true },
  { w: 390, h: 844, mobile: true },
  { w: 768, h: 1024, mobile: true },
  { w: 1440, h: 900, mobile: false },
];

// The gutter tier of globals.css ("Gutter parking"): from here the pills
// rest beside the shell and are always shown.
const GUTTER_MIN = 1320;

const PILLS = { studio: '.director-dock', back: '.back-button' };

const CONTROLS =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
  '[role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], ' +
  '[role="radio"], [role="menuitem"], [role="option"], [role="slider"], [role="combobox"], ' +
  '[role="textbox"], [role="spinbutton"], [tabindex]:not([tabindex^="-"])';
const VALUES =
  'td, th, dd, output, meter, progress, [role="cell"], [role="gridcell"], ' +
  '[role="rowheader"], [role="columnheader"], [role="meter"], [role="progressbar"]';
const VALUE_CLASS = /-(score|value|val|num|count|pct)$/;

// Settled state for the measurement only: no entrance, no slide.
const PILL_STILL = `.director-dock, .back-button, .director-dock-label, .back-button-label {
  transition: none !important; animation: none !important; }`;
// The defect at its broadest: both pills held up everywhere.
const PILL_FORCED = `.director-dock, .back-button { opacity: 1 !important;
  visibility: visible !important; transform: none !important; pointer-events: auto !important; }`;

// stripe.com's spread per category from a live run of engine 1.2.0 on
// 2026-10-10 (67.9, D: 18 pass, 1 fail, 12 warn, 10 N/A, 3 manual), applied
// to the registered checks of each category in order. P pass, F fail,
// W warn, S N/A (skip), M manual.
const STRIPE_SPREAD = {
  tokens: 'PS',
  responsive: 'M',
  interaction: 'P',
  poise: 'PPM',
  motion: 'PPWSS',
  accessibility: 'PFWWWSS',
  identity: 'PW',
  takt: 'PP',
  cadence: 'PPPPPPWWSSSS',
  performance: 'M',
  semantic: 'WW',
  security: 'P',
  copywriting: 'PWWW',
  spec: 'S',
};
const LETTER = { P: 'PASS', F: 'FAIL', W: 'WARN', S: 'SKIP', M: 'MANUAL' };

/** A full score result shaped like stripe.com's, from the server's own
 *  check registry (/api/score/checks), so the feed renders every check. */
async function stripeLikeResult() {
  const res = await fetch(BASE + '/api/score/checks');
  if (!res.ok) throw new Error(`/api/score/checks answered ${res.status}`);
  const reg = await res.json();
  const used = {};
  const checks = reg.checks.map((c) => {
    const spread = STRIPE_SPREAD[c.category] || '';
    const i = (used[c.category] = (used[c.category] || 0) + 1) - 1;
    const status = LETTER[spread[i]] || 'PASS';
    const detail = {
      PASS: `${c.pass} (${c.threshold})`,
      WARN: `${c.warn}: ${c.threshold}; found 3 of 8 rules, the rest are absent from the stylesheet the engine read`,
      FAIL:
        `${c.fail}: 14 text pairs fall below their floor. ` +
        Array.from({ length: 14 }, (_, k) => `.c${k + 1} #6b7a90 on #f6f9fc ${(3.1 + k / 40).toFixed(2)}:1`).join(', '),
      SKIP: `${c.fail} (skipped: scope=universal; this check verifies Designesy-specific naming, and the site may use different names)`,
      MANUAL: 'requires browser viewport trace: run the full audit to resolve',
    }[status];
    const out = { id: c.id, item: c.item, category: c.category, status, detail, weight: c.weight };
    if (status !== 'PASS') {
      out.remediation = `Meet the threshold (${c.threshold}). Fix it in the global stylesheet, then score again: the check reads the live CSS, so a change ships when the site deploys.`;
    }
    return out;
  });
  const count = (s) => checks.filter((c) => c.status === s).length;
  const categoryScores = {};
  for (const [cat, weight] of Object.entries(reg.categoryWeights)) {
    const mine = checks.filter((c) => c.category === cat);
    if (!mine.length) continue;
    const n = (s) => mine.filter((c) => c.status === s).length;
    const graded = n('PASS') + n('WARN') + n('FAIL');
    categoryScores[cat] = {
      score: graded ? Math.round(((n('PASS') + n('WARN') / 2) / graded) * 1000) / 10 : null,
      weight,
      pass: n('PASS'),
      fail: n('FAIL'),
      warn: n('WARN'),
      skip: n('SKIP'),
      manual: n('MANUAL'),
    };
  }
  return {
    ok: true,
    contractVersion: reg.contractVersion,
    score: 67.9,
    grade: 'D',
    pass: count('PASS'),
    fail: count('FAIL'),
    warn: count('WARN'),
    skip: count('SKIP'),
    manual: count('MANUAL'),
    total: checks.length,
    scored: count('PASS') + count('FAIL') + count('WARN'),
    scope: 'universal',
    a11yFloorApplied: false,
    hardFailCeilingApplied: false,
    hardFailCeilingReason: null,
    categoryScores,
    checks,
    tokensExtracted: 714,
    slop: {
      total: 19,
      findings: [
        { id: 'S1', label: 'Overused font family', severity: 5, instances: 1, evidence: ['roboto'], deduction: 5 },
        { id: 'S4', label: 'Gradient text (background-clip:text)', severity: 4, instances: 1, evidence: ['.stat-graphic{background-clip:text}'], deduction: 4 },
        { id: 'S6', label: 'Repeated identical card grid', severity: 5, instances: 1, evidence: ['11 card-like classes with repeating grid layouts'], deduction: 5 },
        { id: 'S11', label: 'Marketing buzzword copy', severity: 3, instances: 7, evidence: ['streamline', 'empower', 'world-class', 'enterprise-grade', 'next-generation'], deduction: 5 },
      ],
      convergences: '4 anti-slop patterns detected',
    },
    originality: {
      points: 8,
      signals: [
        { id: 'O1', label: 'Bespoke motion easing', points: 3, evidence: '22 custom easing curves' },
        { id: 'O2', label: 'Modern layout primitives', points: 2, evidence: 'clamp() + container queries + subgrid' },
        { id: 'O3', label: 'Typographic detail', points: 2, evidence: '10 advanced type properties' },
        { id: 'O4', label: 'Tiered reduced-motion', points: 1, evidence: 'targeted (not blanket) motion reduction' },
        { id: 'O5', label: 'Advanced motion choreography', points: 2, evidence: 'scroll-driven animation' },
        { id: 'O6', label: 'Bespoke iconography', points: 1, evidence: '150 inline SVGs' },
        { id: 'O7', label: 'Semantic design tokens', points: 4, evidence: '8 semantic tokens' },
      ],
      summary: '7 craft signals (+8pts, capped from +15, slop-gated ×0.5)',
      slopGateApplied: true,
    },
  };
}

/** The results states: the mocked result rendered by each score surface. */
const RESULT_STATES = [
  {
    route: '/',
    label: '/ [stripe.com result]',
    ready: async (page) => {
      const field = page.getByRole('textbox', { name: 'Site URL to score' });
      await field.fill('stripe.com');
      await field.press('Enter');
      await page.locator('.score-cat-legend-row').first().waitFor({ timeout: 20000 });
      await page.locator('.score-check-group').first().waitFor({ timeout: 20000 });
    },
    anchors: '.score-cat-legend-row',
  },
  {
    route: '/score/report?url=https%3A%2F%2Fstripe.com',
    label: '/score/report [stripe.com result]',
    ready: async (page) => {
      await page.locator('.report-hero').waitFor({ timeout: 20000 });
    },
    anchors: null,
  },
];

/** Routes: the a11y sweep's full set (MARKDOWN_ROUTES plus the dynamic
 *  surfaces), so a new page is covered without editing this file. */
function allRoutes() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'next.config.ts'), 'utf8');
  const m = src.match(/const MARKDOWN_ROUTES = \[([\s\S]*?)\];/);
  if (!m) {
    console.error('[dock] MARKDOWN_ROUTES not found in next.config.ts');
    process.exit(2);
  }
  const listed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => (x[1] === 'index' ? '/' : '/' + x[1]));
  const dynamic = ['/score', '/compare', '/drift', '/readiness', '/guardrails', '/monitor', '/report'];
  return [...new Set([...listed, ...dynamic])];
}

/**
 * Runs IN THE PAGE: installs the probe. Kept as one plain function (passed to
 * page.evaluate, never a source string).
 */
function installProbe(cfg) {
  const r2 = (n) => Math.round(n * 10) / 10;
  // One rendering update, then a task: the scroll event fires in that update
  // and the pacing's own frame callback runs in it after ours, so by the task
  // the pill has taken its state for the new position.
  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const pillEls = () =>
    Object.fromEntries(Object.entries(cfg.pills).map(([k, s]) => [k, document.querySelector(s)]));
  const valueClass = new RegExp(cfg.valueClass);

  const names = new Map();
  const name = (el) => {
    if (names.has(el)) return names.get(el);
    const n = el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
    names.set(el, n);
    return n;
  };

  // One scan of every box the pills must stay off, in viewport coordinates at
  // the current scroll position, each cut to its clipping ancestors.
  function scan() {
    const pills = Object.values(pillEls()).filter(Boolean);
    const inPill = (el) => pills.some((p) => p.contains(el));
    const style = new Map();
    const cs = (el) => {
      let s = style.get(el);
      if (!s) style.set(el, (s = getComputedStyle(el)));
      return s;
    };
    const visible = new Map();
    const isVisible = (el) => {
      if (!visible.has(el)) {
        visible.set(el, el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
      }
      return visible.get(el);
    };
    const fixed = new Map();
    const isFixed = (el) => {
      if (!el || el === document.documentElement) return false;
      if (!fixed.has(el)) {
        const p = cs(el).position;
        fixed.set(el, p === 'fixed' || p === 'sticky' || isFixed(el.parentElement));
      }
      return fixed.get(el);
    };
    // The box an element's content is clipped to (null: unclipped).
    const clips = new Map();
    const EMPTY = { l: 0, t: 0, r: 0, b: 0, empty: true };
    const cut = (a, b) => {
      if (!a) return b;
      if (!b) return a;
      const o = { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) };
      return o.r - o.l < 0 || o.b - o.t < 0 ? EMPTY : o;
    };
    const contentClip = (el) => {
      if (!el || el === document.documentElement) return null;
      if (clips.has(el)) return clips.get(el);
      const s = cs(el);
      // A fixed layer is clipped by the viewport, not by the page around it.
      let c = s.position === 'fixed' ? null : contentClip(el.parentElement);
      if (s.clip && s.clip !== 'auto') c = EMPTY;
      else if (/inset\(\s*50%/.test(s.clipPath)) c = EMPTY;
      else {
        const cx = s.overflowX !== 'visible';
        const cy = s.overflowY !== 'visible';
        if (cx || cy) {
          const r = el.getBoundingClientRect();
          const own = {
            l: cx ? r.left + parseFloat(s.borderLeftWidth) : -Infinity,
            r: cx ? r.right - parseFloat(s.borderRightWidth) : Infinity,
            t: cy ? r.top + parseFloat(s.borderTopWidth) : -Infinity,
            b: cy ? r.bottom - parseFloat(s.borderBottomWidth) : Infinity,
          };
          c = cut(c, own);
        }
      }
      clips.set(el, c);
      return c;
    };
    const boxes = [];
    const add = (kind, el, rect, clip, text) => {
      if (rect.width < 1 || rect.height < 1) return;
      const b = cut(clip, { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom });
      if (b.empty || b.r - b.l < 2 || b.b - b.t < 2) return;
      boxes.push({ kind, el, l: b.l, t: b.t, r: b.r, b: b.b, fixed: isFixed(el), text });
    };

    const skipTags = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/\S/.test(n.data)) continue;
      const el = n.parentElement;
      if (!el || skipTags.test(el.tagName) || inPill(el) || !isVisible(el)) continue;
      const clip = contentClip(el);
      if (clip && clip.empty) continue;
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) add('text', el, q, clip, n.data.trim().slice(0, 48));
    }
    const take = (kind, list) => {
      for (const el of list) {
        if (inPill(el) || !isVisible(el)) continue;
        const clip = contentClip(el.parentElement);
        if (clip && clip.empty) continue;
        add(kind, el, el.getBoundingClientRect(), clip, (el.textContent || '').trim().slice(0, 48));
      }
    };
    take('control', document.querySelectorAll(cfg.controls));
    take('value', document.querySelectorAll(cfg.values));
    take(
      'value',
      [...document.querySelectorAll('[class*="-"]')].filter((el) => [...el.classList].some((c) => valueClass.test(c))),
    );
    return boxes;
  }

  const over = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > cfg.tol && Math.min(a.b, b.b) - Math.max(a.t, b.t) > cfg.tol;

  // One stop: scroll, let the pacing run its frame, read each pill, and test
  // a shown pill against the page (and, swept, against everything that passed
  // under it since the previous stop, if it was shown there too, in place).
  async function stop(y, prev, hits) {
    scrollTo({ top: y, left: 0, behavior: 'instant' });
    await frame();
    const at = scrollY;
    const out = {};
    let boxes = null;
    for (const [key, el] of Object.entries(pillEls())) {
      if (!el) {
        out[key] = { present: false };
        continue;
      }
      const rendered = getComputedStyle(el).display !== 'none';
      const r = el.getBoundingClientRect();
      const shown =
        rendered &&
        el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
        r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      const box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      out[key] = { present: true, rendered, shown, box, y: at };
      if (!shown) continue;
      if (!boxes) boxes = scan();
      const p = prev[key];
      const swept =
        p && p.shown && p.y !== at &&
        Math.abs(p.box.l - box.l) < 0.5 && Math.abs(p.box.t - box.t) < 0.5 &&
        Math.abs(p.box.r - box.r) < 0.5 && Math.abs(p.box.b - box.b) < 0.5
          ? { l: box.l, r: box.r, t: Math.min(p.y, at) + box.t, b: Math.max(p.y, at) + box.b }
          : null;
      for (const q of boxes) {
        let where = null;
        if (over(q, box)) where = String(at);
        else if (swept && !q.fixed && over({ l: q.l, r: q.r, t: q.t + at, b: q.b + at }, swept)) {
          where = `${Math.min(p.y, at)}..${Math.max(p.y, at)}`;
        }
        if (!where) continue;
        const id = key + '|' + q.kind + '|' + name(q.el) + '|' + q.text;
        const seen = hits.get(id);
        if (seen) {
          seen.stops += 1;
          continue;
        }
        hits.set(id, {
          pill: key,
          kind: q.kind,
          el: name(q.el),
          text: q.text,
          scrollY: where,
          // The pill on screen; the box it met on the page (left, top,
          // right, bottom), in page coordinates for in-flow content.
          pillBox: [r2(box.l), r2(box.t), r2(box.r), r2(box.b)],
          box: q.fixed ? [r2(q.l), r2(q.t), r2(q.r), r2(q.b)] : [r2(q.l), r2(q.t + at), r2(q.r), r2(q.b + at)],
          fixed: q.fixed,
          stops: 1,
        });
      }
    }
    return out;
  }

  async function walk() {
    const doc = document.documentElement;
    const H = doc.scrollHeight;
    const M = Math.max(0, H - innerHeight);
    const coarse = Math.max(120, Math.round(innerHeight * cfg.coarse));
    // Down in coarse steps, the last stretch finely (where the pill first
    // comes up at the end), then back up in coarse steps.
    const ys = [];
    for (let y = 0; y < M - cfg.fineSpan; y += coarse) ys.push(y);
    for (let y = Math.max(0, M - cfg.fineSpan); y < M; y += cfg.fine) ys.push(y);
    ys.push(M);
    for (let y = M - coarse; y > 0; y -= coarse) ys.push(y);
    ys.push(0);
    // The owner's move: an anchor brought to the bottom corner by a scroll
    // up (from 300px further down), so its right end sits under the pill.
    if (cfg.anchors) {
      for (const a of document.querySelectorAll(cfg.anchors)) {
        const r = a.getBoundingClientRect();
        const y = Math.max(0, Math.min(M, Math.round(r.top + scrollY + r.height / 2 - (innerHeight - 38))));
        ys.push(Math.min(M, y + 300), y);
      }
    }
    const hits = new Map();
    const stops = [];
    let prev = {};
    for (const y of ys) {
      const s = await stop(y, prev, hits);
      stops.push(s);
      prev = s;
    }
    return { H, M, grew: doc.scrollHeight !== H, stops, hits: [...hits.values()] };
  }

  window.__dockProbe = { walk, scan: () => scan().length };
}

// --- stall trace ----------------------------------------------------------------

// One stderr line before and after every browser operation that can hang, so
// when CI's bound kills an attempt, the log names the route, width, theme and
// step it was waiting on (part 3 has hung to its job limit with no output).
// stderr only: stdout and the checks are unchanged.
//   [dock] +12345ms /docs 390 dark walk start
// "-" stands for no route, width or theme (a browser-level step). The theme is
// the one the page is in when the step runs. A result state's label has its
// spaces replaced by "_" so every line splits on spaces.
//
// Jobs run --concurrency at a time, so the last line before a kill can belong
// to a worker that was not stuck. On SIGTERM (CI's `timeout`) the operations
// still in flight are listed with their age, longest last, and tracing stops:
// the last line is then the step that hung. Playwright's own SIGTERM handler
// closes the browser without exiting, so the run then ends on its own.
const inFlight = new Map();
let opSeq = 0;
let traceStopped = false;
const ms = (t) => Math.round(t);

function trace(where, op, phase) {
  if (traceStopped) return;
  process.stderr.write(`[dock] +${ms(performance.now())}ms ${where} ${op} ${phase}\n`);
}

/** Runs one browser operation between a start and an end line. A throw is
 *  traced as "fail" and rethrown untouched, so callers behave as before. */
async function step(where, op, fn) {
  const id = ++opSeq;
  inFlight.set(id, { where, op, t0: performance.now() });
  trace(where, op, 'start');
  try {
    const value = await fn();
    trace(where, op, 'end');
    return value;
  } catch (e) {
    trace(where, op, 'fail');
    throw e;
  } finally {
    inFlight.delete(id);
  }
}

function dumpInFlight() {
  if (traceStopped) return;
  const now = performance.now();
  const open = [...inFlight.values()].sort((a, b) => b.t0 - a.t0);
  process.stderr.write(`[dock] +${ms(now)}ms SIGTERM with ${open.length} operation(s) in flight, longest last\n`);
  for (const o of open) process.stderr.write(`[dock] +${ms(now)}ms ${o.where} ${o.op} in-flight ${ms(now - o.t0)}ms\n`);
  traceStopped = true;
}

const place = (job, theme) => `${job.label.replace(/\s+/g, '_')} ${job.vp.w} ${theme}`;

async function launch() {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    console.error('[dock] playwright-core is not installed');
    process.exit(2);
  }
  try {
    // A private headless browser: its own profile, nothing the operator has
    // open is touched.
    return await chromium.launch({ channel: CHANNEL, headless: true });
  } catch (e) {
    console.error(`[dock] cannot launch ${CHANNEL}: ${e.message}`);
    process.exit(2);
  }
}

/** Reads a walk into C1 and C2 findings for one theme. */
function assess(job, walk, row) {
  for (const h of walk.hits) row.violations.push({ id: 'C1', ...h });
  for (const key of Object.keys(PILLS)) {
    const seen = walk.stops.map((s) => s[key]).filter((s) => s && s.present && s.rendered);
    if (!seen.length) continue;
    if (job.vp.w >= GUTTER_MIN) {
      const hidden = seen.filter((s) => !s.shown).length;
      if (hidden) {
        row.violations.push({ id: 'C2', pill: key, why: `tucked at ${hidden} of ${seen.length} stops, where the gutter holds it` });
      }
    } else if (!seen.some((s) => s.shown && s.y >= walk.M - 0.5)) {
      row.violations.push({ id: 'C2', pill: key, why: 'not shown at the end of the page' });
    }
    row[key] = { stops: seen.length, shown: seen.filter((s) => s.shown).length };
  }
  row.height = walk.H;
  row.ok = row.violations.length === 0;
}

/** One route at one width: loaded once, walked once per theme. */
async function runJob(browser, job, result, themes) {
  const at0 = place(job, themes[0]);
  const ctx = await step(at0, 'newContext', () =>
    browser.newContext({
      viewport: { width: job.vp.w, height: job.vp.h },
      deviceScaleFactor: 1,
      isMobile: job.vp.mobile,
      hasTouch: job.vp.mobile,
      colorScheme: themes[0],
    }),
  );
  const page = await step(at0, 'newPage', () => ctx.newPage());
  if (SAFE_AREA && job.vp.mobile) {
    const cdp = await step(at0, 'newCDPSession', () => ctx.newCDPSession(page));
    await step(at0, 'setSafeAreaInsetsOverride', () =>
      cdp.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { top: 0, topMax: 0, left: 0, leftMax: 0, right: 0, rightMax: 0, bottom: SAFE_AREA, bottomMax: SAFE_AREA },
      }),
    );
  }
  const rows = themes.map((theme) => ({ route: job.label, width: job.vp.w, theme, ok: false, violations: [] }));
  try {
    if (job.state) {
      await step(at0, 'route.mock', () =>
        page.route('**/api/score', (route) =>
          route.request().method() === 'POST'
            ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
            : route.continue(),
        ),
      );
    }
    // Arrive from another page, so the Back pill has history to offer
    // (phones drop the Back pill, so they skip the hop).
    if (job.vp.w > 720) {
      await step(at0, 'goto.robots', () => page.goto(BASE + '/robots.txt', { waitUntil: 'load', timeout: 60000 }));
    }
    await step(at0, 'goto', () => page.goto(BASE + job.route, { waitUntil: 'load', timeout: 60000 }));
    if (job.state) await step(at0, 'results.ready', () => job.state.ready(page));
    await step(at0, 'fonts', () =>
      page.evaluate(async () => {
        try {
          await document.fonts.ready;
        } catch {
          /* no FontFaceSet */
        }
      }),
    );
    // One pass down and back so every reveal, count-up and lazy block has
    // run, then the pills held still and, with --break, held up.
    await step(at0, 'reveal', () =>
      page.evaluate(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        const h = document.documentElement.scrollHeight;
        for (let y = 0; y < h; y += innerHeight) {
          scrollTo({ top: y, left: 0, behavior: 'instant' });
          await frame();
        }
        scrollTo({ top: 0, left: 0, behavior: 'instant' });
        await frame();
      }),
    );
    await step(at0, 'settle.wait', () => page.waitForTimeout(job.state ? 1200 : 400));
    await step(at0, 'addStyleTag', () => page.addStyleTag({ content: PILL_STILL + (BREAK ? PILL_FORCED : '') }));
    await step(at0, 'installProbe', () =>
      page.evaluate(installProbe, {
        pills: PILLS,
        controls: CONTROLS,
        values: VALUES,
        valueClass: VALUE_CLASS.source,
        tol: 0.5,
        fine: 6,
        fineSpan: 72,
        coarse: Number(opt('--coarse', '1.8')),
        anchors: job.state ? job.state.anchors : null,
      }),
    );
    for (let i = 0; i < themes.length; i++) {
      const row = rows[i];
      const at = place(job, themes[i]);
      try {
        if (i > 0) {
          // The next theme as a visitor switching it gets it: the scheme and
          // the site's own data-theme, which its stylesheet keys on.
          await step(at, 'emulateMedia', () => page.emulateMedia({ colorScheme: themes[i] }));
          await step(at, 'setTheme', () =>
            page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), themes[i]),
          );
          await step(at, 'theme.wait', () => page.waitForTimeout(150));
        }
        const theme = await step(at, 'readTheme', () =>
          page.evaluate(() => document.documentElement.getAttribute('data-theme')),
        );
        if (theme !== themes[i]) throw new Error(`page is in ${theme}, not ${themes[i]}`);
        let walk = await step(at, 'walk', () => page.evaluate(() => window.__dockProbe.walk()));
        // Late content moved the page under the walk: walk it again, once.
        if (walk.grew) walk = await step(at, 'walk.again', () => page.evaluate(() => window.__dockProbe.walk()));
        assess(job, walk, row);
      } catch (e) {
        row.violations.push({ id: 'LOAD', why: String(e && e.message ? e.message : e).slice(0, 200) });
      }
    }
  } catch (e) {
    for (const row of rows) {
      row.violations.push({ id: 'LOAD', why: String(e && e.message ? e.message : e).slice(0, 200) });
    }
  } finally {
    await step(place(job, themes[themes.length - 1]), 'context.close', () => ctx.close()).catch(() => {});
  }
  return rows;
}

async function main() {
  const widths = opt('--widths', null);
  const viewports = widths
    ? widths.split(',').map((w) => {
        const vp = VIEWPORTS.find((v) => v.w === Number(w));
        if (!vp) {
          console.error(`[dock] --widths takes ${VIEWPORTS.map((v) => v.w).join(', ')}`);
          process.exit(2);
        }
        return vp;
      })
    : VIEWPORTS;
  const themes = opt('--themes', 'dark,light').split(',');
  if (themes.some((t) => t !== 'dark' && t !== 'light')) {
    console.error('[dock] --themes takes dark, light');
    process.exit(2);
  }
  const routes = opt('--routes', null) ? opt('--routes').split(',') : RESULTS_ONLY ? [] : allRoutes();

  let result;
  try {
    result = await step('- - -', 'fixture', () => stripeLikeResult());
  } catch (e) {
    console.error(`[dock] cannot build the results fixture: ${e.message}`);
    process.exit(2);
  }

  const targets = [
    ...routes.map((route) => ({ route, label: route, state: null })),
    ...(opt('--routes', null) ? [] : RESULT_STATES.map((s) => ({ route: s.route, label: s.label, state: s }))),
  ];
  const jobs = [];
  for (const vp of viewports) for (const t of targets) jobs.push({ ...t, vp });

  const browser = await step('- - -', 'launch', () => launch());
  // After launch, so a SIGTERM before it still ends the process as it always
  // did; from here Playwright holds SIGTERM anyway (it closes the browser).
  process.once('SIGTERM', dumpInFlight);
  const rows = [];
  const started = Date.now();
  try {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const t = Date.now();
        const got = await runJob(browser, job, result, themes);
        rows.push(...got);
        if (VERBOSE) {
          const bad = got.filter((r) => !r.ok).length;
          console.error(`[dock] ${job.label} @${job.vp.w} ${Date.now() - t}ms h=${got[0].height} ${bad ? 'FAIL' : 'ok'}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  } finally {
    await step('- - -', 'browser.close', () => browser.close());
  }

  const failed = rows.filter((r) => !r.ok);
  const violations = failed.flatMap((r) => r.violations.map((v) => ({ route: r.route, width: r.width, theme: r.theme, ...v })));
  const summary = {};
  for (const v of violations) summary[v.id] = (summary[v.id] || 0) + 1;
  const secs = Math.round((Date.now() - started) / 1000);

  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, break: BREAK, safeArea: SAFE_AREA, seconds: secs, pages: rows.length, failedPages: failed.length, summary, rows, violations }, null, 1));
  } else {
    console.log(
      `[dock] ${BASE} ${targets.length} routes x ${viewports.length} widths x ${themes.length} themes = ${rows.length} pages in ${secs}s` +
        (BREAK ? ' (--break)' : '') + (SAFE_AREA ? ` (safe-area-inset-bottom ${SAFE_AREA}px on touch widths)` : ''),
    );
    if (!violations.length) {
      console.log('[dock] OK - no shown pill covers text, a control or a value, and each pill comes up where it should');
    } else {
      console.log(
        `[dock] ${failed.length} page(s) fail, ${violations.length} finding(s): ` +
          Object.entries(summary).map(([k, n]) => `${k} ${n}`).join(', '),
      );
      for (const v of violations.slice(0, 60)) {
        const what = v.id === 'C1' ? `${v.pill} over ${v.kind} ${v.el} "${v.text}" at y=${v.scrollY} pill=${JSON.stringify(v.pillBox)} box=${JSON.stringify(v.box)}` : `${v.pill || ''} ${v.why}`;
        console.log(`  FAIL ${v.id} ${v.route} @${v.width} ${v.theme} ${what}`);
      }
      if (violations.length > 60) console.log(`  ... and ${violations.length - 60} more (use --json)`);
    }
  }
  process.exit(violations.length ? 1 : 0);
}

// A fatal error exits 2 and loudly: a measurement that never ran must not
// read as a pass.
main().catch((e) => {
  console.error('[dock] fatal:', e && e.message ? e.message : e);
  process.exit(2);
});
