#!/usr/bin/env node
/**
 * Ignition gate: the score's loading ignition does what brand D51 and its
 * rulings (D54) say, on both score loaders, in both themes, with motion on,
 * with reduced motion and with motion paused.
 *
 * WHY THIS EXISTS
 * The ignition (app/lib/engine/ignition.ts, globals.css "loading ignition")
 * is a per-frame colour sweep, a ring, a hold and a swap back, on a dot of 5
 * to 8px. None of it is visible to a source check, the axe sweep or a
 * screenshot at rest, and each part has a quiet way to go wrong: an sRGB
 * blend (it passes through grey), a hue that goes the other way round
 * through green, a last frame a rounding short of the flame, a breath that
 * keeps looping under the site's "Pause motion", a rim that fades with the
 * breath, a crossfade on the calm path, two lamps lighting for one result,
 * or orange on a run that did not land. This gate runs the real thing in a
 * browser on a fake clock and reads every frame.
 *
 * WHAT IT ASSERTS
 * Surfaces: the score form on the home page (the run line's lone dot over
 * the loader and the B′ result; /api/score held) and the four-engine
 * instrument on /score (the dot in its mark; /api/report held,
 * /api/guardrails failing). A run is submitted, and the browser clock is
 * paused before the held response is released, so every frame after the
 * result lands is read at an exact time. The fill is read from the dot's
 * ::before, the rim from the dot's box-shadow.
 * Modes: dark and light, each with motion, with prefers-reduced-motion:
 * reduce, and with the site's pause (localStorage "motion" = "paused", the
 * way the toggle stores it).
 *   motion   while running, the dot runs ig-breathe (1600ms, infinite) and
 *            is Azure (--signal); its own opacity stays 1 (only the fill
 *            breathes); pausing motion mid-run stops it live. On light, at
 *            the breath's maximum, minimum and both midpoints, the rim's
 *            rendered width is 1px (spread x scale) and its pixel colour,
 *            read from a 2x screenshot on all four sides, is --signal-access
 *            #016ABB. When the result lands, the fill on every 16ms frame
 *            from 0 to 320ms equals the reference sweep (OKLCH,
 *            easeOutQuart, hue rising 250.8 -> 46.7 + 360) within 1 per
 *            channel and is never grey, and 320ms is exactly #F56B00; on
 *            light the rim is drawn in every one of those frames, on the
 *            same sweep from #016ABB to #B04D00. One ring: 700ms, 120ms delay,
 *            easeOutExpo, scale 1 -> 1.9, opacity .9 -> 0, in --activation.
 *            At 1000ms the dot holds the flame (light: the 1px
 *            --activation-ink rim). At 1400ms it is Azure again with one
 *            400ms opacity .55 -> 1 settle on the fill only, and it does not
 *            breathe.
 *   calm     (reduced motion, and paused): no breath while running. When the
 *            result lands and when it swaps back, there are no intermediate
 *            colours: on every 16ms frame from 0 to 320ms, at 1384ms and at
 *            1400ms the dot has no animation or transition at all, the dot
 *            and its fill are at opacity 1, no colour is written per frame,
 *            the fill is exactly the flame (then exactly Azure), and the
 *            centre pixel of a 2x screenshot is that colour exactly.
 *   one      exactly one ignition per landing, page wide: a mutation observer
 *            counts every dot that enters "sweep" or "lit". Also on
 *            /score/v0, /score/bolt and /score/lovable, which run on load.
 *            The page-wide claim (claimLanding) is also checked directly:
 *            two lamps in one landing get one ignition, the next landing
 *            gets its own.
 *   no land  a run that fails never shows the flame.
 *   artwork  the header and footer (the logo and lockup) hold no ignition
 *            element, so the rim and the breath never reach them.
 *
 * PROVING IT CAN FAIL
 *   --break injects four regressions: the breath keeps running under the
 *   pause, the fill gets an sRGB transition (a blend, and a crossfade on the
 *   calm path), the whole dot fades with the breath (the rim with it), and
 *   the page-wide claim is skipped (checked against a second lamp). The gate
 *   must exit 1.
 *
 * Usage:
 *   node scripts/check-ignition.js --base http://127.0.0.1:3422 [--channel chrome]
 *     [--surfaces home,score] [--themes dark,light] [--modes motion,reduced,paused]
 *     [--frames <dir>] [--break] [--json]
 * --frames writes 2x crops of the dot while running, at the breath's maximum
 * and minimum, at 0, 80, 160 and 320ms, at the hold (1000ms), just before the
 * swap back (1384ms), at the swap (1400ms) and settled (1800ms), plus the
 * sampled colours and rim pixels, to <dir>.
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 * Needs Node 22.18+ (type stripping, for the claimLanding check).
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('--base', '').replace(/\/$/, '');
const CHANNEL = arg('--channel', undefined);
const BREAK = args.includes('--break');
const AS_JSON = args.includes('--json');
const FRAMES = arg('--frames', '');
const THEMES = arg('--themes', 'dark,light').split(',');
const MODES = arg('--modes', 'motion,reduced,paused').split(',');
const SURFACE_NAMES = arg('--surfaces', 'home,score').split(',');
const ONLOAD_ROUTES = ['/score/v0', '/score/bolt', '/score/lovable'];

if (!BASE) {
  console.error('usage: node scripts/check-ignition.js --base http://127.0.0.1:3422 [--channel chrome] [--frames dir] [--break] [--json]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('check-ignition: playwright is not installed');
    process.exit(2);
  }
}

// The reference sweep (brand flame/build_flame.py, ignite()), written out
// here so the gate does not read the code it checks.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function hexToOklch(h) {
  const [r, g, b] = [1, 3, 5].map((i) => toLin(parseInt(h.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function oklchToRgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.min(1, Math.max(0, toGam(v))) * 255));
}
const AZURE = '#0A94FF';
const FLAME = '#F56B00';
const AZURE_DEEP = '#016ABB';
const FLAME_DEEP = '#B04D00';
function sweep(ms, coolHex, hotHex) {
  const cool = hexToOklch(coolHex);
  const hot = hexToOklch(hotHex);
  const e = 1 - Math.pow(1 - Math.min(1, ms / 320), 4);
  const h0 = cool[2];
  const h1 = hot[2] + (hot[2] < h0 ? 360 : 0);
  return oklchToRgb(cool[0] + (hot[0] - cool[0]) * e, cool[1] + (hot[1] - cool[1]) * e, (h0 + (h1 - h0) * e) % 360);
}
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** A computed colour as [r, g, b] in 0-255: rgb()/rgba(), or color(srgb ...). */
function parseColor(s) {
  const m = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)/.exec(s || '');
  if (m) return [m[1], m[2], m[3]].map((v) => Math.round(Number(v) * 255));
  return (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
}
const near = (a, b, tol = 1) => a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const chromaOf = (rgb) => hexToOklch(hex(rgb))[1];
/** The rim from a computed box-shadow: its colour and spread, or null. */
function parseRim(boxShadow) {
  if (!boxShadow || boxShadow === 'none') return null;
  const color = parseColor(boxShadow);
  const lengths = (boxShadow.replace(/rgba?\([^)]*\)|color\([^)]*\)/g, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
  return { color, spread: lengths[3] ?? null };
}

