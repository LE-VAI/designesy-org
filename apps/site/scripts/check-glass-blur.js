#!/usr/bin/env node
/**
 * Glass blur check — the standing proof that the glass actually blurs.
 *
 * WHY THIS EXISTS
 * The header capsule shipped with its backdrop blur silently dead on every
 * route. The grain layer inside the capsule carried mix-blend-mode: overlay,
 * and a blended layer inside an isolated glass context makes that context the
 * backdrop root: the capsule's backdrop-filter then sampled nothing but its
 * own layers, and page text read crisp through the tint. Computed style still
 * reported blur(16px) the whole time, so no source or style check could see
 * it. This one reads PIXELS.
 *
 * WHAT IT ASSERTS
 *   For each case it puts page content under a glass surface, hides the
 *   surface's own content (text, icons, the progress line) but keeps every
 *   glass layer, and shoots the glass rect twice: over the content, and with
 *   the content hidden. Subtracting the pair leaves only what reached the
 *   glass from behind; tint, grain, rim and page background cancel exactly,
 *   so the grain's own noise can never pass for (or mask) a blur. It takes
 *   the same pair with the glass's backdrop blur forced off, and compares the
 *   high-frequency edge energy (mean luminance gradient) of the two
 *   differences. Working glass leaves almost none of the content's edges;
 *   dead glass leaves all of them (the ratio reads 100%: the blur does
 *   nothing). The tint scales both alike, so it cannot fake a pass.
 *     PASS  blurred edge energy <= 25% of the same glass unblurred.
 *     FAIL  above that, or too little content shows through the unblurred
 *           glass to judge (a probe that sees nothing under the glass proves
 *           nothing, so "inconclusive" fails too).
 *   Cases: the header capsule, scrolled over body text on /contracts/report,
 *   /work/designesy-org, /labs and a /learn article, at 1440x900 and 390x844,
 *   dark and light; and the engine command slab on /drift, over a striped
 *   probe pattern laid directly behind it (its in-flow backdrop is otherwise
 *   flat page, which no blur changes).
 *
 *   Emulated: prefers-reduced-motion: reduce (every transition settles) and
 *   each colour scheme in turn. Device scale factor 1.
 *
 * PROVING IT CAN FAIL
 *   --break re-injects the original defect and the check must exit 1:
 *     .topbar .topbar-right::after { mix-blend-mode: overlay !important; }
 *   --inject <file.css> appends any stylesheet after load, which also
 *   verifies a source fix against an older running build.
 *
 * Usage:
 *   node scripts/check-glass-blur.js --base http://localhost:3422
 *   node scripts/check-glass-blur.js --base ... --break          (must exit 1)
 *   node scripts/check-glass-blur.js --base ... --inject fix.css --json
 *   node scripts/check-glass-blur.js --base ... --cases capsule --themes dark
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const fs = require('fs');

const RATIO_MAX = 0.25;
// Edge energy (mean luminance gradient, 0-255 per px) the content must show
// through the UNBLURRED glass before the ratio means anything. A line of body
// text under the capsule measures 1.5-11.
const SHARP_FLOOR = 1.2;
// Crops stay this far inside the surface so the rim, the corner radius and
// the drop shadow never count as content.
const INSET = 14;

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];

// y is where the judges saw body text under the capsule; the probe walks
// down from there until enough content shows through the glass to judge.
const CAPSULE_ROUTES = [
  { path: '/contracts/report', y: 760 },
  { path: '/work/designesy-org', y: 770 },
  { path: '/labs', y: 700 },
  { path: '/learn/why-we-built-a-public-design-score', y: 700 },
];

// Each surface names four pieces of probe CSS: hide the surface's own
// content but keep every glass layer; turn its backdrop blur off; hide the
// whole surface; and hide the content behind it (everything but the
// surface), so a shot with it subtracted from a shot without it leaves only
// what the backdrop contributed. Tint, grain, rim and page background are
// identical in both shots of a pair and cancel exactly.
const CAPSULE = {
  hideContent: `
    .topbar .topbar-inner * { visibility: hidden !important; }
    .topbar .topbar-right::before,
    .topbar .topbar-right::after { visibility: visible !important; }
  `,
  noBlur: `.topbar .topbar-inner::before { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`,
  hideSurface: `.topbar { visibility: hidden !important; }`,
  hideBackdrop: `body * { visibility: hidden !important; } .topbar, .topbar * { visibility: visible !important; }`,
};

const DEFECT = `.topbar .topbar-right::after { mix-blend-mode: overlay !important; }`;

const SLAB = {
  hideContent: `
    .eg-bar * { visibility: hidden !important; }
    .eg-bar > :first-child::before { visibility: visible !important; }
    .eg-bar::before, .eg-bar::after { opacity: 0 !important; }
    .eg-bar { z-index: 2; }
  `,
  noBlur: `.eg-bar { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }`,
  hideSurface: `.eg-bar { visibility: hidden !important; z-index: 2; }`,
  hideBackdrop: `[data-glass-pattern] { visibility: hidden !important; }`,
};

function opt(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

async function addStyle(page, css) {
  return page.evaluate((text) => {
    const s = document.createElement('style');
    s.dataset.glassProbe = '1';
    s.textContent = text;
    document.head.appendChild(s);
    return true;
  }, css);
}

async function dropProbeStyles(page) {
  await page.evaluate(() => {
    document.querySelectorAll('style[data-glass-probe="1"]').forEach((s) => s.remove());
  });
}

// Mean absolute luminance gradient of (a - b), two PNG crops of one rect,
// decoded in the page's own canvas so the check needs no image library.
async function diffEnergy(page, a, b) {
  return page.evaluate(
    async ([b64a, b64b]) => {
      const lum = async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        const L = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
          L[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
        }
        return { L, width, height };
      };
      const A = await lum(b64a);
      const B = await lum(b64b);
      const { width, height } = A;
      const D = new Float32Array(width * height);
      for (let i = 0; i < D.length; i++) D[i] = A.L[i] - B.L[i];
      let sum = 0;
      let n = 0;
      for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
          const i = y * width + x;
          sum += Math.abs(D[i + 1] - D[i]) + Math.abs(D[i + width] - D[i]);
          n++;
        }
      }
      return n ? sum / n : 0;
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

async function measure(page, clip, s, inject) {
  const shot = async (...css) => {
    await dropProbeStyles(page);
    if (inject) await addStyle(page, inject);
    for (const c of css) await addStyle(page, c);
    await page.waitForTimeout(120);
    return page.screenshot({ clip, animations: 'disabled' });
  };
  // glass: as shipped. sharp: the same glass with its blur off. raw: no
  // surface at all. Each is shot over the backdrop and over nothing.
  const glass = await diffEnergy(page, await shot(s.hideContent), await shot(s.hideContent, s.hideBackdrop));
  const sharp = await diffEnergy(
    page,
    await shot(s.hideContent, s.noBlur),
    await shot(s.hideContent, s.noBlur, s.hideBackdrop),
  );
  const raw = await diffEnergy(page, await shot(s.hideSurface), await shot(s.hideSurface, s.hideBackdrop));
  await dropProbeStyles(page);
  if (inject) await addStyle(page, inject);
  return {
    glass: +glass.toFixed(3),
    sharp: +sharp.toFixed(3),
    raw: +raw.toFixed(3),
    ratio: sharp ? +(glass / sharp).toFixed(3) : null,
  };
}

function insetClip(r) {
  return {
    x: Math.round(r.x + INSET),
    y: Math.round(r.y + INSET / 2),
    width: Math.max(1, Math.round(r.width - 2 * INSET)),
    height: Math.max(1, Math.round(r.height - INSET)),
  };
}

async function capsuleCase(page, base, route, inject) {
  await page.goto(base + route.path, { waitUntil: 'load', timeout: 60000 });
  if (inject) await addStyle(page, inject);
  let best = null;
  // 16 steps (to y + 2700): after the 2026-10-03 surface pass the light
  // capsule over /contracts/report at 1440 first shows enough text at y 3100;
  // within the old 8 steps it peaked at 1.12, under the floor (inconclusive).
  for (let step = 0; step < 16; step++) {
    const y = route.y + step * 180;
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(350);
    const rect = await page.evaluate(() => {
      const el = document.querySelector('.topbar .topbar-inner');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (!rect) return { error: 'no .topbar .topbar-inner' };
    const m = await measure(page, insetClip(rect), CAPSULE, inject);
    // Keep the step with the most content showing, so an inconclusive result
    // reports the best evidence the walk found, not merely its last step.
    if (!best || m.sharp > best.sharp) best = { y, rect, ...m };
    if (m.sharp >= SHARP_FLOOR) break;
  }
  return best;
}

async function slabCase(page, base, inject) {
  await page.goto(base + '/drift', { waitUntil: 'load', timeout: 60000 });
  if (inject) await addStyle(page, inject);
  const found = await page.evaluate(() => {
    const el = document.querySelector('.eg-bar');
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    return true;
  });
  if (!found) return { error: 'no .eg-bar on /drift' };
  await page.waitForTimeout(350);
  // The probe pattern: hard black and white stripes laid as the slab's
  // previous sibling, so it paints under the slab and is its backdrop.
  const rect = await page.evaluate(() => {
    const el = document.querySelector('.eg-bar');
    const r = el.getBoundingClientRect();
    const p = document.createElement('div');
    p.dataset.glassPattern = '1';
    p.style.cssText =
      'position:fixed;z-index:1;pointer-events:none;margin:0;' +
      'background:repeating-linear-gradient(90deg,#000 0 3px,#fff 3px 6px);';
    el.parentNode.insertBefore(p, el);
    const place = () => {
      p.style.left = r.x + 'px';
      p.style.top = r.y + 'px';
      p.style.width = r.width + 'px';
      p.style.height = r.height + 'px';
    };
    place();
    // A transformed ancestor would re-anchor position: fixed; correct for it.
    const q = p.getBoundingClientRect();
    p.style.left = r.x - (q.x - r.x) + 'px';
    p.style.top = r.y - (q.y - r.y) + 'px';
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const m = await measure(page, insetClip(rect), SLAB, inject);
  return { rect, ...m };
}

async function main() {
  const args = process.argv.slice(2);
  const BASE = (opt(args, '--base') || 'http://localhost:3422').replace(/\/$/, '');
  const CHANNEL = opt(args, '--channel') || 'chrome';
  const JSON_OUT = args.includes('--json');
  const injectPath = opt(args, '--inject');
  const cases = (opt(args, '--cases') || 'capsule,slab').split(',');
  const themes = (opt(args, '--themes') || 'dark,light').split(',');
  const BREAK = args.includes('--break');
  let inject = null;
  if (injectPath) {
    try {
      inject = fs.readFileSync(injectPath, 'utf8');
    } catch (e) {
      console.error(`[glass] cannot read --inject ${injectPath}: ${e.message}`);
      process.exit(2);
    }
  }
  if (BREAK) inject = (inject ? inject + '\n' : '') + DEFECT;

  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    console.error('[glass] playwright-core not installed.');
    process.exit(2);
  }
  let browser;
  try {
    browser = await chromium.launch({ channel: CHANNEL, headless: true });
  } catch (e) {
    console.error(`[glass] cannot launch ${CHANNEL}: ${e.message}`);
    process.exit(2);
  }

  const results = [];
  try {
    for (const theme of themes) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.w, height: vp.h },
          deviceScaleFactor: 1,
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        const page = await ctx.newPage();
        if (cases.includes('capsule')) {
          for (const route of CAPSULE_ROUTES) {
            const r = await capsuleCase(page, BASE, route, inject);
            results.push({ surface: 'capsule', route: route.path, theme, width: vp.w, ...r });
          }
        }
        if (cases.includes('slab')) {
          const r = await slabCase(page, BASE, inject);
          results.push({ surface: 'slab', route: '/drift', theme, width: vp.w, ...r });
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  for (const r of results) {
    if (r.error) r.verdict = 'error';
    else if (r.sharp < SHARP_FLOOR) r.verdict = 'inconclusive';
    else r.verdict = r.ratio <= RATIO_MAX ? 'pass' : 'fail';
  }
  const bad = results.filter((r) => r.verdict !== 'pass');

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, broken: BREAK, ratioMax: RATIO_MAX, sharpFloor: SHARP_FLOOR, results }, null, 1));
  } else {
    console.log(`[glass] ${BASE}${BREAK ? ' (defect injected)' : ''}  pass: blurred edge energy <= ${RATIO_MAX * 100}% of the same glass unblurred`);
    for (const r of results) {
      const where = `${r.surface.padEnd(7)} ${r.route.padEnd(44)} ${r.theme.padEnd(5)} ${String(r.width).padStart(4)}`;
      const nums = r.error ? r.error : `blurred ${r.glass.toFixed(2)} / unblurred ${r.sharp.toFixed(2)} = ${(r.ratio * 100).toFixed(1)}%  bare ${r.raw.toFixed(2)}${r.y != null ? `  y ${r.y}` : ''}`;
      console.log(`  ${r.verdict.toUpperCase().padEnd(12)} ${where}  ${nums}`);
    }
    console.log(`[glass] ${results.length - bad.length}/${results.length} pass`);
  }
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => {
  console.error('[glass] fatal:', e && e.stack ? e.stack : e);
  process.exit(2);
});
