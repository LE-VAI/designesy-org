// /api/drift — Designesy Drift Radar
//
// Detects AI-generated UI drift by fetching a URL, extracting CSS + :root
// tokens, and running 12 drift-specific checks against the four documented
// 2026 drift failure modes: token fabrication, within-session drift,
// between-session amnesia, silent breaking changes.
//
// All 12 checks are static CSS/HTML analysis — no browser needed.
//
// Contract: /contracts/drift.json (designesy.drift v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl, safeFetch } from '../../lib/url-guard';

// ── URL utilities (shared hardened guard — see app/lib/url-guard.ts) ──────────
// Imported above. Closes IPv6 loopback/link-local/ULA, cloud metadata
// (169.254.169.254), full 172.16.0.0/12, and encoded-IP bypass paths.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Scope system (mirrors score engine) ──────────────────────────────────────
//
// The drift engine has the same fairness gap as the score engine: some checks
// penalize ABSENCE of a feature (no CSS custom properties → "no token system")
// rather than DRIFT (variance within a system that exists). A site that uses
// Tailwind, Sass variables, or well-organized static CSS has zero :root custom
// properties but isn't "drifting" — it just doesn't use that particular
// token mechanism.
//
// Scope modes:
//   contract  — all 12 checks penalize absence (strict, for designesy.org self-scan)
//   universal — absence-only checks SKIP on absence (fair to external sites)
//
// Only d01 is a pure-absence check in the drift engine. d03 has a mild absence
// component (no color tokens → WARN on inline colors) but its WARN threshold
// is informative rather than punitive, so it stays in tier 1. All other checks
// measure genuine variance/consistency, which IS drift by definition.

export type DriftScope = 'contract' | 'universal';

// d01: "Token registry declared" — fails if <5 :root custom properties.
// In universal scope, a site with no custom properties SKIPs rather than FAILs,
// because absence of a CSS-custom-property system is an architectural choice,
// not drift. The check still fires (FAIL) if the site HAS a token system but
// it's tiny (1-4 tokens) — that's a weak system, not absence.
const TIER2_ABSENCE_PATTERNS: Array<{ id: string; absenceMatch: RegExp }> = [
  // Only match the 0-tokens case (pure absence). 1-4 tokens = weak system = real FAIL.
  { id: 'd01', absenceMatch: /^Only 0 :root custom properties/ },
];

function applyDriftScopeFilter(checks: CheckResult[], scope: DriftScope): CheckResult[] {
  if (scope === 'contract') return checks;
  return checks.map((c) => {
    const tier2 = TIER2_ABSENCE_PATTERNS.find((t) => t.id === c.id);
    if (tier2 && (c.status === 'WARN' || c.status === 'FAIL')) {
      if (tier2.absenceMatch.test(c.detail)) {
        return {
          ...c,
          status: 'SKIP' as CheckResult['status'],
          detail: `${c.detail} (skipped: scope=universal — absence of CSS custom properties is an architectural choice, not drift)`,
        };
      }
    }
    return c;
  });
}

function autoDetectDriftScope(targetUrl: string): DriftScope {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    if (host === 'designesy.org' || host === 'www.designesy.org') return 'contract';
  } catch { /* fall through */ }
  return 'universal';
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = 50;
const RATE_WINDOW = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = hits.get(ip) || [];
  const recent = arr.filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ── Fetching (mirrors score route) ─────────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

function extractCssLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    links.push(m[1]);
  }
  const linkRe = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi;
  while ((m = linkRe.exec(html)) !== null) {
    try {
      links.push(new URL(m[1], baseUrl).href);
    } catch {
      // ignore malformed
    }
  }
  return links;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await safeFetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPageResilient(targetUrl: string): Promise<{ html: string; css: string }> {
  let html = '';
  try {
    const parsed = new URL(targetUrl);
    const candidates = [
      targetUrl,
      !parsed.hostname.startsWith('www.') ? `https://www.${parsed.hostname}${parsed.pathname}` : '',
    ].filter(Boolean);
    for (const c of candidates) {
      html = await fetchText(c);
      if (html && html.length > 50) break;
    }
  } catch {
    // fall through
  }
  if (!html) return { html: '', css: '' };
  const parts = extractCssLinks(html, targetUrl);
  const cssParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith('http')) {
      const ext = await fetchText(part);
      if (ext) cssParts.push(ext);
    } else {
      cssParts.push(part);
    }
  }
  return { html, css: cssParts.join('\n') };
}

// ── Token extraction ─────────────────────────────────────────────────────────
//
// Tokens declared in CSS custom properties can live in three scopes:
//   1. :root { ... }                    — global theme tokens
//   2. [data-theme="light"] :root { }   — theme override (still global)
//   3. .component { --x: ...; }         — component-scoped (CSS spec valid)
//   4. JS: el.style.setProperty('--x')  — runtime-injected state
//
// The original d02 check only scanned :root, which produced a high false-
// positive count on real CSS that legitimately uses local-scope custom
// properties (Krehel /better-ui pattern, magnetic-cursor effect, filter
// segmented controls, grade badges). This now scans ALL custom property
// declarations in the stylesheet so component-scoped state tokens are
// recognized as declared, not fabricated.

