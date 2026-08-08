// Edge Middleware — Vercel Edge network, runs before the route handler.
// Deliberately minimal and surgical. Per Next.js + Vercel ISR/CDN rules:
//
//  • NO cookies(), headers()-driven branching, Set-Cookie, Vary, or rewrites
//    on public HTML pages — any of these on `/` would mark the response
//    uncacheable (private/no-store) or fragment the edge cache per user,
//    defeating the homepage ISR. The homepage theme is stamped client-side.
//  • `_next/static` and `_next/image` are EXCLUDED via the matcher — the most
//    common middleware bug (Next.js #77833: intercepted asset chunks 404).
//  • Security headers only where they aren't already set by next.config's
//    global `headers()` (which IS ISR-safe — it applies to the route, not
//    per-request HTML). We do not duplicate them here.
//
// Rate limiting uses Upstash Redis (@upstash/ratelimit) — a distributed
// store that persists across serverless instances. The prior in-memory Map
// rate limiters in each route reset on every cold start and differed per
// instance (Fluid Compute runs multiple instances), so the limit was
// aspirational, not enforced. This edge-level limiter runs BEFORE the
// serverless function invokes, saving compute cost.
//
// All rate-limited API routes are covered here:
//   /api/score/*      100/min  (burst) — primary scoring endpoint
//   /api/mcp/*         30/min  — MCP endpoint, expensive (up to 300s)
//   /api/report/*      20/hr   — 3× fetch amplification (score+drift+readiness)
//   /api/score/audit   20/hr   — PageSpeed Insights audit, expensive
//   /api/drift/*       50/hr   — drift detection
//   /api/guardrails/*  50/hr   — guardrail generation
//   /api/monitor/*     50/hr   — drift monitoring
//   /api/readiness/*   50/hr   — AI readiness check
//   /api/compare/*     30/hr   — design system comparison
//
// Graceful degradation: if UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN
// env vars are not set, rate limiting is skipped (the site still works, just
// without edge-level rate limiting). The in-memory limiters in route files
// remain as a secondary defense.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ── Upstash rate limiters (lazy init, edge-compatible) ──────────────────────
//
// Lazy-initialized so the module doesn't crash if env vars aren't set.
// Vercel reuses edge instances (Fluid Compute), so the limiter is typically
// initialized once and reused across requests.

const limiters = new Map<string, Ratelimit | null>();

function getLimiter(
  prefix: string,
  window: ReturnType<typeof Ratelimit.slidingWindow>,
): Ratelimit | null {
  if (limiters.has(prefix)) return limiters.get(prefix)!;
  const limiter = createLimiter(prefix, window);
  limiters.set(prefix, limiter);
  return limiter;
}

// `Ratelimit.slidingWindow()` returns an `Algorithm<RegionContext>` — the
// type isn't exported, so we use ReturnType to stay type-safe without
// reaching into internals.
function createLimiter(
  prefix: string,
  limiter: ReturnType<typeof Ratelimit.slidingWindow>,
): Ratelimit | null {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Graceful degradation: no Upstash env vars → skip rate limiting.
  if (!redisUrl || !redisToken) return null;

  const redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });

  return new Ratelimit({
    redis,
    limiter,
    prefix: `designesy:${prefix}`,
    analytics: true,
  });
}

// ── Rate limit check ────────────────────────────────────────────────────────
//
// Returns a 429 NextResponse if rate limited, or null if OK (caller continues
// to the route handler).

async function checkRateLimit(
  request: NextRequest,
  limiter: Ratelimit | null,
  identifier: string,
): Promise<NextResponse | null> {
  if (!limiter) return null; // no Upstash configured → skip

  // Next.js 15 removed `request.ip` from NextRequest. Vercel sets the
  // `x-forwarded-for` and `x-real-ip` headers on every edge request — both
  // are populated by Vercel's proxy layer and are trustworthy on Vercel.
  // (In local dev, neither may be set; we fall back to 'unknown' which
  // collapses all local requests into one bucket — acceptable for dev.)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown';

  const { success, limit, remaining, reset } = await limiter.limit(`${identifier}:${ip}`);

  if (!success) {
    const res = NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 },
    );
    // Standard rate limit headers (RFC draft-ietf-httpapi-ratelimit-headers).
    res.headers.set('RateLimit-Limit', limit.toString());
    res.headers.set('RateLimit-Remaining', '0');
    res.headers.set('RateLimit-Reset', Math.ceil(reset / 1000).toString());
    res.headers.set('Retry-After', Math.ceil((reset - Date.now()) / 1000).toString());
    return res;
  }

  return null;
}

// ── Route → limiter mapping ─────────────────────────────────────────────────
//
// Each rate-limited API path gets its own Upstash limiter with a limit that
// matches the prior in-memory RATE_LIMIT values. Burst-prone endpoints use
// per-minute windows; expensive endpoints use hourly windows.

const API_LIMITERS: Array<{
  pattern: string;
  prefix: string;
  window: ReturnType<typeof Ratelimit.slidingWindow>;
}> = [
  // Burst-capable endpoints — per-minute windows
  { pattern: '/api/score/audit', prefix: 'audit', window: Ratelimit.slidingWindow(20, '1 h') },
  { pattern: '/api/score', prefix: 'score', window: Ratelimit.slidingWindow(100, '60 s') },
  { pattern: '/api/mcp', prefix: 'mcp', window: Ratelimit.slidingWindow(30, '60 s') },
  // Expensive / fetch-amplified endpoints — hourly windows
  { pattern: '/api/report', prefix: 'report', window: Ratelimit.slidingWindow(20, '1 h') },
  { pattern: '/api/compare', prefix: 'compare', window: Ratelimit.slidingWindow(30, '1 h') },
  { pattern: '/api/drift', prefix: 'drift', window: Ratelimit.slidingWindow(50, '1 h') },
  { pattern: '/api/guardrails', prefix: 'guardrails', window: Ratelimit.slidingWindow(50, '1 h') },
  { pattern: '/api/monitor', prefix: 'monitor', window: Ratelimit.slidingWindow(50, '1 h') },
  { pattern: '/api/readiness', prefix: 'readiness', window: Ratelimit.slidingWindow(50, '1 h') },
];

// ── Middleware (async — Next.js supports async middleware) ──────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Check all rate-limited API routes
  for (const route of API_LIMITERS) {
    if (pathname.startsWith(route.pattern)) {
      const limiter = getLimiter(route.prefix, route.window);
      const blocked = await checkRateLimit(request, limiter, route.prefix);
      if (blocked) return blocked;

      // Scoring API gets extra headers
      if (pathname.startsWith('/api/score')) {
        const res = NextResponse.next();
        res.headers.set('x-request-id', crypto.randomUUID());
        // Defense-in-depth: the route is force-dynamic already; this guarantees
        // no CDN layer ever caches a score response regardless of future config.
        res.headers.set('Cache-Control', 'no-store, max-age=0');
        return res;
      }

      return NextResponse.next();
    }
  }

  // 2. Public pages (incl. the ISR'd homepage) — no-op. Do NOT set any header
  //    that would change cache semantics (no Set-Cookie, no Vary, no rewrite).
  //    This path stays sync-equivalent (no await) for page-view performance.
  return NextResponse.next();
}

export const config = {
  // Match every path EXCEPT Next internals and well-known metadata files.
  // Excluding _next/static + _next/image is mandatory; excluding favicon /
  // sitemap / robots avoids paying middleware tax on crawler hits.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|badge-light.svg|badge-dark.svg).*)',
  ],
};