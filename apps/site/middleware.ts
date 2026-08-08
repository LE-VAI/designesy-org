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
// Three real jobs:
//   1. /api/score — stamp a request id + explicit no-store + rate limit.
//   2. /api/mcp — rate limit (MCP endpoint, expensive serverless calls).
//   3. Everything else — pass through untouched.
//
// Rate limiting uses Upstash Redis (@upstash/ratelimit) — a distributed
// store that persists across serverless instances. The prior in-memory Map
// rate limiter in score/route.ts reset on every cold start and differed per
// instance, so the limit was aspirational, not enforced. This edge-level
// limiter runs BEFORE the serverless function invokes, saving compute cost.
//
// Graceful degradation: if UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN
// env vars are not set, rate limiting is skipped (the site still works, just
// without edge-level rate limiting). The in-memory limiter in score/route.ts
// remains as a secondary defense.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ── Upstash rate limiter (lazy init, edge-compatible) ────────────────────────
//
// Lazy-initialized so the module doesn't crash if env vars aren't set.
// Vercel reuses edge instances (Fluid Compute), so the limiter is typically
// initialized once and reused across requests.

let scoreLimiter: Ratelimit | null | undefined;
let mcpLimiter: Ratelimit | null | undefined;

function getScoreLimiter(): Ratelimit | null {
  if (scoreLimiter !== undefined) return scoreLimiter;
  scoreLimiter = createLimiter('score', 100, '60 s');
  return scoreLimiter;
}

function getMcpLimiter(): Ratelimit | null {
  if (mcpLimiter !== undefined) return mcpLimiter;
  // MCP endpoint is more expensive (long-running, up to 300s) — tighter limit.
  mcpLimiter = createLimiter('mcp', 30, '60 s');
  return mcpLimiter;
}

function createLimiter(prefix: string, limit: number, window: string): Ratelimit | null {
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
    limiter: Ratelimit.slidingWindow(limit, window),
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

  // request.ip is set by Vercel infra and is trustworthy.
  // Fallback to x-forwarded-for for non-Vercel environments.
  const ip = request.ip || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

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

// ── Middleware (async — Next.js supports async middleware) ──────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Scoring API — dynamic by design. Rate limit + no-store + request id.
  if (pathname.startsWith('/api/score')) {
    const blocked = await checkRateLimit(request, getScoreLimiter(), 'score');
    if (blocked) return blocked;

    const res = NextResponse.next();
    res.headers.set('x-request-id', crypto.randomUUID());
    // Defense-in-depth: the route is force-dynamic already; this guarantees
    // no CDN layer ever caches a score response regardless of future config.
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  }

  // 2. MCP endpoint — rate limit (expensive, up to 300s function timeout).
  if (pathname.startsWith('/api/mcp')) {
    const blocked = await checkRateLimit(request, getMcpLimiter(), 'mcp');
    if (blocked) return blocked;

    return NextResponse.next();
  }

  // 3. Public pages (incl. the ISR'd homepage) — no-op. Do NOT set any header
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