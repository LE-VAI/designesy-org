// /api/admin/limiter-health — reports whether the Edge rate limiter is ACTIVE.
//
// Why this exists. On 2026-09-16 an audit found the scoring API had no effective
// rate limiting at all, and had not for weeks:
//
//   - The in-route limiter is an in-memory Map keyed by IP. On Fluid compute
//     each serverless instance holds its own Map, so the counter never
//     accumulates to the limit on any one instance. The middleware's own header
//     comment already described this as "aspirational, not enforced."
//   - The Edge limiter (Upstash, distributed) was built to replace it — and
//     silently skipped every request. A skip is indistinguishable from a
//     deliberate pass: checkRateLimit returns null either way, so nothing in the
//     response or the logs said the protection was absent.
//
// The failure mode is the one this codebase keeps producing: a guard that cannot
// report its own absence. A limiter that is skipped looks exactly like a limiter
// that is working, from the outside, forever.
//
// This endpoint makes it observable. It reports only booleans and the limiter's
// own limit values — never the Upstash URL, token, or any credential.
//
// Security: same CRON_SECRET bearer check as the purge endpoint. Without it the
// endpoint 401s and reports nothing.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // What the middleware sees. Node and Edge read the same project env, so if
  // these are absent here they are almost certainly absent there too.
  const urlSet = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const tokenSet = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

  const report: Record<string, unknown> = {
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: 'nodejs',
    env: { UPSTASH_REDIS_REST_URL: urlSet, UPSTASH_REDIS_REST_TOKEN: tokenSet },
    // The decision the middleware makes, stated as the middleware makes it.
    would_activate: urlSet && tokenSet,
  };

  if (!urlSet || !tokenSet) {
    report.verdict =
      'LIMITER INACTIVE — env vars missing in this runtime, so the middleware ' +
      'skips rate limiting entirely. This is the silent-skip failure.';
    return Response.json(report);
  }

  // Prove the limiter can actually reach Upstash by performing one real check
  // against the same sliding window the middleware uses for /api/score.
  const started = Date.now();
  try {
    const limiter = new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(100, '60 s'),
      prefix: 'designesy:healthcheck',
      analytics: false,
    });

    const { success, limit, remaining, reset } = await limiter.limit('healthcheck');
    report.upstash_reachable = true;
    report.latency_ms = Date.now() - started;
    report.limit = limit;
    report.remaining = remaining;
    report.reset_at = new Date(reset).toISOString();
    report.verdict = success
      ? 'LIMITER ACTIVE — Upstash reachable and the sliding window responds.'
      : 'LIMITER ACTIVE but this caller is already rate limited.';
  } catch (err) {
    report.upstash_reachable = false;
    report.latency_ms = Date.now() - started;
    report.error = err instanceof Error ? err.message : String(err);
    report.verdict =
      'LIMITER INACTIVE — Upstash is unreachable, so every request fails OPEN ' +
      'and is served without rate limiting. The middleware logs this too.';
  }

  return Response.json(report);
}

// Allow POST for convenience, same auth.
export async function POST(request: Request) {
  return GET(request);
}
