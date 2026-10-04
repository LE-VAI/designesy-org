#!/usr/bin/env node
/**
 * Keyboard QA — the standing check for the nav, the drawer and Find.
 *
 * WHY THIS EXISTS
 * "Find never worked in production." The full-text search shipped dead: the
 * palette imported pagefind through a Vite comment (`/* @vite-ignore *\/`) while
 * Next 15.5 builds with webpack, which compiled it into an empty context module.
 * Every source check passed; every test passed; the build passed; the axe sweep
 * passed, because a search input that opens and looks right violates nothing.
 * Only pressing the keys and watching what happens finds it.
 *
 * The round-3 QA report (2026-10-04) specified eighteen runtime checks and
 * recorded that all twenty flows eventually passed. That verification was done
 * by hand, in one session, and nothing kept it. This is the part of it that can
 * run unattended, so the flows stay verified instead of staying remembered.
 *
 * WHAT IT ASSERTS (the flows that carry the most user-visible risk):
 *   A. Find opens by Ctrl+K and by '/', and the input takes focus.
 *   B. Find's pagefind bundle actually loads and returns a hit for a body-only
 *      term. This is the regression that shipped; a palette that opens and
 *      searches nothing must fail.
 *   C. The palette yields the drawer (the real overlay-stack contract): with
 *      the phone menu open, Ctrl+K closes it first, then opens the palette
 *      with focus in the field; one Escape closes the palette alone.
 *   D. The drawer closes on Escape and returns focus to its trigger.
 *   E. Tab stays inside the palette while it is open (focus containment).
 *   F. No scroll-lock leaks: after open/close cycles the page can scroll again.
 *
 * USAGE
 *   node scripts/qa-keyboard.js [--base http://127.0.0.1:3422] [--json] [--cdp URL]
 *
 * Two launch modes, same probe either way (the reasoning is visual-floor.js's,
 * and it applies identically here):
 *   --cdp <url>  connect to a running browser (local, any OS)
 *   (default)    launch the bundled Linux Chromium (CI)
 *
 * Exits 1 on any failed flow so it can gate CI. Exits 2 when it cannot measure.
 */

const BASE_ARG = (() => {
  const a = process.argv.slice(2);
  const i = a.indexOf('--base');
  return i !== -1 ? a[i + 1] : 'http://localhost:3422';
})();
const BASE = BASE_ARG.replace(/\/$/, '');
const AS_JSON = process.argv.includes('--json');
const CDP = (() => {
  const a = process.argv.slice(2);
  const i = a.indexOf('--cdp');
  return i !== -1 ? a[i + 1] : null;
})();

/** Desktop, and a phone for the drawer. The drawer only exists below 720px. */
const DESKTOP = { w: 1440, h: 900 };
const PHONE = { w: 390, h: 844 };

