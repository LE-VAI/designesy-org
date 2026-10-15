// /api/leaderboard — public leaderboard API (JSON)
// Serves the curated seed list (30 sites across 5 tiers) as JSON.
// Scores from the latest weekly re-score: LEADERBOARD_LAST_SCORED, engine
// LEADERBOARD_ENGINE_VERSION and contract LEADERBOARD_VERSION in seed.ts.
// Each scored site now also carries `categoryScores` — the verbatim
// per-category breakdown from a live engine batch run (batch-data.ts), used
// by the MiniConstellation ring on the rendered page. score:null = unscored.
// prevScore carries the previous week's score for delta-badge rendering
// (populated by scripts/rescore-leaderboard.mjs from snapshot.json).
// The rendered HTML page lives at /leaderboard (app/leaderboard/page.tsx).
// v0.3: weekly re-scoring via .github/workflows/rescore-leaderboard.yml.
//
// Trust fields. Each site carries `status`
// ('current', ranked; 'stale', last scored on an earlier run because the latest
// could not re-score it, rank null; 'unscored') with a `statusLabel` in the
// page's words, a `relationship` ('operator' for a site Designesy runs,
// 'competitor' for a competing product) with its `coiDisclosure`, and the
// response names where to dispute a score.
export const dynamic = 'force-static';

import {
  SEED,
  LEADERBOARD_POLICY,
  LEADERBOARD_VERSION,
  LEADERBOARD_SCORED_COUNT,
  LEADERBOARD_LAST_SCORED,
  LEADERBOARD_RANKED_COUNT,
  LEADERBOARD_STALE_COUNT,
  LEADERBOARD_DISPUTE_EMAIL,
} from '../../leaderboard/seed';

// The policy text lives in seed.ts, the data file the weekly re-score writes
// (scripts/rescore-leaderboard.mjs updates only its site count). Its check
// count was once typed by hand and went stale ("42 checks" while the engine
// ran 44); seed.ts now takes it from the registry (ENGINE_CHECK_COUNT), the
// one source for it.

export function GET() {
  return Response.json(
    {
      ok: true,
      version: LEADERBOARD_VERSION,
      lastScored: LEADERBOARD_LAST_SCORED,
      total: SEED.length,
      scoredCount: LEADERBOARD_SCORED_COUNT,
      rankedCount: LEADERBOARD_RANKED_COUNT,
      staleCount: LEADERBOARD_STALE_COUNT,
      policy: LEADERBOARD_POLICY,
      dispute: {
        email: LEADERBOARD_DISPUTE_EMAIL,
        how: 'Email the site and the check you dispute. A person reads it; a score changes only when the engine, run again, measures something different.',
      },
      relationships: {
        operator: 'A site Designesy operates, scored by its own engine.',
        competitor: 'A product that competes with Designesy\'s own.',
      },
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