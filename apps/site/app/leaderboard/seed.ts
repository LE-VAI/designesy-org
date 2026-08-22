// /leaderboard seed — curated sites with batch-scored verification results.
// Shared source for the JSON route (route.ts) and the rendered page (page.tsx).
//
// All 30 sites re-scored 2026-08-03 with the 40-check engine (contract v0.4.0).
// Deterministic — no LLM. Re-scored weekly via .github/workflows/rescore-leaderboard.yml.
// prevScore holds the previous week's score for delta-badge rendering.

import { BATCH_CATEGORY_SCORES } from './batch-data';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Tier = 1 | 2 | 3 | 4 | 5;

// One category's weighted sub-score, verbatim from the score engine
// (/api/score categoryScores). score:null means the engine found zero scored
// checks in that category for this site — rendered as a dashed unscored node,
// never as a fabricated 0 or 100.
export interface CategoryBreakdown {
  score: number | null;
  weight: number;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
}

export interface SeedSite {
  rank: number | null;
  url: string;
  name: string;
  tier: Tier;
  category: string;
  score: number | null;
  grade: Grade | null;
  pass: number | null;
  fail: number | null;
  warn: number | null;
  skip: number | null;
  tokens: number | null;
  seededBecause: string;
  /**
   * Previous week's score — for delta badge rendering (↑/↓/= since last week).
   * null when this is the first score or the previous run failed.
   */
  prevScore: number | null;
  /**
   * Real per-category fingerprints captured from a live engine batch run
   * (batch-run.mjs -> batch-data.ts). undefined until a site has been batch
   * scored — the MiniConstellation ring then renders the unscored state.
   */
  categoryScores?: Record<string, CategoryBreakdown>;
  /**
   * Live score-report link for self-scored entries. When present, the
   * leaderboard row renders a "View live report" link instead of treating
   * the score as a static claim. Null for third-party sites (their score
   * was captured by the same engine but they haven't opted in to a link).
   */
  liveScoreUrl?: string | null;
  /**
   * Conflict-of-interest disclosure. When present, the leaderboard row
   * renders a COI badge so viewers know this entry is self-scored.
   */
  coiDisclosure?: string | null;
}

