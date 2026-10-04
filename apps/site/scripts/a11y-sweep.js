#!/usr/bin/env node
/**
 * A11y sweep — the incremental standing check for the axe-family contract.
 *
 * WHY THIS EXISTS
 * The published contract (designesy.org/contracts/a11y.json) is scored by hand
 * on the routes someone thought to check. What shipped as regressions were the
 * routes nobody re-checked after a change — and a full 77-route sweep on every
 * PR costs minutes nobody wants to pay. The operator's rule for this gate
 * (2026-10-04): sweep the routes a commit TOUCHES, and nothing else; when a
 * commit touches shared surfaces (globals.css, layout, lib), it touches every
 * route, so the full set runs. The CI step computes the list from the git
 * diff; this script only executes the list it is given.
 *
 * WHAT IT ASSERTS, and where the bar sits
 *   A. axe-core wcag2a2a — the same engine and ruleset as rater B in
 *      blind-comparison.mjs (cdnjs 4.10.2, the version this repo already pins).
 *      SERIOUS and CRITICAL violations fail the gate. Moderate and minor are
 *      reported per route but do not block: the round-3 triage list is the
 *      minors lane, and a gate that fails on 131 known minors is a gate
 *      someone deletes.
 *   B. Heading structure (contract a06): the first visible heading is an h1,
 *      and no level is skipped going deeper. Headings inside aria-hidden
 *      containers or presentational-children roles are excluded, exactly as
 *      assistive tech would never read them.
 *   C. Landmarks (contract a07): main, navigation and contentinfo are each
 *      present, by element or role.
 *
 *   The remaining contract checks (a03 keyboard walk, a09 obscured probes,
 *   a10 reduced-motion) stay in the contract runner's lane: qa-keyboard.js
 *   already gates the keyboard contract, and a per-route Tab walk across the
 *   full set is minutes this gate does not buy.
 *
 * USAGE
 *   node scripts/a11y-sweep.js [--base http://127.0.0.1:3422] [--routes /a,/b]
 *                             [--json] [--cdp URL]
 *   A11Y_ROUTES=/a,/b is the env form the CI job uses.
 *   No routes given -> the full set (MARKDOWN_ROUTES from next.config.ts plus
 *   the dynamic routes, the same derivation visual-floor.js uses), so a
 *   sweep with an empty route list can never read as green.
 *
 * Two launch modes, same probe either way (visual-floor.js's reasoning):
 *   --cdp <url>  connect to a running browser (local, any OS) — pages are
 *                closed after each route, the browser is NEVER closed (a CDP
 *                browser belongs to its operator).
 *   (default)    launch the bundled Linux Chromium (CI).
 *
 * Exits 1 on any failing route so it can gate CI. Exits 2 when it cannot
 * measure.
 */

const ARGS = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = ARGS.indexOf(name);
  return i !== -1 && ARGS[i + 1] !== undefined ? ARGS[i + 1] : dflt;
};
const BASE = (opt('--base', 'http://localhost:3422') || '').replace(/\/$/, '');
const AS_JSON = ARGS.includes('--json');
const CDP = opt('--cdp', null);

// axe-core is a devDependency of apps/site, pinned in package-lock.json — the
// gate reads the installed file, so a CI run is deterministic and offline
// (a gate whose engine comes from a CDN fetch flakes, and a flaky gate is one
// someone deletes). The pin: the same 4.10.x the repo's blind-comparison.mjs
// already uses as rater B.
function axeSource() {
  const fs = require('node:fs');
  try {
    return fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  } catch (e) {
    console.error('[a11y] axe-core is not installed (npm ci installs it as a devDependency)');
    process.exit(2);
  }
}

/** Routes to sweep when no list is given. Same derivation as visual-floor.js:
 *  MARKDOWN_ROUTES is the site's own single source of truth for "pages that
 *  matter", plus the force-dynamic routes that render real pages. The
 *  [slug] framework pages are data-driven rows of one template; the /frameworks
 *  index covers the family, so they are not enumerated. */
function routesFromConfig() {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'next.config.ts'), 'utf8');
  const m = src.match(/const MARKDOWN_ROUTES = \[([\s\S]*?)\];/);
  if (!m) {
    console.error('[a11y] MARKDOWN_ROUTES not found in next.config.ts');
    process.exit(2);
  }
  return [...m[1].matchAll(/'([^']+)'/g)]
    .map((x) => x[1])
    .map((r) => (r === 'index' ? '/' : '/' + r));
}
const DYNAMIC_ROUTES = ['/score', '/compare', '/drift', '/readiness', '/guardrails', '/monitor', '/report'];