/** A minimal PNG decoder (8-bit RGB or RGBA, not interlaced: what Chrome's
    screenshots are), so pixels are read without a dependency. */
function decodePng(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9];
      if (data[8] !== 8 || (ct !== 2 && ct !== 6) || data[12]) throw new Error(`unsupported PNG (depth ${data[8]}, colour type ${ct})`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return (x, y) => {
    const i = y * stride + x * bpp;
    return [out[i], out[i + 1], out[i + 2]];
  };
}

const REPORT = {
  ok: true,
  compositeScore: 82,
  compositeGrade: 'B',
  totalPass: 2,
  totalWarn: 0,
  totalFail: 1,
  totalSkip: 0,
  totalManual: 0,
  totalChecks: 3,
  score: { ok: true, score: 82, grade: 'B', checks: [] },
  drift: { ok: true, score: 80, grade: 'B', checks: [] },
  readiness: { ok: true, score: 85, grade: 'B', checks: [] },
};
const FAIL = { ok: false, error: 'Ignition probe: no result.' };

// A small, complete score result (as check-status-messages.js uses), so the
// home form draws its B′ result.
const SCORED = {
  ok: true,
  score: 82.5,
  grade: 'B',
  pass: 2,
  fail: 1,
  warn: 0,
  skip: 0,
  manual: 0,
  total: 3,
  scope: 'universal',
  tokensExtracted: 12,
  categoryScores: {
    tokens: { score: 100, weight: 9, pass: 1, fail: 0, warn: 0, skip: 0, manual: 0 },
    accessibility: { score: 50, weight: 15, pass: 1, fail: 1, warn: 0, skip: 0, manual: 0 },
  },
  checks: [
    { id: 'v01', item: 'Tokens resolve', category: 'tokens', status: 'PASS', detail: 'Resolved.' },
    { id: 'v05', item: 'Focus ring', category: 'accessibility', status: 'PASS', detail: 'Visible.' },
    { id: 'v06', item: 'Text contrast', category: 'accessibility', status: 'FAIL', detail: 'Below 4.5:1.' },
  ],
};

