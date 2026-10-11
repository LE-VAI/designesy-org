#!/usr/bin/env node
/**
 * Accessibility modes gate: text contrast under the preferences that repaint
 * the palette.
 *
 * WHY THIS EXISTS
 * Two rules in globals.css change the palette only when a visitor has asked
 * for it: under dark + prefers-contrast: more, --ink becomes
 * var(--paper-on-signal), and under light + prefers-reduced-transparency:
 * reduce, --surface-soft becomes var(--paper-on-signal). Both read that token
 * as white. A brand test (draft PR #252) changed --paper-on-signal from
 * #ffffff to #010102, which is the dark paper itself: every line of text on
 * the dark theme with "Increase contrast" on measured 1.00:1, and ink on the
 * light theme's soft surfaces with "Reduce transparency" on measured 1.20:1.
 * CI passed it. Every runtime gate renders the site with no preference set,
 * and the axe sweep runs one theme, so neither mode was ever rendered. This
 * gate renders them.
 *
 * WHAT IT ASSERTS
 *   Modes: dark and light, each with prefers-contrast: more, with
 *   prefers-reduced-transparency: reduce, and with neither (the control).
 *   Each mode emulates every preference it does not test as no-preference,
 *   so the host's own settings (Windows "Transparency effects", "Contrast
 *   themes") cannot leak into a run.
 *   Routes: the pages the focus visibility gate sweeps, plus /badge,
 *   /changelog and /docs, plus two score results states: /api/score is
 *   mocked with a result that carries every registered check and every
 *   status (pass, fail, warn, N/A, manual), rendered by the home form and by
 *   /score/report.
 *   On each page, in each mode:
 *     theme      the site's own theme switch is set the way the site reads it
 *                (the theme cookie, localStorage, and prefers-color-scheme),
 *                and the html data-theme the page rendered must be the
 *                mode's theme.
 *     emulation  the media features are set through CDP
 *                (Emulation.setEmulatedMedia; Playwright's emulateMedia has
 *                no reduced-transparency), then read back in the page with
 *                matchMedia, before and after the measurement:
 *                prefers-color-scheme, prefers-contrast: more,
 *                prefers-reduced-transparency: reduce, prefers-reduced-motion
 *                and forced-colors must each be exactly what the mode asks
 *                for, and the browser must parse the transparency feature at
 *                all. A mode whose condition never applied fails: a gate
 *                that measured the wrong mode would otherwise pass it.
 *     contrast   axe-core's color-contrast rule (the engine the a11y sweep
 *                uses, read from the installed devDependency): text at least
 *                4.5:1 against its resolved background, 3:1 for large text.
 *                axe resolves stacked backgrounds, opacity and overlays, and
 *                lists what it cannot resolve (a background image, a
 *                gradient, a single glyph) as incomplete; those are counted,
 *                never passed or failed. One incomplete is a failure here:
 *                text at exactly 1:1 (axe's equalRatio), which axe sets
 *                aside as possibly hidden on purpose, and which is the
 *                brand test's dark + contrast-more defect itself.
 *                Before axe runs, pseudo-elements that cannot paint behind
 *                text are switched off for the measurement: transparent or
 *                hidden ones, and the 1px card rims (masked to a ring). axe
 *                reads neither a pseudo-element's opacity nor its mask, so it
 *                set aside every text node inside a card as incomplete.
 *     coverage   a page where axe checked no text node fails: a blank page
 *                must not read as a contrast pass.
 *   Requests: GET only; every other method is aborted and counted, except
 *   the mocked score request, which never leaves the browser.
 *   Emulated throughout: prefers-reduced-motion: reduce (entrances settle at
 *   once) and device scale factor 1, at 1440x900.
 *
 * NOT ASSERTED
 *   Non-text contrast (borders, icons, focus rings: check-focus-visibility.js
 *   and check-warn-ink.js), forced-colors: active (the browser repaints that
 *   mode itself), and text axe lists as incomplete.
 *
 * PROVING IT CAN FAIL
 *   --break injects, after load, the two values the brand test gave these
 *   rules, and the gate must exit 1:
 *     contrast      dark + prefers-contrast: more sets --ink to #010102
 *     transparency  light + prefers-reduced-transparency: reduce sets
 *                   --surface-soft to #010102
 *   Each sits inside its media query, so the control modes still pass: a
 *   gate that rendered only the default mode passes --break.
 *   --break contrast (or transparency) injects one alone.
 *   --inject <file.css> appends any stylesheet after load.
 *
 * Usage:
 *   node scripts/check-a11y-modes.js --base http://127.0.0.1:3422 --channel chrome
 *   node scripts/check-a11y-modes.js --base ... --break                  (must exit 1)
 *   node scripts/check-a11y-modes.js --base ... --routes /,/docs --themes dark --modes contrast
 *   node scripts/check-a11y-modes.js --base ... --no-results --concurrency 2 --json
 *   node scripts/check-a11y-modes.js --base ... --executable /path/to/chromium
 * Exit 1 on any failure, 2 on a fatal error (no browser, bad arguments).
 */

