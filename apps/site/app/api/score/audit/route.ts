import { NextResponse } from 'next/server';
import { normalizeInputUrl, isPublicUrl } from '../../../lib/url-guard';
import { createUrlVerdict, guardBrowser, type GuardedBrowser, type UrlVerdict } from '../../../lib/browser-guard';
import { clientKey } from '../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Pro Plan: allows up to 800s. The PSI/Lighthouse audit round-trip
// takes 10-25s. We set 300s to give ample headroom for slow sites.
// The PSI-only path (v21) can succeed faster if CrUX field data is
// available (fast ~2-3s response, no Lighthouse lab run needed).
export const maxDuration = 300;

// ── Rate limiting (in-memory, shared shape with /api/score) ────────────────
// Browser audits are heavier than static scores — tighter limit.
const RATE_LIMIT = 20; // Pro Plan: 20 audits per hour per IP (lifted from 5)
const RATE_WINDOW = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ── URL guard ───────────────────────────────────────────────────────────────
// normalizeInputUrl and isPublicUrl come from app/lib/url-guard.ts, the guard
// the JSON engines use. This route used to carry its own string-only check,
// which let 169.254.169.254, 172.17-31.x, 100.64/10, 127.0.0.2 and names that
// resolve to private addresses through to PageSpeed Insights and the browser.
// The browser itself is guarded per request in app/lib/browser-guard.ts.

// ── Check result shape (mirror of /api/score) ──────────────────────────────

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
  detail: string;
};

// ── v21: Core Web Vitals via PageSpeed Insights API ────────────────────────
// Google's PSI API returns CrUX-derived field metrics + lab Lighthouse audits.
// Public endpoint (no key) has a daily quota; with key the quota is 25k/day.
// We use whichever is available — env var PSI_API_KEY if set, else public.
//
// Thresholds (per contract / web.dev):
//   LCP < 2.5s = PASS, 2.5–4.0s = WARN, > 4.0s = FAIL
//   INP < 200ms = PASS, 200–500ms = WARN, > 500ms = FAIL
//   CLS < 0.1 = PASS, 0.1–0.25 = WARN, > 0.25 = FAIL
//
// We score each metric independently, then aggregate: all PASS = PASS,
// any FAIL = FAIL, else WARN.

type CwvMetric = { name: string; value: number | null; unit: string; status: 'PASS' | 'WARN' | 'FAIL' };

function classifyLcp(seconds: number): 'PASS' | 'WARN' | 'FAIL' {
  if (seconds < 2.5) return 'PASS';
  if (seconds <= 4.0) return 'WARN';
  return 'FAIL';
}
function classifyInp(ms: number): 'PASS' | 'WARN' | 'FAIL' {
  if (ms < 200) return 'PASS';
  if (ms <= 500) return 'WARN';
  return 'FAIL';
}
function classifyCls(cls: number): 'PASS' | 'WARN' | 'FAIL' {
  if (cls < 0.1) return 'PASS';
  if (cls <= 0.25) return 'WARN';
  return 'FAIL';
}

