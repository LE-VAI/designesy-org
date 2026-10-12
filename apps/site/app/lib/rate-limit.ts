// Upstash rate limiters, shared by the Edge middleware (middleware.ts) and the
// routes that limit one path of their own (the live badge's cache miss,
// app/lib/badge/miss-limit.ts). Moved out of middleware.ts unchanged, so the
// two read one construction, one key prefix scheme and one client-IP rule.
//
// Edge-compatible: Upstash talks REST over fetch, and nothing here imports a
// Node built-in.
//
// What each caller does when the backend does not answer is the caller's
// decision, stated where it is made: the middleware fails OPEN (a dead Redis
// must not take the scoring API down with it), the badge's miss path fails
// CLOSED (a dead Redis must not let anyone start unlimited fresh scores).

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/** `Ratelimit.fixedWindow()` returns an `Algorithm<RegionContext>` whose type
    is not exported, so ReturnType keeps it type-safe without reaching into
    internals. */
export type LimiterWindow = ReturnType<typeof Ratelimit.fixedWindow>;

/**
 * Whether a limiter ran:
 *   "active"   Upstash answered; the request was counted against the limit
 *   "degraded" the limiter exists but its backend did not answer (an error or
 *              Ratelimit's own timeout), so nothing was counted
 *   "inactive" no limiter object (env vars missing, or construction threw)
 */
export type LimiterOutcome = 'active' | 'degraded' | 'inactive';

/** A fixed window of `tokens` per `window` (see middleware.ts on why fixed). */
export function fixedWindow(tokens: number, window: Parameters<typeof Ratelimit.fixedWindow>[1]): LimiterWindow {
  return Ratelimit.fixedWindow(tokens, window);
}

// ── Upstash rate limiters (lazy init, edge-compatible) ──────────────────────
//
// Lazy-initialized so the module doesn't crash if env vars aren't set.
// Vercel reuses edge instances (Fluid Compute), so the limiter is typically
// initialized once and reused across requests.

const limiters = new Map<string, Ratelimit | null>();

/** The limiter for `prefix`, built on first use and kept; null without Upstash. */
export function getLimiter(prefix: string, window: LimiterWindow): Ratelimit | null {
  if (limiters.has(prefix)) return limiters.get(prefix)!;
  const limiter = createLimiter(prefix, window);
  limiters.set(prefix, limiter);
  return limiter;
}

function createLimiter(prefix: string, limiter: LimiterWindow): Ratelimit | null {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // No Upstash env vars → no limiter. Each caller decides what that means.
  if (!redisUrl || !redisToken) return null;

  // Construction can throw too (malformed URL, bad token shape), and that throw
  // would happen at module init rather than inside the guarded call. Return null
  // so the caller handles "no limiter" instead of failing the request.
  try {
    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    return new Ratelimit({
      redis,
      limiter,
      prefix: `designesy:${prefix}`,
      // analytics: false — deliberately.
      //
      // With analytics on, the docs state "every time we call ratelimit.limit(),
      // analytics will be sent to the Redis database" — an extra write per
      // guarded request, on top of the limit check itself. That multiplier sits
      // directly on the monthly command quota, and on 2026-09-16 the free tier's
      // quota ran out (ERR max requests limit exceeded, Limit 500000, Usage
      // 500002), which silently disabled rate limiting on all nine guarded
      // routes. The dashboard's analytics charts are not worth spending the
      // protection's own budget on; the limiter should be as cheap as possible.
      analytics: false,
    });
  } catch (err) {
    console.error(
      `[rate-limit] could not construct rate limiter "${prefix}" — running without it:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * The caller's IP. Next.js 15 removed `request.ip`; Vercel sets
 * `x-forwarded-for` and `x-real-ip` on every request from its proxy layer, so
 * both are trustworthy there. Locally neither may be set, and every request
 * shares the 'unknown' bucket, which is acceptable for dev.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}
