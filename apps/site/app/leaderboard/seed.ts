// /leaderboard seed — curated sites with batch-scored verification results.
// Shared source for the JSON route (route.ts) and the rendered page (page.tsx).
//
// All 30 sites re-scored 2026-07-30 with the 36-check engine (contract v0.3.0).
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
}

// Unranked seed — re-scored 2026-07-30.
// Rank is computed at load time (sorted by score desc, nulls last).
const RAW_SEED: Omit<SeedSite, 'rank'>[] = [
  { url: 'https://linear.app', name: 'Linear', tier: 1, category: 'SaaS', score: 67.2, grade: 'D', pass: 18, fail: 6, warn: 12, skip: 4, tokens: 192, seededBecause: 'Frontier reference — invariant-craft tier', prevScore: 65.3 },
  { url: 'https://vercel.com', name: 'Vercel', tier: 1, category: 'SaaS', score: 66.4, grade: 'D', pass: 19, fail: 7, warn: 10, skip: 4, tokens: 3, seededBecause: 'Frontier reference — Geist design system', prevScore: 65.6 },
  { url: 'https://stripe.com', name: 'Stripe', tier: 1, category: 'SaaS', score: 68.8, grade: 'D', pass: 17, fail: 4, warn: 14, skip: 5, tokens: 713, seededBecause: 'Frontier reference — mature design system', prevScore: 69.3 },
  { url: 'https://apple.com', name: 'Apple', tier: 1, category: 'Hardware', score: 66.3, grade: 'D', pass: 14, fail: 5, warn: 16, skip: 5, tokens: 90, seededBecause: 'Apple HIG — tiered reduced-motion reference', prevScore: 66.7 },
  { url: 'https://nytimes.com', name: 'The New York Times', tier: 1, category: 'Editorial', score: 60.9, grade: 'D', pass: 11, fail: 5, warn: 19, skip: 5, tokens: 85, seededBecause: 'Editorial typography — Cadence rules origin', prevScore: 59.5 },
  { url: 'https://mozaika.design', name: 'Mozaika', tier: 2, category: 'Design Systems', score: 52.6, grade: 'F', pass: 6, fail: 3, warn: 23, skip: 8, tokens: 0, seededBecause: 'Closest competitor — 0-100 score comparison', prevScore: 48.3 },
  { url: 'https://www.designesy.org', name: 'Designesy', tier: 2, category: 'Design Systems', score: 99.2, grade: 'A', pass: 35, fail: 0, warn: 1, skip: 4, tokens: 50, seededBecause: 'Self-score — transparency earns trust', prevScore: 99.1 },
  { url: 'https://designesy.ai.studio', name: 'Designesy AI Studio', tier: 2, category: 'Design Systems', score: 64.8, grade: 'D', pass: 10, fail: 1, warn: 23, skip: 6, tokens: 28, seededBecause: 'AI Studio mirror — parity relationship', prevScore: 48.3 },
  { url: 'https://getdesy.com', name: 'Desy Guard', tier: 2, category: 'Design Systems', score: 75, grade: 'C', pass: 16, fail: 2, warn: 17, skip: 5, tokens: 61, seededBecause: 'AST-gate competitor', prevScore: 73.9 },
  { url: 'https://stitch.withgoogle.com', name: 'Google Stitch', tier: 2, category: 'Design Systems', score: 56.5, grade: 'F', pass: 7, fail: 3, warn: 23, skip: 7, tokens: 2, seededBecause: 'DESIGN.md ecosystem', prevScore: 52.6 },
  { url: 'https://zeroheight.com', name: 'zeroheight', tier: 2, category: 'Design Systems', score: 68.8, grade: 'D', pass: 16, fail: 4, warn: 15, skip: 5, tokens: 134, seededBecause: 'DTCG 2025.10 incumbent', prevScore: 68.2 },
  { url: 'https://roastbyai.com', name: 'Roast by AI', tier: 2, category: 'Design Systems', score: 67.1, grade: 'D', pass: 16, fail: 4, warn: 15, skip: 5, tokens: 46, seededBecause: 'Roast competitor — leaderboard model reference', prevScore: 65.2 },
  { url: 'https://atlassian.design', name: 'Atlassian Design System', tier: 3, category: 'Design Systems', score: 65.1, grade: 'D', pass: 14, fail: 4, warn: 18, skip: 4, tokens: 27, seededBecause: 'Motion + tokens exemplar', prevScore: 61.9 },
  { url: 'https://primer.style', name: 'GitHub Primer', tier: 3, category: 'Design Systems', score: 77.6, grade: 'C', pass: 26, fail: 5, warn: 5, skip: 4, tokens: 518, seededBecause: 'Contract-adjacent', prevScore: 75.6 },
  { url: 'https://carbondesignsystem.com', name: 'IBM Carbon', tier: 3, category: 'Design Systems', score: 60.6, grade: 'D', pass: 14, fail: 7, warn: 14, skip: 5, tokens: 15, seededBecause: 'Mature token system', prevScore: 58 },
  { url: 'https://spectrum.adobe.com', name: 'Adobe Spectrum', tier: 3, category: 'Design Systems', score: 53.4, grade: 'F', pass: 7, fail: 4, warn: 21, skip: 8, tokens: 0, seededBecause: 'Motion $type reference', prevScore: 49.1 },
  { url: 'https://m3.material.io', name: 'Material 3', tier: 3, category: 'Design Systems', score: 56, grade: 'F', pass: 6, fail: 4, warn: 22, skip: 8, tokens: 158, seededBecause: 'MotionScheme + Sound — closest to designesy combo', prevScore: 51.8 },
  { url: 'https://radix-ui.com', name: 'Radix Colors', tier: 3, category: 'Design Systems', score: 63.3, grade: 'D', pass: 14, fail: 6, warn: 15, skip: 5, tokens: 60, seededBecause: '12-step semantic color', prevScore: 61 },
  { url: 'https://geist.dev', name: 'Vercel Geist', tier: 3, category: 'Design Systems', score: 54.3, grade: 'F', pass: 7, fail: 3, warn: 21, skip: 9, tokens: 0, seededBecause: '.md-for-agents pattern (replaced dead geist-ui.com)', prevScore: 50 },
  { url: 'https://plex.ibm.com', name: 'IBM Plex', tier: 3, category: 'Typography', score: 51, grade: 'F', pass: 7, fail: 4, warn: 23, skip: 6, tokens: 0, seededBecause: 'Org-first type system', prevScore: 46.6 },
  { url: 'https://awwwards.com', name: 'Awwwards', tier: 4, category: 'Inspiration', score: 57.1, grade: 'F', pass: 10, fail: 5, warn: 19, skip: 6, tokens: 98, seededBecause: 'Exemplar discovery surface', prevScore: 55.4 },
  { url: 'https://fwa.org', name: 'FWA', tier: 4, category: 'Inspiration', score: 53.1, grade: 'F', pass: 8, fail: 5, warn: 21, skip: 6, tokens: 45, seededBecause: 'Creative exemplars', prevScore: 51.8 },
  { url: 'https://cssdesignawards.com', name: 'CSS Design Awards', tier: 4, category: 'Inspiration', score: 44.8, grade: 'F', pass: 6, fail: 6, warn: 23, skip: 5, tokens: 0, seededBecause: 'Design awards', prevScore: 43.2 },
  { url: 'https://pentagram.com', name: 'Pentagram', tier: 4, category: 'Agency', score: 57.1, grade: 'F', pass: 11, fail: 5, warn: 19, skip: 5, tokens: 181, seededBecause: 'Parent-system posture analog', prevScore: 55.4 },
  { url: 'https://vam.ac.uk', name: 'V&A Museum', tier: 4, category: 'Cultural', score: 61.4, grade: 'D', pass: 13, fail: 6, warn: 16, skip: 5, tokens: 46, seededBecause: 'Pentagram brand identity case study', prevScore: 58.9 },
  { url: 'https://github.com', name: 'GitHub', tier: 5, category: 'SaaS', score: 70, grade: 'C', pass: 21, fail: 6, warn: 8, skip: 5, tokens: 566, seededBecause: 'High-traffic dev surface — Primer in production', prevScore: 69.6 },
  { url: 'https://notion.so', name: 'Notion', tier: 5, category: 'SaaS', score: 65.5, grade: 'D', pass: 14, fail: 5, warn: 16, skip: 5, tokens: 542, seededBecause: 'Product surface — Linear/Stripe competitor', prevScore: 63.4 },
  { url: 'https://figma.com', name: 'Figma', tier: 5, category: 'SaaS', score: 73.1, grade: 'C', pass: 17, fail: 4, warn: 14, skip: 5, tokens: 102, seededBecause: 'Design tool surface — token workflow origin', prevScore: 71.7 },
  { url: 'https://x.com', name: 'X', tier: 5, category: 'Consumer', score: 70.1, grade: 'C', pass: 14, fail: 2, warn: 18, skip: 6, tokens: 166, seededBecause: 'High-traffic consumer surface — a11y calibration', prevScore: 67.3 },
  { url: 'https://wikipedia.org', name: 'Wikipedia', tier: 5, category: 'Reference', score: 59, grade: 'F', pass: 12, fail: 6, warn: 17, skip: 5, tokens: 393, seededBecause: 'High-traffic reference — minimal-design baseline', prevScore: 56.3 },
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

export const LEADERBOARD_LAST_SCORED = '2026-07-30';

export const LEADERBOARD_POLICY =
  'Curated seed (30 sites) + open submission. Scores are deterministic — 36 checks, no LLM. Sites scoring below 50 are flagged "needs work", not hidden. No paywall, no pay-to-remove.';

export const LEADERBOARD_VERSION = '0.3.0';

export const LEADERBOARD_SCORED_COUNT = SEED.filter((s) => s.score !== null).length;
