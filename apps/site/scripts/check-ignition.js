#!/usr/bin/env node
/**
 * Ignition gate: the score's loading ignition does what brand D51 says, on
 * both score loaders, in both themes, with motion on, with reduced motion
 * and with motion paused.
 *
 * WHY THIS EXISTS
 * The ignition (app/lib/engine/ignition.ts, engine.css "loading ignition") is
 * a per-frame colour sweep, a ring, a hold and a cool, on a 5px dot. None of
 * it is visible to a source check, the axe sweep or a screenshot at rest, and
 * each part has a quiet way to go wrong: an sRGB blend (it passes through
 * grey), a hue that goes the short way down through green, a last frame a
 * rounding short of the flame, a breath that keeps looping under the site's
 * "Pause motion", or orange on a run that did not land. This gate runs the
 * real thing in a browser on a fake clock and reads every frame.
 *
 * WHAT IT ASSERTS
 * Surfaces: the score form on the home page (the run line's lone dot over
 * the loader and the B′ result; /api/score held) and the four-engine
 * instrument on /score (the dot in its mark; /api/report held,
 * /api/guardrails failing). A run is submitted, and the browser clock is
 * paused before the held response is released, so every frame after the
 * result lands is read at an exact time.
 * Modes: dark and light, each with motion, with prefers-reduced-motion:
 * reduce, and with the site's pause (localStorage "motion" = "paused", the
 * way the toggle stores it).
 *   motion   while running, the dot runs ig-breathe (1600ms,
 *            infinite) and is Azure (--signal); pausing motion mid-run stops
 *            it live. When the result lands, the dot's colour on every 16ms
 *            frame from 0 to 320ms equals the reference sweep (OKLCH,
 *            easeOutQuart, hue rising 250.8 -> 46.7 + 360) within 1 per
 *            channel, every mid-sweep frame is saturated (never grey), and
 *            320ms is exactly --activation #F56B00. One ring: 700ms, 120ms
 *            delay, easeOutExpo, scale 1 -> 1.9, opacity .9 -> 0, in
 *            --activation. At 1000ms the dot holds the flame (light: a 1px
 *            --activation-ink rim). At 1400ms it is Azure again with one
 *            400ms opacity .55 -> 1 settle, and it does not breathe.
 *   calm     (reduced motion, and paused): no breath while running, no
 *            per-frame colour, no ring. The flame arrives with one 150ms
 *            opacity crossfade, holds, and is Azure again at 1400ms.
 *   no land  a run that fails never shows the flame (a mutation observer
 *            records every data-lamp the page ever sets).
 *
 * PROVING IT CAN FAIL
 *   --break injects two regressions: the breath keeps running under the
 *   pause, and the sweep's colour is an sRGB transition. The gate must exit 1.
 *
 * Usage:
 *   node scripts/check-ignition.js --base http://127.0.0.1:3422 [--channel chrome]
 *     [--surfaces home,score] [--themes dark,light] [--modes motion,reduced,paused]
 *     [--frames <dir>] [--break] [--json]
 * --frames writes 2x crops of the dot while running, at 0, 80, 160 and 320ms,
 * at the hold (1000ms), at the cool (1400ms) and settled (1800ms),
 * plus the sampled colours, to <dir>.
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const fs = require('node:fs');
const path = require('node:path');

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
const AZ = hexToOklch(AZURE);
const FL = hexToOklch(FLAME);
function reference(ms) {
  const e = 1 - Math.pow(1 - Math.min(1, ms / 320), 4);
  const h0 = AZ[2];
  const h1 = FL[2] + 360;
  return oklchToRgb(AZ[0] + (FL[0] - AZ[0]) * e, AZ[1] + (FL[1] - AZ[1]) * e, (h0 + (h1 - h0) * e) % 360);
}
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const parseRgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b, tol = 1) => a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol);
// Chroma in OKLCH, to tell a saturated frame from a grey one.
const chromaOf = (rgb) => hexToOklch(hex(rgb))[1];

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
  [data-ignite] > .ig-dot { transition: background-color 320ms linear !important; }
`;

async function run(browser, surfaceName, theme, mode, land) {
  const surface = SURFACES[surfaceName];
  const LAMP = surface.lamp;
  const failures = [];
  const samples = [];
  const label = `${surfaceName} (${surface.route}) / ${theme} / ${mode}${land ? '' : ' / run fails'}`;
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
  });
  try {
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
    // Every data-lamp the page ever sets, so a flame that came and went
    // between two reads is still seen.
    await ctx.addInitScript(() => {
      window.__igLamps = [];
      new MutationObserver((list) => {
        for (const m of list) if (m.attributeName === 'data-lamp') window.__igLamps.push(m.target.getAttribute('data-lamp'));
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-lamp'] });
    });
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto(`${BASE}${surface.route}`, { waitUntil: 'load' });
    const rendered = await page.evaluate(() => document.documentElement.dataset.theme);
    if (rendered !== theme) failures.push(`page rendered theme ${rendered}, expected ${theme}`);

    const read = () =>
      page.evaluate((lampSel) => {
        const d = document.querySelector(`${lampSel} > .ig-dot`);
        const h = document.querySelector(`${lampSel} > .ig-halo`);
        const cs = getComputedStyle(d);
        const hs = getComputedStyle(h);
        const anim = (el) =>
          el.getAnimations().map((a) => {
            const t = a.effect.getTiming();
            return {
              css: a.animationName || null,
              duration: t.duration,
              delay: t.delay,
              iterations: t.iterations,
              easing: t.easing,
              frames: a.effect.getKeyframes().map((k) => ({ opacity: k.opacity, transform: k.transform })),
            };
          });
        return {
          phase: d.parentElement.dataset.phase,
          lamp: d.getAttribute('data-lamp'),
          inline: d.style.backgroundColor,
          bg: cs.backgroundColor,
          rim: cs.boxShadow,
          dotAnims: anim(d),
          haloAnims: anim(h),
          haloOpacity: hs.opacity,
          haloTransform: hs.transform,
          haloRing: hs.boxShadow,
          signal: cs.getPropertyValue('--signal').trim(),
          activation: cs.getPropertyValue('--activation').trim(),
        };
      }, LAMP);

    const crop = async (name) => {
      if (!FRAMES) return;
      const box = await page.locator(LAMP).boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.screenshot({
        path: path.join(FRAMES, `${surfaceName}-${theme}-${mode}-${name}.png`),
        clip: { x: cx - 16, y: cy - 16, width: 32, height: 32 },
        animations: 'allow',
      });
    };

    // The home form draws its lamp only once a run starts; the instrument's
    // mark is there at rest, Azure.
    if (surfaceName === 'score') {
      if ((await page.locator(`${LAMP} > .ig-dot`).count()) !== 1) {
        failures.push(`no ignition dot (${LAMP} > .ig-dot) at rest`);
        return { label, failures, samples };
      }
      const rest = await read();
      if (!near(parseRgb(rest.bg), rgbOf(AZURE), 0)) failures.push(`at rest the dot is ${rest.bg}, not Azure`);
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
    // Tokens the gate expects: if they moved, the reference is wrong, not the dot.
    if (running.signal.toUpperCase() !== AZURE) failures.push(`--signal is ${running.signal}, the reference assumes ${AZURE}`);
    if (running.activation.toUpperCase() !== FLAME) failures.push(`--activation is ${running.activation}, the reference assumes ${FLAME}`);
    const breath = running.dotAnims.filter((a) => a.css === 'ig-breathe');
    if (mode === 'motion') {
      if (breath.length !== 1 || breath[0].duration !== 1600 || breath[0].iterations !== Infinity)
        failures.push(`running: expected one ig-breathe (1600ms, infinite), got ${JSON.stringify(breath)}`);
    } else if (running.dotAnims.length) {
      failures.push(`running (${mode}): the dot must not animate, got ${JSON.stringify(running.dotAnims)}`);
    }
    if (!near(parseRgb(running.bg), rgbOf(AZURE), 0)) failures.push(`running: the dot is ${running.bg}, not Azure`);
    await crop('running');

    if (mode === 'motion') {
      // Pausing motion mid-run stops the breath live.
      await page.evaluate(() => (document.documentElement.dataset.motion = 'paused'));
      const paused = await read();
      if (paused.dotAnims.some((a) => a.css === 'ig-breathe')) failures.push('running: "Pause motion" mid-run did not stop the breath');
      await page.evaluate(() => delete document.documentElement.dataset.motion);
      const again = await read();
      if (!again.dotAnims.some((a) => a.css === 'ig-breathe')) failures.push('running: the breath did not resume when motion was turned back on');
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
    release();
    if (!land) {
      // The instrument stays, Azure; the home form's run line leaves with the loader.
      if (surfaceName === 'score') await page.locator(`${LAMP}[data-phase="error"]`).waitFor({ timeout: 15000 });
      else await page.locator('.score-error-card').waitFor({ timeout: 15000 });
      await page.clock.runFor(1600);
      if (surfaceName === 'score') {
        const r = await read();
        if (r.lamp || !near(parseRgb(r.bg), rgbOf(AZURE), 0)) failures.push(`a failed run left the dot ${r.bg} (${r.lamp})`);
        if (r.haloAnims.length) failures.push('a failed run rang the ring');
      } else if (await page.locator(LAMP).count()) {
        failures.push('the run line stayed after a failed run');
      }
      const lamps = await page.evaluate(() => window.__igLamps);
      if (lamps.some(Boolean)) failures.push(`a failed run lit the dot: data-lamp went ${JSON.stringify(lamps)}`);
      return { label, failures, samples };
    }
    await page.locator(`${LAMP}[data-phase="done"]`).waitFor({ timeout: 15000 });

    // The ring, the calm crossfade and the settle are WAAPI animations, which
    // run on the page's real clock, not the fake one. Each is paused and
    // seeked to the fake clock's time, counted from the read where it first
    // appeared (the ring and the crossfade at 0, the settle at the cool).
    const seekAnims = (t) =>
      page.evaluate(
        ({ t: now, sel }) => {
          const d = document.querySelector(`${sel} > .ig-dot`);
          const h = document.querySelector(`${sel} > .ig-halo`);
          window.__igAnims = window.__igAnims || [];
          for (const a of [...d.getAnimations(), ...h.getAnimations()]) {
            if (!a.animationName && !window.__igAnims.some((x) => x.a === a)) window.__igAnims.push({ a, at: now });
          }
          for (const { a, at } of window.__igAnims) {
            a.pause();
            a.currentTime = Math.max(0, now - at);
          }
        },
        { t, sel: LAMP },
      );
    await seekAnims(0);
    // A run the visitor started brings the result into view (smooth scroll,
    // real time); let it settle so every crop frames the same spot.
    let lastY = -1;
    for (let i = 0; i < 30; i++) {
      const y = await page.evaluate(() => window.scrollY);
      if (y === lastY) break;
      lastY = y;
      await page.waitForTimeout(150);
    }

    const calm = mode !== 'motion';
    let t = 0;
    const at = async (ms) => {
      if (ms > t) await page.clock.runFor(ms - t);
      t = ms;
      await seekAnims(ms);
      return read();
    };

    const first = await at(0);
    if (calm) {
      if (first.lamp !== 'lit') failures.push(`${mode}: the flame did not arrive at once (data-lamp ${first.lamp})`);
      if (first.inline) failures.push(`${mode}: the colour is written per frame (${first.inline}); calm is one crossfade`);
      const fades = first.dotAnims;
      const ok =
        fades.length === 1 &&
        fades[0].duration === 150 &&
        fades[0].frames.length === 2 &&
        Number(fades[0].frames[0].opacity) === 0.4 &&
        Number(fades[0].frames[1].opacity) === 1 &&
        !fades[0].frames.some((f) => f.transform && f.transform !== 'none');
      if (!ok) failures.push(`${mode}: expected one 150ms opacity crossfade, got ${JSON.stringify(fades)}`);
      if (first.haloAnims.length) failures.push(`${mode}: the ring animated`);
      if (!near(parseRgb(first.bg), rgbOf(FLAME), 0)) failures.push(`${mode}: the dot is ${first.bg}, not the flame`);
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
    }
    await crop('t0000');

    if (!calm) {
      for (let ms = 16; ms <= 320; ms += 16) {
        const r = await at(ms);
        const got = parseRgb(r.bg);
        const want = ms >= 320 ? rgbOf(FLAME) : reference(ms);
        samples.push({ ms, got: hex(got), want: hex(want) });
        if (!near(got, want, ms >= 320 ? 0 : 1)) failures.push(`motion: at ${ms}ms the dot is ${hex(got)}, the sweep says ${hex(want)}`);
        if (ms < 320 && chromaOf(got) < 0.15) failures.push(`motion: at ${ms}ms the dot is greyed (${hex(got)}, OKLCH C ${chromaOf(got).toFixed(3)})`);
        if (ms === 80 || ms === 160 || ms === 320) await crop(`t${String(ms).padStart(4, '0')}`);
      }
      const end = await at(320);
      if (end.lamp !== 'lit') failures.push(`motion: after the sweep data-lamp is ${end.lamp}, expected lit`);
    } else {
      for (const ms of [80, 160, 320]) {
        const r = await at(ms);
        samples.push({ ms, got: hex(parseRgb(r.bg)), want: FLAME.toLowerCase() });
        await crop(`t${String(ms).padStart(4, '0')}`);
      }
    }

    const hold = await at(1000);
    if (hold.lamp !== 'lit' || !near(parseRgb(hold.bg), rgbOf(FLAME), 0)) failures.push(`hold: the dot is ${hold.bg} (${hold.lamp}), not the flame`);
    if (Number(hold.haloOpacity) !== 0) failures.push(`hold: the ring is still showing (opacity ${hold.haloOpacity})`);
    if (theme === 'light' && !/176,\s*77,\s*0\)\s*0px\s*0px\s*0px\s*1px/.test(hold.rim))
      failures.push(`hold (light): expected the 1px --activation-ink rim, got ${hold.rim}`);
    if (theme === 'dark' && hold.rim !== 'none') failures.push(`hold (dark): expected no rim, got ${hold.rim}`);
    await crop('hold');

    const cooled = await at(1400);
    if (cooled.lamp || !near(parseRgb(cooled.bg), rgbOf(AZURE), 0)) failures.push(`cool: at 1400ms the dot is ${cooled.bg} (${cooled.lamp}), not Azure`);
    const settle = cooled.dotAnims.filter((a) => !a.css);
    if (calm) {
      // The arrival's 150ms crossfade runs on the page's real clock, so it may
      // still be listed; anything else is an animation back, which calm has none of.
      const back = cooled.dotAnims.filter((a) => !(a.duration === 150 && Number(a.frames[0].opacity) === 0.4));
      if (back.length) failures.push(`cool (${mode}): expected no animation back, got ${JSON.stringify(back)}`);
    } else if (
      settle.length !== 1 ||
      settle[0].duration !== 400 ||
      Number(settle[0].frames[0].opacity) !== 0.55 ||
      Number(settle[0].frames[1].opacity) !== 1
    ) {
      failures.push(`cool: expected one 400ms opacity .55 -> 1 settle, got ${JSON.stringify(settle)}`);
    }
    if (cooled.dotAnims.some((a) => a.css === 'ig-breathe')) failures.push('cool: the dot breathes after the run');
    if (theme === 'light' && !/1,\s*106,\s*187\)\s*0px\s*0px\s*0px\s*1px/.test(cooled.rim))
      failures.push(`cool (light): expected the 1px --signal-access rim, got ${cooled.rim}`);
    await crop('cooled');
    const settled = await at(1800);
    if (settled.lamp || !near(parseRgb(settled.bg), rgbOf(AZURE), 0)) failures.push(`settled: at 1800ms the dot is ${settled.bg}, not Azure`);
    await crop('settled');
    return { label, failures, samples };
  } catch (e) {
    failures.push(`error: ${e.message.split('\n')[0]}`);
    return { label, failures, samples };
  } finally {
    await ctx.close();
  }
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