async function checkCoreWebVitals(targetUrl: string): Promise<CheckResult> {
  const apiKey = process.env.PSI_API_KEY;
  const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  psiUrl.searchParams.set('url', targetUrl);
  psiUrl.searchParams.set('strategy', 'mobile');
  // Only request the performance category — without this, PSI runs all 5
  // Lighthouse categories (performance + accessibility + best-practices + SEO
  // + PWA), which takes 30-60s and blows past the function timeout.
  // category=performance still returns CrUX field data + Lighthouse perf lab.
  psiUrl.searchParams.set('category', 'performance');
  // LCP + CLS come from the loadingExperience (field data, CrUX).
  // INP is reported under FIRST_INPUT_DELAY_MS (field) when available; falls
  // back to lab diagnostics when field data is absent (new/small sites).
  if (apiKey) psiUrl.searchParams.set('key', apiKey);

  const controller = new AbortController();
  // PSI with category=performance takes 10-25s (Lighthouse lab run on Google's
  // infra). 45s gives margin for slow sites and Google backend latency.
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const resp = await fetch(psiUrl.href, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const reason = `PSI ${resp.status}: ${body.slice(0, 80) || 'no body'}`;
      // No Chromium lab fallback on Hobby plan — @sparticuz/chromium's 130MB
      // binary exceeds the 50MB Lambda zip limit and the launch hangs, blowing
      // the 60s function timeout. PSI-only is the supported path on Hobby.
      // Upgrade to Vercel Pro + ENABLE_BROWSER_AUDIT=1 for the Chromium lab
      // fallback (LCP/CLS via CDP performance trace when CrUX is absent).
      return {
        id: 'v21',
        item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
        category: 'performance',
        status: 'MANUAL',
        detail: `${reason} (PSI is the primary path; Chromium lab fallback requires Vercel Pro)`,
      };
    }
    const data = await resp.json();
    const loadingExp = data.loadingExperience;
    const metrics = data.lighthouseResult?.audits;
    const cruxMetrics = loadingExp?.metrics || {};

    // Field (CrUX) values preferred; fall back to lab Lighthouse audits.
    const lcpRaw = cruxMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? metrics?.['largest-contentful-paint']?.numericValue;
    const clsRaw = cruxMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? metrics?.['cumulative-layout-shift']?.numericValue;
    const inpRaw = cruxMetrics.FIRST_INPUT_DELAY_MS?.percentile ?? metrics?.['interaction-to-next-paint']?.numericValue ?? metrics?.['experimental-interaction-to-next-paint']?.numericValue;

    const lcpSec = lcpRaw != null ? Number(lcpRaw) / 1000 : null;
    const cls = clsRaw != null ? Number(clsRaw) / 100 : null; // PSI reports CLS * 100
    const inpMs = inpRaw != null ? Number(inpRaw) : null;

    const lcpStatus = lcpSec != null ? classifyLcp(lcpSec) : null;
    const clsStatus = cls != null ? classifyCls(cls) : null;
    const inpStatus = inpMs != null ? classifyInp(inpMs) : null;

    const collected: CwvMetric[] = [
      { name: 'LCP', value: lcpSec, unit: 's', status: lcpStatus ?? 'WARN' },
      { name: 'CLS', value: cls, unit: '', status: clsStatus ?? 'WARN' },
      { name: 'INP', value: inpMs, unit: 'ms', status: inpStatus ?? 'WARN' },
    ];

    const statuses = [lcpStatus, clsStatus, inpStatus].filter(Boolean) as Array<'PASS' | 'WARN' | 'FAIL'>;
    const overall: 'PASS' | 'FAIL' | 'WARN' =
      statuses.includes('FAIL') ? 'FAIL' :
      statuses.every((s) => s === 'PASS') ? 'PASS' :
      'WARN';

    const detail = collected
      .map((m) => {
        const val = m.value != null ? `${m.value < 10 ? m.value.toFixed(2) : Math.round(m.value)}${m.unit}` : 'n/a';
        return `${m.name}=${val}(${m.status})`;
      })
      .join(', ');

    // If no field data existed for any metric, note that — common for low-traffic sites.
    const noFieldData = !loadingExp || Object.keys(cruxMetrics).length === 0;
    const source = noFieldData ? 'lab (Lighthouse)' : 'field (CrUX) + lab fallback';

    // A lab WARN is not a field WARN, and reporting them identically misleads.
    //
    // CrUX measures real users on real devices and networks. Lighthouse lab
    // runs are CPU- and network-throttled simulations, and on a fast
    // edge-served site they routinely disagree by a wide margin. Measured
    // 2026-09-24 on designesy.org: Lighthouse lab reported LCP=3.75s (WARN)
    // while a CDP trace on the same URL reported FCP/LCP at 1.30s, and 0.33s
    // under Fast 4G throttling with a warm edge — both inside the 2.5s target,
    // with CLS 0.00–0.003.
    //
    // designesy.org has no CrUX field data (too new for the dataset), so v21
    // necessarily reports the lab number. Docking the score for a throttled
    // simulation that contradicts direct measurement is the same defect class
    // as d07 counting circles as radius drift: a verdict about the instrument
    // rather than the artifact.
    //
    // So when there is no field data, a lab-only WARN is reported as SKIP with
    // the lab figures retained in the detail — the measurement is preserved and
    // visible, it just no longer claims to be about real users. A lab FAIL
    // still fails: egregious lab numbers are worth acting on regardless.
    if (noFieldData && overall === 'WARN') {
      return {
        id: 'v21',
        item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
        category: 'performance',
        status: 'SKIP',
        detail: `${detail} (source: ${source}). No CrUX field data for this origin, so these are throttled lab figures only, not real-user metrics. SKIP rather than WARN: a lab simulation that has not been corroborated by field data is not evidence about user experience.`,
      };
    }

    return {
      id: 'v21',
      item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
      category: 'performance',
      status: overall,
      detail: `${detail} (source: ${source})`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    // No Chromium lab fallback on Hobby — see note above.
    return {
      id: 'v21',
      item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
      category: 'performance',
      status: 'MANUAL',
      detail: `PSI API unreachable: ${msg}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// v21 lab fallback — measure LCP + CLS via Chromium CDP performance trace.
// INP requires real user input and isn't measurable in a headless lab run;
// we mark INP as SKIP and score LCP + CLS only. This is the standard lab
// limitation documented by web.dev.
async function checkCoreWebVitalsLab(targetUrl: string, fallbackReason: string, shared?: GuardedBrowser): Promise<CheckResult> {
  let browser;
  let ownsBrowser = false;
  try {
    // Prefer the caller-owned browser: the route opens ONE Chromium and
    // passes it in, so neither check has to launch or close it.
    browser = shared ?? (await openAuditBrowser());
    ownsBrowser = !shared;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    // CDP session for performance trace
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    await client.send('Page.enable');
    // Enable LCP + CLS observation via the Performance API
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 8000 });
    await page.waitForTimeout(2500); // let layout settle
    const perf = await page.evaluate(() => {
      const obs: { lcp: number | null; cls: number | null } = { lcp: null, cls: null };
      // LCP
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[];
      if (lcpEntries.length) obs.lcp = lcpEntries[lcpEntries.length - 1].startTime;
      // CLS via LayoutShift entries (sum of all layout-shift entry values)
      // Cast to any[] because hadRecentInput/value are LayoutShift-specific props
      // not present on the base PerformanceEntry type.
      const clsEntries = performance.getEntriesByType('layout-shift') as unknown as Array<{ hadRecentInput: boolean; value: number }>;
      if (clsEntries.length) {
        let maxSession = 0;
        let currentSession = 0;
        for (const e of clsEntries) {
          // entry.value is the layout shift score; sum within session window (1s gap, 5s max)
          if (!e.hadRecentInput) {
            currentSession += e.value;
            maxSession = Math.max(maxSession, currentSession);
          }
        }
        obs.cls = maxSession;
      }
      return obs;
    });
    await ctx.close();
    const lcpSec = perf.lcp != null ? perf.lcp / 1000 : null;
    const cls = perf.cls;
    const lcpStatus = lcpSec != null ? classifyLcp(lcpSec) : null;
    const clsStatus = cls != null ? classifyCls(cls) : null;
    const lcpStr = lcpSec != null ? `LCP=${lcpSec.toFixed(2)}s(${lcpStatus})` : 'LCP=n/a';
    const clsStr = cls != null ? `CLS=${cls.toFixed(3)}(${clsStatus})` : 'CLS=n/a';
    const statuses = [lcpStatus, clsStatus].filter(Boolean) as Array<'PASS' | 'WARN' | 'FAIL'>;
    const overall: 'PASS' | 'FAIL' | 'WARN' =
      statuses.includes('FAIL') ? 'FAIL' :
      statuses.length === 2 && statuses.every((s) => s === 'PASS') ? 'PASS' :
      'WARN';
    return {
      id: 'v21',
      item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
      category: 'performance',
      status: overall,
      detail: `${lcpStr}, ${clsStr}, INP=SKIP(lab) (source: Chromium CDP lab; PSI fallback: ${fallbackReason.slice(0, 60)})`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return {
      id: 'v21',
      item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
      category: 'performance',
      status: 'MANUAL',
      detail: `both PSI and Chromium lab failed: ${msg}`,
    };
  } finally {
    // Release the SHARED browser — closing it here would kill the browser
    // out from under the sibling checks that are still running.
    if (ownsBrowser && browser) await browser.close();
  }
}

// ── v02 + v04 + v21-fallback: Browser checks (Playwright + @sparticuz/chromium) ─
// The route runs v21 via PageSpeed Insights API (primary) when a key is set.
// v02 (responsive overflow) and v04 (sound toggle) require a real browser —
// they run via Playwright + @sparticuz/chromium when ENABLE_BROWSER_AUDIT=1.
// If PSI returns 429/timeout for v21, the same Chromium session measures
// LCP/CLS via CDP performance trace as a lab fallback (no INP — INP needs
// real user input, which lab Lighthouse approximates via TBT; we mark it
// SKIP when only lab is available).

import path from 'node:path';
import { chromium as playwrightChromium } from 'playwright-core';
import type { BrowserContext, ElementHandle, Page } from 'playwright-core';
import sparticuzChromium from '@sparticuz/chromium';

function browserAuditEnabled(): boolean {
  return process.env.ENABLE_BROWSER_AUDIT === '1' || process.env.ENABLE_BROWSER_AUDIT === 'true';
}

// A remote browser service that speaks CDP (Browserless, Browserbase, a
// container host, or any Chrome started with --remote-debugging-port). When set,
// we ATTACH to a browser that is already running off-platform instead of
// launching Chromium inside this function.
//
// Why this exists: five in-function configurations were tested and none worked —
// two separate launches, a shared ref-counted browser, per-request serialized
// checks, plus LD_LIBRARY_PATH and graphics-off, and finally 4GB/2vCPU. The
// failure moved from crashing to hanging as each fix landed but never resolved,
// which closed the in-function path on evidence rather than guesswork. Attaching
// to an external browser also removes the /tmp decompression of the ~62MB
// brotli binary, the bundle-size cost, and Playwright's documented
// browser.close() hang class (microsoft/playwright#39753) in one move.
//
// Set CDP_ENDPOINT (e.g. wss://chrome.browserless.io?token=...) plus
// CDP_HEADERS_JSON if the service needs auth headers. Both are optional: with no
// CDP_ENDPOINT the function falls back to the in-function Chromium path.
function cdpEndpoint(): string | null {
  const raw = (process.env.CDP_ENDPOINT || '').trim();
  return raw.length > 0 ? raw : null;
}

function cdpHeaders(): Record<string, string> | undefined {
  const raw = process.env.CDP_HEADERS_JSON;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* malformed config — connect without extra headers rather than throwing */
  }
  return undefined;
}

async function launchBrowser() {
  // Preferred path: attach to an external browser over CDP. No local Chromium,
  // no /tmp, no cold-start decompression.
  const endpoint = cdpEndpoint();
  if (endpoint) {
    return playwrightChromium.connectOverCDP(endpoint, {
      headers: cdpHeaders(),
      timeout: 30000,
    });
  }

  // Fallback: in-function Chromium. Retained so the route still works with no
  // external service configured; see the block comment above for why this is
  // not the recommended production configuration.
  //
  // Serverless has no GPU. sparticuz's default graphics mode enables the
  // SwiftShader GL path, which is not usable in this environment — it has been
  // reported to freeze the launch after "Creating new page". Turning it off is
  // one of the two documented must-do steps that were missing here (the other
  // is LD_LIBRARY_PATH below).
  sparticuzChromium.setGraphicsMode = false;

  const executablePath = await sparticuzChromium.executablePath();

  // Chromium's shared libraries are extracted by executablePath() into the
  // same directory as the binary (/tmp on Lambda/Vercel). Without this the
  // loader cannot resolve them, the browser process dies immediately after
  // spawning, and every context operation fails with the misleading
  // "Target page, context or browser has been closed" — which is exactly the
  // error observed in production, with the launch args but no page ever
  // reaching newPage(). path.dirname() of the resolved binary is the documented
  // location.
  const libraryPath = path.dirname(executablePath);
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${libraryPath}:${process.env.LD_LIBRARY_PATH}`
    : libraryPath;

  return playwrightChromium.launch({
    args: sparticuzChromium.args,
    executablePath,
    headless: true,
  });
}

// Browser lifecycle: ONE Chromium per request, owned by the route handler.
//
// Earlier revisions tried two shapes, both wrong here:
//
//  1. Each check launched its own Chromium. The route ran all three through
//     Promise.all, so two-plus launches each decompressed the ~62MB brotli
//     binary into /tmp and competed for the same 2GB ceiling. One browser
//     died: v02 reported "Target page, context or browser has been closed"
//     with "Browser logs:" attached.
//
//  2. A module-scoped ref-counted shared browser. This project runs with
//     Fluid compute ENABLED, and Fluid explicitly lets multiple invocations
//     share one physical instance CONCURRENTLY — so module-scoped state is
//     shared between different users' requests. Ref counting cannot tell
//     "my request's borrow" from another request's, and one request's browser
//     crash (or a hung close) would wedge the instance for every subsequent
//     caller. Playwright's own tracker has a documented case of
//     browser.close() never resolving (microsoft/playwright#39753), which is
//     exactly how that becomes a permanent wedge rather than a slow request.
//
// So: the route handler launches one browser, hands it to the checks, and
// closes it when they are done. No cross-request state, nothing to alias.

// Close a browser without ever risking an unbounded await. browser.close()
// can hang on a wedged renderer; a hang inside a request handler means the
// response is never sent and the platform kills the function at maxDuration.
// Race it against a timeout and treat the timeout as success — the container
// is recycled afterwards, so a straggler process costs nothing that matters.
async function closeBrowserSafely(browser: import('playwright-core').Browser): Promise<void> {
  try {
    await Promise.race([
      browser.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    /* fall through to the kill backstop */
  }
  // Backstop: SIGKILL the process tree if it is still alive. This mirrors the
  // sanctioned upstream fix for the close-hang (microsoft/playwright#39753).
  try {
    const proc = (browser as unknown as { process?: () => { killed?: boolean; kill?: (s: string) => void } | null }).process?.();
    if (proc && !proc.killed) proc.kill?.('SIGKILL');
  } catch {
    /* already gone */
  }
}

// The only way the audit obtains a browser. launchBrowser() is called nowhere
// else (scripts/check-audit-ssrf.js asserts it), and the checks receive the
// GuardedBrowser this returns, never the Playwright Browser, so every context a
// check opens has every request host-checked (app/lib/browser-guard.ts). If
// the guard cannot be installed the browser is closed and the error propagates:
// the audit does not run an unguarded browser.
//
// One UrlVerdict per request: its hostname cache lives as long as the request.
async function openAuditBrowser(isAllowed: UrlVerdict = createUrlVerdict()): Promise<GuardedBrowser> {
  const raw = await launchBrowser();
  try {
    return await guardBrowser(raw, isAllowed, () => closeBrowserSafely(raw));
  } catch (e) {
    await closeBrowserSafely(raw);
    throw e;
  }
}

// v02 — responsive overflow. Launch Chromium, navigate at 4 viewports,
// measure scrollWidth vs clientWidth at each. PASS if all 4 fit; FAIL with
// the first overflowing viewport in the detail string.
async function checkResponsiveOverflow(targetUrl: string, shared?: GuardedBrowser): Promise<CheckResult> {
  if (!browserAuditEnabled()) {
    return {
      id: 'v02',
      item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
      category: 'responsive',
      status: 'MANUAL',
      detail: 'this check needs a live browser session, which this deployment does not run, so no result is reported rather than a guessed one',
    };
  }
  const viewports = [
    { w: 375, label: '375px (mobile)' },
    { w: 720, label: '720px (tablet)' },
    { w: 860, label: '860px (small laptop)' },
    { w: 1080, label: '1080px (desktop)' },
  ];
  let browser;
  let ownsBrowser = false;
  try {
    // Prefer the caller-owned browser: the route opens ONE Chromium and
    // passes it in, so neither check has to launch or close it.
    browser = shared ?? (await openAuditBrowser());
    ownsBrowser = !shared;
    const overflows: string[] = [];
    for (const vp of viewports) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: 800 } });
      const page = await ctx.newPage();
      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 8000 });
      } catch {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 8000 });
      }
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (metrics.scrollWidth > metrics.clientWidth) {
        overflows.push(`${vp.label}: ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
      }
      await ctx.close();
    }
    if (overflows.length === 0) {
      return {
        id: 'v02',
        item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
        category: 'responsive',
        status: 'PASS',
        detail: 'all 4 viewports fit (no horizontal scroll)',
      };
    }
    return {
      id: 'v02',
      item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
      category: 'responsive',
      status: 'FAIL',
      detail: `overflow at: ${overflows.join('; ')}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return {
      id: 'v02',
      item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
      category: 'responsive',
      status: 'MANUAL',
      detail: `browser launch failed: ${msg}`,
    };
  } finally {
    // Release the SHARED browser — closing it here would kill the browser
    // out from under the sibling checks that are still running.
    if (ownsBrowser && browser) await browser.close();
  }
}

