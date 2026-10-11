#!/usr/bin/env node
/**
 * Edge contract — the standing check that surfaces share edges on purpose.
 *
 * WHY THIS EXISTS
 * Every edge on the site that agreed with another agreed by coincidence. The
 * shell token meant three different boxes, so home cards sat 24px inside the
 * header pill while engine instruments sat flush with it. The hero form ended
 * 24.8px past the console's divider at 1440 and 203px short of it at 2560; the
 * Drift bar missed its instrument's divider by 9.85px (the "awkward cutoff");
 * the Contract Health panel aligned to a heading's line box, 143px above the
 * cells it sits beside. None of it was visible to lint, types or tests, because
 * all of them read SOURCE and every one of these defects exists only in the
 * RENDERED page. This measures the rendered page.
 *
 * WHAT IT ASSERTS (the edge contract, design spec section 2.2 rule 5)
 *   E1  The header pill's outer left/right edges equal the page's content edges
 *       (main and footer), +-1px.
 *   E2  STACK. A surface directly above another surface in the same section
 *       shares its left edge, and its right edge equals the lower surface's
 *       right edge or one of that surface's internal dividers, +-1px.
 *   E3  ROW. Side-by-side surfaces in the same section share top and bottom
 *       edges, +-1px. The Four ways bento is allowlisted: there every card edge
 *       must sit on a neighbour's edge, across the grid gap from one, or on the
 *       grid's own content edge.
 *   E4  DIVIDERS sit on named lines of the 12-column shell grid (split, mirror,
 *       or the 4|8 and 3|6|9 module lines), +-1px. Only where the shell content
 *       box is at least 64rem, because that is where spans switch on.
 *   E5  GOLDEN FIXTURE. The Four ways featured card's height = kit A's height +
 *       the row gap + the continuity card's height, +-1px.
 *   E6  No layout surface (or wrapper between a surface and the page shell) is
 *       held narrower than its slot by a max-width, outside the component
 *       allowlist (dialogs, drawer, pills, .cmdk-panel, .eg-inst-target).
 *   E7  .eg-cell heights are equal within each row, +-0.5px.
 *   CUT Text inside a surface is not clipped by an overflow:hidden ancestor.
 *       Digit strips are allowlisted: a rolling digit is clipped by design.
 *
 * HOW E6 TELLS A BINDING CAP FROM A HARMLESS ONE
 * The computed max-width of a token-driven cap is a px number just like a
 * literal's, so the value says nothing. The probe asks the layout instead: it
 * lifts the cap (inline max-width: none), measures, and restores it. A cap that
 * changes the element's width is holding a surface narrower than its slot,
 * which is the defect; one that does not is inert at this width.
 *
 * Geometry is measured with prefers-reduced-motion: reduce emulated, so every
 * transform has settled to its rest state, and after one scroll pass so any
 * observer-driven reveal has run.
 *
 * Usage:
 *   node scripts/edge-contract.js --base http://127.0.0.1:3422
 *   node scripts/edge-contract.js --base http://127.0.0.1:3422 --channel chrome --json
 *   node scripts/edge-contract.js --base http://localhost:3999 --cdp http://127.0.0.1:9222
 *   node scripts/edge-contract.js --base ... --routes /,/drift --widths 390,1440
 * Exit 1 on any violation, 2 on a fatal error (no browser, bad arguments).
 */

const WIDTHS = [390, 768, 1024, 1088, 1440, 1920, 2560];
const HEIGHT = 900;

// The eleven routes the spec names. /contracts is the contracts hub: the spec's
// "/contract" has no page (404), and the hub is the shell it meant.
const ROUTES = [
  '/',
  '/drift',
  '/score',
  '/readiness',
  '/compare',
  '/monitor',
  '/guardrails',
  '/maturity',
  '/m3-bridge',
  '/docs',
  '/contracts',
];

const SURFACES =
  '.vc-window, .eg-inst, .eg-bar, .health-panel, .check-grid, .field-card, .pillar, ' +
  '.surface-card, .inspect-window, .score-history-panel, .home-state-panel';

// The left edge of these is an internal divider.
const DIVIDERS = '.vc-side, .eg-side, [data-divider]';

