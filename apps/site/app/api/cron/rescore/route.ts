// /api/cron/rescore — Vercel Cron Job that re-scores all leaderboard seed sites
// weekly (Mondays 09:00 UTC). This keeps the leaderboard fresh without manual
// batch runs.
//
// Pro Plan: 800s function timeout (Pro max). Scoring ~30 sites sequentially
// takes 3-8s cold each (up to 240s worst case). 800s gives ample headroom.
// Results are cached via unstable_cache on /api/score for 24h, so re-scoring
// the same URL within 24h is instant.
//
// Security: Vercel Cron sends a CRON_SECRET header. We validate it against
// the env var. Without the secret, the endpoint returns 401.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800; // Pro Plan: 800s max (upgraded from 300s)

import { SEED } from '../../../leaderboard/seed';

export async function GET(request: Request) {
  // Validate CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = new URL(request.url).origin;
  const scored = SEED.filter((s) => s.score !== null);
  const results: { url: string; score: number | null; grade: string | null; error?: string }[] = [];

  // Score each site sequentially (3-8s each, ~30 sites = ~2-4 min)
  for (const site of scored) {
    try {
      const res = await fetch(`${baseUrl}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: site.url }),
      });
      const data = await res.json();
      const summary = data.summary || data;
      results.push({
        url: site.url,
        score: summary.score_percent ?? summary.score ?? null,
        grade: summary.grade ?? null,
      });
    } catch (err) {
      results.push({
        url: site.url,
        score: null,
        grade: null,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  const successCount = results.filter((r) => r.score !== null).length;
  const failCount = results.filter((r) => r.error).length;

  return Response.json({
    ok: true,
    message: `Weekly re-score complete. ${successCount}/${scored.length} sites scored, ${failCount} errors.`,
    timestamp: new Date().toISOString(),
    results,
  });
}