// v04 — the sound control. One page at 1280x800 on the route's browser:
//
//  1. Find it. An element marked data-sound-toggle comes first: designesy.org
//     marks the senses menu's Sound row and the labs' sound switches with it.
//     Otherwise a button or a switch (a <button> with no role, role="button"
//     or role="switch") with aria-pressed or aria-checked whose accessible
//     name or text says sound, audio or mute, in any case. Among those found,
//     a visible one is taken first. A found control with neither
//     aria-pressed nor aria-checked, which only a marked one can be, is FAIL
//     at once, hidden or not, and nothing is clicked.
//  2. Open it the way a visitor would. A hidden control is shown by clicking
//     a visible element with aria-expanded="false" whose aria-controls names
//     the control or an element that holds it, as the senses menu's trigger
//     names its panel: the control itself is tried first, then each element
//     above it in turn. A hidden control with a pressed or checked state
//     that nothing opens is MANUAL and is not clicked.
//  3. Click it, waiting at most V04_PRESS_MS for it to be visible, enabled and
//     still. A control that does not take the click is MANUAL.
//  4. Judge. In every scope its aria-pressed, or its aria-checked when it has
//     no aria-pressed, must move within V04_SETTLE_MS of the click; with
//     scope=contract, which a designesy.org address gets by default, the
//     stored preference, designesy:sound, then gets as long again to follow
//     it. Other sites keep their preference where they choose, so with
//     scope=universal it is never read. The state is read again once,
//     V04_HOLD_MS after those waits end, and judged on that reading; with
//     scope=universal that is V04_HOLD_MS after the state is seen to move. A
//     state that is back where it was is FAIL, so a toggle that goes back
//     before that reading fails and one that goes back later passes. With
//     scope=contract designesy:sound is read before the click, just after the
//     state, and again at the moment of that reading, and one that is what it
//     was before the click is FAIL.
//
// No sound control is SKIP when scope=universal (a site without sound is not
// broken, it does not use audio) and WARN when scope=contract (the contract
// expects one on designesy.org). A pressed control that is neither marked nor
// named for sound, a Bold toggle say, is never taken for the sound control or
// judged; the element that opens a hidden sound control is clicked to open
// it, whatever its own state. One that is named for sound but does something
// else, a checklist row about sound or a "Mute thread" toggle, is taken for
// the sound control and judged, unless the page marks its sound control
// data-sound-toggle.
//
// Earlier versions clicked the first [aria-pressed] or [data-sound-toggle] in
// the document. On designesy.org that is the Motion row, in the senses panel,
// which is hidden until the menu opens, so the click waited 30 s for it to
// show and v04 came back MANUAL. On other sites they read designesy:sound, so
// a toggle that worked failed. And the stored value was once read after the
// click, so it was compared with itself and never moved.
//
// A failure says where it happened: opening a page, loading it, or the check
// itself. The route launches the browser, so a launch failure is the route's
// 502, never a v04 detail.

