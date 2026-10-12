#!/usr/bin/env node
/**
 * Flame flip gate: the Ctrl+I easter egg does what brand D69 says, and costs
 * the page nothing until someone asks for it.
 *
 * WHY THIS EXISTS
 * The flip (app/lib/flame-flip.tsx, app/lib/flame-flip-run.ts, globals.css
 * "The flame flip") is a fixed layer with backdrop-filter: invert(1), clipped
 * to a circle that opens from the header logo's dot. Each part fails
 * quietly: a layer that takes pointer events freezes the page for 2.6s, a
 * missing -webkit- prefix or a wrong stacking context inverts nothing, an
 * origin measured once at load drifts from the dot, a shortcut that fires in
 * a text field steals italic, a second press stacks a second circle, the
 * calm path animates anyway, the layer stays behind after the close, or the
 * module ships in the first-load bundle. None of it is visible at rest. This
 * gate runs the flip in a browser and reads its frames and pixels.
 *
 * WHAT IT ASSERTS (route /, 1440x900, device scale factor 2)
 *   lazy       before any trigger there is no .flame-flip element, and the
 *              first trigger fetches at least one script the page had not
 *              loaded (the run module is its own chunk).
 *   motion     dark and light. Ctrl+I at the top of the page. One animation
 *              on the layer, 2640ms (620 open, 1500 hold, 520 close),
 *              easeInOutCubic on both moves. Seeked to 0, 300, 1400 and
 *              2400ms: the clip is a circle centred on the header lockup's
 *              largest circle (the mark's dot) within 1px; its radius is 0
 *              at 0, between 0 and the far-corner distance at 300 and 2400,
 *              and at least the far-corner distance at 1400. At 1400 a probe
 *              swatch of Azure #0A94FF reads #F56B00 (255-10, 255-148,
 *              255-255) within 2 per channel, and the logo's dot itself reads
 *              the flame. A click on a probe button at 1400 reaches the
 *              button. A second Ctrl+I during the run starts nothing. After
 *              the run the layer is hidden with no animation and no clip
 *              left on it, and html, body and storage are as they were.
 *   calm       prefers-reduced-motion: reduce, and the site's pause
 *              (localStorage "motion" = "paused"), on a fake clock. The
 *              layer runs no animation; the swap is whole and immediate (the
 *              probe reads the flame at once, with no circle), holds at
 *              1499ms and is gone at 1501ms.
 *   keyboard   the footer keycaps are a <button> named "Flip to the flame:
 *              ctrl i" (the visible keycaps inside the name, WCAG 2.5.3), reached by Tab from the control before it, with
 *              a visible focus ring (pixels change); Enter runs the flip and
 *              so does Space. Ctrl+I and Command+I run it from the page.
 *              Ctrl+Shift+I and Ctrl+Alt+I do not. Ctrl+I inside an input, a
 *              textarea, a select and a contenteditable element starts
 *              nothing and is not prevented (italic stays the field's).
 *
 * PROVING IT CAN FAIL
 *   --break gives the layer pointer-events: auto and drops its backdrop
 *   filter; the click-through and the pixel checks must then fail (exit 1).
 *
 * Usage:
 *   node scripts/check-flame-flip.js --base http://127.0.0.1:3422 [--channel chrome]
 *        [--frames <dir>]   write the frames as PNGs (evidence)
 *        [--break]
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('--base', '').replace(/\/$/, '');
const CHANNEL = arg('--channel', undefined);
const FRAMES = arg('--frames', '');
const BREAK = args.includes('--break');

if (!BASE) {
  console.error('usage: node scripts/check-flame-flip.js --base http://127.0.0.1:3422 [--channel chrome] [--frames dir] [--break]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('check-flame-flip: playwright is not installed');
    process.exit(2);
  }
}

const OPEN = 620;
const HOLD = 1500;
const CLOSE = 520;
const TOTAL = OPEN + HOLD + CLOSE;
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const AZURE = [0x0a, 0x94, 0xff];
const FLAME = [0xf5, 0x6b, 0x00];
const DSF = 2;
const BROKEN = '.flame-flip { pointer-events: auto !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';

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
  const px = (x, y) => {
    const i = y * stride + x * bpp;
    return [out[i], out[i + 1], out[i + 2]];
  };
  return { w, h, px };
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function newContext(browser, theme, mode) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: DSF,
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
  // GET only: the home page must not score anything on its own.
  await ctx.route('**/*', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  return ctx;
}