import {
  runDriftChecks,
  extractRootTokens,
  extractVarRefs,
  extractVarChains,
  extractValuesByProperty,
  uniqueValues,
  cleanCssForValueCounting,
  extractHardcodedColors,
  extractHardcodedSpacing,
  type CheckResult,
} from '../../lib/drift-checks';

// ── The twelve drift checks are IMPORTED, not defined here ───────────────────
//
// They live in app/lib/drift-checks.ts so /api/drift and /api/monitor share ONE
// implementation of d01-d12. Both routes published those same IDs, and
// hand-maintained copies had silently diverged: monitor held this file's
// PRE-FIX versions of nine checks, so the two engines disagreed about 9 of 12
// checks on the same page and monitor reported fabricated drift about real
// sites (radix-ui.com: d08 drift 7 PASS vs monitor 149 FAIL).
//
// Porting the fixes across would have recreated the same failure later. One
// implementation makes agreement structural.
//
// Everything below is transport — fetching, caching, rate limiting, scope
// filtering, response shaping. The MEASUREMENT is imported.
// ── Score computation ────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function scoreDriftUncached(targetUrl: string, scope?: DriftScope) {
  const effectiveScope: DriftScope = scope || autoDetectDriftScope(targetUrl);
  const { html, css } = await fetchPageResilient(targetUrl);

  if (!html && !css) {
    return {
      ok: false,
      error: 'Could not fetch the target URL. Check that the URL is correct and the site is publicly accessible.',
    };
  }

  const allCss = css + (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join('\n') || '');
  const tokens = extractRootTokens(allCss);

  // var() references come from TWO surfaces, and only one was being scanned.
  //
  // extractVarRefs(allCss) sees stylesheets and <style> blocks. It does NOT
  // see `style="..."` attributes — which is exactly what React's `style={{}}`
  // prop renders to. So any token referenced from a component style object was
  // invisible to d02 and d11.
  //
  // That is how `--surface-1` survived: guardrails-form.tsx set a code block's
  // background to var(--surface-1) in a style object, the token was never
  // declared anywhere, the declaration was therefore invalid, and the panel
  // rendered transparent. d02 — the check whose entire job is catching
  // fabricated tokens — reported PASS the whole time, because the reference
  // lived in an attribute rather than a rule.
  //
  // Proven before fixing: injecting two fabricated tokens
  // (--totally-fabricated-token-xyz, --another-fake-token) into a style
  // attribute left d02 at PASS with an unchanged 2,593 reference count.
  //
  // The 8 tokens a rendered guardrails panel actually writes to attributes
  // (--ease, --ink, --line, --muted, --muted-dim, --ok, --radius-md, --surface)
  // are all declared today, so this changes no current verdict — it closes the
  // door rather than reporting an existing breach.
  const attrCss = (html.match(/\sstyle="([^"]*)"/gi) || []).join(';');
  const varRefs = [...extractVarRefs(allCss), ...extractVarRefs(attrCss)];

  // varRefs is passed explicitly so the attribute coverage above is preserved.
  // The shared module derives it from css by default, but this route legitimately
  // sees more than css — and after the --surface-1 defect, scanning style
  // attributes is a fix that must not be quietly dropped by the extraction.
  let checks: CheckResult[] = runDriftChecks(allCss, tokens, varRefs);

  // Apply scope filter AFTER checks run but BEFORE scoring math.
  // Converts absence-only results to SKIP in universal scope.
  checks = applyDriftScopeFilter(checks, effectiveScope);

  // SKIP checks are excluded from scoring (not counted in denominator).
  const scoredChecks = checks.filter((c) => c.status !== 'SKIP');
  const pass = scoredChecks.filter((c) => c.status === 'PASS').length;
  const warn = scoredChecks.filter((c) => c.status === 'WARN').length;
  const fail = scoredChecks.filter((c) => c.status === 'FAIL').length;
  const skip = checks.length - scoredChecks.length;
  const points = pass + warn * 0.5;
  const score = scoredChecks.length > 0
    ? Math.round((points / scoredChecks.length) * 100)
    : 0;
  const grade = computeGrade(score);

  return {
    ok: true,
    url: targetUrl,
    scope: effectiveScope,
    score,
    grade,
    pass,
    warn,
    fail,
    skip,
    total: checks.length,
    tokensExtracted: Object.keys(tokens).length,
    checks,
  };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const DRIFT_TTL = 60 * 60 * 24; // 24h

const scoreDrift = unstable_cache(scoreDriftUncached, ['designesy-drift'], {
  revalidate: DRIFT_TTL,
  tags: ['drift'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 50 drift scans per hour.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { url?: string; scope?: DriftScope };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const targetUrl = normalizeInputUrl(body.url || '');
  if (!isValidUrl(targetUrl)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Provide a public http(s) URL.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Scope: explicit body.scope wins; otherwise auto-detect (designesy.org → contract, else universal)
  const scope: DriftScope = body.scope === 'contract' || body.scope === 'universal'
    ? body.scope
    : autoDetectDriftScope(targetUrl);

  const result = await scoreDrift(targetUrl, scope);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}