const fs = require('node:fs');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const BASE = opt('--base', '').replace(/\/$/, '');
const CHANNEL = opt('--channel', 'chrome');
const EXECUTABLE = opt('--executable', null);
const AS_JSON = args.includes('--json');
const NO_RESULTS = args.includes('--no-results');
const CONCURRENCY = Math.max(1, Number(opt('--concurrency', '4')) || 4);
const LIST = Math.max(1, Number(opt('--list', '12')) || 12);

const USAGE =
  'usage: node scripts/check-a11y-modes.js --base http://127.0.0.1:3422 [--channel chrome | --executable <path>] ' +
  '[--routes /a,/b] [--themes dark,light] [--modes none,contrast,transparency] [--no-results] ' +
  '[--break [contrast,transparency]] [--inject file.css] [--concurrency 4] [--json]';
if (!BASE) {
  console.error(USAGE);
  process.exit(2);
}

// The focus visibility gate's routes (its main sweep and its extra passes),
// so the two gates read the same pages. /score/report renders a result only
// with a score behind it; the results states below cover it.
const ROUTES = [
  '/',
  '/score',
  '/drift',
  '/compare',
  '/leaderboard',
  '/contracts',
  '/learn/the-pause-button-that-emptied-our-pages',
  '/docs',
  '/pricing',
  '/review',
  '/badge',
  '/changelog',
  '/labs/poise/orb',
  '/open',
];

const THEMES = ['dark', 'light'];
// Each preference under test, and the matchMedia query that proves it.
const PREFS = {
  none: { label: 'no preference', contrast: false, transparency: false },
  contrast: { label: 'prefers-contrast: more', contrast: true, transparency: false },
  transparency: { label: 'prefers-reduced-transparency: reduce', contrast: false, transparency: true },
};

// The two values the brand test (draft PR #252) gave the mode rules, each
// inside its own media query, appended after the house sheets.
const DEFECTS = {
  contrast: `@media (prefers-contrast: more) {
    :root:not([data-theme="light"]) { --ink: #010102; }
  }`,
  transparency: `@media (prefers-reduced-transparency: reduce) {
    [data-theme="light"] { --surface-soft: #010102; }
  }`,
};

