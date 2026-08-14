// Single source of truth for every number the landing hero shows.
// VWP Stage-1 receipt (hero-stat source-of-truth): any hero stat MUST read
// from this module — never a hardcoded literal in page.tsx or copy — so a
// fabricated counter is architecturally impossible. Each export states its
// provenance inline; add a stat only with a live data path behind it.

import { SEED, LEADERBOARD_LAST_SCORED } from './leaderboard/seed';

// The verification engine's check count. The engine ships 40 checks
// (v01–v23 + x01–x03 + v36–v41, grounded in CSS Color 5, WCAG 2.2, and
// Baseline 2024–2026). Marketing copy previously said "32" and "34" —
// stale; the engine is the truth.
export const ENGINE_CHECK_COUNT = 40;

// Public contract version the engine scores against.
export const CONTRACT_VERSION = 'v0.4.0';

// Latest self-score — DERIVED from the public leaderboard seed row, never a
// second literal. The hero and the leaderboard show the same number because
// they read the same source: two frozen values for one fact is the exact
// contradiction this module exists to kill. Current seed-derived self-score
// (2026-08-03 leaderboard seed): 100% A (36P / 0F / 0W / 1S — the 1 skip
// is a live-browser-only probe: sound toggle). The number below is derived
// from the seed row, never a second literal — update the seed to change it.
function selfRow() {
  const row = SEED.find((s) => s.url === 'https://www.designesy.org');
  if (!row || row.score === null || row.grade === null) {
    throw new Error('hero-stats: leaderboard seed lost its designesy.org self row');
  }
  return row;
}
export const SELF_SCORE = selfRow().score as number; // percent — from the seed row
export const SELF_GRADE = selfRow().grade as string;

// Seeded cohort honesty — what the public leaderboard actually contains.
export const COHORT_SCORED_COUNT = SEED.filter((s) => s.score !== null).length;
export const COHORT_TOTAL_COUNT = SEED.length;
export const COHORT_LAST_SCORED = LEADERBOARD_LAST_SCORED;

// "Recent scores" rail — the REAL seeded sites, ranked, top 5. These are
// real engine batch results (2026-07-28 seed + 2026-07-29 category batch),
// not a fabricated ticker. Ordered by seed rank (composite score desc).
export const RECENT_SCORES = SEED.filter((s) => s.score !== null && s.rank !== null)
  .sort((a, b) => (a.rank as number) - (b.rank as number))
  .slice(0, 5)
  .map((s) => ({
    name: s.name,
    grade: s.grade as string,
    score: s.score as number,
    url: s.url,
    isSelf: s.url === 'https://www.designesy.org',
  }));

// Lowest score in the cohort — the proof the engine doesn't grade-inflate.
// Showing the floor alongside the self-score makes the self-score credible:
// a benchmark that only shows its own A and hides everyone's F reads as
// rigged. The floor is the honesty signal. Derived from the seed, same as
// everything else — never a second literal.
const lowestRow = SEED
  .filter((s) => s.score !== null && s.url !== 'https://www.designesy.org')
  .sort((a, b) => (a.score as number) - (b.score as number))[0];
export const LOWEST_SCORE = lowestRow ? (lowestRow.score as number) : null;
export const LOWEST_GRADE = lowestRow ? (lowestRow.grade as string) : null;
export const LOWEST_NAME = lowestRow ? lowestRow.name : null;

// Explicitly NOT exported: any "scores today" / total-scores counter. There
// is no global score-count store — score history is per-browser
// localStorage and submissions are not logged. A number like "3,821 scores
// today" would be fabricated, and fabricated scarcity/activity counters are
// regulator-actionable dark patterns (AGCM v. Deghi €2.0M, 2026). If a real
// server-side counter lands later (persisted score_log), add it here with
// its data path in the provenance comment — until then it does not exist.
