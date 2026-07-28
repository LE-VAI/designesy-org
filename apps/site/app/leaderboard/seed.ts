// /leaderboard seed — curated sites with batch-scored verification results.
// Shared source for the JSON route (route.ts) and the rendered page (page.tsx).
//
// All 30 sites re-scored 2026-07-28 with the 34-check engine (contract v0.3.0).
// Deterministic — no LLM. Re-scored weekly. geist.dev replaced dead geist-ui.com.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Tier = 1 | 2 | 3 | 4 | 5;

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
}

// Unranked seed — scores from the 2026-07-26 batch run.
// Rank is computed at load time (sorted by score desc, nulls last).
const RAW_SEED: Omit<SeedSite, 'rank'>[] = [
  // Tier 1 — Reference-tier craft
  { url: 'https://linear.app', name: 'Linear', tier: 1, category: 'SaaS', score: 63.9, grade: 'D', pass: 14, fail: 6, warn: 10, skip: 4, tokens: 197, seededBecause: 'Frontier reference — invariant-craft tier' },
  { url: 'https://vercel.com', name: 'Vercel', tier: 1, category: 'SaaS', score: 64.2, grade: 'D', pass: 16, fail: 7, warn: 7, skip: 4, tokens: 5, seededBecause: 'Frontier reference — Geist design system' },
  { url: 'https://stripe.com', name: 'Stripe', tier: 1, category: 'SaaS', score: 67.4, grade: 'D', pass: 15, fail: 4, warn: 11, skip: 4, tokens: 719, seededBecause: 'Frontier reference — mature design system' },
  { url: 'https://apple.com', name: 'Apple', tier: 1, category: 'Hardware', score: 64.6, grade: 'D', pass: 12, fail: 5, warn: 13, skip: 4, tokens: 93, seededBecause: 'Apple HIG — tiered reduced-motion reference' },
  { url: 'https://nytimes.com', name: 'The New York Times', tier: 1, category: 'Editorial', score: 57.0, grade: 'F', pass: 8, fail: 5, warn: 17, skip: 4, tokens: 93, seededBecause: 'Editorial typography — Cadence rules origin' },
  // Tier 2 — Competitors
  { url: 'https://mozaika.design', name: 'Mozaika', tier: 2, category: 'Design Systems', score: 44.9, grade: 'F', pass: 4, fail: 3, warn: 22, skip: 5, tokens: 25, seededBecause: 'Closest competitor — 0-100 score comparison' },
  { url: 'https://www.designesy.org', name: 'Designesy', tier: 2, category: 'Design Systems', score: 100.0, grade: 'A', pass: 31, fail: 0, warn: 0, skip: 3, tokens: 39, seededBecause: 'Self-score — transparency earns trust' },
  { url: 'https://designesy.ai.studio', name: 'Designesy AI Studio', tier: 2, category: 'Design Systems', score: 44.9, grade: 'F', pass: 4, fail: 3, warn: 22, skip: 5, tokens: 25, seededBecause: 'AI Studio mirror — parity relationship' },
  { url: 'https://getdesy.com', name: 'Desy Guard', tier: 2, category: 'Design Systems', score: 73.4, grade: 'C', pass: 12, fail: 2, warn: 15, skip: 5, tokens: 64, seededBecause: 'AST-gate competitor' },
  { url: 'https://stitch.withgoogle.com', name: 'Google Stitch', tier: 2, category: 'Design Systems', score: 49.7, grade: 'F', pass: 5, fail: 3, warn: 22, skip: 4, tokens: 7, seededBecause: 'DESIGN.md ecosystem' },
  { url: 'https://zeroheight.com', name: 'zeroheight', tier: 2, category: 'Design Systems', score: 66.1, grade: 'D', pass: 13, fail: 4, warn: 13, skip: 4, tokens: 139, seededBecause: 'DTCG 2025.10 incumbent' },
  { url: 'https://roastbyai.com', name: 'Roast by AI', tier: 2, category: 'Design Systems', score: 63.0, grade: 'D', pass: 12, fail: 4, warn: 14, skip: 4, tokens: 52, seededBecause: 'Roast competitor — leaderboard model reference' },
  // Tier 3 — Design-system exemplars
  { url: 'https://atlassian.design', name: 'Atlassian Design System', tier: 3, category: 'Design Systems', score: 62.0, grade: 'D', pass: 10, fail: 4, warn: 16, skip: 4, tokens: 32, seededBecause: 'Motion + tokens exemplar' },
  { url: 'https://primer.style', name: 'GitHub Primer', tier: 3, category: 'Design Systems', score: 75.3, grade: 'C', pass: 21, fail: 5, warn: 4, skip: 4, tokens: 520, seededBecause: 'Contract-adjacent' },
  { url: 'https://carbondesignsystem.com', name: 'IBM Carbon', tier: 3, category: 'Design Systems', score: 55.4, grade: 'F', pass: 10, fail: 7, warn: 13, skip: 4, tokens: 18, seededBecause: 'Mature token system' },
  { url: 'https://spectrum.adobe.com', name: 'Adobe Spectrum', tier: 3, category: 'Design Systems', score: 45.9, grade: 'F', pass: 5, fail: 4, warn: 20, skip: 5, tokens: 2, seededBecause: 'Motion $type reference' },
  { url: 'https://m3.material.io', name: 'Material 3', tier: 3, category: 'Design Systems', score: 48.7, grade: 'F', pass: 4, fail: 4, warn: 22, skip: 4, tokens: 162, seededBecause: 'MotionScheme + Sound — closest to designesy combo' },
  { url: 'https://radix-ui.com', name: 'Radix Colors', tier: 3, category: 'Design Systems', score: 58.5, grade: 'F', pass: 10, fail: 6, warn: 14, skip: 4, tokens: 62, seededBecause: '12-step semantic color' },
  { url: 'https://geist.dev', name: 'Vercel Geist', tier: 3, category: 'Design Systems', score: 46.8, grade: 'F', pass: 5, fail: 3, warn: 21, skip: 5, tokens: 0, seededBecause: '.md-for-agents pattern (replaced dead geist-ui.com)' },
  { url: 'https://plex.ibm.com', name: 'IBM Plex', tier: 3, category: 'Typography', score: 43.0, grade: 'F', pass: 3, fail: 4, warn: 22, skip: 5, tokens: 0, seededBecause: 'Org-first type system' },
  // Tier 4 — Inspiration / exemplar sites
  { url: 'https://awwwards.com', name: 'Awwwards', tier: 4, category: 'Inspiration', score: 52.5, grade: 'F', pass: 8, fail: 5, warn: 18, skip: 3, tokens: 104, seededBecause: 'Exemplar discovery surface' },
  { url: 'https://fwa.org', name: 'FWA', tier: 4, category: 'Inspiration', score: 48.7, grade: 'F', pass: 6, fail: 5, warn: 19, skip: 4, tokens: 49, seededBecause: 'Creative exemplars' },
  { url: 'https://cssdesignawards.com', name: 'CSS Design Awards', tier: 4, category: 'Inspiration', score: 39.2, grade: 'F', pass: 4, fail: 6, warn: 19, skip: 5, tokens: 6, seededBecause: 'Design awards' },
  { url: 'https://pentagram.com', name: 'Pentagram', tier: 4, category: 'Agency', score: 52.5, grade: 'F', pass: 8, fail: 5, warn: 17, skip: 4, tokens: 187, seededBecause: 'Parent-system posture analog' },
  { url: 'https://vam.ac.uk', name: 'V&A Museum', tier: 4, category: 'Cultural', score: 56.3, grade: 'F', pass: 9, fail: 6, warn: 15, skip: 4, tokens: 52, seededBecause: 'Pentagram brand identity case study' },
  // Tier 5 — High-traffic public sites
  { url: 'https://github.com', name: 'GitHub', tier: 5, category: 'SaaS', score: 67.7, grade: 'D', pass: 18, fail: 6, warn: 6, skip: 4, tokens: 567, seededBecause: 'High-traffic dev surface — Primer in production' },
  { url: 'https://notion.so', name: 'Notion', tier: 5, category: 'SaaS', score: 62.0, grade: 'D', pass: 11, fail: 5, warn: 14, skip: 4, tokens: 548, seededBecause: 'Product surface — Linear/Stripe competitor' },
  { url: 'https://figma.com', name: 'Figma', tier: 5, category: 'SaaS', score: 69.9, grade: 'D', pass: 13, fail: 4, warn: 13, skip: 4, tokens: 107, seededBecause: 'Design tool surface — token workflow origin' },
  { url: 'https://x.com', name: 'X', tier: 5, category: 'Consumer', score: 66.1, grade: 'D', pass: 11, fail: 2, warn: 17, skip: 4, tokens: 167, seededBecause: 'High-traffic consumer surface — a11y calibration' },
  { url: 'https://wikipedia.org', name: 'Wikipedia', tier: 5, category: 'Reference', score: 53.5, grade: 'F', pass: 8, fail: 6, warn: 16, skip: 4, tokens: 398, seededBecause: 'High-traffic reference — minimal-design baseline' },
];

// Assign ranks: scored sites sorted by score desc, nulls unranked.
const scored = RAW_SEED.filter((s) => s.score !== null).sort(
  (a, b) => (b.score as number) - (a.score as number)
);
const unscored = RAW_SEED.filter((s) => s.score === null);

export const SEED: SeedSite[] = [
  ...scored.map((s, i) => ({ ...s, rank: i + 1 })),
  ...unscored.map((s) => ({ ...s, rank: null })),
];

export const LEADERBOARD_LAST_SCORED = '2026-07-28';

export const LEADERBOARD_POLICY =
  'Curated seed (30 sites) + open submission. Scores are deterministic — 34 checks, no LLM. Sites scoring below 50 are flagged "needs work", not hidden. No paywall, no pay-to-remove.';

export const LEADERBOARD_VERSION = '0.2.0';

export const LEADERBOARD_SCORED_COUNT = SEED.filter((s) => s.score !== null).length;