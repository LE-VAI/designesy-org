// /leaderboard — public leaderboard API
// Serves the curated seed list (30 sites across 5 tiers) as JSON.
// Scores from the 2026-07-26 batch run (34-check engine, contract v0.3.0).
// v2: open submission + weekly re-scoring is a follow-up.
export const dynamic = 'force-static';

import {
  SEED,
  LEADERBOARD_POLICY,
  LEADERBOARD_VERSION,
  LEADERBOARD_SCORED_COUNT,
  LEADERBOARD_LAST_SCORED,
} from './seed';

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