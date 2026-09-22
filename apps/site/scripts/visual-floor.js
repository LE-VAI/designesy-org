#!/usr/bin/env node
/**
 * Visual floor — the standing check for what the P1 sweep fixed.
 *
 * WHY THIS EXISTS
 * /methodology ran 130 characters per line against a ~75-character readable
 * maximum, and ~380 interactive controls sat below the 44px target, for as long
 * as anyone cared to look. Neither was visible to lint, types, tests, or the
 * prose gate: every one of them measures SOURCE, and both defects were only
 * present in the RENDERED PAGE. The fix was a one-time sweep; this is what stops
 * it silently regressing.
 *
 * It runs against a live URL with a real browser, so it sees what a reader sees.
 *
 * THE EXEMPTION RULE IS THE LOAD-BEARING PART
 * WCAG 2.2 SC 2.5.8 exempts a target that is "in a sentence, or its size is
 * otherwise constrained by the line-height of non-target text". The test here is
 * the LINE BOX, not surrounding sentence text: /methodology's 31 table-of-
 * contents entries are 18px links inside a 21.08px line box and are exempt,
 * though no sentence surrounds them. Requiring surrounding text mis-flagged all
 * 31 as failures, which is the cry-wolf shape that gets a gate ignored.
 *
 * Thresholds are floors with a small tolerance, not exact values. A control at
 * 43.6px due to subpixel layout is not a defect, and a check that reports it as
 * one is a check nobody keeps.
 *
 * Usage:
 *   node scripts/visual-floor.js --base https://www.designesy.org
 *   node scripts/visual-floor.js --base http://localhost:3999 --json
 * Exit 1 on any floor violation, so it can gate a workflow.
 */

const ROUTES = process.env.FLOOR_ROUTES
  ? process.env.FLOOR_ROUTES.split(',')
  : ['/', '/docs', '/methodology', '/leaderboard', '/open', '/contracts', '/review'];

// Floors. WCAG 2.5.8 = 24px (AA, required). 44px = 2.5.5 / Apple HIG, which
// this site has adopted as its own standard, so it is enforced here too.
const MIN_TARGET = 44;
const WCAG_FLOOR = 24;
const TOLERANCE = 0.5; // subpixel

const MAX_CHARS_PER_LINE = 90;  // 45-75 is the norm; 90 is the hard ceiling
const MIN_CHARS_PER_LINE = 30;  // below this it is a label, not running prose

const PROBE = `(() => {
  const out = { targets: [], measure: [] };

  // ── touch targets ────────────────────────────────────────────────────────
  for (const el of document.querySelectorAll(
    'a,button,[role=button],input:not([type=hidden]),select,textarea,summary'
  )) {
    // Not rendered: hidden subtree (e.g. a closed mobile drawer at desktop
    // width). The first version of this probe counted seven 0x0 elements on the
    // homepage as "under 24px" — layout that is not on screen.
    if (el.getClientRects().length === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // offsetParent is null inside a display:none subtree AND for position:fixed
    // elements. The rect check above already excludes the hidden case, so this
    // is a second signal on the same condition rather than a new rule -- it
    // caught nothing on its own but makes the intent explicit.
    if (!el.hasLayoutClientRects && el.offsetParent === null && el.offsetWidth === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;

    // WCAG 2.5.8 inline exception, tested against the LINE BOX.
    const lh = parseFloat(cs.lineHeight) || 0;
    const inlineExempt =
      el.tagName === 'A' && cs.display === 'inline' && lh > 0 && r.height <= lh + 2;

    out.targets.push({
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().split(' ').filter(Boolean)[0] || '',
      text: (el.textContent || '').trim().slice(0, 34),
      exempt: inlineExempt,
      inMain: !!el.closest('main'),
    });
  }

  // ── measure ─────────────────────────────────────────────────────────────
  // Characters, NOT ch. 'ch' is the width of the '0' glyph, so Nch overstates
  // capacity — measured 30% high at 16.8px on this site. A probe span rendered
  // in the element's own computed font gives the real average character width.
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
  probe.textContent = 'n'.repeat(100);
  document.body.appendChild(probe);

  for (const el of document.querySelectorAll('main p, main li, main article p')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // Skip anything containing block children — those are layout containers
    // whose width says nothing about their text. 104-character "paragraphs"
    // in an earlier run were all containers, not prose.
    if (el.querySelector('p,div,ul,ol,table,section,article,pre,blockquote')) continue;
    if (el.closest('pre, code, table')) continue;
    const text = (el.textContent || '').trim();
    if (text.length < 80) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 100) continue;

    probe.style.font = cs.font;
    probe.style.letterSpacing = cs.letterSpacing;
    const avg = probe.getBoundingClientRect().width / 100;
    if (!avg) continue;

    out.measure.push({
      chars: Math.round(r.width / avg),
      px: Math.round(r.width),
      cls: (el.className || '').toString().split(' ').filter(Boolean)[0] || '',
      sample: text.slice(0, 46),
    });
  }
  probe.remove();

  return JSON.stringify(out);
})()`;

