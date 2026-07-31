// /api/admin/purge — manually clears the 'score' Data Cache tag so the next
// score request re-fetches and re-computes instead of serving a stale entry.
//
// Why: the score response is wrapped in unstable_cache with a 24h TTL and the
// 'score' tag (see apps/site/app/api/score/route.ts). When the scoring logic
// changes (new checks, new dimensions like the originality lift), every URL
// scored in the prior 24h — including the leaderboard cohort primed by the
// weekly cron — keeps serving the OLD shape until the tag is purged. Vercel
// has no dashboard button for this; the only programmatic path is
// revalidateTag(). This route is that manual trigger.
//
// Security: same CRON_SECRET bearer check as /api/cron/rescore. The secret is a
// server-only env var; without it the endpoint returns 401 and never touches
// the cache. Purging is safe and idempotent — the cache simply rebuilds on the
// next request.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { revalidateTag } from 'next/cache';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  revalidateTag('score');

  return Response.json({
    ok: true,
    message: "Purged the 'score' cache tag. Next score request re-computes fresh.",
    timestamp: new Date().toISOString(),
  });
}

// Allow GET for convenience (curl in a browser/terminal), same auth.
export async function GET(request: Request) {
  return POST(request);
}