// --- arguments ---------------------------------------------------------------
const routeArg = opt('--routes', null);
const routes = routeArg ? routeArg.split(',').map((r) => r.trim()).filter(Boolean) : ROUTES;
const badRoute = routes.find((r) => !r.startsWith('/'));
if (badRoute) {
  // Git Bash rewrites a bare /score into a Windows path; MSYS_NO_PATHCONV=1 stops it.
  console.error(`[a11y-modes] route "${badRoute}" does not start with /`);
  process.exit(2);
}
const themes = opt('--themes', THEMES.join(',')).split(',');
const prefs = opt('--modes', Object.keys(PREFS).join(',')).split(',');
for (const t of themes) {
  if (!THEMES.includes(t)) {
    console.error(`[a11y-modes] unknown theme "${t}" (one of ${THEMES.join(', ')})`);
    process.exit(2);
  }
}
for (const p of prefs) {
  if (!PREFS[p]) {
    console.error(`[a11y-modes] unknown mode "${p}" (one of ${Object.keys(PREFS).join(', ')})`);
    process.exit(2);
  }
}
let breaks = [];
const bi = args.indexOf('--break');
if (bi >= 0) {
  const next = args[bi + 1];
  breaks = next && !next.startsWith('--') ? next.split(',') : Object.keys(DEFECTS);
  for (const b of breaks) {
    if (!DEFECTS[b]) {
      console.error(`[a11y-modes] unknown --break "${b}" (one of ${Object.keys(DEFECTS).join(', ')})`);
      process.exit(2);
    }
  }
}
let inject = breaks.map((b) => DEFECTS[b]).join('\n');
const injectPath = opt('--inject', null);
if (injectPath) {
  try {
    inject += '\n' + fs.readFileSync(injectPath, 'utf8');
  } catch (e) {
    console.error(`[a11y-modes] cannot read --inject ${injectPath}: ${e.message}`);
    process.exit(2);
  }
}

// axe-core is a devDependency of apps/site, pinned in package-lock.json, so a
// run is deterministic and offline (the a11y sweep's reasoning).
let AXE;
try {
  AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  console.error('[a11y-modes] axe-core is not installed (npm ci installs it as a devDependency)');
  process.exit(2);
}
const AXE_VERSION = (() => {
  try {
    return require('axe-core/package.json').version;
  } catch {
    return '?';
  }
})();

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('[a11y-modes] playwright-core is not installed');
  process.exit(2);
}

// --- the score results states ------------------------------------------------
// One score result with every registered check (from the server's own check
// registry) and every status, so each status ink and the grade render.
const STATUSES = ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'];
async function resultFixture() {
  const res = await fetch(BASE + '/api/score/checks');
  if (!res.ok) throw new Error(`/api/score/checks answered ${res.status}`);
  const reg = await res.json();
  const checks = reg.checks.map((c, i) => {
    const status = STATUSES[i % STATUSES.length];
    const out = {
      id: c.id,
      item: c.item,
      category: c.category,
      status,
      weight: c.weight,
      detail: {
        PASS: `${c.pass} (${c.threshold})`,
        FAIL: `${c.fail}: 3 text pairs fall below their floor.`,
        WARN: `${c.warn}: ${c.threshold}`,
        SKIP: `${c.fail} (skipped: scope=universal)`,
        MANUAL: 'requires browser viewport trace: run the full audit to resolve',
      }[status],
    };
    if (status !== 'PASS') out.remediation = `Meet the threshold (${c.threshold}), then score again.`;
    return out;
  });
  const count = (s) => checks.filter((c) => c.status === s).length;
  const categoryScores = {};
  for (const [cat, weight] of Object.entries(reg.categoryWeights)) {
    const mine = checks.filter((c) => c.category === cat);
    if (!mine.length) continue;
    const n = (s) => mine.filter((c) => c.status === s).length;
    const graded = n('PASS') + n('WARN') + n('FAIL');
    categoryScores[cat] = {
      score: graded ? Math.round(((n('PASS') + n('WARN') / 2) / graded) * 1000) / 10 : null,
      weight,
      pass: n('PASS'),
      fail: n('FAIL'),
      warn: n('WARN'),
      skip: n('SKIP'),
      manual: n('MANUAL'),
    };
  }
  return {
    ok: true,
    contractVersion: reg.contractVersion,
    score: 67.9,
    grade: 'D',
    pass: count('PASS'),
    fail: count('FAIL'),
    warn: count('WARN'),
    skip: count('SKIP'),
    manual: count('MANUAL'),
    total: checks.length,
    scored: count('PASS') + count('FAIL') + count('WARN'),
    scope: 'universal',
    a11yFloorApplied: false,
    hardFailCeilingApplied: false,
    hardFailCeilingReason: null,
    categoryScores,
    checks,
    tokensExtracted: 120,
    slop: {
      total: 9,
      findings: [
        { id: 'S1', label: 'Overused font family', severity: 5, instances: 1, evidence: ['roboto'], deduction: 5 },
        { id: 'S11', label: 'Marketing buzzword copy', severity: 3, instances: 3, evidence: ['streamline', 'empower'], deduction: 4 },
      ],
      convergences: '2 anti-slop patterns detected',
    },
    originality: {
      points: 4,
      signals: [
        { id: 'O1', label: 'Bespoke motion easing', points: 3, evidence: '6 custom easing curves' },
        { id: 'O3', label: 'Typographic detail', points: 2, evidence: '4 advanced type properties' },
      ],
      summary: '2 craft signals (+4pts)',
      slopGateApplied: false,
    },
  };
}