/** Fixed probes: an Azure swatch and a button that counts clicks, placed
    where the open circle covers them and the hero does not move them. */
async function addProbes(page) {
  await page.evaluate(() => {
    const wrap = document.createElement('div');
    wrap.id = 'ff-probes';
    wrap.style.cssText = 'position:fixed;left:640px;top:420px;z-index:5;display:flex;gap:16px;align-items:center';
    wrap.innerHTML =
      '<div id="ff-swatch" style="width:64px;height:64px;background:#0A94FF"></div>' +
      '<button id="ff-btn" type="button" style="width:96px;height:48px;background:#0A94FF;border:0">probe</button>';
    document.body.appendChild(wrap);
    window.__ffClicks = 0;
    document.getElementById('ff-btn').addEventListener('click', () => (window.__ffClicks += 1));
  });
}

async function snapshot(page) {
  return page.evaluate(() => ({
    html: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`).sort().join(' '),
    body: [...document.body.attributes].map((a) => `${a.name}=${a.value}`).sort().join(' '),
    storage: (() => {
      try {
        return Object.keys(localStorage).sort().map((k) => `${k}=${localStorage.getItem(k)}`).join(' ');
      } catch {
        return 'blocked';
      }
    })(),
  }));
}

/** The layer's state: its animations, its computed clip and the dot centre. */
async function layerState(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.flame-flip');
    let dot = null;
    for (const c of document.querySelectorAll('#topbar .wordmark-lockup circle')) {
      const r = c.getBoundingClientRect();
      if (r.width > 0 && (!dot || r.width > dot.width)) dot = r;
    }
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    const anims = el.getAnimations();
    return {
      exists: true,
      hidden: el.hidden || cs.display === 'none',
      clip: cs.clipPath,
      inlineClip: el.style.clipPath,
      anims: anims.length,
      duration: anims[0] ? anims[0].effect.getTiming().duration : null,
      easings: anims[0] ? anims[0].effect.getKeyframes().map((k) => k.easing) : [],
      offsets: anims[0] ? anims[0].effect.getKeyframes().map((k) => k.computedOffset) : [],
      pointer: cs.pointerEvents,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      dot: dot ? { x: dot.left + dot.width / 2, y: dot.top + dot.height / 2 } : null,
      far: dot
        ? Math.hypot(Math.max(dot.left + dot.width / 2, innerWidth - dot.left - dot.width / 2), Math.max(dot.top + dot.height / 2, innerHeight - dot.top - dot.height / 2))
        : null,
    };
  });
}

const parseCircle = (clip) => {
  const m = /circle\(\s*([\d.]+)px\s+at\s+([\d.]+)px\s+([\d.]+)px\s*\)/.exec(clip || '');
  return m ? { r: +m[1], x: +m[2], y: +m[3] } : null;
};

async function seek(page, t) {
  await page.evaluate((ms) => {
    const a = document.querySelector('.flame-flip').getAnimations()[0];
    a.pause();
    a.currentTime = ms;
  }, t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function rectOf(page, sel) {
  return page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel);
}

async function shoot(page, name) {
  const buf = await page.screenshot({ animations: 'allow' });
  if (FRAMES) fs.writeFileSync(path.join(FRAMES, `${name}.png`), buf);
  return decodePng(buf);
}

const centre = (img, r) => img.px(Math.round((r.x + r.w / 2) * DSF), Math.round((r.y + r.h / 2) * DSF));

async function waitIdle(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.flame-flip');
    return !el || (el.hidden && el.getAnimations().length === 0);
  }, null, { timeout: 8000 });
}

async function pressFlip(page, combo = 'Control+i') {
  await page.keyboard.press(combo);
  await page.waitForFunction(() => {
    const el = document.querySelector('.flame-flip');
    return el && !el.hidden;
  }, null, { timeout: 8000 });
}

async function motionRun(browser, theme) {
  const failures = [];
  const label = `motion / ${theme}`;
  const ctx = await newContext(browser, theme, 'motion');
  try {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const rendered = await page.evaluate(() => document.documentElement.dataset.theme);
    if (rendered !== theme) failures.push(`page rendered theme ${rendered}, expected ${theme}`);

    // lazy: nothing before the trigger, a new script on it.
    const before = await layerState(page);
    if (before.exists) failures.push('lazy: a .flame-flip element exists before any trigger');
    const scriptsBefore = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name)).map((e) => e.name));
    await addProbes(page);
    const swatch = await rectOf(page, '#ff-swatch');
    const rest = await shoot(page, `${theme}-rest`);
    const swatchRest = centre(rest, swatch);
    if (!near(swatchRest, AZURE, 2)) failures.push(`probe swatch reads ${hex(swatchRest)} at rest, expected #0A94FF`);
    const state0 = await snapshot(page);

    await pressFlip(page);
    const scriptsAfter = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name)).map((e) => e.name));
    const fresh = scriptsAfter.filter((s) => !scriptsBefore.includes(s));
    if (!fresh.length) failures.push('lazy: the first trigger fetched no new script (the run module is in the first-load bundle)');

    const st = await layerState(page);
    if (st.anims !== 1) failures.push(`motion: ${st.anims} animations on the layer, expected 1`);
    if (st.duration !== TOTAL) failures.push(`motion: duration ${st.duration}ms, expected ${TOTAL}`);
    const offs = st.offsets.map((o) => Math.round(o * TOTAL));
    if (offs.join() !== [0, OPEN, OPEN + HOLD, TOTAL].join()) failures.push(`motion: keyframes at ${offs.join(', ')}ms, expected 0, ${OPEN}, ${OPEN + HOLD}, ${TOTAL}`);
    if (st.easings[0] !== EASE || st.easings[2] !== EASE) failures.push(`motion: easings ${st.easings.join(' | ')}, expected ${EASE} on the open and the close`);
    if (st.pointer !== 'none') failures.push(`layer pointer-events is ${st.pointer}`);
    if (!/invert\(1\)/.test(st.backdrop || '')) failures.push(`layer backdrop-filter is ${st.backdrop}`);

    // A second press while running starts nothing.
    await page.keyboard.press('Control+i');
    await page.waitForTimeout(50);
    const again = await layerState(page);
    if (again.anims !== 1) failures.push(`second trigger: ${again.anims} animations on the layer, expected 1 (ignored)`);

    const frames = {};
    for (const t of [0, 300, 1400, 2400]) {
      await seek(page, t);
      const s = await layerState(page);
      const c = parseCircle(s.clip);
      // The timed frames are evidence of the page itself: probes out of them.
      await page.evaluate(() => (document.getElementById('ff-probes').style.visibility = 'hidden'));
      const img = await shoot(page, `${theme}-${String(t).padStart(4, '0')}ms`);
      await page.evaluate(() => (document.getElementById('ff-probes').style.visibility = ''));
      frames[t] = { c, img, s };
      if (!c) {
        failures.push(`${t}ms: clip-path "${s.clip}" is not a circle in px`);
        continue;
      }
      if (!s.dot || Math.abs(c.x - s.dot.x) > 1 || Math.abs(c.y - s.dot.y) > 1) {
        failures.push(`${t}ms: circle at ${c.x.toFixed(1)},${c.y.toFixed(1)}; the logo dot is at ${s.dot ? `${s.dot.x.toFixed(1)},${s.dot.y.toFixed(1)}` : 'missing'}`);
      }
      if (t === 0 && c.r > 0.5) failures.push(`0ms: radius ${c.r.toFixed(1)}, expected 0`);
      if ((t === 300 || t === 2400) && !(c.r > 0 && c.r < s.far)) failures.push(`${t}ms: radius ${c.r.toFixed(1)} is not between 0 and ${s.far.toFixed(1)}`);
      if (t === 1400 && c.r < s.far) failures.push(`1400ms: radius ${c.r.toFixed(1)} short of the far corner ${s.far.toFixed(1)}`);
    }

    // Hold: the pixel arithmetic, the logo dot, and a click through the layer.
    await seek(page, 1400);
    const hold = await shoot(page, `${theme}-1400ms-pixelcheck`);
    const swatchHold = centre(hold, swatch);
    if (!near(swatchHold, FLAME, 2)) failures.push(`1400ms: #0A94FF under the layer reads ${hex(swatchHold)}, expected #F56B00 (255-10, 255-148, 255-255)`);
    const dotPx = hold.px(Math.round(frames[1400].s.dot.x * DSF), Math.round(frames[1400].s.dot.y * DSF));
    if (!near(dotPx, FLAME, 6)) failures.push(`1400ms: the logo dot reads ${hex(dotPx)}, expected the flame #F56B00`);
    const btn = await rectOf(page, '#ff-btn');
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.id || el.className : null;
    }, [btn.x + btn.w / 2, btn.y + btn.h / 2]);
    await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
    const clicks = await page.evaluate(() => window.__ffClicks);
    if (clicks !== 1 || hit !== 'ff-btn') failures.push(`click-through at 1400ms: the probe button got ${clicks} click(s); elementFromPoint is "${hit}"`);

    // Let it finish, then nothing persists.
    await page.evaluate(() => document.querySelector('.flame-flip').getAnimations()[0].play());
    await waitIdle(page);
    const end = await layerState(page);
    if (!end.hidden || end.anims || end.inlineClip) failures.push(`after the run: hidden ${end.hidden}, ${end.anims} animations, inline clip "${end.inlineClip}"`);
    const state1 = await snapshot(page);
    for (const k of Object.keys(state0)) if (state0[k] !== state1[k]) failures.push(`after the run: ${k} changed (${state0[k]} -> ${state1[k]})`);
    const after = await shoot(page, `${theme}-after`);
    if (!near(centre(after, swatch), AZURE, 2)) failures.push(`after the run: the swatch reads ${hex(centre(after, swatch))}, expected #0A94FF`);

    console.log(`  ${label}: swatch ${hex(swatchRest)} -> ${hex(swatchHold)} at 1400ms; dot ${hex(dotPx)}; radius 0/300/1400/2400 = ${[0, 300, 1400, 2400].map((t) => (frames[t].c ? frames[t].c.r.toFixed(0) : '?')).join('/')} of ${frames[1400].s.far.toFixed(0)}; click-through ${clicks}; new scripts on trigger ${fresh.length}`);
  } catch (e) {
    failures.push(`error: ${e.message}`);
  } finally {
    await ctx.close();
  }
  return failures.map((f) => `${label}: ${f}`);
}

