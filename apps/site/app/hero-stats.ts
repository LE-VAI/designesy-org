// Single source of truth for every number the landing hero shows.
// VWP Stage-1 receipt (hero-stat source-of-truth): any hero stat MUST read
// from this module — never a hardcoded literal in page.tsx or copy — so a
// fabricated counter is architecturally impossible. Each export states its
// provenance inline; add a stat only with a live data path behind it.

import { SEED, LEADERBOARD_LAST_SCORED } from './leaderboard/seed';

// The verification engine's check count. The engine ships 34 checks
// (v01–v23 + x01–x03 = 26 statically-reportable on the root URL, the rest
// page/SKIP-gated). Marketing copy said "32" — stale; the engine is the truth.
export const ENGINE_CHECK_COUNT = 34;

// Public contract version the engine scores against.
export const CONTRACT_VERSION = 'v0.3.0';

// Latest self-score — the engine's own run against designesy.org
// (designesy_score, 2026-07-29 deploy: 20P / 1F / 5S, the 1F is the known
// INP static-probe artifact v21, score 95.2% grade A). Keep in sync with the
// engine's last clean gate, not with the leaderboard seed snapshot.
export const SELF_SCORE = 95.2; // percent
export const SELF_GRADE = 'A';

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

// Explicitly NOT exported: any "scores today" / total-scores counter. There
// is no global score-count store — score history is per-browser
// localStorage and submissions are not logged. A number like "3,821 scores
// today" would be fabricated, and fabricated scarcity/activity counters are
// regulator-actionable dark patterns (AGCM v. Deghi €2.0M, 2026). If a real
// server-side counter lands later (persisted score_log), add it here with
// its data path in the provenance comment — until then it does not exist.
