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
export const dynamic = 'force-static';

import {
  SEED,
  LEADERBOARD_POLICY,
  LEADERBOARD_VERSION,
  LEADERBOARD_SCORED_COUNT,
  LEADERBOARD_LAST_SCORED,
} from '../../leaderboard/seed';
import { ENGINE_CHECK_COUNT } from '../../lib/check-definitions';

// The policy text lives in seed.ts, the data file the weekly re-score writes
// (scripts/rescore-leaderboard.mjs updates only its site count). Its check
// count was typed by hand and went stale: it said "42 checks" while the engine
// ran 44. The count is put in here from the registry, the one source for it.
const POLICY = LEADERBOARD_POLICY.replace(/\b\d+ checks\b/, `${ENGINE_CHECK_COUNT} checks`);

export function GET() {
  return Response.json(
    {
      ok: true,
      version: LEADERBOARD_VERSION,
      lastScored: LEADERBOARD_LAST_SCORED,
      total: SEED.length,
      scoredCount: LEADERBOARD_SCORED_COUNT,
      policy: POLICY,
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