async function calmRun(browser, theme, mode) {
  const failures = [];
  const label = `calm (${mode}) / ${theme}`;
  const ctx = await newContext(browser, theme, mode);
  try {
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.clock.runFor(1500);
    if (mode === 'paused') {
      const m = await page.evaluate(() => document.documentElement.dataset.motion);
      if (m !== 'paused') failures.push(`the stored pause did not apply (data-motion="${m}")`);
    }
    await addProbes(page);
    const swatch = await rectOf(page, '#ff-swatch');
    await page.clock.pauseAt(Date.now() + 60000);
    await pressFlip(page);
    const st = await layerState(page);
    if (st.anims) failures.push(`${st.anims} animation(s) on the layer, expected none`);
    if (st.clip !== 'none') failures.push(`clip-path "${st.clip}", expected none (the whole page swaps at once)`);
    const on = await shoot(page, `${theme}-calm-${mode}-0000ms`);
    if (!near(centre(on, swatch), FLAME, 2)) failures.push(`at the swap the swatch reads ${hex(centre(on, swatch))}, expected #F56B00`);
    const corner = on.px(4, on.h - 4);
    await page.clock.runFor(1499);
    const held = await layerState(page);
    if (held.hidden) failures.push('hidden before 1500ms');
    await page.clock.runFor(2);
    const off = await layerState(page);
    if (!off.hidden) failures.push('still showing at 1501ms');
    const back = await shoot(page, `${theme}-calm-${mode}-1501ms`);
    if (!near(centre(back, swatch), AZURE, 2)) failures.push(`after the swap back the swatch reads ${hex(centre(back, swatch))}, expected #0A94FF`);
    console.log(`  ${label}: no animation; swatch ${hex(centre(on, swatch))} at once (page corner ${hex(corner)}); hidden at 1501ms ${off.hidden}`);
  } catch (e) {
    failures.push(`error: ${e.message}`);
  } finally {
    await ctx.close();
  }
  return failures.map((f) => `${label}: ${f}`);
}