// Unranked seed — re-scored 2026-08-03.
// Rank is computed at load time (sorted by score desc, nulls last).
const RAW_SEED: Omit<SeedSite, 'rank'>[] = [
  { url: 'https://linear.app', name: 'Linear', tier: 1, category: 'SaaS', score: 68.6, grade: 'D', pass: 18, fail: 5, warn: 13, skip: 1, tokens: 192, seededBecause: 'Frontier reference — invariant-craft tier', prevScore: 67.2 },
  { url: 'https://vercel.com', name: 'Vercel', tier: 1, category: 'SaaS', score: 73.6, grade: 'C', pass: 20, fail: 6, warn: 10, skip: 1, tokens: 3, seededBecause: 'Frontier reference — Geist design system', prevScore: 66.4 },
  { url: 'https://stripe.com', name: 'Stripe', tier: 1, category: 'SaaS', score: 61.099999999999994, grade: 'D', pass: 18, fail: 3, warn: 14, skip: 2, tokens: 713, seededBecause: 'Frontier reference — mature design system', prevScore: 68.8 },
  { url: 'https://apple.com', name: 'Apple', tier: 1, category: 'Hardware', score: 77.7, grade: 'C', pass: 15, fail: 4, warn: 16, skip: 2, tokens: 90, seededBecause: 'Apple HIG — tiered reduced-motion reference', prevScore: 66.3 },
  { url: 'https://nytimes.com', name: 'The New York Times', tier: 1, category: 'Editorial', score: 66, grade: 'D', pass: 11, fail: 4, warn: 20, skip: 2, tokens: 85, seededBecause: 'Editorial typography — Cadence rules origin', prevScore: 60.9 },
  { url: 'https://mozaika.design', name: 'Mozaika', tier: 2, category: 'Design Systems', score: 52.6, grade: 'F', pass: 6, fail: 3, warn: 23, skip: 5, tokens: 0, seededBecause: 'Closest competitor — 0-100 score comparison', prevScore: 52.6 },
  { url: 'https://www.designesy.org', name: 'Designesy', tier: 2, category: 'Design Systems', score: 93, grade: 'A', pass: 36, fail: 0, warn: 0, skip: 1, tokens: 50, seededBecause: 'Self-score — transparency earns trust. Conflict of interest: Designesy operates the scoring engine. Re-run live: /score?url=designesy.org', prevScore: 95.3, liveScoreUrl: '/score/report?url=designesy.org', coiDisclosure: 'Self-scored by the engine operator' },
  { url: 'https://designesy.ai.studio', name: 'Designesy AI Studio', tier: 2, category: 'Design Systems', score: 67.8, grade: 'D', pass: 10, fail: 1, warn: 23, skip: 3, tokens: 28, seededBecause: 'AI Studio mirror — parity relationship', prevScore: 64.8 },
  { url: 'https://getdesy.com', name: 'Desy Guard', tier: 2, category: 'Design Systems', score: 66, grade: 'D', pass: 16, fail: 2, warn: 17, skip: 2, tokens: 61, seededBecause: 'AST-gate competitor', prevScore: 75 },
  { url: 'https://stitch.withgoogle.com', name: 'Google Stitch', tier: 2, category: 'Design Systems', score: 52.5, grade: 'F', pass: 7, fail: 3, warn: 23, skip: 4, tokens: 2, seededBecause: 'DESIGN.md ecosystem', prevScore: 56.5 },
  { url: 'https://zeroheight.com', name: 'zeroheight', tier: 2, category: 'Design Systems', score: 73.8, grade: 'C', pass: 16, fail: 4, warn: 15, skip: 2, tokens: 134, seededBecause: 'DTCG 2025.10 incumbent', prevScore: 68.8 },
  { url: 'https://roastbyai.com', name: 'Roast by AI', tier: 2, category: 'Design Systems', score: 59.3, grade: 'F', pass: 16, fail: 3, warn: 16, skip: 2, tokens: 46, seededBecause: 'Roast competitor — leaderboard model reference', prevScore: 67.1 },
  { url: 'https://atlassian.design', name: 'Atlassian Design System', tier: 3, category: 'Design Systems', score: 70.2, grade: 'C', pass: 14, fail: 3, warn: 19, skip: 1, tokens: 27, seededBecause: 'Motion + tokens exemplar', prevScore: 65.1 },
  { url: 'https://primer.style', name: 'GitHub Primer', tier: 3, category: 'Design Systems', score: 77.6, grade: 'C', pass: 26, fail: 5, warn: 5, skip: 1, tokens: 518, seededBecause: 'Contract-adjacent', prevScore: 77.6 },
  { url: 'https://carbondesignsystem.com', name: 'IBM Carbon', tier: 3, category: 'Design Systems', score: 50.8, grade: 'F', pass: 14, fail: 6, warn: 15, skip: 2, tokens: 15, seededBecause: 'Mature token system', prevScore: 60.6 },
  { url: 'https://spectrum.adobe.com', name: 'Adobe Spectrum', tier: 3, category: 'Design Systems', score: 49.4, grade: 'F', pass: 7, fail: 4, warn: 21, skip: 5, tokens: 0, seededBecause: 'Motion $type reference', prevScore: 53.4 },
  { url: 'https://m3.material.io', name: 'Material 3', tier: 3, category: 'Design Systems', score: 59, grade: 'F', pass: 6, fail: 4, warn: 22, skip: 5, tokens: 158, seededBecause: 'MotionScheme + Sound — closest to designesy combo', prevScore: 56 },
  { url: 'https://radix-ui.com', name: 'Radix Colors', tier: 3, category: 'Design Systems', score: 60.7, grade: 'D', pass: 15, fail: 5, warn: 15, skip: 2, tokens: 60, seededBecause: '12-step semantic color', prevScore: 63.3 },
  { url: 'https://geist.dev', name: 'Vercel Geist', tier: 3, category: 'Design Systems', score: 50.3, grade: 'F', pass: 7, fail: 3, warn: 21, skip: 6, tokens: 0, seededBecause: '.md-for-agents pattern (replaced dead geist-ui.com)', prevScore: 54.3 },
  { url: 'https://plex.ibm.com', name: 'IBM Plex', tier: 3, category: 'Typography', score: 51, grade: 'F', pass: 7, fail: 4, warn: 23, skip: 3, tokens: 0, seededBecause: 'Org-first type system', prevScore: 51 },
  { url: 'https://awwwards.com', name: 'Awwwards', tier: 4, category: 'Inspiration', score: 62.2, grade: 'D', pass: 10, fail: 4, warn: 20, skip: 3, tokens: 98, seededBecause: 'Exemplar discovery surface', prevScore: 57.1 },
  { url: 'https://fwa.org', name: 'FWA', tier: 4, category: 'Inspiration', score: 41.1, grade: 'F', pass: 8, fail: 5, warn: 21, skip: 3, tokens: 45, seededBecause: 'Creative exemplars', prevScore: 53.1 },
  { url: 'https://cssdesignawards.com', name: 'CSS Design Awards', tier: 4, category: 'Inspiration', score: 37.9, grade: 'F', pass: 6, fail: 5, warn: 24, skip: 2, tokens: 0, seededBecause: 'Design awards', prevScore: 44.8 },
  { url: 'https://pentagram.com', name: 'Pentagram', tier: 4, category: 'Agency', score: 41.1, grade: 'F', pass: 11, fail: 5, warn: 19, skip: 2, tokens: 181, seededBecause: 'Parent-system posture analog', prevScore: 57.1 },
  { url: 'https://vam.ac.uk', name: 'V&A Museum', tier: 4, category: 'Cultural', score: 62.6, grade: 'D', pass: 13, fail: 5, warn: 17, skip: 2, tokens: 46, seededBecause: 'Pentagram brand identity case study', prevScore: 61.4 },
  { url: 'https://github.com', name: 'GitHub', tier: 5, category: 'SaaS', score: 58.099999999999994, grade: 'F', pass: 21, fail: 6, warn: 8, skip: 2, tokens: 585, seededBecause: 'High-traffic dev surface — Primer in production', prevScore: 70 },
  { url: 'https://notion.so', name: 'Notion', tier: 5, category: 'SaaS', score: 68.5, grade: 'D', pass: 14, fail: 5, warn: 16, skip: 2, tokens: 542, seededBecause: 'Product surface — Linear/Stripe competitor', prevScore: 65.5 },
  { url: 'https://figma.com', name: 'Figma', tier: 5, category: 'SaaS', score: 68.1, grade: 'D', pass: 17, fail: 4, warn: 14, skip: 2, tokens: 102, seededBecause: 'Design tool surface — token workflow origin', prevScore: 73.1 },
  { url: 'https://x.com', name: 'X', tier: 5, category: 'Consumer', score: 73.1, grade: 'C', pass: 14, fail: 2, warn: 18, skip: 3, tokens: 166, seededBecause: 'High-traffic consumer surface — a11y calibration', prevScore: 70.1 },
  { url: 'https://wikipedia.org', name: 'Wikipedia', tier: 5, category: 'Reference', score: 64.1, grade: 'D', pass: 12, fail: 5, warn: 18, skip: 2, tokens: 393, seededBecause: 'High-traffic reference — minimal-design baseline', prevScore: 59 },
];

