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
// Two real jobs:
//   1. /api/score — stamp a request id + explicit no-store (it must never
//      be CDN-cached; its result cache lives in the app via unstable_cache).
//   2. Everything else — pass through untouched.
//
// Budget note: middleware runs at the edge on every matched request. Keeping
// the public-page path a no-op avoids paying compute per page-view.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Scoring API — dynamic by design. No-store + a request id for tracing.
  if (pathname.startsWith('/api/score')) {
    const res = NextResponse.next();
    res.headers.set('x-request-id', crypto.randomUUID());
    // Defense-in-depth: the route is force-dynamic already; this guarantees
    // no CDN layer ever caches a score response regardless of future config.
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  }

  // 2. Public pages (incl. the ISR'd homepage) — no-op. Do NOT set any header
  //    that would change cache semantics (no Set-Cookie, no Vary, no rewrite).
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