const SURFACES = {
  home: {
    route: '/',
    label: 'Site URL to score',
    lamp: '.score-lamp[data-ignite]',
    held: '**/api/score',
    body: SCORED,
    other: {},
  },
  score: {
    route: '/score',
    label: 'Site URL to verify',
    lamp: '.eg-mark[data-ignite]',
    held: '**/api/report',
    body: REPORT,
    other: { '**/api/guardrails': FAIL },
  },
};

const BROKEN = `
  html[data-motion="paused"] [data-ignite][data-phase="running"] > .ig-dot {
    animation: ig-breathe 1600ms ease-in-out infinite !important;
  }
  [data-ignite] > .ig-dot::before { transition: background-color 320ms linear !important; }
  [data-ignite][data-phase="running"] > .ig-dot { opacity: 0.72 !important; }
`;

// Every data-lamp change and every inline colour write on a dot, from the
// first byte, so a flame that came and went between two reads is still seen.
function observeLamps() {
  window.__ig = { lamps: [], writes: 0 };
  const ids = new WeakMap();
  let n = 0;
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target;
      if (m.attributeName === 'data-lamp') {
        if (!ids.has(el)) ids.set(el, n++);
        window.__ig.lamps.push({ i: ids.get(el), from: m.oldValue, to: el.getAttribute('data-lamp') });
      } else if (m.attributeName === 'style' && el.classList && el.classList.contains('ig-dot') && /--ig-fill/.test(el.getAttribute('style') || '')) {
        window.__ig.writes++;
      }
    }
  }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-lamp', 'style'] });
}
const ignitionsIn = (lamps) => lamps.filter((l) => l.from === null && (l.to === 'sweep' || l.to === 'lit')).length;

async function newContext(browser, theme, mode, { dsf = 2 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dsf,
    colorScheme: theme,
    reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
  });
  await ctx.addCookies([{ name: 'theme', value: theme, url: BASE }]);
  await ctx.addInitScript(
    ([t, paused, broken]) => {
      try {
        localStorage.setItem('theme', t);
        localStorage.setItem('motion', paused ? 'paused' : 'on');
      } catch {
        /* storage blocked */
      }
      if (broken) {
        document.addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('style');
          s.textContent = broken;
          document.head.appendChild(s);
        });
      }
    },
    [theme, mode === 'paused', BREAK ? BROKEN : ''],
  );
  await ctx.addInitScript(observeLamps);
  return ctx;
}

