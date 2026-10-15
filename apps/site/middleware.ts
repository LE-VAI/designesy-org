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
// ALGORITHM: fixedWindow, chosen for COMMAND COST not for precision.
//
// The limiters were slidingWindow until 2026-09-16, when the Upstash free tier's
// 500,000 monthly command allowance was exhausted and rate limiting silently
// stopped on all nine guarded routes. Measured in the console: 506,000 commands,
// of which 317,125 were WRITES against 188,693 reads (63:37). That write-heavy
// signature is sliding window's — it maintains a sorted set, issuing ZINCRBY plus
// INCRBY plus PEXPIRE per check. Upstash's own docs say sliding window "results in
// large number of commands in Redis" and recommend fixed window "to keep the
// number of commands low."
//
// fixedWindow trades a little precision for roughly half the commands: a caller
// can burst across a window boundary (two windows filled back to back). For abuse
// protection that is an acceptable trade — the limits are per-minute and per-hour
// ceilings on expensive endpoints, not billing meters. Halving the burn is what
// keeps the protection alive inside the free tier instead of being switched off
// by it, which is strictly worse protection than a slightly imprecise limiter.
//
// If precision is ever needed more than cost, slidingWindow is one word away —
// but check the command budget first, because that is what broke.
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
// Not here, by design: the live badge (/api/badge?url=, /score/badge). Its
// views are images, many arriving through GitHub's image proxy from a shared
// pool of IPs, and a cached badge costs nothing, so a per-request limit would
// block legitimate views. Only its cache miss (a fresh score) is limited, in
// the route: 20 per IP and 300 in all per hour, failing CLOSED
// (app/lib/badge/miss-limit.ts).
//
// Graceful degradation: if UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN
// env vars are not set, rate limiting is skipped (the site still works, just
// without edge-level rate limiting). The in-memory limiters in route files
// remain as a secondary defense.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { clientKey, getLimiter, type LimiterOutcome } from './app/lib/rate-limit';

// ── Upstash rate limiters ───────────────────────────────────────────────────
//
// Construction (lazy, one limiter per prefix, analytics off) and the client-IP
// rule live in app/lib/rate-limit.ts, shared with the live badge's miss limit.
// What this file decides is its own: the API routes below fail OPEN when the
// limiter is missing or its backend does not answer (see checkRateLimit).

// ── Rate limit check ────────────────────────────────────────────────────────
//
// Returns a 429 NextResponse if rate limited, or null if OK (caller continues
// to the route handler).

async function checkRateLimit(
  request: NextRequest,
  limiter: Ratelimit | null,
  identifier: string,
): Promise<{ blocked: NextResponse | null; outcome: LimiterOutcome }> {
  // 'inactive' — no limiter object at all (env vars missing / construction threw)
  if (!limiter) return { blocked: null, outcome: 'inactive' };

  // FAIL OPEN on any limiter error.
  //
  // This await was unguarded, and a rate limiter that throws takes the whole
  // middleware invocation down with it: the platform returns 500
  // MIDDLEWARE_INVOCATION_FAILED for every route in RULES below, so a dead or
  // slow Upstash instance became a full outage of the scoring API, the MCP
  // endpoint, and every other guarded route. Observed live 2026-09-16.
  //
  // The module's own comment promised "graceful degradation", but only covered
  // missing env vars — an unreachable Redis still crashed the request. Rate
  // limiting is a protective measure, not a correctness gate: if we cannot ask
  // the limiter, the right answer is to serve the request and lose the
  // protection, never to refuse every caller. Logged so the outage is visible.
  let decision: { success: boolean; limit: number; remaining: number; reset: number };
  try {
    // The caller's key, a keyed hash of the IP (clientKey, app/lib/rate-limit.ts),
    // is derived inside the try so a crypto failure also fails open.
    decision = await limiter.limit(`${identifier}:${await clientKey(request.headers)}`);
  } catch (err) {
    console.error(
      `[middleware] rate limiter unavailable for "${identifier}" — failing open:`,
      err instanceof Error ? err.message : String(err),
    );
    // 'degraded' — the limiter EXISTS but its backend did not answer. This is
    // the state that must not be confused with a healthy one: requests are being
    // served with NO rate limiting while every config check looks correct.
    return { blocked: null, outcome: 'degraded' };
  }

  const { success, limit, remaining, reset } = decision;

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
    return { blocked: res, outcome: 'active' };
  }

  return { blocked: null, outcome: 'active' };
}