const RESULT_STATES = [
  {
    route: '/',
    label: '/ [score result]',
    ready: async (page) => {
      await page.waitForFunction(
        () => {
          const f = document.querySelector('form.eg-bar');
          return !!f && Object.keys(f).some((k) => k.startsWith('__react'));
        },
        null,
        { timeout: 30000 },
      );
      const field = page.getByRole('textbox', { name: 'Site URL to score' });
      await field.fill('example.com');
      await field.press('Enter');
      await page.locator('.score-cat-legend-row').first().waitFor({ timeout: 20000 });
      await page.locator('.score-check-group').first().waitFor({ timeout: 20000 });
    },
  },
  {
    route: '/score/report?url=https%3A%2F%2Fexample.com',
    label: '/score/report [score result]',
    ready: async (page) => {
      await page.locator('.report-hero').waitFor({ timeout: 20000 });
    },
  },
];

// --- the page side -----------------------------------------------------------
/** The media features a mode emulates: every one stated, none left to the host. */
function featuresFor(theme, pref) {
  const p = PREFS[pref];
  return [
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-contrast', value: p.contrast ? 'more' : 'no-preference' },
    { name: 'prefers-reduced-transparency', value: p.transparency ? 'reduce' : 'no-preference' },
    { name: 'forced-colors', value: 'none' },
  ];
}

/** Read back, in the page, what the browser actually applies. */
const READ_MODE = () => {
  const mq = (q) => window.matchMedia(q).matches;
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    dark: mq('(prefers-color-scheme: dark)'),
    contrastMore: mq('(prefers-contrast: more)'),
    reducedTransparency: mq('(prefers-reduced-transparency: reduce)'),
    // The feature parses at all: a browser without it answers false to both
    // values, and a false "reduce" would pass the control vacuously.
    transparencyKnown: mq('(prefers-reduced-transparency: no-preference) or (prefers-reduced-transparency: reduce)'),
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    forcedColors: mq('(forced-colors: active)'),
  };
};

function modeMismatches(read, theme, pref) {
  const p = PREFS[pref];
  const want = {
    theme,
    dark: theme === 'dark',
    contrastMore: p.contrast,
    reducedTransparency: p.transparency,
    transparencyKnown: true,
    reducedMotion: true,
    forcedColors: false,
  };
  return Object.keys(want)
    .filter((k) => read[k] !== want[k])
    .map((k) => `${k} is ${JSON.stringify(read[k])}, wanted ${JSON.stringify(want[k])}`);
}

/** Switch off, for the measurement, the pseudo-elements that cannot paint
 *  behind text: transparent or hidden ones, and the 1px rims (a fill masked to
 *  a ring by mask-composite exclude). axe reads neither a pseudo-element's
 *  opacity nor its mask, so it lists every text node over one as incomplete
 *  (pseudoContent) and measures nothing there: on /docs that was 141 of 244
 *  text nodes, every card behind its rim. Pseudo-elements that do fill (the
 *  glass capsule, chart cells) are left on, and axe still lists the text over
 *  them as incomplete. */
