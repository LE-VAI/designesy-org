#!/usr/bin/env node
/**
 * Status messages gate: a failed run is announced, with its reason (WCAG 2.2
 * SC 4.1.3).
 *
 * WHY THIS EXISTS
 * When a score run failed, screen readers heard nothing. The only live region
 * on the score form was the loading log, and it unmounted the moment the run
 * ended; the error card that replaced it was plain markup. The same shape sat
 * on the four-engine form (/score), whose own live line said the run stopped
 * but never why, and on the report page, whose loading region unmounted into
 * a plain "Score failed" block. Every source check, the axe sweep and the
 * keyboard walk passed: nothing is wrong with markup that is never announced.
 * Only failing a run and reading what the browser exposes finds it.
 *
 * The seven other pages built on the instrument (drift, compare, guardrails,
 * readiness, report, monitor and the M3 converter) had the four-engine form's
 * shape: the instrument's live line said "stopped without a result" and the
 * reason sat in the side column, which is drawn, not announced. Each now
 * hands the instrument its reason as errorText, so the line that was in the
 * tree all along reads it.
 *
 * WHAT IT ASSERTS
 * Each surface below is loaded with its API answering with a failure that
 * carries a unique message. The response is held until the browser's
 * accessibility tree (CDP Accessibility.getFullAXTree, the tree a screen
 * reader is served) has been read once, then released, and the tree is read
 * again when the message is on screen. The M3 converter fails in the browser,
 * with no request to hold, so its tree is read at rest and then the convert
 * that fails is pressed. For the message:
 *   A. it sits inside a live region (aria-live polite or assertive, which
 *      role=status and role=alert imply);
 *   B. that region is an alert, which is announced when it is inserted, or a
 *      region that was already in the tree before the message arrived (the
 *      same DOM node), because a polite region mounted with its text already
 *      in it is not reliably read. On an instrument surface it must be the
 *      second: the instrument's polite line, the same node as before the
 *      failure, so an alert added beside it does not pass;
 *   C. exactly one live region carries it, so it is announced once;
 *   D. where the surface draws the error icon, the icon's strokes stay inside
 *      its circle (a <line> without y2 ran from y=8 to y=0, out of the top),
 *      and its dot draws at all: a line shorter than its stroke is only a dot
 *      with round caps, and with butt caps it drew nothing.
 *
 * PROVING IT CAN FAIL
 * Against a build without the fix, A fails on every surface. --break injects
 * three later regressions into a fixed build, and the gate must exit 1:
 *   - the score form's alert becomes a freshly mounted status region (B),
 *   - the four-engine form's visible card becomes a second alert next to the
 *     instrument's polite line (C), and
 *   - on every instrument surface, the side column's drawn reason becomes an
 *     alert next to the polite line (C, and the instrument form of B).
 *
 * Usage:
 *   node scripts/check-status-messages.js --base http://127.0.0.1:3422
 *   node scripts/check-status-messages.js --base ... --channel chrome [--break] [--json]
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('--base', '').replace(/\/$/, '');
const CHANNEL = arg('--channel', undefined);
const BREAK = args.includes('--break');
const AS_JSON = args.includes('--json');

if (!BASE) {
  console.error('usage: node scripts/check-status-messages.js --base http://127.0.0.1:3422 [--channel chrome] [--break] [--json]');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('check-status-messages: playwright is not installed');
    process.exit(2);
  }
}

// The failure each mocked endpoint returns. Unique, so a match can only be
// the message itself, never copy that happens to sit on the page.
const MESSAGE = 'Status probe: the target site could not be reached.';
const fail = { status: 502, body: { ok: false, error: MESSAGE } };

// A small, complete score result, so the form shows its results card and the
// browser-audit control the audit surface needs.
const SCORED = {
  status: 200,
  body: {
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
  },
};

/** Fill the engine bar's URL field and submit it, as a visitor would. */
const submit = (label) => async (page) => {
  const field = page.getByRole('textbox', { name: label });
  await field.fill('example.com');
  await field.press('Enter');
};

