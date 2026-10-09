#!/usr/bin/env node
/**
 * Motion pause gate: pausing animations never hides content.
 *
 * WHY THIS EXISTS
 * The site's "Pause animations" control (WCAG 2.2.2) sets
 * html[data-motion="paused"], and layout.tsx restores it before first paint.
 * globals.css then held every animation on its first frame. Entrances that
 * start at opacity 0 (.fade-up wraps the header of every "surface" page) were
 * held invisible, so a visitor who had paused motion got empty pages: on
 * 2026-10-08, 1,198 text elements across 8 of 16 sampled routes (/pricing,
 * /contracts, /labs, /changelog, /badge, /work, /learn, /spring-validator).
 * The fix runs each animation past its end before holding it; this gate keeps
 * it that way for every route below and for any entrance added later.
 *
 * WHAT IT ASSERTS
 *   Each route is loaded twice, at 1440x900: once with motion on and once
 *   with the pause stored the way the toggle stores it
 *   (localStorage "motion" = "paused"). Every element that owns text and is
 *   visible with motion on (effective opacity > 0.2) must not be invisible
 *   when paused (effective opacity < 0.05). Only GET requests are allowed,
 *   so pages that score on load do not call the API.
 *
 * PROVING IT CAN FAIL
 *   --break re-injects the defect as it shipped (.fade-up held on its first
 *   frame); the gate must then exit 1 on the surface pages.
 *
 * Usage:
 *   node scripts/check-motion-pause.js --base http://127.0.0.1:3422
 *   node scripts/check-motion-pause.js --base ... --channel chrome --break
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const ROUTES = [
  '/', '/score', '/leaderboard', '/drift', '/compare', '/badge', '/changelog',
  '/work', '/labs', '/contracts', '/pricing', '/methodology', '/learn',
  '/m3-bridge', '/spring-validator', '/frameworks',
];

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('--base', '').replace(/\/$/, '');
const CHANNEL = arg('--channel', undefined);
const BREAK = args.includes('--break');

if (!BASE) {
  console.error('usage: node scripts/check-motion-pause.js --base http://127.0.0.1:3422 [--channel chrome] [--break]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('check-motion-pause: playwright is not installed');
    process.exit(2);
  }
}

// The defect as it shipped: .fade-up held on its first frame (opacity 0).
// The repeated class only raises specificity above the fix's :is() list.
const BROKEN = 'html[data-motion="paused"] .fade-up.fade-up.fade-up.fade-up { animation-delay: 0s !important; }';

async function visibleText(browser, route, paused) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (paused) {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('motion', 'paused'); } catch {}
    });
  }
  if (paused && BREAK) {
    await ctx.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
      });
    }, BROKEN);
  }
  await ctx.route('**/*', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const result = await page.evaluate(() => {
    const out = {};
    const effective = (el) => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden') return 0;
        o *= parseFloat(s.opacity);
      }
      return o;
    };
    for (const el of document.querySelectorAll('body *')) {
      const owns = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 1);
      if (!owns) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase();
      out[`${cls} | ${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 48)}`] = effective(el);
    }
    return { motion: document.documentElement.dataset.motion || 'on', out };
  });
  await ctx.close();
  return result;
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) });
  } catch (e) {
    console.error(`check-motion-pause: cannot launch a browser: ${e.message}`);
    process.exit(2);
  }
  const failures = [];
  for (const route of ROUTES) {
    const on = await visibleText(browser, route, false);
    const off = await visibleText(browser, route, true);
    if (off.motion !== 'paused') {
      failures.push(`${route}: the stored pause did not apply (data-motion="${off.motion}")`);
      continue;
    }
    const shown = Object.keys(on.out).filter((k) => on.out[k] > 0.2);
    const hidden = shown.filter((k) => off.out[k] !== undefined && off.out[k] < 0.05);
    console.log(`  ${route}: ${shown.length} text elements visible with motion; ${hidden.length} hidden when paused`);
    for (const k of hidden.slice(0, 5)) failures.push(`${route}: hidden when paused: ${k}`);
    if (hidden.length > 5) failures.push(`${route}: ... and ${hidden.length - 5} more`);
  }
  await browser.close();
  if (failures.length) {
    console.error(`\nMotion pause gate FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`Motion pause gate passed: pausing animations hides no text on ${ROUTES.length} routes.`);
})();
