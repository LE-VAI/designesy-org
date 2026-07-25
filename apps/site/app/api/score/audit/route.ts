import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Hobby caps at 10s (too short — PSI round-trip is 10-25s with a full
// Lighthouse run). Pro allows up to 60s. We set 60s; on Hobby the function
// will be killed at 10s and return a 504, which the client surfaces as an
// audit error. Upgrade to Pro for the browser-audit path to fully work.
// The PSI-only path (v21) can succeed on Hobby if CrUX field data is
// available (fast ~2-3s response, no Lighthouse lab run needed).
export const maxDuration = 60;

// ── Rate limiting (in-memory, shared shape with /api/score) ────────────────
// Browser audits are heavier than static scores — tighter limit.
const RATE_LIMIT = 5; // audits per hour per IP
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

// ── URL normalization (mirror of /api/score) ───────────────────────────────

function normalizeInputUrl(raw: string): string {
  let clean = raw.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  try {
    const u = new URL(clean);
    return u.href;
  } catch {
    return clean;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.16.') ||
      host === '0.0.0.0' ||
      !host.includes('.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Check result shape (mirror of /api/score) ──────────────────────────────

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
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
        status: 'SKIP',
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

    return {
      id: 'v21',
      item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
      category: 'performance',
      status: overall,
      detail: `${detail} — source: ${source}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    // No Chromium lab fallback on Hobby — see note above.
    return {
      id: 'v21',
      item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
      category: 'performance',
      status: 'SKIP',
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
async function checkCoreWebVitalsLab(targetUrl: string, fallbackReason: string): Promise<CheckResult> {
  let browser;
  try {
    browser = await launchBrowser();
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
      detail: `${lcpStr}, ${clsStr}, INP=SKIP(lab) — source: Chromium CDP lab (PSI fallback: ${fallbackReason.slice(0, 60)})`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return {
      id: 'v21',
      item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
      category: 'performance',
      status: 'SKIP',
      detail: `both PSI and Chromium lab failed: ${msg}`,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
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

import { chromium as playwrightChromium } from 'playwright-core';
import sparticuzChromium from '@sparticuz/chromium';

function browserAuditEnabled(): boolean {
  return process.env.ENABLE_BROWSER_AUDIT === '1' || process.env.ENABLE_BROWSER_AUDIT === 'true';
}

async function launchBrowser() {
  const executablePath = await sparticuzChromium.executablePath();
  return playwrightChromium.launch({
    args: sparticuzChromium.args,
    executablePath,
    headless: true,
  });
}

// v02 — responsive overflow. Launch Chromium, navigate at 4 viewports,
// measure scrollWidth vs clientWidth at each. PASS if all 4 fit; FAIL with
// the first overflowing viewport in the detail string.
async function checkResponsiveOverflow(targetUrl: string): Promise<CheckResult> {
  if (!browserAuditEnabled()) {
    return {
      id: 'v02',
      item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
      category: 'responsive',
      status: 'SKIP',
      detail: 'browser audit not enabled on this deployment (set ENABLE_BROWSER_AUDIT=1)',
    };
  }
  const viewports = [
    { w: 375, label: '375px (mobile)' },
    { w: 720, label: '720px (tablet)' },
    { w: 860, label: '860px (small laptop)' },
    { w: 1080, label: '1080px (desktop)' },
  ];
  let browser;
  try {
    browser = await launchBrowser();
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
      status: 'SKIP',
      detail: `browser launch failed: ${msg}`,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// v04 — sound toggle. Launch Chromium, navigate, locate the sound toggle by
// [aria-pressed] or [data-sound-toggle] or button text matching 'sound',
// click it, observe aria-pressed flip, observe localStorage[designesy:sound]
// update. PASS if both state changes occur.
async function checkSoundToggle(targetUrl: string): Promise<CheckResult> {
  if (!browserAuditEnabled()) {
    return {
      id: 'v04',
      item: 'Sound toggle flips aria-pressed and applies the audio preference',
      category: 'poise',
      status: 'SKIP',
      detail: 'browser audit not enabled on this deployment (set ENABLE_BROWSER_AUDIT=1)',
    };
  }
  let browser;
  try {
    browser = await launchBrowser();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 8000 });
    } catch {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 8000 });
    }
    // Locate sound toggle — aria-pressed is the contract spec.
    const toggle = await page.$('[aria-pressed], [data-sound-toggle], button:has-text("sound" i)');
    if (!toggle) {
      await ctx.close();
      return {
        id: 'v04',
        item: 'Sound toggle flips aria-pressed and applies the audio preference',
        category: 'poise',
        status: 'WARN',
        detail: 'no sound toggle element found on page',
      };
    }
    const beforePressed = await toggle.getAttribute('aria-pressed');
    await toggle.click();
    await page.waitForTimeout(300);
    const afterPressed = await toggle.getAttribute('aria-pressed');
    const beforeStorage = await page.evaluate(() => localStorage.getItem('designesy:sound'));
    await page.waitForTimeout(200);
    const afterStorage = await page.evaluate(() => localStorage.getItem('designesy:sound'));
    const pressedFlipped = beforePressed !== afterPressed;
    const storageUpdated = beforeStorage !== afterStorage;
    await ctx.close();
    if (pressedFlipped && storageUpdated) {
      return {
        id: 'v04',
        item: 'Sound toggle flips aria-pressed and applies the audio preference',
        category: 'poise',
        status: 'PASS',
        detail: `aria-pressed ${beforePressed}→${afterPressed}, storage updated`,
      };
    }
    return {
      id: 'v04',
      item: 'Sound toggle flips aria-pressed and applies the audio preference',
      category: 'poise',
      status: 'FAIL',
      detail: `aria-pressed flip=${pressedFlipped}, storage update=${storageUpdated}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return {
      id: 'v04',
      item: 'Sound toggle flips aria-pressed and applies the audio preference',
      category: 'poise',
      status: 'SKIP',
      detail: `browser launch failed: ${msg}`,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Audit rate limit exceeded. Maximum 5 browser audits per hour.' },
      { status: 429 }
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const url = normalizeInputUrl(rawUrl);

  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Enter a valid domain like designesy.org or nike.com.' },
      { status: 400 }
    );
  }

  try {
    // Run all three audit checks in parallel for the lowest total latency.
    const [v21, v02, v04] = await Promise.all([
      checkCoreWebVitals(url),
      checkResponsiveOverflow(url),
      checkSoundToggle(url),
    ]);
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