const SURFACES = [
  {
    name: 'score form: run fails',
    route: '/',
    held: '**/api/score',
    mocks: { '**/api/score': fail },
    ready: (page) => page.getByRole('textbox', { name: 'Site URL to score' }).waitFor(),
    trigger: submit('Site URL to score'),
    icon: '.score-error-icon svg',
  },
  {
    name: 'score form: browser audit fails',
    route: '/',
    held: '**/api/score/audit',
    mocks: { '**/api/score': SCORED, '**/api/score/audit': fail },
    ready: async (page) => {
      await submit('Site URL to score')(page);
      await page.getByRole('button', { name: 'Run full browser audit' }).waitFor({ timeout: 20000 });
    },
    trigger: (page) => page.getByRole('button', { name: 'Run full browser audit' }).click(),
  },
  {
    name: 'four-engine form (/score): run fails',
    route: '/score',
    held: '**/api/report',
    mocks: { '**/api/report': fail, '**/api/guardrails': fail },
    ready: (page) => page.getByRole('textbox', { name: 'Site URL to verify' }).waitFor(),
    trigger: submit('Site URL to verify'),
    icon: '.score-error-icon svg',
  },
  {
    name: 'report page: score fails',
    route: '/score/report?url=example.com',
    held: '**/api/score',
    mocks: { '**/api/score': fail },
    // The page scores on load: the held request is the trigger.
    ready: async () => {},
    trigger: null,
  },
  // The instrument surfaces: one engine each, its reason read by the
  // instrument's polite line (instrument: true holds them to that node).
  ...[
    ['drift radar (/drift)', '/drift', 'drift', 'URL to scan for drift'],
    ['guardrails (/guardrails)', '/guardrails', 'guardrails', 'URL to emit guardrails from'],
    ['AI readiness (/readiness)', '/readiness', 'readiness', 'URL to probe for AI readiness'],
    ['report (/report)', '/report', 'report', 'URL to report on'],
    ['drift monitor (/monitor)', '/monitor', 'monitor', 'URL to watch for drift'],
  ].map(([name, route, api, label]) => ({
    name: `${name}: run fails`,
    route,
    held: `**/api/${api}`,
    mocks: { [`**/api/${api}`]: fail },
    ready: (page) => page.getByRole('textbox', { name: label }).waitFor(),
    trigger: submit(label),
    instrument: true,
  })),
  {
    name: 'compare (/compare): run fails',
    route: '/compare',
    held: '**/api/compare',
    mocks: { '**/api/compare': fail },
    ready: (page) => page.getByRole('textbox', { name: 'Second URL, site B' }).waitFor(),
    trigger: async (page) => {
      await page.getByRole('textbox', { name: 'First URL, site A' }).fill('example.com');
      await submit('Second URL, site B')(page);
    },
    instrument: true,
  },
  {
    // Converted in the browser: no request to fail, so input with no
    // Material 3 tokens is the failure, and its parser's message the probe.
    name: 'M3 converter (/m3-bridge): conversion fails',
    route: '/m3-bridge',
    held: null,
    mocks: {},
    message: 'No M3 tokens found. Expected CSS custom properties starting with --md-',
    hydrated: '#m3-input',
    ready: (page) => page.getByRole('textbox', { name: 'Material 3 tokens to convert' }).fill(':root { color: red; }'),
    trigger: (page) => page.getByRole('button', { name: 'Convert to DTCG' }).click(),
    instrument: true,
  },
];

// --break: the regressions this gate must catch on a fixed build.
const BREAK_SCRIPT = () => {
  const swap = () => {
    // Score form: its alert becomes a status region mounted with its text in it.
    for (const el of document.querySelectorAll('.score-form:not(.eg-bench) .score-error-card[role="alert"]')) {
      el.setAttribute('role', 'status');
    }
    // Four-engine form: the visible card becomes a second announcer.
    for (const el of document.querySelectorAll('.eg-bench .score-error-card:not([role])')) {
      el.setAttribute('role', 'alert');
    }
    // Every instrument: the side column's drawn reason becomes an announcer
    // next to the polite line.
    for (const el of document.querySelectorAll('.eg-inst .eg-error:not([role])')) {
      el.setAttribute('role', 'alert');
    }
  };
  new MutationObserver(swap).observe(document, { childList: true, subtree: true });
};