// Component caps are exempt from E6 (spec 2.2 rule 5e): a dialog, the drawer
// and pills are sized by what they hold, not by the page's grid.
const CAP_ALLOW =
  'dialog, [role="dialog"], .nav-drawer, .cmdk-panel, .eg-inst-target, .senses-panel, .pill, [class*="-pill"]';

// Clipped on purpose: a digit strip rolls a column of digits behind a one-digit
// window (lib/verify-console.tsx draws numbers this way instead of with CSS
// counters). aria-hidden subtrees are decorative duplicates (a marquee's
// second copy, a strip's spare digits) and are skipped for the same reason.
const CUT_ALLOW =
  '.vc-row-count, .vc-num-strip, .vc-row-strip, [data-digit-strip], [class*="digit"], [aria-hidden="true"]';

const TOL = 1; // px, edges
const TOL_CELL = 0.5; // px, E7 heights
const SPAN_SWITCH_PX = 1024; // @container g12 (width >= 64rem) at a 16px root

// Seeded so the hero's Recent Scores panel renders: it only exists once a score
// has been run in this browser, and it is one half of a stack the spec
// measures (history panel over the console). Launched browsers only: a browser
// reached over CDP belongs to the operator, so its storage is left alone.
const HISTORY_SEED = {
  key: 'designesy.score.history.v1',
  entry: {
    url: 'https://example.com',
    score: 82,
    grade: 'B',
    pass: 30,
    fail: 4,
    warn: 3,
    skip: 2,
    manual: 1,
    total: 40,
    tokensExtracted: 24,
  },
};

/**
 * Runs IN THE PAGE. Collects every rectangle the assertions need; the
 * assertions themselves run in node, so the page code stays a plain function
 * (passed to page.evaluate, never a source string).
 */
