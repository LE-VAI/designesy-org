// /api/leaderboard — public leaderboard API (JSON)
// Serves the curated seed list (30 sites across 5 tiers) as JSON.
// Scores from the 2026-08-03 re-score (42-check engine, contract v0.4.0).
// Each scored site now also carries `categoryScores` — the verbatim
// per-category breakdown from a live engine batch run (batch-data.ts), used
// by the MiniConstellation ring on the rendered page. score:null = unscored.
// prevScore carries the previous week's score for delta-badge rendering
// (populated by scripts/rescore-leaderboard.mjs from snapshot.json).
// The rendered HTML page lives at /leaderboard (app/leaderboard/page.tsx).
// v0.3: weekly re-scoring via .github/workflows/rescore-leaderboard.yml.
export const dynamic = 'force-static';

import {
  SEED,
  LEADERBOARD_POLICY,
  LEADERBOARD_VERSION,
  LEADERBOARD_SCORED_COUNT,
  LEADERBOARD_LAST_SCORED,
} from '../../leaderboard/seed';

export function GET() {
  return Response.json(
    {
      ok: true,
      version: LEADERBOARD_VERSION,
      lastScored: LEADERBOARD_LAST_SCORED,
      total: SEED.length,
      scoredCount: LEADERBOARD_SCORED_COUNT,
      policy: LEADERBOARD_POLICY,
      sites: SEED,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}