async function main() {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base');
  const BASE = baseIdx !== -1 ? args[baseIdx + 1] : 'https://www.designesy.org';
  const AS_JSON = args.includes('--json');

  const cdpIdx = args.indexOf('--cdp');
  const CDP = cdpIdx !== -1 ? args[cdpIdx + 1] : null;

  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e) {
    console.error('[floor] playwright-core not installed');
    process.exit(2);
  }

  // TWO LAUNCH MODES, because the binary is platform-locked.
  //
  // @sparticuz/chromium ships a LINUX Chromium. That is exactly right for the CI
  // runner (ubuntu-latest) and exactly wrong on the operator's Windows machine,
  // where it resolves to a path with no executable and dies with
  // "spawn ... ENOENT". So:
  //   --cdp <url>  connect to an already-running browser (local, any OS)
  //   (default)    launch the bundled Linux binary (CI)
  // Same probe either way, so a local run and a CI run measure the same thing.
  let browser;
  if (CDP) {
    browser = await chromium.connectOverCDP(CDP);
  } else {
    let sparticuz;
    try {
      sparticuz = require('@sparticuz/chromium').default;
    } catch (e) {
      console.error(
        '[floor] @sparticuz/chromium not installed. On a non-Linux host, ' +
          'pass --cdp http://127.0.0.1:9222 to use a running browser instead.',
      );
      process.exit(2);
    }
    // The two documented must-dos. Without either, Chromium dies right after
    // spawn and every operation fails with the misleading "Target page, context
    // or browser has been closed".
    sparticuz.setGraphicsMode = false;
    const executablePath = await sparticuz.executablePath();
    const path = require('node:path');
    const libPath = path.dirname(executablePath);
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${libPath}:${process.env.LD_LIBRARY_PATH}`
      : libPath;

    // STRIP THE SERVERLESS-ONLY ARGS.
    //
    // sparticuz tunes its flag set for a Lambda container, where one process and
    // no zygote are how you fit in a 2GB ceiling. Playwright needs the opposite:
    // it drives the browser over a multi-process protocol, and --single-process
    // breaks that. The first CI run died exactly there --
    //   browser.newPage: Target page, context or browser has been closed
    // -- with Chromium launching (pid=2365) and then failing to produce a page.
    //
    // These flags buy nothing on a GitHub runner, which is a full VM with no
    // such ceiling. Removing them is not a workaround for a bug: it is using the
    // binary without the constraints that shaped those flags.
    const SERVERLESS_ONLY = ['--single-process', '--no-zygote', '--in-process-gpu'];
    const args = sparticuz.args.filter(
      (a) => !SERVERLESS_ONLY.some((bad) => a.includes(bad)),
    );

    browser = await chromium.launch({ args, executablePath, headless: true });
  }

  const findings = [];
  const report = [];

  try {
    for (const route of ROUTES) {
      const url = BASE.replace(/\/$/, '') + route;
      // Viewport first, THEN navigate.
      //
      // An earlier version navigated and set the viewport in the other order.
      // Playwright's setViewportSize after load reflows the page, but the
      // measurement ran against the pre-reflow DOM: the probe reported a
      // 762x19.8 <summary> that is display:none at 1280px (verified separately:
      // clientRects 0, offsetParent null), i.e. it measured a MOBILE layout while
      // claiming a desktop viewport. Setting the size before goto means the page
      // lays out once, at the size the report names.
      const ctx = (await browser.contexts())[0];
      const page = CDP ? await ctx.newPage() : await browser.newPage();

      // setViewportSize DOES NOT WORK over connectOverCDP.
      //
      // The browser is a real OS window; Playwright cannot resize it, so
      // setViewportSize is silently ignored and window.innerWidth stays at
      // whatever the window happens to be. Measured on this machine: the call
      // asked for 1280, innerWidth reported 853, and the probe therefore
      // measured a TABLET layout while the report claimed desktop -- it flagged
      // a <summary> that is display:none at 1280px as a violation.
      //
      // CDP's own Emulation override is tab-scoped and does take effect, and
      // unlike Playwright's it does not revert on disconnect, so it is cleared
      // explicitly below. Same call this session used for the standalone
      // measurement tool.
      const W = 1280, H = 900;
      let session = null;
      if (CDP) {
        session = await ctx.newCDPSession(page);
        await session.send('Emulation.setDeviceMetricsOverride', {
          width: W, height: H, deviceScaleFactor: 1, mobile: true,
        });
      } else {
        await page.setViewportSize({ width: W, height: H });
      }
      let raw;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(1200);

        // Assert the viewport is what we think it is. Measuring at one width
        // while reporting another is worse than not measuring: it produces a
        // confident wrong answer, which is the failure this whole session keeps
        // running into.
        const actual = await page.evaluate('window.innerWidth');
        if (Math.abs(actual - W) > 8) {
          findings.push({
            route,
            kind: 'viewport-mismatch',
            detail: `wanted ${W}px, page reports ${actual}px -- refusing to report measurements`,
          });
          await page.close();
          continue;
        }

        raw = await page.evaluate(PROBE);
      } catch (e) {
        findings.push({ route, kind: 'load', detail: String(e).slice(0, 160) });
        await page.close();
        continue;
      }
      if (session) {
        // CDP overrides are tab-scoped and do NOT revert on their own.
        await session.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
      }
      await page.close();

      const data = JSON.parse(raw);
      const live = data.targets.filter((t) => !t.exempt);
      const underWcag = live.filter(
        (t) => t.w < WCAG_FLOOR - TOLERANCE || t.h < WCAG_FLOOR - TOLERANCE,
      );
      const under44 = live.filter(
        (t) => t.w < MIN_TARGET - TOLERANCE || t.h < MIN_TARGET - TOLERANCE,
      );
      const long = data.measure.filter((m) => m.chars > MAX_CHARS_PER_LINE);

      report.push({
        route,
        targets: data.targets.length,
        exempt: data.targets.length - live.length,
        under24: underWcag.length,
        under44: under44.length,
        measureBlocks: data.measure.length,
        over90: long.length,
      });

      // The 24px WCAG floor is a HARD failure. Sub-44 is reported, because the
      // site may deliberately accept a few and the count is the signal that
      // matters, not a pass/fail.
      for (const t of underWcag) {
        findings.push({
          route,
          kind: 'wcag-2.5.8-target',
          detail: `${t.w}x${t.h} ${t.tag}.${t.cls} "${t.text}"`,
        });
      }
      for (const m of long) {
        findings.push({
          route,
          kind: 'measure-over-90',
          detail: `${m.chars} chars @ ${m.px}px .${m.cls} "${m.sample}"`,
        });
      }
    }
  } finally {
    // Only close what we launched. A browser reached over CDP belongs to the
    // operator and may hold his logged-in tabs -- closing it would take those
    // with it. Pages this script opened are closed individually above.
    if (!CDP) await browser.close();
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, report, findings }, null, 1));
  } else {
    console.log(`[floor] ${BASE}`);
    console.log(
      '  ' +
        'route'.padEnd(14) +
        'targets'.padStart(8) +
        'exempt'.padStart(8) +
        '<24'.padStart(6) +
        '<44'.padStart(6) +
        'over90'.padStart(8),
    );
    for (const r of report) {
      console.log(
        '  ' +
          r.route.padEnd(14) +
          String(r.targets).padStart(8) +
          String(r.exempt).padStart(8) +
          String(r.under24).padStart(6) +
          String(r.under44).padStart(6) +
          String(r.over90).padStart(8),
      );
    }
    if (!findings.length) {
      console.log('[floor] OK - no WCAG 2.5.8 floor violations, no measure overflow');
    } else {
      console.log(`[floor] ${findings.length} violation(s):`);
      for (const f of findings.slice(0, 30)) {
        console.log(`  FAIL ${f.route} [${f.kind}] ${f.detail}`);
      }
      if (findings.length > 30) console.log(`  ... and ${findings.length - 30} more`);
    }
  }
  process.exit(findings.length ? 1 : 0);
}

// A fatal error MUST exit non-zero, and it must be LOUD.
//
// The first CI run of this script reported `[floor] fatal: browser.newPage:
// Target page, context or browser has been closed` and the JOB STILL SHOWED
// SUCCESS. The cause: the step pipes to `tee`, and bash takes tee's exit status,
// not node's. So a total measurement failure read as a pass -- a check that
// cannot fail, which is the exact shape this session keeps hunting.
//
// Two fixes, because either alone would be fragile:
//   1. This handler exits 2 (unchanged), and
//   2. the workflow step no longer pipes through tee -- it writes the summary
//      from a file after the run, so node's status is the step's status.
main().catch((e) => {
  console.error('[floor] fatal:', e && e.message ? e.message : e);
  process.exit(2);
});