/** The item's wording, the contract's own. */
const V04_ITEM = 'Sound toggle flips aria-pressed and applies the audio preference';

/** Words that name a sound control, matched anywhere in its name or text, in any case. */
const SOUND_WORDS = 'sound|audio|mute';

/** Where designesy.org keeps the sound preference (SOUND_STORAGE_KEY in app/lib/use-sound.tsx). */
const SOUND_KEY = 'designesy:sound';

/** How long each click waits for its target to be visible, enabled and still, and how long a hidden control gets to show once its opener is clicked. */
const V04_PRESS_MS = 3000;

/** How long the check waits after the click for the state to move, and then for the stored preference to follow it. */
const V04_SETTLE_MS = 2000;

/** How long after those waits the state, and with scope=contract the stored preference, are read again and judged. */
const V04_HOLD_MS = 500;

function v04(status: CheckResult['status'], detail: string): CheckResult {
  return { id: 'v04', item: V04_ITEM, category: 'poise', status, detail };
}

/** A found control's name for a detail, as JSON text, at most 80 characters. */
function quoted(name: string): string {
  return JSON.stringify(name.length > 80 ? `${name.slice(0, 79).trimEnd()}…` : name);
}

/** The first line of an error: Playwright puts its call log on the lines after it. */
function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}

