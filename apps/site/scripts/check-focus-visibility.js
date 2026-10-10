#!/usr/bin/env node
/**
 * Focus visibility check: every focus ring measured in pixels.
 *
 * WHY THIS EXISTS
 * Three focus defects passed every static check, because each was valid CSS
 * that resolved:
 *   1. An invalid command-bar field lost its ring. The amber invalid style
 *      (.eg-bar-field[data-invalid]) and the focus ring (:focus-within) were
 *      both box-shadow at the same specificity, and the invalid rule came
 *      later, so focusing an invalid field changed 0 pixels (WCAG 2.4.7).
 *      Every engine form reached that state after one refused submit.
 *   2. The site-wide ring colour measured 3.16 to 3.68:1 on the dark surface
 *      ladder and under 3:1 on wells and tinted surfaces (WCAG 1.4.11).
 *   3. The top-bar links and the path-line link drew their rings inside a
 *      scroller, which cut off the top and bottom of each ring.
 * check-focus-rings.js proves a focus rule resolves. It cannot see a rule
 * that another rule overrides, a colour that is too faint, or a ring that a
 * parent clips. This one reads the pixels.
 *
 * WHAT IT ASSERTS
 *   Routes (GET only; every other method is aborted and counted): /, /score,
 *   /drift, /compare, /leaderboard, /contracts and a /learn article, dark and
 *   light, at 1440x900 and 390x844. On each it presses Tab through the first
 *   N controls (default 40). For each control it shoots the control's box
 *   plus 6px (the field's well, for an input inside one) focused, then
 *   blurred, and diffs the pair (a pixel changes when a channel moves by 24
 *   or more of 255). On each side, at 25, 50 and 75% along it, it walks a
 *   line from 6px inside the edge to 6px outside and takes the outermost
 *   changed run that reaches the edge; its core is the pixel that changed the
 *   most, its band the pixels around the core of the same colour (under 1.5:1
 *   from it). This is the method of the QA pass's ring measure, with the crop
 *   cut to the box plus 6px.
 *     changed   pixels that change >= the box's perimeter (a 1px ring's
 *               worth; a 2px ring changes about twice that).
 *     contrast  the band's colour against the colours next to it on both
 *               sides (outside: the surface around; inside: the gap, or the
 *               control's own background when the ring touches it) is
 *               >= 3:1 on every side (median of the side's three lines). One
 *               antialiased edge pixel is stepped over, never measured. A
 *               control hidden until focused (the skip link) appears whole
 *               over whatever lay there, so its band is found by its
 *               computed outline colour instead of by the diff.
 *     extends   the ring is present on all four sides and reaches as far out
 *               on each as on its widest side (1px of tolerance). A ring a
 *               parent cuts off is missing or short on the cut sides; an
 *               inset ring drawn inside on purpose reaches the same depth
 *               all round and passes.
 *     colour    the computed outline colour is >= 3:1 on the page's paper,
 *               and on the dark theme is never rgb(1, 51, 203): --signal is a
 *               fill (2.32:1 on the dark page), and an outside site review
 *               found it drawn as the ring on 30 stops of /docs, /pricing
 *               and /review.
 *   A second sweep runs at that review's conditions: /docs, /pricing and
 *   /review, dark, 1280x800. Named controls must be reached by Tab and pass
 *   wherever their route is swept: the first "Start here" card on /docs.
 *   Then the invalid state: on /score and /compare it presses Enter in the
 *   empty first field (the form refuses on the client and sends nothing; the
 *   probe asserts no /api/ request left the page), and holds the invalid
 *   field to the same checks.
 *
 *   Emulated: prefers-reduced-motion: reduce, each colour scheme, device
 *   scale factor 1. Screenshots fast-forward transitions.
 *
 * NOT ASSERTED
 *   An inline link that wraps onto two lines draws its ring around each line
 *   fragment, so its box sides are not its ring's sides: it is listed as
 *   skipped (multi-line), never as passed. Controls that leave the viewport
 *   or sit under another layer are skipped the same way, and listed.
 *
 * PROVING IT CAN FAIL
 *   --break re-injects the three defects and the check must exit 1:
 *     invalid  the old rule order: the amber shadow wins and no outline
 *     colour   the old ring colours (--signal-light, and --signal on the
 *              agent actions) and the capsule's old 3px offset
 *     clip     the scrollers lose the room they give the ring
 *   --break invalid (or colour, or clip) injects one alone.
 *   --inject <file.css> appends any stylesheet after load.
 *
 * Usage:
 *   node scripts/check-focus-visibility.js --base http://localhost:3422
 *   node scripts/check-focus-visibility.js --base ... --break           (must exit 1)
 *   node scripts/check-focus-visibility.js --base ... --routes /score --themes dark --widths 1440
 *   node scripts/check-focus-visibility.js --base ... --json --shots out/
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const fs = require('fs');
const path = require('path');

const ROUTES = ['/', '/score', '/drift', '/compare', '/leaderboard', '/contracts', '/learn/the-pause-button-that-emptied-our-pages'];
const INVALID_ROUTES = ['/score', '/compare'];
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];
// A second sweep at the conditions of an outside site review, which found the
// --signal fill (#0133cb, 2.32:1 on the dark page) drawn as the ring on 30
// focus stops across these pages: dark theme, 1280 wide.
const EXTRA_PASSES = [{ theme: 'dark', vp: { w: 1280, h: 800 }, routes: ['/docs', '/pricing', '/review'] }];
// Controls that must be reached by Tab and pass, wherever their route is swept.
const NAMED = [{ route: '/docs', selector: '#start-here .docs-card-grid a.row', label: 'the first "Start here" card' }];
// Never a ring colour on the dark theme: the brand fill, 2.32:1 on the page.
const FORBIDDEN_DARK_RING = { 'rgb(1, 51, 203)': '--signal (#0133cb), a fill colour' };
const PAD = 6; // the crop: the box plus this much on every side
const IN = 6; // how far inside the edge a sample line starts
const TH = 24; // a channel delta of this much (of 255) is a changed pixel
const CONTRAST_MIN = 3;
const BAND_RATIO = 1.5; // pixels within this ratio of the core are the ring's band

// The three defects as they shipped, appended after the house sheets so each
// wins at its original specificity.
const DEFECTS = {
  // The invalid rule after the focus rule: its amber shadow is all a focused
  // invalid well shows.
  invalid: `
    .eg-bar-field[data-invalid],
    .eg-bar-field[data-invalid]:focus-within {
      box-shadow: inset 0 0 0 1px var(--ctl-warn), 0 0 0 3px color-mix(in srgb, var(--ctl-warn) 18%, transparent);
      outline: none;
    }`,
  // The ring colours and offsets before the fix.
  colour: `
    :focus-visible,
    .nav-links a:focus-visible, .skip-link:focus-visible, .row:focus-visible, .layer-item:focus-visible,
    .nav-trigger:focus-visible, .nav-drawer-close:focus-visible, .nav-drawer a:focus-visible,
    .copy-prompt-btn:focus-visible, .back-button:focus-visible, .director-dock:focus-visible,
    .score-signal-raw > summary:focus-visible, .state-marquee-toggle:focus-visible,
    .pipeline-step:focus-within .pipeline-node, .pricing-cta-link:focus-visible,
    .pricing-faq-q:focus-visible, .mcp-pre > code:focus-visible { outline-color: var(--signal-light); }
    .agent-action:focus-visible, .docs-card-grid .row:focus-visible, .docs-toc-list a:focus-visible,
    .lottie-tip-close:focus-visible { outline-color: var(--signal); }
    .topbar .wordmark:focus-visible, .topbar .cmdk-trigger:focus-visible,
    .topbar .senses-trigger:focus-visible, .topbar .topbar-cta:focus-visible { outline-offset: 3px; }
    .footer-badge:focus-visible { opacity: 0.85; }`,
  // The scrollers without the room they give the ring.
  clip: `
    .nav-links { padding: 0; margin: 0; }
    .eg-path { padding-block: 0; margin: 0 0 var(--space-20); }`,
};

function opt(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

// ---------------------------------------------------------------------------
// Pixel analysis. Runs in a blank page of the same browser (its canvas decodes
// the PNGs), so the check needs no image library.
// ---------------------------------------------------------------------------
async function analyse(lab, a, b, box, conf) {
  return lab.evaluate(
    async ([a64, b64, box, conf]) => {
      const decode = async (s) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + s;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, c.width, c.height);
      };
      const ia = await decode(a64);
      const ib = await decode(b64);
      const W = ia.width;
      const H = ia.height;
      const A = ia.data;
      const B = ib.data;
      const at = (D, x, y) => {
        const i = (y * W + x) * 4;
        return [D[i], D[i + 1], D[i + 2]];
      };
      const lin = (c) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
      const ratio = (p, q) => {
        const l1 = lum(p);
        const l2 = lum(q);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const moved = (p, q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])) >= conf.TH;
      const hex = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');

      let changed = 0;
      for (let i = 0; i < A.length; i += 4) {
        if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) >= conf.TH) changed++;
      }

      // Edge pixels (inside the box) and the walk: d > 0 is outside, d = 0 the
      // box's own edge pixel, d < 0 further inside.
      const xL = Math.round(box.x);
      const xR = Math.round(box.x + box.w) - 1;
      const yT = Math.round(box.y);
      const yB = Math.round(box.y + box.h) - 1;
      const inH = Math.max(0, Math.min(conf.IN, Math.floor(box.w / 2) - 1));
      const inV = Math.max(0, Math.min(conf.IN, Math.floor(box.h / 2) - 1));
      const sides = {};
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const lines = [];
        for (const f of [0.25, 0.5, 0.75]) {
          const pts = [];
          const depth = side === 'left' || side === 'right' ? inH : inV;
          for (let d = -depth; d <= conf.PAD; d++) {
            let x;
            let y;
            if (side === 'left') [x, y] = [xL - d, Math.round(box.y + box.h * f)];
            else if (side === 'right') [x, y] = [xR + d, Math.round(box.y + box.h * f)];
            else if (side === 'top') [x, y] = [Math.round(box.x + box.w * f), yT - d];
            else [x, y] = [Math.round(box.x + box.w * f), yB + d];
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const pa = at(A, x, y);
            const pb = at(B, x, y);
            pts.push({ d, pa, pb, ch: moved(pa, pb) });
          }
          // Runs of changed pixels. The ring is the outermost run that reaches
          // the edge (d >= -1): an inner run is the control's own fill or an
          // accent changing with it (the definition card's focus bar), never
          // the ring drawn around it. Ties go to the run that changed most.
          const runs = [];
          let cur = null;
          pts.forEach((p, i) => {
            if (p.ch) {
              if (!cur) cur = { s: i, e: i };
              else cur.e = i;
            } else if (cur) {
              runs.push(cur);
              cur = null;
            }
          });
          if (cur) runs.push(cur);
          // A run whose core moved less than the band ratio is a tint (the dim
          // halo the house ring lays under itself), not an indicator: it is
          // only taken when no stronger run reaches the edge.
          const cands = [];
          for (const r of runs) {
            if (pts[r.e].d < -1) continue;
            let core = r.s;
            let coreChange = 0;
            for (let i = r.s; i <= r.e; i++) {
              const c = ratio(pts[i].pb, pts[i].pa);
              if (c > coreChange) {
                coreChange = c;
                core = i;
              }
            }
            cands.push({ ...r, core, coreChange, end: pts[r.e].d });
          }
          const strong = cands.filter((c) => c.coreChange >= conf.BAND);
          const pool = strong.length ? strong : cands;
          let best = null;
          for (const c of pool) {
            if (!best) best = c;
            else if (strong.length ? c.end > best.end || (c.end === best.end && c.coreChange > best.coreChange) : c.coreChange > best.coreChange) best = c;
          }
          // A control that is hidden until focused (the skip link) appears
          // whole, over whatever was there, so the diff cannot tell its ring
          // from its body. Its ring is found by colour instead: the outermost
          // run of pixels within 48 levels of the computed outline colour.
          if (conf.ring) {
            const dist = (p) => Math.max(...p.map((v, k) => Math.abs(v - conf.ring[k])));
            let run = null;
            best = null;
            pts.forEach((p, i) => {
              if (dist(p.pb) <= 48) {
                if (!run) run = { s: i, e: i };
                else run.e = i;
              } else if (run) {
                if (pts[run.e].d >= -1) best = run;
                run = null;
              }
            });
            if (run && pts[run.e].d >= -1) best = run;
            if (best) {
              let core = best.s;
              for (let i = best.s; i <= best.e; i++) if (dist(pts[i].pb) < dist(pts[core].pb)) core = i;
              best = { ...best, core, coreChange: ratio(pts[core].pb, pts[core].pa) };
            }
          }
          if (!best) {
            lines.push(null);
            continue;
          }
          let lo = best.core;
          let hi = best.core;
          const cpx = pts[best.core].pb;
          while (lo - 1 >= best.s && ratio(pts[lo - 1].pb, cpx) < conf.BAND) lo--;
          while (hi + 1 <= best.e && ratio(pts[hi + 1].pb, cpx) < conf.BAND) hi++;
          // The colour next to the band. A ring at a fractional position is
          // antialiased: its edge pixel is a blend of the ring and what lies
          // beyond, so when the first pixel sits between the core and the one
          // after it in luminance, the one after it is the adjacent colour.
          const beyond = (i, step) => {
            const p1 = pts[i];
            if (!p1) return null;
            const p2 = pts[i + step];
            if (!p2) return p1.pb;
            const [l0, l1, l2] = [lum(cpx), lum(p1.pb), lum(p2.pb)];
            return (l1 - l0) * (l1 - l2) < 0 ? p2.pb : p1.pb;
          };
          const inner = beyond(lo - 1, -1);
          const outer = beyond(hi + 1, 1);
          const adj = [inner, outer].filter(Boolean).map((p) => ratio(cpx, p));
          let solid3 = 0;
          for (let i = best.s; i <= best.e; i++) if (ratio(pts[i].pb, pts[i].pa) >= 3) solid3++;
          lines.push({
            ring: hex(cpx),
            inner: inner ? hex(inner) : null,
            outer: outer ? hex(outer) : null,
            adjacent: adj.length ? Math.min(...adj) : null,
            change: best.coreChange,
            // How far out the ring's own band reaches (a shadow the control
            // drops on focus may run further; it is not the ring).
            reach: pts[hi].d,
            width: hi - lo + 1,
            solid3,
          });
        }
        const got = lines.filter(Boolean);
        const med = (xs) => {
          const s = xs.filter((v) => v != null).sort((p, q) => p - q);
          return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
        };
        sides[side] = {
          lines: got.length,
          contrast: med(got.map((l) => l.adjacent)),
          change: med(got.map((l) => l.change)),
          reach: med(got.map((l) => l.reach)),
          width: med(got.map((l) => l.width)),
          solid3: med(got.map((l) => l.solid3)),
          ring: got.length ? got[Math.floor((got.length - 1) / 2)].ring : null,
          against: got.length ? [got[Math.floor((got.length - 1) / 2)].inner, got[Math.floor((got.length - 1) / 2)].outer] : null,
        };
      }
      return { changed, total: W * H, sides };
    },
    [a.toString('base64'), b.toString('base64'), box, conf],
  );
}

// sRGB colour strings as computed styles give them: rgb(), rgba(), color(srgb).
function parseColour(s) {
  if (!s) return null;
  let m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { rgb: [+m[1], +m[2], +m[3]], a };
  }
  m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (m) return { rgb: [m[1], m[2], m[3]].map((v) => Math.round(parseFloat(v) * 255)), a: m[4] == null ? 1 : parseFloat(m[4]) };
  return null;
}

function contrast(p, q) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = (x) => 0.2126 * lin(x[0]) + 0.7152 * lin(x[1]) + 0.0722 * lin(x[2]);
  const [l1, l2] = [lum(p), lum(q)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// The computed ring colour, read from style rather than pixels: never the
// --signal fill on the dark theme, and at least 3:1 on the page's paper (a
// ring that fails on the paper fails on every surface lighter than it).
function colourReasons(info) {
  const out = [];
  const paper = parseColour(info.paper);
  for (const o of info.outlines || []) {
    if (o.style === 'none' || !(parseFloat(o.width) > 0)) continue;
    if (info.theme === 'dark' && FORBIDDEN_DARK_RING[o.color]) out.push(`${o.who} outline is ${o.color}, ${FORBIDDEN_DARK_RING[o.color]}, on the dark theme`);
    const c = parseColour(o.color);
    if (!c || !paper) continue;
    const seen = c.rgb.map((v, i) => v * c.a + paper.rgb[i] * (1 - c.a));
    const r = contrast(seen, paper.rgb);
    if (r < CONTRAST_MIN) out.push(`${o.who} outline ${o.color} is ${r.toFixed(2)}:1 on the page paper ${info.paper}`);
  }
  return out;
}

function verdict(m, box) {
  const reasons = [];
  const perimeter = Math.round(2 * (box.w + box.h));
  if (m.changed < perimeter) reasons.push(`changed ${m.changed} px < perimeter ${perimeter}`);
  const missing = [];
  const clipped = [];
  const faint = [];
  // A ring reaches as far on every side as on its widest one. An inset ring
  // (the check grid's, drawn inside because the card clips) reaches the same
  // depth all round and passes; a ring a parent cuts off stops short on the
  // cut sides, or vanishes there.
  const reaches = Object.values(m.sides).filter((s) => s.lines >= 2).map((s) => s.reach);
  const widest = reaches.length ? Math.max(...reaches) : null;
  for (const [side, s] of Object.entries(m.sides)) {
    if (s.lines < 2) missing.push(side);
    else if (s.reach < widest - 1) clipped.push(`${side} (${s.reach}px out, ${widest}px elsewhere)`);
    if (s.lines >= 2 && s.contrast != null && s.contrast < CONTRAST_MIN) faint.push(`${side} ${s.contrast.toFixed(2)}`);
  }
  if (missing.length) reasons.push(`no ring on ${missing.join(', ')}`);
  if (clipped.length) reasons.push(`ring cut short on ${clipped.join(', ')}`);
  if (faint.length) reasons.push(`contrast < ${CONTRAST_MIN}:1 (${faint.join(', ')})`);
  const cs = Object.values(m.sides).map((s) => s.contrast).filter((c) => c != null);
  return { ok: reasons.length === 0, reasons, perimeter, minContrast: cs.length ? Math.min(...cs) : null };
}

// ---------------------------------------------------------------------------
// The page side.
// ---------------------------------------------------------------------------
async function addStyle(page, css) {
  if (!css) return;
  await page.evaluate((text) => {
    const s = document.createElement('style');
    s.dataset.focusProbe = '1';
    s.textContent = text;
    document.head.appendChild(s);
  }, css);
}

// The focused control: its box (a field's well, when it sits in one), whether
// it can be measured, and the ring styles that drew what the pixels show.
async function describeFocused(page, idx) {
  return page.evaluate(
    ([idx, PAD]) => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return { end: 'focus left the page' };
      if (el.dataset.fvSeen) return { end: 'tab order wrapped' };
      el.dataset.fvSeen = String(idx);
      if (el.tagName === 'IFRAME') return { skip: 'iframe' };
      const target = el.closest('.eg-bar-field') || el;
      const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean)[0] || '' : '';
      const name = `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${label}"`;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      // Settle what focus set moving (the skip link slides in), so the box is
      // where the ring is drawn. Infinite animations are left alone.
      for (const a of document.getAnimations()) {
        const end = a.effect && a.effect.getComputedTiming().endTime;
        if (Number.isFinite(end)) a.finish();
      }
      const rects = el.getClientRects();
      if (getComputedStyle(el).display === 'inline' && rects.length > 1) return { name, skip: 'multi-line inline' };
      const r = target.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return { name, skip: 'no box' };
      if (r.left - PAD < 0 || r.top - PAD < 0 || r.right + PAD > innerWidth || r.bottom + PAD > innerHeight) {
        return { name, skip: 'outside the viewport' };
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && !(target.contains(hit) || hit.contains(target))) return { name, skip: 'under another layer' };
      const s = getComputedStyle(el);
      const t = getComputedStyle(target);
      const probe = document.createElement('i');
      probe.style.color = 'var(--paper)';
      document.body.appendChild(probe);
      const paper = getComputedStyle(probe).color;
      probe.remove();
      const outlines = [{ who: 'control', style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }];
      if (target !== el) outlines.push({ who: 'well', style: t.outlineStyle, width: t.outlineWidth, color: t.outlineColor });
      return {
        name,
        well: target !== el,
        focusVisible: el.matches(':focus-visible'),
        box: { x: r.left, y: r.top, w: r.width, h: r.height },
        theme: document.documentElement.getAttribute('data-theme'),
        paper,
        outlines,
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} offset ${s.outlineOffset}`,
        boxShadow: (target !== el ? t.boxShadow : s.boxShadow).slice(0, 160),
        wellOutline: target !== el ? `${t.outlineStyle} ${t.outlineWidth} ${t.outlineColor} offset ${t.outlineOffset}` : null,
      };
    },
    [idx, PAD],
  );
}

function clipOf(box) {
  const x = Math.floor(box.x) - PAD;
  const y = Math.floor(box.y) - PAD;
  return {
    clip: { x, y, width: Math.ceil(box.x + box.w) + PAD - x, height: Math.ceil(box.y + box.h) + PAD - y },
    inClip: { x: box.x - x, y: box.y - y, w: box.w, h: box.h },
  };
}

// Focused shot (as the keyboard left it), then blurred, then focus restored so
// the next Tab continues from this control.
async function measureFocused(page, lab, info, shots, tag) {
  const { clip, inClip } = clipOf(info.box);
  const focused = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  await page.evaluate(() => {
    window.__fvEl = document.activeElement;
    window.__fvBox = window.__fvEl.getBoundingClientRect();
    document.activeElement.blur();
  });
  const blurred = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  // Hidden until focused: blurred, it has moved away (the skip link slides
  // off) or stopped painting.
  const revealed = await page.evaluate(() => {
    const el = window.__fvEl;
    for (const a of document.getAnimations()) {
      const end = a.effect && a.effect.getComputedTiming().endTime;
      if (Number.isFinite(end)) a.finish();
    }
    const was = window.__fvBox;
    const now = el.getBoundingClientRect();
    const moved = Math.abs(now.left - was.left) > 2 || Math.abs(now.top - was.top) > 2;
    const painted = el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
    return moved || !painted;
  });
  await page.evaluate(() => window.__fvEl && window.__fvEl.focus({ preventScroll: true }));
  const own = (info.outlines || []).find((o) => o.who === 'control' && o.style !== 'none' && parseFloat(o.width) > 0);
  const ring = revealed && own && parseColour(own.color) ? parseColour(own.color).rgb : null;
  const m = await analyse(lab, blurred, focused, inClip, { TH, IN, PAD, BAND: BAND_RATIO, ring });
  m.revealed = revealed;
  const v = verdict(m, info.box);
  const style = colourReasons(info);
  if (style.length) {
    v.reasons.push(...style);
    v.ok = false;
  }
  if (shots && (shots.all || !v.ok || shots.named.has(tag))) {
    fs.writeFileSync(path.join(shots.dir, `${tag}-blurred.png`), blurred);
    fs.writeFileSync(path.join(shots.dir, `${tag}-focused.png`), focused);
  }
  return { ...m, ...v };
}

async function openRoute(ctx, base, route, inject) {
  const page = await ctx.newPage();
  await page.goto(base + route, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(400);
  await addStyle(page, inject);
  return page;
}

async function tabRoute(page, lab, vp, max, shots, slug) {
  const rows = [];
  await page.mouse.move(vp.w - 2, vp.h - 2);
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const info = await describeFocused(page, i);
    if (info.end) break;
    if (info.skip) {
      rows.push({ i, name: info.name || '(iframe)', skipped: info.skip });
      continue;
    }
    if (!info.focusVisible) {
      rows.push({ i, name: info.name, ok: false, reasons: ['Tab focus does not match :focus-visible'], box: info.box });
      continue;
    }
    const m = await measureFocused(page, lab, info, shots, `${slug}-${String(i).padStart(2, '0')}`);
    rows.push({ i, name: info.name, well: info.well, box: info.box, outline: info.outline, outlines: info.outlines, boxShadow: info.boxShadow, wellOutline: info.wellOutline, ...m });
  }
  return rows;
}

// The invalid well: an empty submit refuses on the client and focuses the
// field, which then carries data-invalid. Nothing may leave the page.
async function invalidCase(page, lab, shots, slug) {
  const api = [];
  const onReq = (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) api.push(`${r.method()} ${r.url()}`);
  };
  const ready = await page.evaluate(() => {
    const input = document.querySelector('.eg-bar .eg-bar-input');
    if (!input) return 'no .eg-bar-input';
    input.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (input.value) return 'the first field is not empty';
    input.focus();
    return null;
  });
  if (ready) return { ok: false, reasons: [ready] };
  page.on('request', onReq);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  page.off('request', onReq);
  const state = await page.evaluate(() => {
    const el = document.activeElement;
    const well = el && el.closest('.eg-bar-field');
    return { invalid: !!(well && well.hasAttribute('data-invalid')), ariaInvalid: el && el.getAttribute('aria-invalid') };
  });
  if (!state.invalid) return { ok: false, reasons: ['the empty submit did not leave a focused field in the invalid state'], api };
  const info = await describeFocused(page, 900);
  if (info.skip || info.end) return { ok: false, reasons: [`cannot measure: ${info.skip || info.end}`], api };
  const m = await measureFocused(page, lab, info, shots, `${slug}-invalid`);
  const reasons = [...m.reasons];
  if (api.length) reasons.push(`the refused submit sent ${api.length} request(s): ${api.join(', ')}`);
  return { name: info.name, box: info.box, boxShadow: info.boxShadow, wellOutline: info.wellOutline, api, ...m, ok: reasons.length === 0, reasons };
}

// A named control: Tab from the top until it has focus (it must be reachable
// by keyboard), then hold it to the same checks as every other control.
async function namedCase(page, lab, vp, probe, shots, slug) {
  await page.mouse.move(vp.w - 2, vp.h - 2);
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  let reached = false;
  for (let i = 0; i < 200 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate((sel) => !!document.activeElement && document.activeElement.matches(sel), probe.selector);
  }
  if (!reached) return { name: probe.label, ok: false, reasons: [`${probe.selector} was not reached in 200 Tab presses`] };
  const info = await describeFocused(page, 950);
  if (info.skip || info.end) return { name: probe.label, ok: false, reasons: [`cannot measure: ${info.skip || info.end}`] };
  if (!info.focusVisible) return { name: probe.label, ok: false, reasons: ['Tab focus does not match :focus-visible'] };
  const m = await measureFocused(page, lab, info, shots, `${slug}-named`);
  return { name: `${probe.label}: ${info.name}`, box: info.box, outline: info.outline, outlines: info.outlines, ...m };
}

async function main() {
  const args = process.argv.slice(2);
  const BASE = (opt(args, '--base') || 'http://localhost:3422').replace(/\/$/, '');
  const CHANNEL = opt(args, '--channel') || 'chrome';
  const JSON_OUT = args.includes('--json');
  const MAX = Number(opt(args, '--max') || 40);
  const routeArg = opt(args, '--routes');
  const routes = routeArg ? routeArg.split(',') : ROUTES;
  const badRoute = routes.find((r) => !r.startsWith('/'));
  if (badRoute) {
    // Git Bash rewrites a bare /score into a Windows path; MSYS_NO_PATHCONV=1 stops it.
    console.error(`[focus] route "${badRoute}" does not start with /`);
    process.exit(2);
  }
  const themes = (opt(args, '--themes') || 'dark,light').split(',');
  const widths = (opt(args, '--widths') || '1440,390,1280').split(',').map(Number);
  const viewports = VIEWPORTS.filter((v) => widths.includes(v.w));
  const shotsDir = opt(args, '--shots');
  let breaks = [];
  const bi = args.indexOf('--break');
  if (bi >= 0) {
    const next = args[bi + 1];
    breaks = next && !next.startsWith('--') ? next.split(',') : Object.keys(DEFECTS);
    for (const b of breaks) {
      if (!DEFECTS[b]) {
        console.error(`[focus] unknown --break "${b}" (one of ${Object.keys(DEFECTS).join(', ')})`);
        process.exit(2);
      }
    }
  }
  let inject = breaks.map((b) => DEFECTS[b]).join('\n');
  const injectPath = opt(args, '--inject');
  if (injectPath) {
    try {
      inject += '\n' + fs.readFileSync(injectPath, 'utf8');
    } catch (e) {
      console.error(`[focus] cannot read --inject ${injectPath}: ${e.message}`);
      process.exit(2);
    }
  }
  let shots = null;
  if (shotsDir) {
    fs.mkdirSync(shotsDir, { recursive: true });
    shots = { dir: shotsDir, all: args.includes('--shots-all'), named: new Set((opt(args, '--shot') || '').split(',').filter(Boolean)) };
  }

  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    console.error('[focus] playwright-core not installed.');
    process.exit(2);
  }
  let browser;
  try {
    browser = await chromium.launch({ channel: CHANNEL, headless: true });
  } catch (e) {
    console.error(`[focus] cannot launch ${CHANNEL}: ${e.message}`);
    process.exit(2);
  }

  const blocked = [];
  // Each theme and width is its own context. One at a time by default: four
  // side by side in one browser timed out screenshots on the homepage and
  // saved under a minute of ~five. --jobs runs more at once, locally.
  const combos = [];
  for (const theme of themes) for (const vp of viewports) combos.push({ theme, vp, routes });
  // --routes narrows the extra passes as well; a pass left with no route is dropped.
  for (const p of EXTRA_PASSES) {
    if (!themes.includes(p.theme) || !widths.includes(p.vp.w)) continue;
    const rs = routeArg ? p.routes.filter((r) => routes.includes(r)) : p.routes;
    if (rs.length) combos.push({ theme: p.theme, vp: p.vp, routes: rs });
  }
  const JOBS = Math.max(1, Number(opt(args, '--jobs') || 1));
  let results = [];
  try {
    const queue = combos.map((c, i) => ({ ...c, i }));
    const perCombo = new Array(combos.length);
    const runCombo = async ({ theme, vp, routes }) => {
      const results = [];
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      // GET only: the probe reads pages and never writes to the site.
      await ctx.route('**/*', (route) => {
        const m = route.request().method();
        if (m === 'GET' || m === 'HEAD') return route.continue();
        blocked.push(`${m} ${route.request().url()}`);
        return route.abort();
      });
      const lab = await ctx.newPage();
      for (const route of routes) {
        const slug = `${theme}-${vp.w}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}`;
        let page;
        try {
          page = await openRoute(ctx, BASE, route, inject);
          const set = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
          if (set !== theme) {
            results.push({ route, theme, width: vp.w, kind: 'route', error: `data-theme is ${set}, wanted ${theme}` });
            continue;
          }
          const rows = await tabRoute(page, lab, vp, MAX, shots, slug);
          results.push({ route, theme, width: vp.w, kind: 'route', rows });
          if (INVALID_ROUTES.includes(route)) {
            await page.close();
            page = await openRoute(ctx, BASE, route, inject);
            const inv = await invalidCase(page, lab, shots, slug);
            results.push({ route, theme, width: vp.w, kind: 'invalid', rows: [{ i: 'invalid', ...inv, name: inv.name || 'first command-bar field, invalid' }] });
          }
          for (const probe of NAMED.filter((n) => n.route === route)) {
            await page.close();
            page = await openRoute(ctx, BASE, route, inject);
            const row = await namedCase(page, lab, vp, probe, shots, slug);
            results.push({ route, theme, width: vp.w, kind: 'named', rows: [{ i: 'named', ...row }] });
          }
        } catch (e) {
          results.push({ route, theme, width: vp.w, kind: 'route', error: String(e && e.message ? e.message : e).split('\n')[0] });
        } finally {
          if (page) await page.close();
        }
      }
      await ctx.close();
      return results;
    };
    await Promise.all(
      Array.from({ length: Math.min(JOBS, combos.length) }, async () => {
        while (queue.length) {
          const c = queue.shift();
          perCombo[c.i] = await runCombo(c);
        }
      }),
    );
    results = perCombo.flat();
  } finally {
    await browser.close();
  }

  let measured = 0;
  let skipped = 0;
  const failures = [];
  const contrasts = [];
  for (const r of results) {
    if (r.error) {
      failures.push({ where: `${r.route} ${r.theme} ${r.width}`, name: '(route)', reasons: [r.error] });
      continue;
    }
    if (r.kind === 'route' && r.rows.filter((x) => !x.skipped).length === 0) {
      failures.push({ where: `${r.route} ${r.theme} ${r.width}`, name: '(route)', reasons: ['no control was measured'] });
    }
    for (const x of r.rows) {
      if (x.skipped) {
        skipped++;
        continue;
      }
      measured++;
      if (x.minContrast != null) contrasts.push(x.minContrast);
      if (!x.ok) failures.push({ where: `${r.route} ${r.theme} ${r.width}${r.kind === 'route' ? '' : ' ' + r.kind}`, name: x.name, reasons: x.reasons, sides: x.sides, outline: x.outline, boxShadow: x.boxShadow, wellOutline: x.wellOutline });
    }
  }
  contrasts.sort((a, b) => a - b);
  const median = contrasts.length ? contrasts[Math.floor((contrasts.length - 1) / 2)] : null;
  const invalidRows = results.filter((r) => r.kind === 'invalid');
  const namedRows = results.filter((r) => r.kind === 'named');

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, broken: breaks, contrastMin: CONTRAST_MIN, measured, skipped, failures: failures.length, medianMinContrast: median, blocked: blocked.length, results }, null, 1));
  } else {
    console.log(`[focus] ${BASE}${breaks.length ? ` (defects injected: ${breaks.join(', ')})` : ''}`);
    console.log(`  pass: focus changes >= the box's perimeter in pixels, the ring is >= ${CONTRAST_MIN}:1 against the colours on both sides of it, and it reaches past the box on all four sides`);
    for (const r of results) {
      const where = `${r.kind.padEnd(7)} ${r.route.padEnd(48)} ${r.theme.padEnd(5)} ${String(r.width).padStart(4)}`;
      if (r.error) {
        console.log(`  ERROR    ${where}  ${r.error}`);
        continue;
      }
      const got = r.rows.filter((x) => !x.skipped);
      const bad = got.filter((x) => !x.ok);
      const mins = got.map((x) => x.minContrast).filter((c) => c != null);
      const low = mins.length ? Math.min(...mins).toFixed(2) : '-';
      const one = r.kind !== 'route' && got[0];
      const extra = one ? `  ${got[0].changed != null ? `changed ${got[0].changed} px (perimeter ${got[0].perimeter})` : ''}${r.kind === 'named' ? `  ${got[0].name}, outline ${got[0].outline || '-'}` : ''}` : '';
      console.log(`  ${(bad.length ? 'FAIL' : 'PASS').padEnd(8)} ${where}  ${got.length - bad.length}/${got.length} controls, ${r.rows.length - got.length} skipped, lowest ring contrast ${low}${extra}`);
    }
    if (failures.length) {
      console.log(`\n  ${failures.length} failing control(s):`);
      for (const f of failures.slice(0, 60)) console.log(`    ${f.where}  ${f.name}: ${f.reasons.join('; ')}`);
      if (failures.length > 60) console.log(`    ... and ${failures.length - 60} more (--json for all)`);
    }
    console.log(`[focus] ${measured - failures.filter((f) => f.name !== '(route)').length}/${measured} focusings pass, ${skipped} skipped, ${invalidRows.length} invalid-state and ${namedRows.length} named probes; median ring contrast ${median ? median.toFixed(2) : '-'}; ${blocked.length} non-GET request(s) aborted`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error('[focus] fatal:', e && e.stack ? e.stack : e);
  process.exit(2);
});