function deferred() {
  let release;
  const promise = new Promise((r) => (release = r));
  return { promise, release };
}

/** The live regions in the accessibility tree, and where the message sits. */
async function readTree(cdp, message) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const prop = (n, name) => (n.properties || []).find((p) => p.name === name)?.value?.value;
  const liveOf = (n) => {
    const v = prop(n, 'live');
    return v === 'polite' || v === 'assertive' ? v : null;
  };
  // An ignored node (a plain span) still holds exposed text; an aria-hidden
  // subtree's text is ignored itself, so it never counts.
  const textOf = (n) => {
    if (n.role?.value === 'StaticText') return n.ignored ? '' : n.name?.value || '';
    return (n.childIds || []).map((id) => (byId.has(id) ? textOf(byId.get(id)) : '')).join(' ');
  };
  const regions = nodes
    .filter((n) => !n.ignored && liveOf(n))
    .map((n) => ({
      dom: n.backendDOMNodeId,
      role: n.role?.value,
      live: liveOf(n),
      text: textOf(n).replace(/\s+/g, ' ').trim(),
    }));
  // Each exposed occurrence of the message, with its nearest live ancestor.
  const hits = [];
  for (const n of nodes) {
    if (n.ignored || n.role?.value !== 'StaticText') continue;
    if (!(n.name?.value || '').includes(message)) continue;
    let root = null;
    for (let p = byId.get(n.parentId); p; p = byId.get(p.parentId)) {
      if (!p.ignored && liveOf(p)) {
        root = p;
        break;
      }
    }
    hits.push({ node: n.backendDOMNodeId, root: root ? root.backendDOMNodeId : null, rootRole: root?.role?.value ?? null });
  }
  return { regions, hits };
}