function probe(cfg) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const visible = (el) => {
    if (!el || el.getClientRects().length === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r2(r.left), r: r2(r.right), t: r2(r.top + scrollY), b: r2(r.bottom + scrollY), w: r2(r.width), h: r2(r.height) };
  };
  const contentBox = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const l = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const rr = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    return { l: r2(l), r: r2(rr), w: r2(rr - l) };
  };
  // A readable, stable name: tag.class.class plus its index among same-named
  // elements, so two reports of one element match across runs.
  const seen = new Map();
  const names = new Map();
  const name = (el) => {
    if (names.has(el)) return names.get(el);
    const base =
      el.tagName.toLowerCase() +
      [...el.classList].slice(0, 3).map((c) => '.' + c).join('');
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const out = n === 1 ? base : base + ':nth(' + n + ')';
    names.set(el, out);
    return out;
  };

  const out = { vw: innerWidth, layoutW: document.documentElement.clientWidth };

  // Shell edges: the pill, main's content box, the footer's content box.
  const pill = document.querySelector('.topbar .topbar-inner');
  out.pill = pill && visible(pill) ? box(pill) : null;
  const main = document.querySelector('main#main-content') || document.querySelector('main');
  out.main = main ? { sel: name(main), ...contentBox(main) } : null;
  const foot = document.querySelector('.footer .site-shell, footer .site-shell');
  out.footer = foot && visible(foot) ? { sel: name(foot), ...contentBox(foot) } : null;

  // The grid gap the shell grid uses; 16px before the token exists.
  const g = document.createElement('div');
  g.style.cssText = 'position:absolute;visibility:hidden;width:var(--grid-gutter, 16px)';
  document.body.appendChild(g);
  out.gutter = g.getBoundingClientRect().width || 16;
  g.remove();

  // Sections: the nearest section or main ABOVE the element (never itself, so
  // a surface that is a <section> still belongs to its page region).
  const secIds = new Map();
  const sectionOf = (el) => {
    const s = el.parentElement && el.parentElement.closest('section, main');
    if (!s) return -1;
    if (!secIds.has(s)) secIds.set(s, secIds.size);
    return secIds.get(s);
  };

  const all = [...document.querySelectorAll(cfg.surfaces)].filter(visible);
  const bento = document.querySelector('.home-bento');
  out.surfaces = all.map((el) => {
    const parentSurface = el.parentElement && el.parentElement.closest(cfg.surfaces);
    const dividers = [...el.querySelectorAll(cfg.dividers)]
      .filter(visible)
      .filter((d) => d.closest(cfg.surfaces) === el)
      .map((d) => ({ sel: name(d), x: r2(d.getBoundingClientRect().left) }));
    return {
      sel: name(el),
      ...box(el),
      section: sectionOf(el),
      nested: !!parentSurface,
      bento: !!(bento && bento.contains(el)),
      dividers,
    };
  });

  out.dividers = [...document.querySelectorAll(cfg.dividers)]
    .filter(visible)
    .map((d) => ({ sel: name(d), x: r2(d.getBoundingClientRect().left) }));

  // Four ways bento: cards in DOM order (featured, kit A, kit B, continuity).
  out.bento = null;
  if (bento && visible(bento)) {
    const cs = getComputedStyle(bento);
    const cards = [...bento.children].filter(visible);
    out.bento = {
      sel: name(bento),
      content: { ...contentBox(bento), t: r2(bento.getBoundingClientRect().top + scrollY + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth)), b: r2(bento.getBoundingClientRect().bottom + scrollY - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth)) },
      rowGap: parseFloat(cs.rowGap) || 0,
      colGap: parseFloat(cs.columnGap) || 0,
      cards: cards.map((c) => ({ sel: name(c), ...box(c) })),
    };
  }

  // E7: engine cells, grouped per list.
  out.cellLists = [...document.querySelectorAll('.eg-cells')].filter(visible).map((list) => ({
    sel: name(list),
    cells: [...list.querySelectorAll('.eg-cell')].filter(visible).map((c) => ({ sel: name(c), ...box(c) })),
  }));

  // CUT: text clipped by an overflow:hidden/clip ancestor inside a surface.
  out.cuts = [];
  const tops = all.filter((el) => !(el.parentElement && el.parentElement.closest(cfg.surfaces)));
  for (const s of tops) {
    let scanned = 0;
    for (const el of s.querySelectorAll('*')) {
      if (++scanned > 3000) break;
      if (el.closest(cfg.cutAllow)) continue;
      const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!texts.length || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) === 0) continue;
      // Truncation the element declares on itself (an ellipsis, or its own
      // overflow clip) is authored, not a cutoff by a neighbour's box.
      if (cs.textOverflow === 'ellipsis' || /hidden|clip/.test(cs.overflowX + ' ' + cs.overflowY)) continue;
      let clip = null;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (/hidden|clip/.test(acs.overflowX) || /hidden|clip/.test(acs.overflowY)) { clip = a; break; }
        if (a === s) break;
      }
      if (!clip) continue;
      const range = document.createRange();
      let tl = Infinity, tr = -Infinity, tt = Infinity, tb = -Infinity;
      for (const t of texts) {
        range.selectNodeContents(t);
        for (const q of range.getClientRects()) {
          if (q.width === 0 || q.height === 0) continue;
          tl = Math.min(tl, q.left); tr = Math.max(tr, q.right);
          tt = Math.min(tt, q.top); tb = Math.max(tb, q.bottom);
        }
      }
      if (tl === Infinity) continue;
      const cr = clip.getBoundingClientRect();
      const ccs = getComputedStyle(clip);
      const cl = cr.left + parseFloat(ccs.borderLeftWidth);
      const crr = cr.right - parseFloat(ccs.borderRightWidth);
      const ct = cr.top + parseFloat(ccs.borderTopWidth);
      const cb = cr.bottom - parseFloat(ccs.borderBottomWidth);
      const over = {
        left: cl - tl,
        right: tr - crr,
        top: ct - tt,
        bottom: tb - cb,
      };
      const worst = Math.max(over.left, over.right, over.top, over.bottom);
      if (worst > cfg.tol) {
        out.cuts.push({
          surface: name(s),
          sel: name(el),
          clip: name(clip),
          hidden: { left: r2(over.left), right: r2(over.right), top: r2(over.top), bottom: r2(over.bottom) },
          text: texts.map((t) => t.textContent.trim()).join(' ').slice(0, 40),
        });
      }
    }
  }

  // E6 LAST: it mutates inline style (and restores it) to test whether a cap
  // binds. Every other rectangle above was read before any mutation.
  out.caps = [];
  const checked = new Set();
  for (const s of tops) {
    for (let el = s; el && el !== main && el !== document.body; el = el.parentElement) {
      if (checked.has(el)) continue;
      checked.add(el);
      if (el.matches(cfg.capAllow) || el.closest(cfg.capAllow)) continue;
      const mw = getComputedStyle(el).maxWidth;
      if (mw === 'none' || /^\d+(\.\d+)?%$/.test(mw)) continue;
      const before = el.getBoundingClientRect().width;
      const prev = el.style.getPropertyValue('max-width');
      const prio = el.style.getPropertyPriority('max-width');
      el.style.setProperty('max-width', 'none', 'important');
      const after = el.getBoundingClientRect().width;
      if (prev) el.style.setProperty('max-width', prev, prio);
      else el.style.removeProperty('max-width');
      if (after - before > cfg.tol) {
        out.caps.push({ sel: name(el), surface: name(s), maxWidth: mw, width: r2(before), uncapped: r2(after) });
      }
    }
  }
  return out;
}

