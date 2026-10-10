#!/usr/bin/env node
/**
 * LCP entrance gate: the largest content on a page never fades in from
 * opacity 0.
 *
 * WHY THIS EXISTS
 * The browser records Largest Contentful Paint when the element is painted
 * visibly, so an entrance that starts at opacity 0 holds LCP back by its
 * whole duration. The home hero hit this first (globals.css, "Hero
 * first-paint"). On 2026-10-09 the CSS performance report found the same on
 * six more routes: their LCP text sits in section.surface-header.fade-up,
 * whose fadeUp starts at opacity 0 and runs 0.6s, and LCP came 600-650ms
 * after FCP there and 0ms after it everywhere else. The header now rises
 * without fading (globals.css, "Page header first-paint"). The case-study
 * summary (section#summary.doctrine-section) held the LCP paragraph of
 * /work and /review case studies the same way, wherever it outsizes the
 * header's, and rises without fading too. Nothing failed while either was
 * broken: the page looked right once the fade had finished.
 *
 * WHAT IT ASSERTS
 * Each route is loaded with motion on at a phone (412x823) and a desktop
 * (1440x900) viewport. Then:
 *   A. no element from the LCP element up to <html> declares an animation
 *      whose first keyframe sets opacity 0, and
 *   B. no page header (section.surface-header) and no case-study summary
 *      (section#summary.doctrine-section) declares one, whichever element
 *      won LCP.
 * It reads the declared keyframes (computed animation-name, resolved
 * against the page's own @keyframes rules), not timings, so the verdict
 * does not depend on machine speed. The LCP - FCP gap is printed for
 * reading, never asserted. Only GET requests are allowed.
 *
 * There are no exceptions: any LCP element in an entrance from opacity 0
 * fails, on every route below at both widths.
 *
 * PROVING IT CAN FAIL
 *   --break puts the page header and the case-study summary back on the
 *   full fadeUp, as they shipped; the gate must then exit 1 on every
 *   surface route.
 *
 * Usage:
 *   node scripts/check-lcp-entrance.js --base http://127.0.0.1:3422
 *   node scripts/check-lcp-entrance.js --base ... --channel chrome [--break]
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const ROUTES = [
  '/', '/score', '/leaderboard', '/drift', '/contracts', '/pricing',
  '/learn/what-is-design-verification', '/work/designesy-org', '/work/tile', '/review/poise',
  '/changelog', '/badge',
];
const VIEWPORTS = [
  { name: '412', viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  { name: '1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
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
  console.error('usage: node scripts/check-lcp-entrance.js --base http://127.0.0.1:3422 [--channel chrome] [--break]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('check-lcp-entrance: playwright is not installed');
    process.exit(2);
  }
}

// The defect as it shipped: the page header and the case-study summary on
// the full fadeUp. The repeated class only raises specificity above the fix.
const BROKEN = ':is(.surface-header, #summary.doctrine-section).fade-up.fade-up.fade-up { animation-name: fadeUp; }';

// Runs before any page script, so the buffered LCP and paint entries are kept.
function observe() {
  window.__lcpGate = { lcp: null, fcp: null };
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    window.__lcpGate.lcp = entries[entries.length - 1];
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__lcpGate.fcp = e.startTime;
  }).observe({ type: 'paint', buffered: true });
}

// In the page: every element in the chain whose declared animation starts
// invisible, with the keyframes that do it.
function inspect() {
  const firstOpacity = new Map();
  const visit = (rules) => {
    for (const r of rules) {
      if (r.type === CSSRule.KEYFRAMES_RULE) {
        let start = null;
        for (const k of r.cssRules) {
          const at = k.keyText.split(',').map((s) => s.trim());
          if (at.includes('0%') || at.includes('from')) start = k.style.opacity;
        }
        firstOpacity.set(r.name, start);
      } else if (r.cssRules) {
        visit(r.cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    visit(rules);
  }
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + [...el.classList].slice(0, 3).join('.');
    return s;
  };
  const invisibleStart = (el) => {
    const cs = getComputedStyle(el);
    const names = cs.animationName.split(',').map((s) => s.trim());
    const durations = cs.animationDuration.split(',').map((s) => s.trim());
    const out = [];
    names.forEach((name, i) => {
      if (name === 'none') return;
      if (parseFloat(durations[i % durations.length]) === 0) return;
      const start = firstOpacity.get(name);
      if (start !== undefined && start !== null && start !== '' && parseFloat(start) === 0) out.push(`${label(el)} runs ${name} from opacity 0`);
    });
    return out;
  };
  const chain = (el) => {
    const out = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) out.push(...invisibleStart(n));
    return out;
  };
  const g = window.__lcpGate;
  const el = g.lcp && g.lcp.element;
  return {
    keyframes: firstOpacity.size,
    lcp: g.lcp ? { t: g.lcp.startTime, el: el ? label(el) : null, text: el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) : null } : null,
    fcp: g.fcp,
    lcpChain: el ? chain(el) : [],
    headers: [...document.querySelectorAll('section.surface-header, section#summary.doctrine-section')].flatMap(chain),
    headerCount: document.querySelectorAll('section.surface-header, section#summary.doctrine-section').length,
  };
}

async function check(browser, route, vp) {
  const { name, ...opts } = vp;
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'no-preference' });
  await ctx.addInitScript(observe);
  if (BREAK) {
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
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const res = await page.evaluate(inspect).catch((e) => ({ error: e.message }));
  await ctx.close();
  return { name, ...res };
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) });
  } catch (e) {
    console.error(`check-lcp-entrance: cannot launch a browser: ${e.message}`);
    process.exit(2);
  }
  const failures = [];
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      const r = await check(browser, route, vp);
      const where = `${route} @${r.name}`;
      if (r.error) { failures.push(`${where}: could not inspect the page (${r.error})`); continue; }
      if (!r.keyframes) { failures.push(`${where}: no @keyframes readable, so nothing was checked`); continue; }
      if (!r.lcp) { failures.push(`${where}: no LCP entry was recorded, so the LCP element was not checked`); continue; }
      const gap = r.fcp != null ? `${Math.round(r.lcp.t - r.fcp)}ms after FCP` : 'no FCP entry';
      console.log(`  ${where}: LCP ${r.lcp.el || '(removed)'} "${r.lcp.text || ''}" ${gap}; ${r.headerCount} header or summary section(s)`);
      for (const f of r.lcpChain) failures.push(`${where}: the LCP element sits in an entrance from opacity 0: ${f}`);
      for (const f of new Set(r.headers)) failures.push(`${where}: a page header or case-study summary enters from opacity 0: ${f}`);
    }
  }
  await browser.close();
  if (failures.length) {
    console.error(`\nLCP entrance gate FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error('An entrance on the LCP element must not start at opacity 0: animate transform only (globals.css, "Page header first-paint") or take the element out of the entrance (globals.css, "Hero first-paint").');
    process.exit(1);
  }
  console.log(`LCP entrance gate passed: on ${ROUTES.length} routes at ${VIEWPORTS.length} widths, no LCP element, page header or case-study summary enters from opacity 0.`);
})();