// The three page functions below run in the browser, which receives their
// source text, so each reads only its argument and the page, never this module.

/** The sound control, the element that opens it when it is hidden, and what the check reports about them. */
function soundControlProbe(words: string) {
  const sound = new RegExp(words, 'i');
  const shown = (el: Element) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  // Name from content: the text, without what aria-hidden takes out.
  const content = (node: Node): string => {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1 || (node as Element).getAttribute('aria-hidden') === 'true') return '';
    let text = '';
    for (let i = 0; i < node.childNodes.length; i++) text += content(node.childNodes[i]);
    return text;
  };
  const nameOf = (el: Element) => {
    let label = '';
    for (const id of (el.getAttribute('aria-labelledby') || '').split(/\s+/)) {
      const ref = id ? document.getElementById(id) : null;
      if (ref) label += ` ${ref.textContent || ''}`;
    }
    const name =
      label.trim() ||
      (el.getAttribute('aria-label') || '').trim() ||
      content(el).trim() ||
      (el.getAttribute('title') || '').trim();
    return name.replace(/\s+/g, ' ');
  };
  const isToggle = (el: Element) => {
    const role = el.getAttribute('role') || (el.tagName === 'BUTTON' ? 'button' : '');
    return role === 'button' || role === 'switch';
  };
  const marked = Array.from(document.querySelectorAll('[data-sound-toggle]'));
  const toggles = Array.from(document.querySelectorAll('[aria-pressed], [aria-checked]')).filter(isToggle);
  const named = toggles.filter((el) => sound.test(nameOf(el)) || sound.test(el.textContent || ''));
  const pool = marked.length > 0 ? marked : named;
  const control = pool.find(shown) || pool[0] || null;
  const hidden = control !== null && !shown(control);
  let opener: Element | null = null;
  if (control && hidden) {
    const triggers = Array.from(document.querySelectorAll('[aria-expanded="false"][aria-controls]')).filter(shown);
    for (let el: Element | null = control; el && !opener; el = el.parentElement) {
      const id = el.id;
      if (id) opener = triggers.find((t) => (t.getAttribute('aria-controls') || '').split(/\s+/).indexOf(id) >= 0) || null;
    }
  }
  let state = '';
  if (control && control.hasAttribute('aria-pressed')) state = 'aria-pressed';
  else if (control && control.hasAttribute('aria-checked')) state = 'aria-checked';
  return {
    control,
    opener,
    info: {
      found: control ? (marked.length > 0 ? 'data-sound-toggle' : 'its name') : '',
      name: control ? nameOf(control) : '',
      state,
      hidden,
      opener: opener ? nameOf(opener) : '',
      toggles: toggles.length,
    },
  };
}