function resolveRoutes() {
  const given = (opt('--routes', null) || process.env.A11Y_ROUTES || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  if (given.length) return given;
  return [...routesFromConfig(), ...DYNAMIC_ROUTES];
}

async function launch() {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e) {
    console.error('[a11y] playwright-core not installed');
    process.exit(2);
  }
  if (CDP) return { browser: await chromium.connectOverCDP(CDP), connected: true };

  let sparticuz;
  try {
    sparticuz = require('@sparticuz/chromium').default;
  } catch (e) {
    console.error(
      '[a11y] @sparticuz/chromium not installed. On a non-Linux host, pass ' +
        '--cdp http://127.0.0.1:9222 to use a running browser instead.',
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
  return { browser: await chromium.launch({ args, executablePath, headless: true }), connected: false };
}

/** The in-page probe. Runs axe wcag2a2a and reads heading + landmark
 *  structure in one pass, so each route costs one navigation. */
const PROBE = async () => {
  const axeRes = await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a2a'] },
  });
  const violations = axeRes.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
  }));

  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  // Excluded the way assistive tech excludes them: hidden containers and
  // presentational-children roles never speak their inner headings.
  const read = (h) =>
    visible(h) && !h.closest('[aria-hidden="true"], button, [role="button"], [role="tab"], [role="option"], [role="presentation"]');
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(read);
  const levels = headings.map((h) => parseInt(h.tagName[1], 10));
  let first = levels[0] ?? null;
  let skip = null;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      skip = `${levels[i - 1]}->${levels[i]}`;
      break;
    }
  }

  const landmarks = {
    main: !!document.querySelector('main, [role="main"]'),
    navigation: !!document.querySelector('nav, [role="navigation"]'),
    contentinfo: !!document.querySelector('footer, [role="contentinfo"]'),
  };
  return { violations, first, skip, levels: levels.length, landmarks };
};

async function sweep(page, route, findings) {
  const url = BASE + route;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  await page.addScriptTag({ content: axeSource() });
  const data = await page.evaluate(PROBE);

  const serious = data.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (serious.length) {
    findings.push({
      route,
      kind: 'axe-serious',
      detail: `${serious.length} serious/critical violation(s): ` +
        serious.map((v) => `${v.id} (${v.impact}, ${v.nodes} node(s))`).join(', '),
    });
  }
  const minors = data.violations.filter((v) => v.impact === 'moderate' || v.impact === 'minor');
  if (minors.length) {
    findings.push({
      route,
      kind: 'axe-minor',
      minor: true,
      detail: `${minors.length} moderate/minor violation(s): ` +
        minors.map((v) => `${v.id} (${v.impact}, ${v.nodes})`).join(', '),
    });
  }
  if (data.first === null) {
    findings.push({ route, kind: 'a06-headings', detail: 'no visible heading on the page' });
  } else if (data.first !== 1) {
    findings.push({ route, kind: 'a06-headings', detail: `first visible heading is h${data.first}, not h1` });
  }
  if (data.skip) {
    findings.push({ route, kind: 'a06-headings', detail: `heading level skipped: h${data.skip}` });
  }
  const missing = Object.keys(data.landmarks).filter((k) => !data.landmarks[k]);
  if (missing.length) {
    findings.push({ route, kind: 'a07-landmarks', detail: 'missing ' + missing.join(', ') });
  }
}

(async () => {
  const { browser, connected } = await launch();
  const findings = [];
  const routes = resolveRoutes();
  const ctx = (await browser.contexts())[0];
  let checksRun = 0;

  try {
    for (const route of routes) {
      const page = connected ? await ctx.newPage() : await browser.newPage();
      let session = null;
      if (connected) {
        // The persistent-zoom correction loop (qa-keyboard.js's pattern): a
        // browser zoom makes a request for W land at W/zoom, so iterate the
        // override until the page reports the target. mobile stays false —
        // Chrome's mobile emulation freezes the layout viewport at 980 until
        // a viewport meta loads, and a CSS-media-query page needs none.
        session = await ctx.newCDPSession(page);
        const W = 1440, H = 900;
        let dev = W;
        for (let i = 0; i < 5; i++) {
          await session.send('Emulation.setDeviceMetricsOverride', {
            width: dev, height: H, deviceScaleFactor: 1, mobile: false,
          });
          await page.waitForTimeout(300);
          const landed = await page.evaluate('window.innerWidth');
          if (Math.abs(landed - W) <= 2) break;
          dev = Math.max(120, Math.round(dev * (W / landed)));
        }
      } else {
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      checksRun++;
      try {
        await sweep(page, route, findings);
      } catch (e) {
        findings.push({ route, kind: 'load', detail: String(e).slice(0, 160) });
      }
      if (session) await session.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
      await page.close().catch(() => {});
    }
  } finally {
    // Only close what we launched; a CDP browser is the operator's.
    if (!connected) await browser.close().catch(() => {});
  }

  const failed = findings.filter((f) => !f.minor).length;
  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, checksRun, findings }, null, 2));
  } else {
    console.log(`[a11y] ${checksRun} route(s) swept against ${BASE}`);
    for (const f of findings) {
      const mark = f.minor ? '–' : '✗';
      console.log(`  ${mark} ${f.kind}  ${f.route}\n      ${f.detail}`);
    }
    console.log(failed ? `[a11y] ${failed} failing finding(s)` : '[a11y] OK — every swept route holds the axe-family contract');
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('[a11y] fatal:', String(e).slice(0, 300));
  process.exit(2);
});