async function launch() {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e) {
    console.error('[kbd] playwright-core not installed');
    process.exit(2);
  }

  if (CDP) return { browser: await chromium.connectOverCDP(CDP), chromium, connected: true };

  let sparticuz;
  try {
    sparticuz = require('@sparticuz/chromium').default;
  } catch (e) {
    console.error(
      '[kbd] @sparticuz/chromium not installed. On a non-Linux host, pass ' +
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

  // Strip the serverless-only flags: they break Playwright's multi-process
  // protocol. See visual-floor.js for the measured failure this prevents.
  const SERVERLESS_ONLY = ['--single-process', '--no-zygote', '--in-process-gpu'];
  const args = sparticuz.args.filter((a) => !SERVERLESS_ONLY.some((bad) => a.includes(bad)));
  return { browser: await chromium.launch({ args, executablePath, headless: true }), chromium, connected: false };
}

/** A page at an exact viewport, with the override cleared on close.
 *
 * Two forces fight the override over connectOverCDP:
 *  1. Playwright re-applies its OWN viewport (the browser window's) after every
 *     navigation, stomping ours — so the override must be re-applied after each
 *     goto.
 *  2. A persistent browser zoom (Ctrl+-) interacts with setDeviceMetricsOverride:
 *     a request for W can land at W/zoom. The loop corrects dev by the observed
 *     ratio until the page reports the target — the pattern proven against this
 *     browser's own persistent zoom. */
async function newPage(browser, { w, h }, connected) {
  const ctx = (await browser.contexts())[0];
  const page = connected ? await ctx.newPage() : await browser.newPage();
  let session = null;
  if (connected) {
    session = await ctx.newCDPSession(page);
    const applyOverride = async () => {
      let dev = w;
      for (let i = 0; i < 5; i++) {
        // mobile:false on purpose. Chrome's mobile emulation freezes the LAYOUT
        // viewport at 980 until a document with a viewport meta loads, so an
        // override applied on about:blank can never converge (innerWidth stays
        // 980 or 980×zoom). The drawer is a CSS media query on width, not touch
        // emulation — a plain narrow viewport triggers it identically.
        await session.send('Emulation.setDeviceMetricsOverride', {
          width: dev, height: h, deviceScaleFactor: 1, mobile: false,
        });
        await page.waitForTimeout(350);
        const landed = await page.evaluate('window.innerWidth');
        if (Math.abs(landed - w) <= 2) return;
        dev = Math.max(120, Math.round(dev * (w / landed)));
      }
    };
    await applyOverride();
    // Re-apply after every navigation; Playwright stomps the override on load.
    const origGoto = page.goto.bind(page);
    page.goto = async (url, opts) => {
      const res = await origGoto(url, opts);
      await applyOverride();
      return res;
    };
  } else {
    await page.setViewportSize({ width: w, height: h });
  }
  return {
    page,
    async close() {
      if (session) await session.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
      await page.close().catch(() => {});
    },
  };
}

/** Refuse to report measurements taken at a viewport we did not ask for. */
async function assertViewport(page, want, route, findings) {
  const actual = await page.evaluate('window.innerWidth');
  if (Math.abs(actual - want) > 8) {
    findings.push({
      route,
      kind: 'viewport-mismatch',
      detail: `asked for ${want}px, page reports ${actual}px — refusing to report`,
    });
    return false;
  }
  return true;
}

const CHECKS = [];

/** A: Find opens by Ctrl+K and by '/', and the input takes focus. */
CHECKS.push({
  id: 'find-opens',
  async run(page, route, findings) {
    for (const [how, press] of [['Control+k', 'Control+k'], ['/', '/']]) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(900);
      await page.keyboard.press(press);
      await page.waitForTimeout(700);
      const state = await page.evaluate(`(() => {
        const panel = document.querySelector('.cmdk-panel');
        const input = document.querySelector('.cmdk-input');
        const open = !!panel && getComputedStyle(panel).display !== 'none' && panel.offsetParent !== null;
        return { open, focused: !!input && document.activeElement === input,
                 hasInput: !!input, hasPanel: !!panel };
      })()`);
      if (!state.hasPanel) {
        findings.push({ route, kind: 'find-opens', detail: `${how}: no .cmdk-panel in the DOM` });
      } else if (!state.open) {
        findings.push({ route, kind: 'find-opens', detail: `${how}: palette did not open` });
      } else if (!state.focused) {
        findings.push({ route, kind: 'find-opens', detail: `${how}: palette opened but the input does not hold focus` });
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  },
});

/**
 * B: Find's pagefind bundle loads and returns a hit for a body-only term.
 *
 * THIS IS THE REGRESSION THAT SHIPPED. A dead import produced a palette that
 * opens, accepts typing and silently returns nothing. Asserting "it opened" is
 * not enough; this asserts a result arrives.
 */
CHECKS.push({
  id: 'find-search-works',
  async run(page, route, findings) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(900);

    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });

    await page.keyboard.press('Control+k');
    await page.waitForTimeout(600);
    const input = await page.$('.cmdk-input');
    if (!input) {
      findings.push({ route, kind: 'find-search-works', detail: 'no .cmdk-input' });
      return;
    }
    // 'apca' appears in body copy and not in any heading, so a hit proves the
    // full-text index answered rather than a title match.
    await input.type('apca', { delay: 40 });

    let rows = 0;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(300);
      rows = await page.evaluate(`document.querySelectorAll('.cmdk-panel [role=option], .cmdk-panel li[data-value], .cmdk-panel .cmdk-row').length`);
      if (rows > 0) break;
    }

    const deadImport = consoleErrors.some((t) => /Cannot find module|pagefind/i.test(t));
    if (rows === 0) {
      findings.push({
        route,
        kind: 'find-search-works',
        detail:
          `typing "apca" produced 0 rows after 6s` +
          (deadImport ? ' (a pagefind/module console error is present — the dead-import regression)' : ''),
      });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  },
});

/** C: the palette yields the drawer — the real layering contract.
 *
 * The drawer does NOT sit open behind the palette. The overlay stack
 * (topbar.tsx:175-178, command-palette.tsx:47-48) makes Ctrl+K close the
 * phone menu first (onYield), then open the palette with focus in the field.
 * This asserts exactly that handoff, and that one Escape then closes the
 * palette without resurrecting the drawer or leaving the page locked. */