// --- assertions (node side) ---------------------------------------------------

const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;
const r2 = (n) => Math.round(n * 100) / 100;

function assess(route, width, d) {
  const v = [];
  const add = (id, selectors, measured) => v.push({ route, width, id, selectors, measured });

  // E1: pill outer edges == content edges (main, footer).
  if (d.pill) {
    for (const region of [d.main, d.footer]) {
      if (!region) continue;
      const dl = r2(d.pill.l - region.l);
      const dr = r2(d.pill.r - region.r);
      if (!near(dl, 0) || !near(dr, 0)) {
        add('E1', ['.topbar .topbar-inner', region.sel], {
          pill: [d.pill.l, d.pill.r],
          content: [region.l, region.r],
          dLeft: dl,
          dRight: dr,
        });
      }
    }
  }

  const free = d.surfaces.filter((s) => !s.nested && !s.bento);
  const overlapX = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const overlapY = (a, b) => Math.min(a.b, b.b) - Math.max(a.t, b.t);

  // E2: stack. For each surface, the nearest row of surfaces below it in the
  // same section that it overlaps horizontally.
  for (const a of free) {
    const below = free.filter((b) => b !== a && b.section === a.section && b.t >= a.b - TOL && overlapX(a, b) > TOL);
    if (!below.length) continue;
    const minT = Math.min(...below.map((b) => b.t));
    const row = below.filter((b) => near(b.t, minT));
    const gl = Math.min(...row.map((b) => b.l));
    const gr = Math.max(...row.map((b) => b.r));
    const divs = row.flatMap((b) => b.dividers.map((x) => x.x));
    const dl = r2(a.l - gl);
    const dr = r2(a.r - gr);
    const toDivider = divs.length ? divs.map((x) => r2(a.r - x)).sort((p, q) => Math.abs(p) - Math.abs(q))[0] : null;
    const rightOk = near(dr, 0) || (toDivider !== null && near(toDivider, 0));
    if (!near(dl, 0) || !rightOk) {
      add('E2', [a.sel, ...row.map((b) => b.sel)], {
        upper: [a.l, a.r],
        lower: [gl, gr],
        dividers: divs,
        dLeft: dl,
        dRight: dr,
        dRightToNearestDivider: toDivider,
      });
    }
  }

  // E3: row. Side-by-side surfaces share top and bottom.
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if (a.section !== b.section) continue;
      if (overlapY(a, b) <= TOL) continue;
      if (overlapX(a, b) > TOL) continue; // overlapping, not side by side
      const dt = r2(a.t - b.t);
      const db = r2(a.b - b.b);
      if (!near(dt, 0) || !near(db, 0)) {
        add('E3', [a.sel, b.sel], { a: [a.t, a.b], b: [b.t, b.b], dTop: dt, dBottom: db });
      }
    }
  }

  // E3 (bento allowlist): every card edge sits on a neighbour's edge, across
  // the gap from one, or on the grid's content edge.
  if (d.bento && d.bento.cards.length) {
    const { cards, rowGap, colGap, content } = d.bento;
    for (const c of cards) {
      const others = cards.filter((o) => o !== c);
      const checks = [
        ['left', c.l, others.flatMap((o) => [o.l, o.r + colGap]).concat(content.l)],
        ['right', c.r, others.flatMap((o) => [o.r, o.l - colGap]).concat(content.r)],
        ['top', c.t, others.flatMap((o) => [o.t, o.b + rowGap]).concat(content.t)],
        ['bottom', c.b, others.flatMap((o) => [o.b, o.t - rowGap]).concat(content.b)],
      ];
      for (const [edge, x, lines] of checks) {
        if (!lines.some((y) => near(x, y))) {
          const nearest = lines.map((y) => r2(x - y)).sort((p, q) => Math.abs(p) - Math.abs(q))[0];
          add('E3', [d.bento.sel, c.sel], { bento: true, edge, at: x, nearestDelta: nearest });
        }
      }
    }
  }

  // E4: dividers on named lines of the shell grid.
  if (d.main && d.main.w >= SPAN_SWITCH_PX - 0.5) {
    const L = d.main.l, W = d.main.w, g = d.gutter;
    const col = (W - 11 * g) / 12;
    const NAMES = { 3: '3|9', 4: '4|8', 5: 'mirror', 6: '6|6', 7: 'split', 8: '8|4', 9: '9|3' };
    const lines = [];
    for (const k of [3, 4, 5, 6, 7, 8, 9]) {
      const end = L + k * col + (k - 1) * g;
      lines.push({ name: NAMES[k] + ' (track end)', x: end }, { name: NAMES[k] + ' (track start)', x: end + g });
    }
    for (const dv of d.dividers) {
      const best = lines
        .map((ln) => ({ ...ln, delta: r2(dv.x - ln.x) }))
        .sort((p, q) => Math.abs(p.delta) - Math.abs(q.delta))[0];
      if (!near(best.delta, 0)) {
        add('E4', [dv.sel], { x: dv.x, nearestLine: best.name, lineX: r2(best.x), delta: best.delta, shell: [L, r2(L + W)] });
      }
    }
  }

  // E5: golden fixture, only while the bento is in its featured layout
  // ("feature a b" / "feature c c"): both kit cards beside the featured card on
  // its top, the continuity card below them. Narrower layouts stack or pair the
  // cards and the identity does not apply (at 768 the cards sit two by two).
  if (d.bento && d.bento.cards.length >= 4) {
    const [feat, kitA, kitB, cont] = d.bento.cards;
    const featuredLayout =
      near(feat.t, kitA.t) && near(feat.t, kitB.t) &&
      feat.r <= kitA.l + TOL && kitA.r <= kitB.l + TOL &&
      cont.t >= kitA.b - TOL;
    if (featuredLayout) {
      const want = r2(kitA.h + d.bento.rowGap + cont.h);
      const delta = r2(feat.h - want);
      if (!near(delta, 0)) {
        add('E5', [feat.sel, kitA.sel, cont.sel], { featured: feat.h, kitA: kitA.h, gap: d.bento.rowGap, continuity: cont.h, expected: want, delta });
      }
    }
  }

  // E6: binding max-width caps.
  for (const c of d.caps) {
    add('E6', [c.sel, c.surface], { maxWidth: c.maxWidth, width: c.width, uncapped: c.uncapped, heldBy: r2(c.uncapped - c.width) });
  }

  // E7: equal cell heights per row.
  for (const list of d.cellLists) {
    const cells = [...list.cells].sort((p, q) => p.t - q.t);
    const rows = [];
    for (const c of cells) {
      const row = rows.find((r) => near(r.t, c.t));
      if (row) row.cells.push(c);
      else rows.push({ t: c.t, cells: [c] });
    }
    for (const row of rows) {
      const hs = row.cells.map((c) => c.h);
      const spread = r2(Math.max(...hs) - Math.min(...hs));
      if (spread > TOL_CELL) {
        add('E7', [list.sel, ...row.cells.map((c) => c.sel)], { top: row.t, heights: hs, spread });
      }
    }
  }

  // CUT: clipped text in a surface.
  for (const c of d.cuts) {
    add('CUT', [c.surface, c.sel, c.clip], { hidden: c.hidden, text: c.text });
  }

  return v;
}