// ── Route → limiter mapping ─────────────────────────────────────────────────
//
// Each rate-limited API path gets its own Upstash limiter with a limit that
// matches the prior in-memory RATE_LIMIT values. Burst-prone endpoints use
// per-minute windows; expensive endpoints use hourly windows.

const API_LIMITERS: Array<{
  pattern: string;
  prefix: string;
  window: ReturnType<typeof Ratelimit.fixedWindow>;
}> = [
  // Burst-capable endpoints — per-minute windows
  { pattern: '/api/score/audit', prefix: 'audit', window: Ratelimit.fixedWindow(20, '1 h') },
  { pattern: '/api/score', prefix: 'score', window: Ratelimit.fixedWindow(100, '60 s') },
  { pattern: '/api/mcp', prefix: 'mcp', window: Ratelimit.fixedWindow(30, '60 s') },
  // Expensive / fetch-amplified endpoints — hourly windows
  { pattern: '/api/report', prefix: 'report', window: Ratelimit.fixedWindow(20, '1 h') },
  { pattern: '/api/compare', prefix: 'compare', window: Ratelimit.fixedWindow(30, '1 h') },
  { pattern: '/api/drift', prefix: 'drift', window: Ratelimit.fixedWindow(50, '1 h') },
  { pattern: '/api/guardrails', prefix: 'guardrails', window: Ratelimit.fixedWindow(50, '1 h') },
  { pattern: '/api/monitor', prefix: 'monitor', window: Ratelimit.fixedWindow(50, '1 h') },
  { pattern: '/api/readiness', prefix: 'readiness', window: Ratelimit.fixedWindow(50, '1 h') },
];

// ── Middleware (async — Next.js supports async middleware) ──────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Check all rate-limited API routes
  for (const route of API_LIMITERS) {
    if (pathname.startsWith(route.pattern)) {
      const limiter = getLimiter(route.prefix, route.window);
      const { blocked, outcome } = await checkRateLimit(request, limiter, route.prefix);
      if (blocked) return blocked;

      // Announce whether the limiter actually ran. Without this, a skipped
      // limiter is indistinguishable from an enforcing one from the outside —
      // which is how this protection sat silently inactive for weeks (see the
      // file header). Two non-sensitive values:
      //   "active"   — Upstash answered; the request was counted against the limit
      //   "degraded" — the limiter built fine but its backend did NOT answer, so
      //                the request was served without protection. Every config
      //                check looks correct in this state, which is why it needs
      //                its own name.
      //   "inactive" — no limiter object (env vars missing or construction threw)
      const limiterState = outcome;

      // Scoring API gets extra headers
      if (pathname.startsWith('/api/score')) {
        const res = NextResponse.next();
        res.headers.set('x-request-id', crypto.randomUUID());
        res.headers.set('RateLimit-Limiter', limiterState);
        // Defense-in-depth: the route is force-dynamic already; this guarantees
        // no CDN layer ever caches a score response regardless of future config.
        res.headers.set('Cache-Control', 'no-store, max-age=0');
        return res;
      }

      // MCP endpoint gets CORS. Without it, browser-based MCP clients (the MCP
      // Inspector, web-hosted clients) cannot call the server at all: the
      // preflight returns 204 with no Access-Control-Allow-Origin, so the browser
      // blocks the request before it is ever sent. Non-browser clients — Claude
      // Desktop, Cursor, VS Code, every stdio client — were never affected, which
      // is why this gap survived unnoticed while the endpoint looked healthy.
      //
      // `*` is correct here rather than a client allowlist: this is a public,
      // read-only, unauthenticated MCP server, and any client that can reach it
      // over the network could already POST to it directly. The header changes
      // which clients *can* use it, not what they can do. It is scoped to
      // /api/mcp and is not applied to the scoring API, whose responses are
      // site-specific. The tools' own SSRF guard (connection-level IP-pinned
      // fetch) is what protects the fetch surface, not the origin policy.
      //
      // `Access-Control-Expose-Headers` matters for MCP HTTP: the transport
      // reads Mcp-Session-Id to correlate a stream, and a browser client cannot
      // read it unless it is exposed.
      if (pathname === '/api/mcp') {
        const res = NextResponse.next();
        res.headers.set('RateLimit-Limiter', limiterState);
        res.headers.set('Access-Control-Allow-Origin', '*');
        res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.headers.set(
          'Access-Control-Allow-Headers',
          'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
        );
        res.headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');
        // The session id is part of the correlation contract; a cached response
        // carrying a stale one would be worse than no cache.
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