async function run(browser, surfaceName, theme, mode, land) {
  const surface = SURFACES[surfaceName];
  const LAMP = surface.lamp;
  const failures = [];
  const samples = [];
  const rimPixels = [];
  const label = `${surfaceName} (${surface.route}) / ${theme} / ${mode}${land ? '' : ' / run fails'}`;
  const ctx = await newContext(browser, theme, mode);
  try {
    let release;
    const held = new Promise((r) => (release = r));
    await ctx.route(surface.held, async (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      await held;
      await r.fulfill({ status: land ? 200 : 502, contentType: 'application/json', body: JSON.stringify(land ? surface.body : FAIL) });
    });
    for (const [glob, body] of Object.entries(surface.other)) {
      await ctx.route(glob, (r) => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify(body) }));
    }
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto(`${BASE}${surface.route}`, { waitUntil: 'load' });
    const rendered = await page.evaluate(() => document.documentElement.dataset.theme);
    if (rendered !== theme) failures.push(`page rendered theme ${rendered}, expected ${theme}`);

    // The logo and lockup artwork never carries the lamp, so neither the rim
    // nor the breath can reach it.
    const inArt = await page.evaluate(
      () => document.querySelectorAll(':is(header, footer) :is([data-ignite], .ig-dot, .ig-halo)').length,
    );
    if (inArt) failures.push(`artwork: ${inArt} ignition element(s) inside the header or footer`);

    const read = () =>
      page.evaluate((lampSel) => {
        const d = document.querySelector(`${lampSel} > .ig-dot`);
        const h = document.querySelector(`${lampSel} > .ig-halo`);
        const cs = getComputedStyle(d);
        const fs = getComputedStyle(d, '::before');
        const hs = getComputedStyle(h);
        const anim = (el) =>
          el.getAnimations({ subtree: true }).map((a) => {
            const t = a.effect.getTiming();
            return {
              css: a.animationName || null,
              transition: a.transitionProperty || null,
              pseudo: a.effect.pseudoElement || null,
              duration: t.duration,
              delay: t.delay,
              iterations: t.iterations,
              easing: t.easing,
              frames: a.effect.getKeyframes().map((k) => ({ opacity: k.opacity, transform: k.transform })),
            };
          });
        const r = d.getBoundingClientRect();
        return {
          phase: d.parentElement.dataset.phase,
          lamp: d.getAttribute('data-lamp'),
          fill: fs.backgroundColor,
          fillOpacity: fs.opacity,
          dotOpacity: cs.opacity,
          transitions: [cs.transitionDuration, fs.transitionDuration],
          rim: cs.boxShadow,
          scale: cs.getPropertyValue('--ig-s').trim(),
          dotAnims: anim(d),
          haloAnims: anim(h),
          haloOpacity: hs.opacity,
          haloRing: hs.boxShadow,
          signal: cs.getPropertyValue('--signal').trim(),
          activation: cs.getPropertyValue('--activation').trim(),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          writes: window.__ig.writes,
        };
      }, LAMP);

    // A 2x screenshot of the lamp: written as a frame (with --frames) and
    // decoded, so pixels can be read.
    const shoot = async (name) => {
      const box = await page.locator(LAMP).boundingBox();
      const clip = { x: Math.round(box.x + box.width / 2) - 16, y: Math.round(box.y + box.height / 2) - 16, width: 32, height: 32 };
      const buf = await page.screenshot({ clip, animations: 'allow' });
      if (FRAMES && name) fs.writeFileSync(path.join(FRAMES, `${surfaceName}-${theme}-${mode}-${name}.png`), buf);
      return { px: decodePng(buf), clip };
    };
    // The fill's centre pixel.
    const centrePixel = async (name, r) => {
      const { px, clip } = await shoot(name);
      return px(Math.floor((r.rect.x + r.rect.w / 2 - clip.x) * 2), Math.floor((r.rect.y + r.rect.h / 2 - clip.y) * 2));
    };
    // The rim's pixels. A 1px rim is 2 device pixels wide at 2x, so on each
    // side at least one device pixel lies wholly inside it, whatever the
    // sub-pixel offset; that pixel is the rim's colour at full strength.
    // Walking out from the centre to past the rim, the pixel nearest the
    // expected colour is that one (a faded rim has none that close).
    const rimPixel = async (name, r, want) => {
      const { px, clip } = await shoot(name);
      const cx = Math.floor((r.rect.x + r.rect.w / 2 - clip.x) * 2);
      const cy = Math.floor((r.rect.y + r.rect.h / 2 - clip.y) * 2);
      const reach = Math.ceil(r.rect.w) + 4;
      const best = (dx, dy) => {
        let pick = null;
        for (let k = 1; k <= reach; k++) {
          const v = px(cx + dx * k, cy + dy * k);
          const d = Math.max(...v.map((c, i) => Math.abs(c - want[i])));
          if (!pick || d < pick.d) pick = { v, d, k };
        }
        return pick.v;
      };
      return { top: best(0, -1), bottom: best(0, 1), left: best(-1, 0), right: best(1, 0) };
    };

    // The home form draws its lamp only once a run starts; the instrument's
    // mark is there at rest, Azure.
    if (surfaceName === 'score') {
      if ((await page.locator(`${LAMP} > .ig-dot`).count()) !== 1) {
        failures.push(`no ignition dot (${LAMP} > .ig-dot) at rest`);
        return { label, failures, samples, rimPixels };
      }
      const rest = await read();
      if (!near(parseColor(rest.fill), rgbOf(AZURE), 0)) failures.push(`at rest the dot is ${rest.fill}, not Azure`);
    } else if (await page.locator(LAMP).count()) {
      failures.push('the run line is drawn before any run');
    }

    // Run.
    const field = page.getByRole('textbox', { name: surface.label });
    await field.fill('example.com');
    await field.press('Enter');
    await page.locator(`${LAMP}[data-phase="running"] > .ig-dot`).waitFor({ timeout: 15000 });
    await page.waitForTimeout(250);
    const running = await read();
    if (running.signal.toUpperCase() !== AZURE) failures.push(`--signal is ${running.signal}, the reference assumes ${AZURE}`);
    if (running.activation.toUpperCase() !== FLAME) failures.push(`--activation is ${running.activation}, the reference assumes ${FLAME}`);
    const breath = running.dotAnims.filter((a) => a.css === 'ig-breathe');
    if (mode === 'motion') {
      if (breath.length !== 1 || breath[0].duration !== 1600 || breath[0].iterations !== Infinity)
        failures.push(`running: expected one ig-breathe (1600ms, infinite), got ${JSON.stringify(breath)}`);
    } else if (running.dotAnims.length) {
      failures.push(`running (${mode}): the dot must not animate, got ${JSON.stringify(running.dotAnims)}`);
    }
    if (Number(running.dotOpacity) !== 1) failures.push(`running: the dot's own opacity is ${running.dotOpacity}; only the fill may breathe`);
    if (!near(parseColor(running.fill), rgbOf(AZURE), 0)) failures.push(`running: the fill is ${running.fill}, not Azure`);
    await shoot('running');

    if (mode === 'motion') {
      // Pausing motion mid-run stops the breath live.
      await page.evaluate(() => (document.documentElement.dataset.motion = 'paused'));
      const paused = await read();
      if (paused.dotAnims.some((a) => a.css === 'ig-breathe')) failures.push('running: "Pause motion" mid-run did not stop the breath');
      await page.evaluate(() => delete document.documentElement.dataset.motion);
      const again = await read();
      if (!again.dotAnims.some((a) => a.css === 'ig-breathe')) failures.push('running: the breath did not resume when motion was turned back on');

      // The breath, held at four phases: the dot's own opacity stays 1, and
      // on light the rim is 1px wide and #016ABB in every one of them.
      for (const [at, name] of [[0, 'breath-max'], [400, null], [800, 'breath-min'], [1200, null]]) {
        await page.evaluate(
          ({ sel, t }) => {
            const a = document.querySelector(`${sel} > .ig-dot`).getAnimations().find((x) => x.animationName === 'ig-breathe');
            a.pause();
            a.currentTime = t;
          },
          { sel: LAMP, t: at },
        );
        const r = await read();
        if (Number(r.dotOpacity) !== 1) failures.push(`breath ${at}ms: the dot's own opacity is ${r.dotOpacity}`);
        const rim = parseRim(r.rim);
        const entry = { at, scale: r.scale, fillOpacity: r.fillOpacity, rim: r.rim };
        if (theme === 'light') {
          const width = rim && rim.spread !== null ? rim.spread * Number(r.scale) : null;
          entry.width = width;
          if (!rim || !near(rim.color, rgbOf(AZURE_DEEP), 0)) failures.push(`breath ${at}ms: rim is ${r.rim}, expected 1px ${AZURE_DEEP}`);
          else if (Math.abs(width - 1) > 0.01) failures.push(`breath ${at}ms: rim is ${width.toFixed(3)}px wide, expected 1px`);
          const pixels = await rimPixel(name, r, rgbOf(AZURE_DEEP));
          entry.pixels = Object.fromEntries(Object.entries(pixels).map(([k, v]) => [k, hex(v)]));
          for (const [side, v] of Object.entries(pixels)) {
            if (!near(v, rgbOf(AZURE_DEEP), 3)) failures.push(`breath ${at}ms: rim pixel (${side}) is ${hex(v)}, expected ${AZURE_DEEP}`);
          }
        } else {
          if (rim) failures.push(`breath ${at}ms (dark): expected no rim, got ${r.rim}`);
          if (name) await shoot(name);
        }
        rimPixels.push(entry);
      }
      await page.evaluate((sel) => {
        document.querySelector(`${sel} > .ig-dot`).getAnimations().forEach((a) => a.play());
      }, LAMP);
    }

    // Stop the clock, then let the result land: t = 0 is the commit.
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    // The fake clock fires animation frames on its own 16ms grid. Move the
    // paused clock onto that grid, so the ignition starts on a frame and the
    // frame read at t was computed at t (not up to 15ms before it).
    await page.evaluate(() => {
      window.__igFrame = null;
      requestAnimationFrame(() => (window.__igFrame = performance.now()));
    });
    await page.clock.runFor(16);
    const grid = await page.evaluate(() => ({ frame: window.__igFrame, now: performance.now() }));
    const pad = (((grid.frame - grid.now) % 16) + 16) % 16;
    if (pad) await page.clock.runFor(pad);
    const lampsBefore = await page.evaluate(() => window.__ig.lamps.length);
    release();

    if (!land) {
      // The instrument stays, Azure; the home form's run line leaves with the loader.
      if (surfaceName === 'score') await page.locator(`${LAMP}[data-phase="error"]`).waitFor({ timeout: 15000 });
      else await page.locator('.score-error-card').waitFor({ timeout: 15000 });
      await page.clock.runFor(1600);
      if (surfaceName === 'score') {
        const r = await read();
        if (r.lamp || !near(parseColor(r.fill), rgbOf(AZURE), 0)) failures.push(`a failed run left the dot ${r.fill} (${r.lamp})`);
        if (r.haloAnims.length) failures.push('a failed run rang the ring');
      } else if (await page.locator(LAMP).count()) {
        failures.push('the run line stayed after a failed run');
      }
      const lamps = await page.evaluate(() => window.__ig.lamps);
      if (lamps.length) failures.push(`a failed run lit the dot: data-lamp went ${JSON.stringify(lamps)}`);
      return { label, failures, samples, rimPixels };
    }
    await page.locator(`${LAMP}[data-phase="done"]`).waitFor({ timeout: 15000 });

    // The ring and the settle are WAAPI animations, which run on the page's
    // real clock, not the fake one. Each is paused and seeked to the fake
    // clock's time, counted from the read where it first appeared (the ring
    // at 0, the settle at the swap back).
    const seekAnims = (t) =>
      page.evaluate(
        ({ t: now, sel }) => {
          const d = document.querySelector(`${sel} > .ig-dot`);
          const h = document.querySelector(`${sel} > .ig-halo`);
          window.__igAnims = window.__igAnims || [];
          for (const a of [...d.getAnimations({ subtree: true }), ...h.getAnimations()]) {
            if (!a.animationName && !a.transitionProperty && !window.__igAnims.some((x) => x.a === a)) window.__igAnims.push({ a, at: now });
          }
          for (const { a, at } of window.__igAnims) {
            a.pause();
            a.currentTime = Math.max(0, now - at);
          }
        },
        { t, sel: LAMP },
      );
    await seekAnims(0);
    // A run the visitor started brings the run line into view: a smooth
    // scroll on the real clock, started from an animation frame on the fake
    // one. Each read waits for it to settle, so every crop frames the same spot.
    const settleScroll = async () => {
      let lastY = -1;
      for (let i = 0; i < 30; i++) {
        const y = await page.evaluate(() => window.scrollY);
        if (y === lastY) return;
        lastY = y;
        await page.waitForTimeout(150);
      }
    };

    const calm = mode !== 'motion';
    let t = 0;
    const at = async (ms) => {
      if (ms > t) await page.clock.runFor(ms - t);
      t = ms;
      await seekAnims(ms);
      await settleScroll();
      return read();
    };
    // Calm: no animation, no transition, no fade and no per-frame colour,
    // so the only colours the dot can show are the two ends.
    const calmFrame = (r, ms, want) => {
      const moving = r.dotAnims.concat(r.haloAnims);
      if (moving.length) failures.push(`${mode} ${ms}ms: expected no animation or transition, got ${JSON.stringify(moving)}`);
      if (r.transitions.some((d) => d !== '0s')) failures.push(`${mode} ${ms}ms: transition on the dot or its fill (${r.transitions})`);
      if (Number(r.dotOpacity) !== 1 || Number(r.fillOpacity) !== 1) failures.push(`${mode} ${ms}ms: faded (dot ${r.dotOpacity}, fill ${r.fillOpacity})`);
      if (r.writes) failures.push(`${mode} ${ms}ms: a colour was written per frame (${r.writes} write(s))`);
      if (!near(parseColor(r.fill), rgbOf(want), 0)) failures.push(`${mode} ${ms}ms: the fill is ${r.fill}, an intermediate colour (expected exactly ${want})`);
    };

    const first = await at(0);
    if (calm) {
      if (first.lamp !== 'lit') failures.push(`${mode}: the flame did not arrive at once (data-lamp ${first.lamp})`);
      calmFrame(first, 0, FLAME);
      const c = await centrePixel('t0000', first);
      if (!near(c, rgbOf(FLAME), 1)) failures.push(`${mode} 0ms: centre pixel ${hex(c)}, expected exactly ${FLAME}`);
      samples.push({ ms: 0, fill: hex(parseColor(first.fill)), pixel: hex(c), want: FLAME.toLowerCase() });
    } else {
      if (first.lamp !== 'sweep') failures.push(`motion: the sweep did not start (data-lamp ${first.lamp})`);
      const ring = first.haloAnims;
      const ringOk =
        ring.length === 1 &&
        ring[0].duration === 700 &&
        ring[0].delay === 120 &&
        /0\.16,\s*1,\s*0\.3,\s*1/.test(ring[0].easing) &&
        Number(ring[0].frames[0].opacity) === 0.9 &&
        Number(ring[0].frames[1].opacity) === 0 &&
        ring[0].frames[0].transform === 'scale(1)' &&
        ring[0].frames[1].transform === 'scale(1.9)';
      if (!ringOk) failures.push(`motion: expected one ring (700ms, 120ms delay, easeOutExpo, scale 1 -> 1.9, opacity .9 -> 0), got ${JSON.stringify(ring)}`);
      if (!/245,\s*107,\s*0/.test(first.haloRing)) failures.push(`motion: the ring is not the flame (${first.haloRing})`);
      await shoot('t0000');
    }

    for (let ms = 16; ms <= 320; ms += 16) {
      const r = await at(ms);
      if (calm) {
        calmFrame(r, ms, FLAME);
        const c = ms % 80 === 0 ? await centrePixel(`t${String(ms).padStart(4, '0')}`, r) : null;
        if (c && !near(c, rgbOf(FLAME), 1)) failures.push(`${mode} ${ms}ms: centre pixel ${hex(c)}, expected exactly ${FLAME}`);
        samples.push({ ms, fill: hex(parseColor(r.fill)), pixel: c ? hex(c) : null, want: FLAME.toLowerCase() });
        continue;
      }
      const got = parseColor(r.fill);
      const want = ms >= 320 ? rgbOf(FLAME) : sweep(ms, AZURE, FLAME);
      const entry = { ms, got: hex(got), want: hex(want) };
      if (!near(got, want, ms >= 320 ? 0 : 1)) failures.push(`motion: at ${ms}ms the fill is ${hex(got)}, the sweep says ${hex(want)}`);
      if (ms < 320 && chromaOf(got) < 0.15) failures.push(`motion: at ${ms}ms the fill is greyed (${hex(got)}, OKLCH C ${chromaOf(got).toFixed(3)})`);
      if (Number(r.dotOpacity) !== 1) failures.push(`motion: at ${ms}ms the dot's own opacity is ${r.dotOpacity}`);
      if (theme === 'light') {
        const rim = parseRim(r.rim);
        const rimWant = ms >= 320 ? rgbOf(FLAME_DEEP) : sweep(ms, AZURE_DEEP, FLAME_DEEP);
        entry.rim = rim ? hex(rim.color) : null;
        entry.rimWant = hex(rimWant);
        if (!rim) failures.push(`motion (light): at ${ms}ms there is no rim`);
        else if (!near(rim.color, rimWant, ms >= 320 ? 0 : 1)) failures.push(`motion (light): at ${ms}ms the rim is ${hex(rim.color)}, the sweep says ${hex(rimWant)}`);
      }
      samples.push(entry);
      if (ms === 80 || ms === 160 || ms === 320) await shoot(`t${String(ms).padStart(4, '0')}`);
    }
    if (!calm) {
      const end = await at(320);
      if (end.lamp !== 'lit') failures.push(`motion: after the sweep data-lamp is ${end.lamp}, expected lit`);
    }

    const hold = await at(1000);
    if (hold.lamp !== 'lit' || !near(parseColor(hold.fill), rgbOf(FLAME), 0)) failures.push(`hold: the fill is ${hold.fill} (${hold.lamp}), not the flame`);
    if (Number(hold.haloOpacity) !== 0) failures.push(`hold: the ring is still showing (opacity ${hold.haloOpacity})`);
    const holdRim = parseRim(hold.rim);
    if (theme === 'light' && (!holdRim || !near(holdRim.color, rgbOf(FLAME_DEEP), 0) || Math.abs(holdRim.spread - 1) > 0.01))
      failures.push(`hold (light): expected the 1px --activation-ink rim, got ${hold.rim}`);
    if (theme === 'dark' && holdRim) failures.push(`hold (dark): expected no rim, got ${hold.rim}`);
    if (calm) calmFrame(hold, 1000, FLAME);
    await shoot('hold');

    const preCool = await at(1384);
    if (calm) {
      calmFrame(preCool, 1384, FLAME);
      const c = await centrePixel('t1384', preCool);
      if (!near(c, rgbOf(FLAME), 1)) failures.push(`${mode} 1384ms: centre pixel ${hex(c)}, expected exactly ${FLAME}`);
      samples.push({ ms: 1384, fill: hex(parseColor(preCool.fill)), pixel: hex(c), want: FLAME.toLowerCase() });
    } else {
      await shoot('t1384');
    }

    const cooled = await at(1400);
    if (cooled.lamp || !near(parseColor(cooled.fill), rgbOf(AZURE), 0)) failures.push(`swap back: at 1400ms the fill is ${cooled.fill} (${cooled.lamp}), not Azure`);
    if (Number(cooled.dotOpacity) !== 1) failures.push(`swap back: the dot's own opacity is ${cooled.dotOpacity}; only the fill may settle`);
    if (calm) {
      calmFrame(cooled, 1400, AZURE);
      const c = await centrePixel('cooled', cooled);
      if (!near(c, rgbOf(AZURE), 1)) failures.push(`${mode} 1400ms: centre pixel ${hex(c)}, expected exactly ${AZURE}`);
      samples.push({ ms: 1400, fill: hex(parseColor(cooled.fill)), pixel: hex(c), want: AZURE.toLowerCase() });
    } else {
      const settle = cooled.dotAnims.filter((a) => !a.css && !a.transition);
      if (
        settle.length !== 1 ||
        settle[0].pseudo !== '::before' ||
        settle[0].duration !== 400 ||
        Number(settle[0].frames[0].opacity) !== 0.55 ||
        Number(settle[0].frames[1].opacity) !== 1
      ) {
        failures.push(`swap back: expected one 400ms opacity .55 -> 1 settle on the fill (::before), got ${JSON.stringify(settle)}`);
      }
      await shoot('cooled');
    }
    if (cooled.dotAnims.some((a) => a.css === 'ig-breathe')) failures.push('swap back: the dot breathes after the run');
    const coolRim = parseRim(cooled.rim);
    if (theme === 'light' && (!coolRim || !near(coolRim.color, rgbOf(AZURE_DEEP), 0) || Math.abs(coolRim.spread - 1) > 0.01))
      failures.push(`swap back (light): expected the 1px --signal-access rim, got ${cooled.rim}`);

    const settled = await at(1800);
    if (settled.lamp || !near(parseColor(settled.fill), rgbOf(AZURE), 0)) failures.push(`settled: at 1800ms the fill is ${settled.fill}, not Azure`);
    if (calm) calmFrame(settled, 1800, AZURE);
    await shoot('settled');

    // Exactly one ignition for this landing, page wide.
    const lamps = (await page.evaluate(() => window.__ig.lamps)).slice(lampsBefore);
    const count = ignitionsIn(lamps);
    if (count !== 1) failures.push(`one landing lit ${count} dot(s), expected exactly 1 (${JSON.stringify(lamps)})`);
    return { label, failures, samples, rimPixels };
  } catch (e) {
    failures.push(`error: ${e.message.split('\n')[0]}`);
    return { label, failures, samples, rimPixels };
  } finally {
    await ctx.close();
  }
}