async function keyboardRun(browser, theme) {
  const failures = [];
  const label = `keyboard / ${theme}`;
  const ctx = await newContext(browser, theme, 'motion');
  try {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const finish = () => page.evaluate(() => {
      const el = document.querySelector('.flame-flip');
      if (el) for (const a of el.getAnimations()) a.finish();
    }).then(() => waitIdle(page));

    // The button: role, name, tab order.
    const info = await page.evaluate(() => {
      const b = document.querySelector('footer .flip-keys');
      if (!b) return null;
      const tabbable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((el) => {
        if (el.disabled || el.tabIndex < 0) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      });
      const i = tabbable.indexOf(b);
      if (i > 0) {
        tabbable[i - 1].setAttribute('data-ff-prev', '');
      }
      return { tag: b.tagName, type: b.type, ariaLabel: b.getAttribute('aria-label'), index: i, height: b.getBoundingClientRect().height };
    });
    if (!info) {
      failures.push('no footer .flip-keys button');
      return failures.map((f) => `${label}: ${f}`);
    }
    if (info.tag !== 'BUTTON' || info.type !== 'button') failures.push(`keycaps are <${info.tag.toLowerCase()} type=${info.type}>, expected <button type=button>`);
    // The name is computed from content, as assistive tech computes it: an
    // aria-label would replace it and could drop the visible "ctrl".
    if (info.ariaLabel !== null) failures.push(`keycaps carry aria-label "${info.ariaLabel}"; the name must come from the content`);
    const named = await page.getByRole('button', { name: 'Flip to the flame: ctrl i', exact: true }).count();
    if (named !== 1) failures.push(`${named} buttons named "Flip to the flame: ctrl i", expected 1`);
    if (info.height < 44) failures.push(`keycaps are ${info.height}px tall, under the 44px target`);
    await page.locator('[data-ff-prev]').scrollIntoViewIfNeeded();
    await page.locator('[data-ff-prev]').focus();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('flip-keys'));
    if (!focused) failures.push('Tab from the control before it does not reach the keycaps');
    const ring = await page.evaluate(() => {
      const b = document.querySelector('.flip-keys');
      const cs = getComputedStyle(b);
      return { outline: `${cs.outlineStyle} ${cs.outlineWidth}`, visible: b.matches(':focus-visible') };
    });
    if (!ring.visible || !/solid 2px/.test(ring.outline)) failures.push(`focus ring: :focus-visible ${ring.visible}, outline ${ring.outline}`);
    const box = await rectOf(page, '.flip-keys');
    const clip = { x: box.x - 8, y: box.y - 8, width: box.w + 16, height: box.h + 16 };
    const withRing = await page.screenshot({ clip });
    if (FRAMES) fs.writeFileSync(path.join(FRAMES, `${theme}-keycaps-focus.png`), withRing);
    await page.evaluate(() => document.activeElement.blur());
    const without = await page.screenshot({ clip });
    if (FRAMES) fs.writeFileSync(path.join(FRAMES, `${theme}-keycaps-rest.png`), without);
    const a = decodePng(withRing);
    const b = decodePng(without);
    let changed = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (!near(a.px(x, y), b.px(x, y), 24)) changed++;
    if (changed < (box.w + box.h) * 2 * DSF) failures.push(`focus ring changes ${changed} px, under the box perimeter`);
    // The ring shows on every side: something changes in each band from 1 to
    // 7px outside the box (a parent's overflow once clipped the top).
    const pad = 8 * DSF;
    const bw = Math.round(box.w * DSF);
    const bh = Math.round(box.h * DSF);
    const band = (x0, y0, x1, y1) => {
      let n = 0;
      for (let y = Math.max(0, y0); y < Math.min(a.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.w, x1); x++) if (!near(a.px(x, y), b.px(x, y), 24)) n++;
      return n;
    };
    const sides = {
      top: band(pad, pad - 7 * DSF, pad + bw, pad - DSF),
      bottom: band(pad, pad + bh + DSF, pad + bw, pad + bh + 7 * DSF),
      left: band(pad - 7 * DSF, pad, pad - DSF, pad + bh),
      right: band(pad + bw + DSF, pad, pad + bw + 7 * DSF, pad + bh),
    };
    for (const [side, n] of Object.entries(sides)) if (n < 4) failures.push(`focus ring: nothing drawn on the ${side} (${n} px changed)`);

    // Enter and Space on the focused button.
    for (const key of ['Enter', 'Space']) {
      await page.locator('.flip-keys').focus();
      await page.keyboard.press(key);
      const ok = await page.waitForFunction(() => {
        const el = document.querySelector('.flame-flip');
        return el && !el.hidden;
      }, null, { timeout: 5000 }).then(() => true, () => false);
      if (!ok) failures.push(`${key} on the keycaps did not run the flip`);
      await finish();
    }

    // The shortcut from the page.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    for (const combo of ['Control+i', 'Meta+i']) {
      await page.keyboard.press(combo);
      const ran = await page.waitForFunction(() => {
        const el = document.querySelector('.flame-flip');
        return el && !el.hidden;
      }, null, { timeout: 5000 }).then(() => true, () => false);
      if (!ran) failures.push(`${combo} on the page did not run the flip`);
      await finish();
    }
    for (const combo of ['Control+Shift+i', 'Control+Alt+i']) {
      await page.keyboard.press(combo);
      await page.waitForTimeout(400);
      const s = await layerState(page);
      if (s.exists && !s.hidden) failures.push(`${combo} ran the flip`);
      await finish();
    }

    // Never inside a field: input, textarea, select, contenteditable.
    await page.evaluate(() => {
      const w = document.createElement('div');
      w.id = 'ff-fields';
      w.style.cssText = 'position:fixed;left:16px;top:200px;z-index:5;display:grid;gap:8px';
      w.innerHTML = '<input id="ff-input" value="x"><textarea id="ff-textarea">x</textarea><select id="ff-select"><option>a</option></select><div id="ff-ce" contenteditable="true">x</div>';
      document.body.appendChild(w);
      window.__ffDefault = [];
      w.addEventListener('keydown', (e) => window.__ffDefault.push(e.defaultPrevented));
    });
    for (const id of ['ff-input', 'ff-textarea', 'ff-select', 'ff-ce']) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press('Control+i');
      await page.waitForTimeout(400);
      const s = await layerState(page);
      if (s.exists && !s.hidden) failures.push(`Ctrl+I inside #${id} ran the flip`);
      await finish();
    }
    // Typing "i" with Ctrl held inside an input, character by character.
    await page.locator('#ff-input').focus();
    await page.keyboard.down('Control');
    await page.keyboard.type('i');
    await page.keyboard.up('Control');
    await page.waitForTimeout(400);
    const typed = await layerState(page);
    if (typed.exists && !typed.hidden) failures.push('typing i with Ctrl held inside an input ran the flip');
    const prevented = await page.evaluate(() => window.__ffDefault.filter(Boolean).length);
    if (prevented) failures.push(`${prevented} Ctrl+I keydown(s) inside a field were prevented by the page`);
    console.log(`  ${label}: <button> "${info.name}", tab-reachable ${focused}, ring ${ring.outline} (${changed} px), Enter/Space/Ctrl+I/Cmd+I run; Shift and Alt variants and 4 field types do not`);
  } catch (e) {
    failures.push(`error: ${e.message}`);
  } finally {
    await ctx.close();
  }
  return failures.map((f) => `${label}: ${f}`);
}

(async () => {
  if (FRAMES) fs.mkdirSync(FRAMES, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) });
  } catch (e) {
    console.error(`check-flame-flip: cannot launch a browser: ${e.message}`);
    process.exit(2);
  }
  const failures = [];
  for (const theme of ['dark', 'light']) {
    failures.push(...(await motionRun(browser, theme)));
    failures.push(...(await calmRun(browser, theme, 'reduced')));
    failures.push(...(await calmRun(browser, theme, 'paused')));
    failures.push(...(await keyboardRun(browser, theme)));
  }
  await browser.close();
  if (failures.length) {
    console.error(`\nFlame flip gate FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  if (BREAK) {
    console.error('\nFlame flip gate passed with --break set: it cannot see the defect it exists for.');
    process.exit(1);
  }
  console.log('\nFlame flip gate passed.');
})();