// --- stall trace ----------------------------------------------------------------

// One stderr line before and after every browser operation that can hang, so
// when CI's 240 s bound kills an attempt, the last line names the route, width
// and step it was waiting on. Every recorded stall died inside newPage or
// context.close with no output at all. stderr only: stdout carries the --json
// report that CI tees into /tmp/edge.json, and it must stay valid JSON.
//   [edge] +12345ms /drift 390 newPage start
// "-" stands for no route (a context-level step) or no width (the browser).
function trace(route, width, op, phase) {
  process.stderr.write(`[edge] +${Math.round(performance.now())}ms ${route} ${width} ${op} ${phase}\n`);
}

/** Runs one browser operation between a start and an end line. A throw is
 *  traced as "fail" and rethrown untouched, so callers behave as before. */
async function step(route, width, op, fn) {
  trace(route, width, op, 'start');
  try {
    const value = await fn();
    trace(route, width, op, 'end');
    return value;
  } catch (e) {
    trace(route, width, op, 'fail');
    throw e;
  }
}

// --- browser ------------------------------------------------------------------

async function openBrowser(chromium, { cdp, channel }) {
  if (cdp) return { browser: await chromium.connectOverCDP(cdp), mode: 'cdp ' + cdp };
  if (channel) {
    // A locally installed browser (Chrome on Windows and macOS). Headless, own
    // profile: nothing the operator has open is touched.
    return { browser: await chromium.launch({ channel, headless: true }), mode: 'channel ' + channel };
  }
  // CI: @sparticuz/chromium's Linux binary, with the same handling as
  // scripts/visual-floor.js (see the reasoning there for each step).
  let sparticuz;
  try {
    sparticuz = require('@sparticuz/chromium').default;
  } catch (e) {
    console.error(
      '[edge] @sparticuz/chromium not installed. Pass --channel chrome to use a ' +
        'locally installed browser, or --cdp http://127.0.0.1:9222 to use a running one.',
    );
    process.exit(2);
  }
  sparticuz.setGraphicsMode = false;
  const executablePath = await sparticuz.executablePath();
  const path = require('node:path');
  const libPath = path.dirname(executablePath);
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${libPath}:${process.env.LD_LIBRARY_PATH}`
    : libPath;
  const SERVERLESS_ONLY = ['--single-process', '--no-zygote', '--in-process-gpu'];
  const args = sparticuz.args.filter((a) => !SERVERLESS_ONLY.some((bad) => a.includes(bad)));
  return { browser: await chromium.launch({ args, executablePath, headless: true }), mode: 'sparticuz' };
}

async function settle(page) {
  // Fonts change line boxes, so geometry is read only after they land; one
  // scroll pass runs any observer-driven reveal; then back to the top.
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await document.fonts.ready; } catch (e) { /* no FontFaceSet */ }
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += Math.max(400, innerHeight)) {
      scrollTo(0, y);
      await frame();
    }
    scrollTo(0, 0);
    await frame();
  });
  await page.waitForTimeout(400);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  const BASE = (opt('--base') || 'https://www.designesy.org').replace(/\/$/, '');
  const AS_JSON = args.includes('--json');
  const CDP = opt('--cdp');
  // Default browser: a locally installed Chrome on Windows/macOS (the bundled
  // sparticuz binary is Linux-only), sparticuz on Linux (CI).
  const CHANNEL = CDP ? null : opt('--channel') || (process.platform === 'linux' ? null : 'chrome');
  const routes = opt('--routes') ? opt('--routes').split(',') : ROUTES;
  const widths = opt('--widths') ? opt('--widths').split(',').map(Number) : WIDTHS;
  if (widths.some((w) => !Number.isFinite(w) || w < 200)) {
    console.error('[edge] --widths takes comma-separated pixel widths');
    process.exit(2);
  }

  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e) {
    console.error('[edge] playwright-core not installed');
    process.exit(2);
  }

  const { browser, mode } = await step('-', '-', 'launch', () => openBrowser(chromium, { cdp: CDP, channel: CHANNEL }));
  const cfg = { surfaces: SURFACES, dividers: DIVIDERS, capAllow: CAP_ALLOW, cutAllow: CUT_ALLOW, tol: TOL };
  const violations = [];
  const pages = [];

  try {
    for (const width of widths) {
      const mobile = width < 768;
      let ctx;
      if (CDP) {
        ctx = browser.contexts()[0];
      } else {
        ctx = await step('-', width, 'newContext', () =>
          browser.newContext({
            viewport: { width, height: HEIGHT },
            deviceScaleFactor: 1,
            isMobile: mobile,
            hasTouch: mobile,
            reducedMotion: 'reduce',
          }),
        );
        await step('-', width, 'addInitScript', () =>
          ctx.addInitScript((seed) => {
            try {
              if (!localStorage.getItem(seed.key)) {
                localStorage.setItem(seed.key, JSON.stringify([{ ...seed.entry, scoredAt: new Date().toISOString() }]));
              }
            } catch (e) { /* storage blocked: the panel simply stays absent */ }
          }, HISTORY_SEED),
        );
      }

      for (const route of routes) {
        const page = await step(route, width, 'newPage', () => ctx.newPage());
        let session = null;
        try {
          if (CDP) {
            // setViewportSize is ignored over CDP (a real OS window); the
            // tab-scoped Emulation override is not, and is cleared below.
            session = await step(route, width, 'newCDPSession', () => ctx.newCDPSession(page));
            await step(route, width, 'setDeviceMetricsOverride', () =>
              session.send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 1, mobile }),
            );
            await step(route, width, 'emulateMedia', () => page.emulateMedia({ reducedMotion: 'reduce' }));
          }
          await step(route, width, 'goto', () => page.goto(BASE + route, { waitUntil: 'load', timeout: 60000 }));
          const actual = await step(route, width, 'innerWidth', () => page.evaluate(() => innerWidth));
          if (Math.abs(actual - width) > 8) {
            violations.push({ route, width, id: 'VIEWPORT', selectors: [], measured: { wanted: width, actual } });
            pages.push({ route, width, ok: false });
            continue;
          }
          // settle: fonts.ready, one scroll pass, then a 400 ms wait.
          await step(route, width, 'settle', () => settle(page));
          const data = await step(route, width, 'probe', () => page.evaluate(probe, cfg));
          const found = assess(route, width, data);
          violations.push(...found);
          pages.push({
            route,
            width,
            ok: found.length === 0,
            layoutWidth: data.layoutW,
            content: data.main ? [data.main.l, data.main.r] : null,
            pill: data.pill ? [data.pill.l, data.pill.r] : null,
            surfaces: data.surfaces.length,
            violations: found.length,
          });
        } catch (e) {
          violations.push({ route, width, id: 'LOAD', selectors: [], measured: { error: String(e).slice(0, 200) } });
          pages.push({ route, width, ok: false });
        } finally {
          if (session) {
            await step(route, width, 'clearDeviceMetricsOverride', () =>
              session.send('Emulation.clearDeviceMetricsOverride'),
            ).catch(() => {});
          }
          await step(route, width, 'page.close', () => page.close()).catch(() => {});
        }
      }
      if (!CDP) await step('-', width, 'context.close', () => ctx.close());
    }
  } finally {
    // Only close what we launched; a CDP browser is the operator's.
    if (!CDP) await step('-', '-', 'browser.close', () => browser.close());
  }

  const summary = {};
  for (const x of violations) summary[x.id] = (summary[x.id] || 0) + 1;

  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, browser: mode, widths, routes, tolerance: { edge: TOL, cell: TOL_CELL }, summary, pages, violations }, null, 1));
  } else {
    console.log(`[edge] ${BASE} (${mode}) ${routes.length} routes x ${widths.length} widths`);
    if (!violations.length) {
      console.log('[edge] OK - every measured edge holds the contract');
    } else {
      console.log(
        `[edge] ${violations.length} violation(s): ` +
          Object.entries(summary).map(([k, n]) => `${k} ${n}`).join(', '),
      );
      for (const x of violations.slice(0, 60)) {
        console.log(`  FAIL ${x.id} ${x.route} @${x.width} ${x.selectors.join(' | ')} ${JSON.stringify(x.measured)}`);
      }
      if (violations.length > 60) console.log(`  ... and ${violations.length - 60} more (use --json)`);
    }
  }
  process.exit(violations.length ? 1 : 0);
}

// A fatal error exits 2 and loudly: a measurement that never ran must not read
// as a pass (the visual-floor CI lesson).
main().catch((e) => {
  console.error('[edge] fatal:', e && e.message ? e.message : e);
  process.exit(2);
});