const QUIET_PSEUDO = () => {
  let quiet = 0;
  for (const el of document.querySelectorAll('body *')) {
    for (const which of ['before', 'after']) {
      const s = getComputedStyle(el, '::' + which);
      if (s.content === 'none' || s.content === 'normal' || s.display === 'none' || s.position !== 'absolute') continue;
      const ring = /exclude/.test(s.maskComposite || '') || /xor/.test(s.webkitMaskComposite || '');
      if (parseFloat(s.opacity) === 0 || s.visibility === 'hidden' || ring) {
        el.setAttribute(`data-a11y-modes-quiet-${which}`, '');
        quiet++;
      }
    }
  }
  const style = document.createElement('style');
  style.textContent =
    '[data-a11y-modes-quiet-before]::before { content: none !important; }\n' +
    '[data-a11y-modes-quiet-after]::after { content: none !important; }';
  document.head.appendChild(style);
  return quiet;
};

/** axe's color-contrast rule, reduced in the page to what the report needs. */
const RUN_AXE = async () => {
  const r = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
  const nodes = (list) => list.reduce((n, x) => n + x.nodes.length, 0);
  const failures = [];
  for (const v of r.violations) {
    for (const n of v.nodes) {
      const d = (n.any && n.any[0] && n.any[0].data) || {};
      failures.push({
        selector: n.target.join(' '),
        ratio: d.contrastRatio,
        expected: d.expectedContrastRatio,
        fg: d.fgColor,
        bg: d.bgColor,
        fontSize: d.fontSize,
        fontWeight: d.fontWeight,
      });
    }
  }
  // axe lists text at exactly 1:1 as incomplete (equalRatio), on the theory
  // that it may be hidden on purpose. Here it is the defect at its worst: the
  // brand test's dark + contrast-more text was the paper's own colour. It has
  // a measured ratio and both colours, so it fails like any other.
  const incompleteWhy = {};
  let incomplete = 0;
  for (const v of r.incomplete) {
    for (const n of v.nodes) {
      const d = (n.any && n.any[0] && n.any[0].data) || {};
      if (d.messageKey === 'equalRatio' && typeof d.contrastRatio === 'number' && d.fgColor && d.bgColor) {
        failures.push({
          selector: n.target.join(' '),
          ratio: d.contrastRatio,
          expected: d.expectedContrastRatio,
          fg: d.fgColor,
          bg: d.bgColor,
          fontSize: d.fontSize,
          fontWeight: d.fontWeight,
          equal: true,
        });
        continue;
      }
      incomplete++;
      const why = d.messageKey || 'unresolved';
      incompleteWhy[why] = (incompleteWhy[why] || 0) + 1;
    }
  }
  return {
    passes: nodes(r.passes),
    violations: nodes(r.violations),
    incomplete,
    incompleteWhy,
    failures,
  };
};

