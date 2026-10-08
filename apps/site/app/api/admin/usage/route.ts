// /api/admin/usage?days=N: reads the F7 usage counters (see app/lib/usage.ts).
//
// Returns, per UTC day, the calls and approximate distinct callers for each key
// ("mcp:<tool>", "score:<client>"). It holds nothing more: no URLs, no
// contracts, no IPs.
//
// Security: the same CRON_SECRET bearer check as limiter-health. Without it the
// endpoint 401s and reports nothing.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { readUsage } from '../../../lib/usage';

const MAX_DAYS = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const requested = Number(new URL(request.url).searchParams.get('days') ?? '30');
  const days = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), MAX_DAYS) : 30;

  const usage = await readUsage(days);
  if (usage === null) {
    // Same silent-skip lesson as limiter-health: say so instead of returning zeros.
    return Response.json({
      ok: false,
      error: 'Counters inactive: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set in this runtime.',
    });
  }
  return Response.json({ ok: true, days, usage });
}
