import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel: allow up to 60s for the audit round-trip

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
  // LCP + CLS come from the loadingExperience (field data, CrUX).
  // INP is reported under FIRST_INPUT_DELAY_MS (field) when available; falls
  // back to lab diagnostics when field data is absent (new/small sites).
  if (apiKey) psiUrl.searchParams.set('key', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(psiUrl.href, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return {
        id: 'v21',
        item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
        category: 'performance',
        status: 'SKIP',
        detail: `PSI API returned ${resp.status}: ${body.slice(0, 120) || 'no body'}`,
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

// ── v02 + v04: Browser-only checks (Playwright) ────────────────────────────
// These require a headless browser. The route is structured so that when
// Playwright + a Chromium binary are available on the deployment (set
// ENABLE_BROWSER_AUDIT=1), the checks run for real. Otherwise they return a
// clearly-labeled "browser audit not enabled on this deployment" SKIP with a
// detail string explaining why — this is more honest than a silent SKIP.

function browserAuditEnabled(): boolean {
  return process.env.ENABLE_BROWSER_AUDIT === '1' || process.env.ENABLE_BROWSER_AUDIT === 'true';
}

async function checkResponsiveOverflow(_targetUrl: string): Promise<CheckResult> {
  if (!browserAuditEnabled()) {
    return {
      id: 'v02',
      item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
      category: 'responsive',
      status: 'SKIP',
      detail: 'browser audit not enabled on this deployment (set ENABLE_BROWSER_AUDIT=1 + Playwright)',
    };
  }
  // Playwright implementation: launch headless Chromium, navigate to targetUrl
  // at 4 viewports (375, 720, 860, 1080), measure scrollWidth vs clientWidth at
  // each. PASS if all 4 viewports have scrollWidth <= clientWidth. Otherwise FAIL
  // with the first overflowing viewport in the detail string.
  //
  // TODO(sessions): when @sparticuz/chromium is wired into the Vercel build,
  // implement the real check here. For now the route is the scaffold + the
  // honest "not enabled" status.
  return {
    id: 'v02',
    item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
    category: 'responsive',
    status: 'SKIP',
    detail: 'browser audit path scaffolded — Playwright integration pending',
  };
}

async function checkSoundToggle(_targetUrl: string): Promise<CheckResult> {
  if (!browserAuditEnabled()) {
    return {
      id: 'v04',
      item: 'Sound toggle flips aria-pressed and applies the audio preference',
      category: 'poise',
      status: 'SKIP',
      detail: 'browser audit not enabled on this deployment (set ENABLE_BROWSER_AUDIT=1 + Playwright)',
    };
  }
  // Playwright implementation: launch headless Chromium, navigate to targetUrl,
  // locate the sound toggle by [aria-pressed] or [data-sound-toggle], click it,
  // observe aria-pressed state flip, observe localStorage[designesy:sound]
  // update. PASS if both state changes occur. FAIL with whichever half failed.
  return {
    id: 'v04',
    item: 'Sound toggle flips aria-pressed and applies the audio preference',
    category: 'poise',
    status: 'SKIP',
    detail: 'browser audit path scaffolded — Playwright integration pending',
  };
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