// Merge in the real per-category fingerprints captured in batch-data.ts
// (generated by batch-run.mjs against the live engine). A site with no entry
// renders its MiniConstellation ring entirely as the unscored dashed state.
const merged: Omit<SeedSite, 'rank'>[] = RAW_SEED.map((s) =>
  BATCH_CATEGORY_SCORES[s.url]
    ? { ...s, categoryScores: BATCH_CATEGORY_SCORES[s.url] }
    : s
);

// Assign ranks: scored sites sorted by score desc, nulls unranked.
const scored = merged.filter((s) => s.score !== null).sort(
  (a, b) => (b.score as number) - (a.score as number)
);
const unscored = merged.filter((s) => s.score === null);

export const SEED: SeedSite[] = [
  ...scored.map((s, i) => ({ ...s, rank: i + 1 })),
  ...unscored.map((s) => ({ ...s, rank: null })),
];

export const LEADERBOARD_LAST_SCORED = '2026-08-03';

export const LEADERBOARD_POLICY =
  'Curated seed (30 sites) + open submission. Scores are deterministic — 40 checks, no LLM. Sites scoring below 50 are flagged "needs work", not hidden. No paywall, no pay-to-remove.';

export const LEADERBOARD_VERSION = '0.4.0';

export const LEADERBOARD_SCORED_COUNT = SEED.filter((s) => s.score !== null).length;