async function measure(browser, task, fixture, blocked) {
  const { theme, pref, route, state } = task;
  const out = { theme, pref, route: state ? state.label : route, failures: [], problems: [] };
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  try {
    // The site's own theme switch, set the way it reads it: the cookie first,
    // then localStorage, then prefers-color-scheme (layout.tsx themeScript).
    await ctx.addCookies([{ name: 'theme', value: theme, url: BASE }]);
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('theme', t);
      } catch {
        /* storage blocked: the cookie still carries it */
      }
    }, theme);
    // GET only: the probe reads pages and never writes to the site.
    await ctx.route('**/*', (r) => {
      const m = r.request().method();
      if (m === 'GET' || m === 'HEAD') return r.continue();
      blocked.push(`${m} ${r.request().url()}`);
      return r.abort();
    });
    const page = await ctx.newPage();
    if (state) {
      await page.route('**/api/score', (r) => {
        if (r.request().method() !== 'POST') return r.continue();
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
      });
    }
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: featuresFor(theme, pref) });

    await page.goto(BASE + route, { waitUntil: 'load', timeout: 60000 });
    if (state) await state.ready(page);
    await page.waitForTimeout(500);
    if (inject) {
      await page.evaluate((text) => {
        const s = document.createElement('style');
        s.dataset.a11yModesProbe = '1';
        s.textContent = text;
        document.head.appendChild(s);
      }, inject);
    }
    // Settle what is still moving, so no text is measured mid-fade.
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const end = a.effect && a.effect.getComputedTiming().endTime;
        if (Number.isFinite(end)) a.finish();
      }
    });

    out.before = await page.evaluate(READ_MODE);
    const off = modeMismatches(out.before, theme, pref);
    if (off.length) {
      out.problems.push(`emulation did not take before the measurement: ${off.join('; ')}`);
      return out;
    }
    out.quietPseudo = await page.evaluate(QUIET_PSEUDO);
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(RUN_AXE);
    out.after = await page.evaluate(READ_MODE);
    const drift = modeMismatches(out.after, theme, pref);
    if (drift.length) out.problems.push(`emulation did not hold through the measurement: ${drift.join('; ')}`);

    Object.assign(out, {
      checked: res.passes + res.failures.length + res.incomplete,
      passes: res.passes,
      incomplete: res.incomplete,
      incompleteWhy: res.incompleteWhy,
      // Worst first, so the listing leads with the lowest ratio.
      failures: res.failures.sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99)),
    });
    if (out.checked === 0) out.problems.push('axe checked no text on the page, so nothing was measured');
  } catch (e) {
    out.problems.push(`could not measure: ${String(e && e.message ? e.message : e).split('\n')[0]}`);
  } finally {
    await ctx.close().catch(() => {});
  }
  return out;
}