/** A target landing scores its example on load: that landing lights one dot. */
async function onLoadCase(browser, route) {
  const failures = [];
  const label = `one ignition (${route}, scores on load)`;
  const ctx = await newContext(browser, 'dark', 'motion', { dsf: 1 });
  try {
    let release;
    const held = new Promise((r) => (release = r));
    let posted = 0;
    await ctx.route('**/api/score', async (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      posted++;
      await held;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCORED) });
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
    await page.locator('[data-ignite][data-phase="running"]').first().waitFor({ timeout: 15000 });
    if (posted !== 1) failures.push(`expected one score request on load, saw ${posted}`);
    release();
    await page.locator('[data-ignite][data-phase="done"]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1800);
    const { lamps, n } = await page.evaluate(() => ({ lamps: window.__ig.lamps, n: document.querySelectorAll('[data-ignite]').length }));
    const count = ignitionsIn(lamps);
    if (count !== 1) failures.push(`the landing lit ${count} dot(s), expected exactly 1 (${n} lamp(s) on the page)`);
  } catch (e) {
    failures.push(`error: ${e.message.split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
  return { label, failures, samples: [], rimPixels: [] };
}

/** The page-wide claim itself: two lamps that see one landing (one flush)
    get one ignition between them; the next landing gets its own. */
async function claimCase() {
  const failures = [];
  const label = 'one ignition (two lamps, one landing: claimLanding)';
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, '..', 'app', 'lib', 'engine', 'ignition.ts')).href);
    const claim = BREAK ? () => true : mod.claimLanding;
    const sameLanding = [claim(), claim()];
    if (sameLanding.filter(Boolean).length !== 1) failures.push(`two lamps in one landing: claims ${JSON.stringify(sameLanding)}, expected exactly one`);
    await new Promise((r) => setTimeout(r, 0));
    const next = claim();
    if (next !== true) failures.push('the next landing could not claim its ignition');
  } catch (e) {
    failures.push(`error: ${e.message.split('\n')[0]}`);
  }
  return { label, failures, samples: [], rimPixels: [] };
}

(async () => {
  if (FRAMES) fs.mkdirSync(FRAMES, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) });
  } catch (e) {
    console.error(`check-ignition: could not launch a browser: ${e.message.split('\n')[0]}`);
    process.exit(2);
  }
  const results = [];
  try {
    for (const surfaceName of SURFACE_NAMES) {
      if (!SURFACES[surfaceName]) throw new Error(`unknown surface ${surfaceName}`);
      for (const theme of THEMES) {
        for (const mode of MODES) results.push(await run(browser, surfaceName, theme, mode, true));
        results.push(await run(browser, surfaceName, theme, 'motion', false));
      }
    }
    for (const route of ONLOAD_ROUTES) results.push(await onLoadCase(browser, route));
    results.push(await claimCase());
  } finally {
    await browser.close();
  }
  if (FRAMES) fs.writeFileSync(path.join(FRAMES, 'samples.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.failures.length);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: !failed.length, break: BREAK, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.failures.length ? 'FAIL' : 'ok  '}  ${r.label}`);
      r.failures.forEach((f) => console.log(`        ${f}`));
    }
    console.log(failed.length ? `\ncheck-ignition: ${failed.length} of ${results.length} cases failed` : `\ncheck-ignition: all ${results.length} cases pass`);
  }
  process.exit(failed.length ? 1 : 0);
})();