async function probe(browser, surface) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  if (BREAK) await ctx.addInitScript(BREAK_SCRIPT);
  const gate = deferred();
  const arrived = deferred();
  for (const [pattern, answer] of Object.entries(surface.mocks)) {
    await ctx.route(pattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      if (pattern === surface.held) {
        arrived.release();
        await gate.promise;
      }
      await route.fulfill({
        status: answer.status,
        contentType: 'application/json',
        body: JSON.stringify(answer.body),
      });
    });
  }
  const page = await ctx.newPage();
  const message = surface.message ?? MESSAGE;
  const out = { surface: surface.name, route: surface.route, failures: [] };
  try {
    await page.goto(BASE + surface.route, { waitUntil: 'load', timeout: 60000 });
    // Hydrated: React has attached to the page's form, or the converter's
    // field (or, on the report page, the request it fires on mount has
    // arrived).
    if (surface.trigger) {
      await page.waitForFunction(
        (sel) => {
          const f = document.querySelector(sel);
          return !!f && Object.keys(f).some((k) => k.startsWith('__react'));
        },
        surface.hydrated ?? 'form.eg-bar',
        { timeout: 30000 },
      );
    }
    await surface.ready(page);
    if (surface.held) {
      if (surface.trigger) await surface.trigger(page);
      await Promise.race([
        arrived.promise,
        page.waitForTimeout(30000).then(() => {
          throw new Error(`the ${surface.held} request never arrived`);
        }),
      ]);
    }
    await page.waitForTimeout(300);
    const cdp = await ctx.newCDPSession(page);
    const before = await readTree(cdp, message);
    // A surface with no request to hold is made to fail after the first read.
    if (!surface.held) await surface.trigger(page);
    gate.release();
    await page.getByText(message).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const after = await readTree(cdp, message);
    out.before = before.regions;
    out.after = after.regions;
    out.hits = after.hits;

    const preexisting = new Set(before.regions.map((r) => r.dom));
    const roots = [...new Set(after.hits.filter((h) => h.root !== null).map((h) => h.root))];
    if (after.hits.length === 0) {
      out.failures.push('the failure message is not exposed in the accessibility tree at all');
    } else if (roots.length === 0) {
      out.failures.push(
        `A: the failure message is on screen but inside no live region, so it is never announced (${after.hits.length} occurrence(s), none live)`,
      );
    }
    for (const dom of roots) {
      const region = after.regions.find((r) => r.dom === dom);
      const isAlert = region?.role === 'alert';
      if (!isAlert && !preexisting.has(dom)) {
        out.failures.push(
          `B: the ${region?.role ?? '?'} region (${region?.live ?? '?'}) carrying the message was mounted with it, so it is not reliably read; keep the region mounted and write the message into it, or use role=alert`,
        );
      }
    }
    if (roots.length > 1) {
      out.failures.push(`C: ${roots.length} live regions carry the message, so it is announced ${roots.length} times`);
    }
    if (surface.instrument) {
      // What the instrument's live line reads now: the stop, and the reason.
      out.line = await page.evaluate(() => document.querySelector('.eg-inst > p[aria-live="polite"]')?.textContent ?? null);
      const others = roots.filter((dom) => {
        const region = after.regions.find((r) => r.dom === dom);
        return !(region?.live === 'polite' && region.role !== 'alert' && preexisting.has(dom));
      });
      if (roots.length && (others.length || !(out.line || '').includes(message))) {
        out.failures.push(
          `B: on an instrument surface the reason belongs in the instrument's polite line, the node that was in the tree before the failure; it reads ${JSON.stringify(out.line)}${others.length ? `, and ${others.length} other live region(s) carry the message` : ''}`,
        );
      }
    }

    if (surface.icon) {
      const icon = await page.evaluate((sel) => {
        const svg = document.querySelector(sel);
        if (!svg) return { missing: true };
        const circle = svg.querySelector('circle');
        const c = { cx: +circle.getAttribute('cx'), cy: +circle.getAttribute('cy'), r: +circle.getAttribute('r') };
        const lines = [...svg.querySelectorAll('line')].map((l) => {
          const b = l.getBBox();
          const s = getComputedStyle(l);
          return {
            top: b.y,
            bottom: b.y + b.height,
            length: Math.hypot(b.width, b.height),
            stroke: parseFloat(s.strokeWidth),
            cap: s.strokeLinecap,
          };
        });
        return { c, lines };
      }, surface.icon);
      if (icon.missing) {
        out.failures.push(`D: the error icon (${surface.icon}) is not drawn`);
      } else {
        out.icon = icon;
        for (const l of icon.lines) {
          if (l.top < icon.c.cy - icon.c.r || l.bottom > icon.c.cy + icon.c.r) {
            out.failures.push(`D: an error-icon stroke runs from y=${l.top} to y=${l.bottom}, outside its circle`);
          }
          if (l.length < l.stroke && l.cap !== 'round') {
            out.failures.push(`D: the error icon's dot (a ${+l.length.toFixed(2)}-long line) has ${l.cap} caps, so it draws nothing`);
          }
        }
      }
    }
  } catch (e) {
    out.failures.push(`could not measure: ${e.message.split('\n')[0]}`);
    out.fatal = true;
  } finally {
    gate.release();
    await ctx.close();
  }
  return out;
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(CHANNEL ? { channel: CHANNEL } : {}) });
  } catch (e) {
    console.error(`check-status-messages: cannot launch a browser: ${e.message}`);
    process.exit(2);
  }
  const results = [];
  for (const surface of SURFACES) results.push(await probe(browser, surface));
  await browser.close();

  const failed = results.filter((r) => r.failures.length);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, break: BREAK, message: MESSAGE, results }, null, 2));
  } else {
    for (const r of results) {
      const where = (r.hits || []).map((h) => (h.root === null ? 'not live' : `${h.rootRole}`)).join(', ');
      console.log(`  ${r.failures.length ? 'FAIL' : 'ok  '} ${r.surface}${where ? `: message in ${where}` : ''}`);
      if (r.line !== undefined) console.log(`         live line: ${JSON.stringify(r.line)}`);
      for (const f of r.failures) console.log(`         ${f}`);
    }
  }
  if (results.some((r) => r.fatal)) process.exit(2);
  if (failed.length) {
    console.error(`\nStatus messages gate FAILED on ${failed.length} of ${results.length} surfaces.`);
    process.exit(1);
  }
  if (!AS_JSON) {
    console.log(`Status messages gate passed: a failed run is announced once on ${results.length} surfaces.`);
  }
})();