// --- run ---------------------------------------------------------------------
(async () => {
  const started = Date.now();
  let fixture = null;
  if (!NO_RESULTS) {
    try {
      fixture = await resultFixture();
    } catch (e) {
      console.error(`[a11y-modes] cannot build the score result fixture: ${e.message}`);
      process.exit(2);
    }
  }

  let browser;
  try {
    browser = await chromium.launch(
      EXECUTABLE ? { executablePath: EXECUTABLE, args: ['--no-sandbox'], headless: true } : { channel: CHANNEL, headless: true },
    );
  } catch (e) {
    console.error(`[a11y-modes] cannot launch ${EXECUTABLE || CHANNEL}: ${e.message.split('\n')[0]}`);
    process.exit(2);
  }

  const modes = [];
  for (const theme of themes) for (const pref of prefs) modes.push({ theme, pref });
  const tasks = [];
  for (const m of modes) {
    for (const route of routes) tasks.push({ ...m, route });
    if (fixture) for (const state of RESULT_STATES) tasks.push({ ...m, route: state.route, state });
  }

  const blocked = [];
  const results = new Array(tasks.length);
  const queue = tasks.map((t, i) => ({ t, i }));
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const { t, i } = queue.shift();
          results[i] = await measure(browser, t, fixture, blocked);
        }
      }),
    );
  } finally {
    await browser.close().catch(() => {});
  }

  // Per mode: what was rendered, what the browser said it applied, and what
  // axe found.
  const summary = modes.map(({ theme, pref }) => {
    const rows = results.filter((r) => r.theme === theme && r.pref === pref);
    const verified = rows.filter((r) => r.before && !modeMismatches(r.before, theme, pref).length && r.after && !modeMismatches(r.after, theme, pref).length);
    const themesSeen = [...new Set(rows.map((r) => (r.before ? r.before.theme : null)).filter(Boolean))];
    const seen = rows.find((r) => r.before) ? rows.find((r) => r.before).before : null;
    return {
      theme,
      pref,
      label: `${theme} + ${PREFS[pref].label}`,
      dataTheme: themesSeen.join('/') || '-',
      matchMedia: seen
        ? `contrast:more=${seen.contrastMore} reduced-transparency=${seen.reducedTransparency} dark=${seen.dark}`
        : '-',
      verifiedPages: verified.length,
      pages: rows.length,
      checked: rows.reduce((n, r) => n + (r.checked || 0), 0),
      passes: rows.reduce((n, r) => n + (r.passes || 0), 0),
      incomplete: rows.reduce((n, r) => n + (r.incomplete || 0), 0),
      failures: rows.reduce((n, r) => n + r.failures.length, 0),
      problems: rows.reduce((n, r) => n + r.problems.length, 0),
      lowest: rows
        .flatMap((r) => r.failures.map((f) => f.ratio))
        .filter((x) => typeof x === 'number')
        .reduce((a, b) => Math.min(a, b), Infinity),
    };
  });
  const failedPages = results.filter((r) => r.failures.length || r.problems.length);
  const seconds = Math.round((Date.now() - started) / 1000);

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          base: BASE,
          axe: AXE_VERSION,
          broken: breaks,
          injected: !!injectPath,
          ok: failedPages.length === 0,
          seconds,
          blocked: blocked.length,
          modes: summary.map((s) => ({ ...s, lowest: Number.isFinite(s.lowest) ? s.lowest : null })),
          results,
        },
        null,
        1,
      ),
    );
  } else {
    console.log(
      `[a11y-modes] ${BASE}, axe-core ${AXE_VERSION} color-contrast (4.5:1 text, 3:1 large text)` +
        (breaks.length ? `, defects injected: ${breaks.join(', ')}` : '') +
        (injectPath ? `, injected ${injectPath}` : ''),
    );
    const head = ['mode', 'data-theme', 'matchMedia read back', 'emulation', 'pages', 'nodes', 'pass', 'incompl', 'FAIL', 'lowest'];
    const rows = summary.map((s) => [
      s.label,
      s.dataTheme,
      s.matchMedia,
      `${s.verifiedPages}/${s.pages} ok`,
      String(s.pages),
      String(s.checked),
      String(s.passes),
      String(s.incomplete),
      String(s.failures),
      Number.isFinite(s.lowest) ? `${s.lowest.toFixed(2)}:1` : '-',
    ]);
    const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (cells) => '  ' + cells.map((c, i) => (i >= 4 ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ');
    console.log(line(head));
    for (const r of rows) console.log(line(r));

    for (const s of summary) {
      const mine = results.filter((r) => r.theme === s.theme && r.pref === s.pref && (r.failures.length || r.problems.length));
      if (!mine.length) continue;
      console.log(`\n  FAIL ${s.label}`);
      for (const r of mine) {
        for (const p of r.problems) console.log(`    ${r.route}  ${p}`);
        if (!r.failures.length) continue;
        console.log(`    ${r.route}  ${r.failures.length} text node(s) under the floor, of ${r.checked} checked`);
        for (const f of r.failures.slice(0, LIST)) {
          const ratio = typeof f.ratio === 'number' ? `${f.ratio.toFixed(2)}:1` : '?';
          const equal = f.equal ? '  [axe: equalRatio]' : '';
          console.log(`      ${ratio} (needs ${f.expected || '?'})  ${f.fg} on ${f.bg}  ${f.fontSize || ''} ${f.fontWeight || ''}  ${f.selector}${equal}`);
        }
        if (r.failures.length > LIST) console.log(`      ... and ${r.failures.length - LIST} more (--json for all)`);
      }
    }
    console.log(
      `\n[a11y-modes] ${modes.length} mode(s) x ${results.length / Math.max(1, modes.length)} page(s): ` +
        `${results.reduce((n, r) => n + (r.checked || 0), 0)} text nodes checked, ` +
        `${results.reduce((n, r) => n + r.failures.length, 0)} under the floor, ` +
        `${results.reduce((n, r) => n + r.problems.length, 0)} page problem(s); ` +
        `${blocked.length} non-GET request(s) aborted; ${seconds}s`,
    );
  }
  if (failedPages.length) {
    if (!AS_JSON) console.error(`[a11y-modes] FAILED on ${failedPages.length} of ${results.length} page renders`);
    process.exit(1);
  }
  if (!AS_JSON) console.log('[a11y-modes] OK: text holds its contrast floor in every mode');
})().catch((e) => {
  console.error('[a11y-modes] fatal:', e && e.stack ? e.stack : e);
  process.exit(2);
});