CHECKS.push({
  id: 'palette-yields-drawer',
  phoneOnly: true,
  async run(page, route, findings) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    // The drawer trigger, by its real selector (topbar.tsx:291).
    const trigger = await page.$('.nav-trigger');
    if (!trigger) return; // no drawer at this width; nothing to layer
    const visible = await page.evaluate(`(() => {
      const t = document.querySelector('.nav-trigger');
      return !!t && t.offsetParent !== null;
    })()`);
    if (!visible) return; // a width where the drawer does not exist

    await trigger.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);

    const drawerOpened = await page.evaluate(`(() => {
      const d = document.querySelector('.nav-drawer');
      return !!d && d.classList.contains('open');
    })()`);
    if (!drawerOpened) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: '.nav-trigger click did not open the drawer' });
      return;
    }

    // The handoff: Ctrl+K must close the drawer and open the palette.
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(800);
    const handedOff = await page.evaluate(`(() => {
      const d = document.querySelector('.nav-drawer');
      const p = document.querySelector('.cmdk-panel');
      const overlay = p ? p.closest('.cmdk-overlay') : null;
      const input = document.querySelector('.cmdk-input');
      // The overlay is position:fixed, so offsetParent is ALWAYS null for it
      // (the CSS spec gives fixed elements no offset parent). Visibility of
      // the fixed layer is: not inert, not display:none. The panel inside is
      // a normal-flow block, so its offsetParent does reflect visibility.
      const overlayShown = !!overlay && !overlay.hasAttribute('inert') &&
        getComputedStyle(overlay).display !== 'none';
      const panelShown = !!p && p.offsetParent !== null;
      return {
        drawerClosed: !!d && !d.classList.contains('open'),
        paletteOpen: overlayShown && panelShown,
        inputFocused: !!input && document.activeElement === input,
      };
    })()`);

    if (!handedOff.drawerClosed) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: 'Ctrl+K did not close the drawer before opening the palette' });
    }
    if (!handedOff.paletteOpen) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: 'palette did not open after the drawer yielded' });
      return;
    }
    if (!handedOff.inputFocused) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: 'palette opened but the input does not hold focus' });
    }

    // One Escape: palette closes, the drawer stays closed, nothing locks.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    const after = await page.evaluate(`(() => {
      const d = document.querySelector('.nav-drawer');
      const p = document.querySelector('.cmdk-panel');
      const overlay = p ? p.closest('.cmdk-overlay') : null;
      // Same visibility rule as the handoff read: the fixed overlay's
      // offsetParent is meaningless; the panel's is not.
      const overlayShown = !!overlay && !overlay.hasAttribute('inert') &&
        getComputedStyle(overlay).display !== 'none';
      return {
        paletteOpen: overlayShown && !!p && p.offsetParent !== null,
        drawerOpen: !!d && d.classList.contains('open'),
        scrollLocked: document.documentElement.hasAttribute('data-scroll-lock'),
        focusInPalette: !!overlay && overlay.contains(document.activeElement),
      };
    })()`);
    if (after.paletteOpen) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: 'Escape did not close the palette' });
    }
    if (after.drawerOpen) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: 'Escape reopened the yielded drawer' });
    }
    if (after.scrollLocked) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: 'scroll lock left behind after the palette closed' });
    }
    if (after.focusInPalette) {
      findings.push({ route, kind: 'palette-yields-drawer', detail: 'focus stayed in the closed palette' });
    }
  },
});

/** D: the drawer closes on Escape and returns focus to its trigger. */
CHECKS.push({
  id: 'drawer-escape',
  phoneOnly: true,
  async run(page, route, findings) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    const trigger = await page.$('.nav-trigger');
    if (!trigger) return;
    const visible = await page.evaluate(`(() => {
      const t = document.querySelector('.nav-trigger');
      return !!t && t.offsetParent !== null;
    })()`);
    if (!visible) return;

    await trigger.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);

    const opened = await page.evaluate(`(() => {
      const d = document.querySelector('.nav-drawer');
      return { open: !!d && d.classList.contains('open'),
               focusInside: !!d && d.contains(document.activeElement) };
    })()`);
    if (!opened.open) {
      findings.push({ route, kind: 'drawer-escape', detail: '.nav-trigger click did not open the drawer' });
      return;
    }
    if (!opened.focusInside) {
      findings.push({ route, kind: 'drawer-escape', detail: 'focus did not move into the open drawer' });
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    const after = await page.evaluate(`(() => {
      const d = document.querySelector('.nav-drawer');
      const t = document.querySelector('.nav-trigger');
      const before = window.scrollY;
      window.scrollBy(0, 60);
      return {
        closed: !!d && !d.classList.contains('open'),
        focusOnTrigger: !!t && document.activeElement === t,
        scrollLocked: document.documentElement.hasAttribute('data-scroll-lock'),
        scrolled: window.scrollY !== before,
      };
    })()`);
    if (!after.closed) {
      findings.push({ route, kind: 'drawer-escape', detail: 'Escape did not close the drawer' });
    }
    if (!after.focusOnTrigger) {
      findings.push({ route, kind: 'drawer-escape', detail: 'focus did not return to the trigger after Escape' });
    }
    if (after.scrollLocked || !after.scrolled) {
      findings.push({ route, kind: 'drawer-escape', detail: 'the page cannot scroll after the drawer closed' });
    }
  },
});

/** E: Tab stays inside the palette while it is open. */
CHECKS.push({
  id: 'focus-contained',
  async run(page, route, findings) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(900);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(700);
    const open = await page.evaluate(`(() => { const p = document.querySelector('.cmdk-panel'); return !!p && p.offsetParent !== null; })()`);
    if (!open) {
      findings.push({ route, kind: 'focus-contained', detail: 'palette did not open' });
      return;
    }
    let escaped = false;
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(160);
      const inside = await page.evaluate(`(() => {
        const p = document.querySelector('.cmdk-panel');
        const overlay = document.querySelector('.cmdk-overlay');
        const a = document.activeElement;
        return !!a && (p.contains(a) || (overlay && overlay.contains(a)));
      })()`);
      if (!inside) { escaped = true; break; }
    }
    if (escaped) {
      findings.push({ route, kind: 'focus-contained', detail: 'Tab left the palette while it was open' });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  },
});

/** F: no scroll-lock leak across open/close cycles.
 *
 * NOTE ON `inert`: the palette deliberately stays MOUNTED and inert while
 * closed, so that its 120ms exit can paint (command-palette.tsx:1037). An inert
 * element remaining under body is therefore the design, not a leak. What a leak
 * actually looks like is the scroll lock surviving, or the page becoming
 * unscrollable, so those are what this asserts. */
CHECKS.push({
  id: 'no-lock-leak',
  async run(page, route, findings) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(900);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    const state = await page.evaluate(`(() => {
      const before = window.scrollY;
      window.scrollBy(0, 60);
      return {
        locked: document.documentElement.hasAttribute('data-scroll-lock'),
        scrolled: window.scrollY !== before,
        // Only a closed-but-FOCUSABLE palette would be a real leak, and inert
        // removes focusability, so this is the assertion that matters.
        reachablePalette: (() => {
          const p = document.querySelector('.cmdk-panel');
          if (!p || p.offsetParent === null) return false;
          const overlay = p.closest('.cmdk-overlay');
          return !!overlay && !overlay.hasAttribute('inert');
        })(),
      };
    })()`);
    if (state.locked) {
      findings.push({ route, kind: 'no-lock-leak', detail: 'data-scroll-lock remains after 3 open/close cycles' });
    }
    if (!state.scrolled) {
      findings.push({ route, kind: 'no-lock-leak', detail: 'the page cannot scroll after the palette cycles' });
    }
    if (state.reachablePalette) {
      findings.push({ route, kind: 'no-lock-leak', detail: 'a closed palette is still reachable by focus' });
    }
  },
});

(async () => {
  const { browser, connected } = await launch();
  const findings = [];
  let checksRun = 0;

  try {
    for (const check of CHECKS) {
      // Desktop for the keyboard flows; the drawer check is phone-only (the
      // trigger is display:none above 720px, so desktop has no layers to test).
      const sizes = check.phoneOnly ? [PHONE] : [DESKTOP];
      for (const size of sizes) {
        const { page, close } = await newPage(browser, size, connected);
        const route = BASE + '/';
        try {
          checksRun++;
          const ok = await assertViewport(page, size.w, route, findings);
          if (ok) await check.run(page, route, findings);
        } catch (e) {
          findings.push({ route, kind: check.id, detail: `threw: ${String(e).slice(0, 180)}` });
        } finally {
          await close();
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const failed = findings.length;
  if (AS_JSON) {
    console.log(JSON.stringify({ base: BASE, checksRun, findings }, null, 2));
  } else {
    console.log(`[kbd] ${checksRun} flow(s) run against ${BASE}`);
    for (const f of findings) {
      console.log(`  ✗ ${f.kind}  ${f.route}\n      ${f.detail}`);
    }
    console.log(failed ? `[kbd] ${failed} finding(s)` : '[kbd] OK — every keyboard flow holds');
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('[kbd] fatal:', String(e).slice(0, 300));
  process.exit(2);
});