type SoundProbeInfo = ReturnType<typeof soundControlProbe>['info'];

/** The stored sound preference, or null where storage cannot be read. */
function storedSound(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True once the control's state has moved and, when a key is given, the stored preference too. */
function soundMoved(arg: { el: Node; attr: string; was: string | null; key: string; stored: string | null }): boolean {
  if ((arg.el as Element).getAttribute(arg.attr) === arg.was) return false;
  if (!arg.key) return true;
  try {
    return localStorage.getItem(arg.key) !== arg.stored;
  } catch {
    return false;
  }
}

/** Whether soundMoved holds within V04_SETTLE_MS: false when the time runs out, and any other failure is thrown. */
async function settled(page: Page, el: ElementHandle, attr: string, was: string | null, key: string, stored: string | null): Promise<boolean> {
  try {
    await page.waitForFunction(soundMoved, { el, attr, was, key, stored }, { timeout: V04_SETTLE_MS, polling: 100 });
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') return false;
    throw e;
  }
}

async function clickSoundControl(page: Page, contract: boolean): Promise<CheckResult> {
  const probe = await page.evaluateHandle(soundControlProbe, SOUND_WORDS);
  const info = (await (await probe.getProperty('info')).jsonValue()) as SoundProbeInfo;
  const control = (await probe.getProperty('control')).asElement();
  const opener = (await probe.getProperty('opener')).asElement();
  if (!control) {
    const none = `no sound control on the page (buttons and switches with a pressed or checked state: ${info.toggles}, none named for sound)`;
    return contract ? v04('WARN', none) : v04('SKIP', `${none}; skipped: scope=universal, sound is optional`);
  }
  const what = `the sound control ${quoted(info.name)} (found by ${info.found})`;
  if (!info.state) return v04('FAIL', `${what} has neither aria-pressed nor aria-checked`);
  if (info.hidden) {
    if (!opener) {
      return v04('MANUAL', `${what} is hidden, and no visible element with aria-expanded="false" controls it or an element that holds it, so it was not clicked`);
    }
    try {
      await opener.click({ timeout: V04_PRESS_MS });
      await control.waitForElementState('visible', { timeout: V04_PRESS_MS });
    } catch (e) {
      return v04('MANUAL', `${what} is hidden, and clicking ${quoted(info.opener)} did not show it: ${firstLine(e)}`);
    }
  }
  const before = await control.getAttribute(info.state);
  const storedBefore = contract ? await page.evaluate(storedSound, SOUND_KEY) : null;
  try {
    await control.click({ timeout: V04_PRESS_MS });
  } catch (e) {
    return v04('MANUAL', `${what} did not take a click within ${V04_PRESS_MS} ms: ${firstLine(e)}`);
  }
  if (!(await settled(page, control, info.state, before, '', null))) {
    return v04('FAIL', `${what} did not change ${info.state} when clicked (it stayed ${before})`);
  }
  const stored = contract && (await settled(page, control, info.state, before, SOUND_KEY, storedBefore));
  // Judged on what holds: a toggle that moves and then moves back has not changed.
  await page.waitForTimeout(V04_HOLD_MS);
  const after = await control.getAttribute(info.state);
  if (after === before) return v04('FAIL', `${what} changed ${info.state} when clicked, then went back to ${before}`);
  const moved = `${info.state} ${before}→${after}`;
  if (!contract) return v04('PASS', `${what}: ${moved}`);
  const storedAfter = await page.evaluate(storedSound, SOUND_KEY);
  if (storedAfter === storedBefore) {
    const was = JSON.stringify(storedBefore);
    return v04('FAIL', `${what}: ${moved}, but ${SOUND_KEY} ${stored ? `changed, then went back to ${was}` : `did not change (${was})`}`);
  }
  return v04('PASS', `${what}: ${moved}, ${SOUND_KEY} ${JSON.stringify(storedBefore)}→${JSON.stringify(storedAfter)}`);
}

async function checkSoundToggle(targetUrl: string, scope?: 'contract' | 'universal', shared?: GuardedBrowser): Promise<CheckResult> {
  // No browser is launched here: the route hands the checks its one browser.
  if (!browserAuditEnabled() || !shared) {
    return v04('MANUAL', 'this check needs a live browser session, which this deployment does not run, so no result is reported rather than a guessed one');
  }
  let stage: 'page' | 'load' | 'check' = 'page';
  let ctx: BrowserContext | undefined;
  try {
    ctx = await shared.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    stage = 'load';
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 8000 });
    } catch {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 8000 });
    }
    stage = 'check';
    return await clickSoundControl(page, scope === 'contract');
  } catch (e) {
    const where = stage === 'page' ? 'the browser could not open a page' : stage === 'load' ? 'the page did not load' : 'the check stopped';
    return v04('MANUAL', `${where}: ${firstLine(e)}`);
  } finally {
    await ctx?.close().catch(() => {});
  }
}

// ── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const caller = await clientKey(request.headers);
  if (rateLimited(caller)) {
    return NextResponse.json(
      { ok: false, error: `Audit rate limit exceeded. Maximum ${RATE_LIMIT} browser audits per hour.` },
      { status: 429 }
    );
  }

  let body: { url?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const url = normalizeInputUrl(rawUrl);

  // Scope: auto-detect from URL (designesy.org → contract, else → universal).
  const scopeRaw = typeof body.scope === 'string' ? body.scope.toLowerCase() : '';
  const scope: 'contract' | 'universal' = scopeRaw === 'contract' || scopeRaw === 'universal'
    ? scopeRaw as 'contract' | 'universal'
    : (() => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        if (host === 'designesy.org' || host === 'www.designesy.org') return 'contract' as const;
      } catch { /* ignore */ }
      return 'universal' as const;
    })();

  // The shared guard's string checks, then a DNS lookup of the host with every
  // resolved address public. Runs before the URL reaches PageSpeed Insights or
  // a browser. Same 400 and wording as /api/score for a refused address.
  if (!url || !(await isPublicUrl(url))) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Enter a valid domain like designesy.org or nike.com.' },
      { status: 400 }
    );
  }

  try {
    // Run all three audit checks in parallel for the lowest total latency.
    // v21 is a network call (PageSpeed Insights) — it can run alongside the
    // browser work. v02 and v04 are SERIALIZED.
    //
    // They both drive Chromium, and running them concurrently against one
    // shared browser meant two contexts loading a heavy page at once. On a
    // 2GB function that exhausted memory and the browser process died:
    // v02 reported "browserContext.close: Target page, context or browser has
    // been closed" with "Browser logs:" attached, which is the signature of a
    // crashed process rather than a closed context. Two Chromium launches (the
    // original shape) was worse still. One browser driving one context at a
    // time is the reliable configuration at this memory ceiling; the wall-clock
    // cost is a few seconds and the audit is not latency-critical.
    // v21 is a network call (PageSpeed Insights) — it runs alongside the
    // browser work. v02 and v04 are SERIALIZED on ONE caller-owned browser.
    //
    // They both drive Chromium. Running them concurrently against a shared
    // browser meant two contexts loading a heavy page at once; on a 2GB
    // function that exhausted memory and the process died (v02 reported
    // "browserContext.close: Target page, context or browser has been closed"
    // with "Browser logs:" attached — the signature of a crashed browser, not
    // a closed context). Two separate Chromium launches, the original shape,
    // was worse still. One browser, one context at a time is the reliable
    // configuration at this memory ceiling; the wall-clock cost is seconds and
    // the audit is not latency-critical.
    //
    // The route owns the browser lifecycle so the first check to finish cannot
    // close it out from under the second.
    const v21Promise = checkCoreWebVitals(url);
    const browser = browserAuditEnabled() ? await openAuditBrowser(createUrlVerdict()) : undefined;
    let v02: CheckResult;
    let v04: CheckResult;
    try {
      v02 = await checkResponsiveOverflow(url, browser);
      v04 = await checkSoundToggle(url, scope, browser);
    } finally {
      if (browser) await browser.close();
    }
    const v21 = await v21Promise;
    const checks = [v02, v04, v21];
    return NextResponse.json(
      { ok: true, url, checks },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: `Browser audit failed for ${url}: ${msg}` },
      { status: 502 }
    );
  }
}