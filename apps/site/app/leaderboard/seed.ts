// /leaderboard seed — curated sites with batch-scored verification results.
// Shared source for the JSON route (route.ts) and the rendered page (page.tsx).
//
// Scores are from the 2026-07-26 batch run using the designesy.org 34-check
// engine (contract v0.3.0). Deterministic — no LLM. Re-scored weekly.
// geist-ui.com DNS dead → replaced with geist.dev (unscored, pending).
// designesy.ai.studio unscored (rate-limit blocked during batch run).

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
  { url: 'https://linear.app', name: 'Linear', tier: 1, category: 'SaaS', score: 54.8, grade: 'F', pass: 10, fail: 8, warn: 3, skip: 5, tokens: 197, seededBecause: 'Frontier reference — invariant-craft tier' },
  { url: 'https://vercel.com', name: 'Vercel', tier: 1, category: 'SaaS', score: 50.0, grade: 'F', pass: 8, fail: 8, warn: 3, skip: 7, tokens: 5, seededBecause: 'Frontier reference — Geist design system' },
  { url: 'https://stripe.com', name: 'Stripe', tier: 1, category: 'SaaS', score: 59.5, grade: 'F', pass: 11, fail: 7, warn: 3, skip: 5, tokens: 719, seededBecause: 'Frontier reference — mature design system' },
  { url: 'https://apple.com', name: 'Apple', tier: 1, category: 'Hardware', score: 50.0, grade: 'F', pass: 9, fail: 9, warn: 2, skip: 6, tokens: 93, seededBecause: 'Apple HIG — tiered reduced-motion reference' },
  { url: 'https://nytimes.com', name: 'The New York Times', tier: 1, category: 'Editorial', score: 42.9, grade: 'F', pass: 7, fail: 10, warn: 4, skip: 5, tokens: 93, seededBecause: 'Editorial typography — Cadence rules origin' },
  // Tier 2 — Competitors
  { url: 'https://mozaika.design', name: 'Mozaika', tier: 2, category: 'Design Systems', score: 50.0, grade: 'F', pass: 9, fail: 9, warn: 3, skip: 5, tokens: 25, seededBecause: 'Closest competitor — 0-100 score comparison' },
  { url: 'https://www.designesy.org', name: 'Designesy', tier: 2, category: 'Design Systems', score: 100.0, grade: 'A', pass: 31, fail: 0, warn: 0, skip: 3, tokens: 39, seededBecause: 'Self-score — transparency earns trust' },
  { url: 'https://designesy.ai.studio', name: 'Designesy AI Studio', tier: 2, category: 'Design Systems', score: null, grade: null, pass: null, fail: null, warn: null, skip: null, tokens: null, seededBecause: 'AI Studio mirror — parity relationship (unscored: rate-limit blocked)' },
  { url: 'https://getdesy.com', name: 'Desy Guard', tier: 2, category: 'Design Systems', score: 35.7, grade: 'F', pass: 6, fail: 12, warn: 3, skip: 5, tokens: 64, seededBecause: 'AST-gate competitor' },
  { url: 'https://stitch.withgoogle.com', name: 'Google Stitch', tier: 2, category: 'Design Systems', score: 32.5, grade: 'F', pass: 5, fail: 12, warn: 3, skip: 6, tokens: 7, seededBecause: 'DESIGN.md ecosystem' },
  { url: 'https://zeroheight.com', name: 'zeroheight', tier: 2, category: 'Design Systems', score: 45.2, grade: 'F', pass: 8, fail: 10, warn: 3, skip: 5, tokens: 139, seededBecause: 'DTCG 2025.10 incumbent' },
  { url: 'https://roastbyai.com', name: 'Roast by AI', tier: 2, category: 'Design Systems', score: 40.5, grade: 'F', pass: 7, fail: 11, warn: 3, skip: 5, tokens: 52, seededBecause: 'Roast competitor — leaderboard model reference' },
  // Tier 3 — Design-system exemplars
  { url: 'https://atlassian.design', name: 'Atlassian Design System', tier: 3, category: 'Design Systems', score: 45.0, grade: 'F', pass: 8, fail: 10, warn: 2, skip: 6, tokens: 32, seededBecause: 'Motion + tokens exemplar' },
  { url: 'https://primer.style', name: 'GitHub Primer', tier: 3, category: 'Design Systems', score: 65.8, grade: 'D', pass: 12, fail: 6, warn: 1, skip: 7, tokens: 520, seededBecause: 'Contract-adjacent' },
  { url: 'https://carbondesignsystem.com', name: 'IBM Carbon', tier: 3, category: 'Design Systems', score: 40.0, grade: 'F', pass: 7, fail: 11, warn: 2, skip: 6, tokens: 18, seededBecause: 'Mature token system' },
  { url: 'https://spectrum.adobe.com', name: 'Adobe Spectrum', tier: 3, category: 'Design Systems', score: 44.7, grade: 'F', pass: 7, fail: 9, warn: 3, skip: 7, tokens: 2, seededBecause: 'Motion $type reference' },
  { url: 'https://m3.material.io', name: 'Material 3', tier: 3, category: 'Design Systems', score: 37.5, grade: 'F', pass: 6, fail: 11, warn: 3, skip: 6, tokens: 162, seededBecause: 'MotionScheme + Sound — closest to designesy combo' },
  { url: 'https://radix-ui.com', name: 'Radix Colors', tier: 3, category: 'Design Systems', score: 52.6, grade: 'F', pass: 8, fail: 7, warn: 4, skip: 7, tokens: 62, seededBecause: '12-step semantic color' },
  { url: 'https://geist.dev', name: 'Vercel Geist', tier: 3, category: 'Design Systems', score: null, grade: null, pass: null, fail: null, warn: null, skip: null, tokens: null, seededBecause: '.md-for-agents pattern (replaced dead geist-ui.com; pending re-score)' },
  { url: 'https://plex.ibm.com', name: 'IBM Plex', tier: 3, category: 'Typography', score: 31.6, grade: 'F', pass: 5, fail: 12, warn: 2, skip: 7, tokens: 0, seededBecause: 'Org-first type system' },
  // Tier 4 — Inspiration / exemplar sites
  { url: 'https://awwwards.com', name: 'Awwwards', tier: 4, category: 'Inspiration', score: 26.2, grade: 'F', pass: 4, fail: 14, warn: 3, skip: 5, tokens: 104, seededBecause: 'Exemplar discovery surface' },
  { url: 'https://fwa.org', name: 'FWA', tier: 4, category: 'Inspiration', score: 35.7, grade: 'F', pass: 6, fail: 12, warn: 3, skip: 5, tokens: 49, seededBecause: 'Creative exemplars' },
  { url: 'https://cssdesignawards.com', name: 'CSS Design Awards', tier: 4, category: 'Inspiration', score: 21.4, grade: 'F', pass: 3, fail: 15, warn: 3, skip: 5, tokens: 6, seededBecause: 'Design awards' },
  { url: 'https://pentagram.com', name: 'Pentagram', tier: 4, category: 'Agency', score: 38.1, grade: 'F', pass: 6, fail: 11, warn: 4, skip: 5, tokens: 187, seededBecause: 'Parent-system posture analog' },
  { url: 'https://vam.ac.uk', name: 'V&A Museum', tier: 4, category: 'Cultural', score: 38.1, grade: 'F', pass: 6, fail: 11, warn: 4, skip: 5, tokens: 52, seededBecause: 'Pentagram brand identity case study' },
  // Tier 5 — High-traffic public sites
  { url: 'https://github.com', name: 'GitHub', tier: 5, category: 'SaaS', score: 68.4, grade: 'D', pass: 12, fail: 5, warn: 2, skip: 7, tokens: 567, seededBecause: 'High-traffic dev surface — Primer in production' },
  { url: 'https://notion.so', name: 'Notion', tier: 5, category: 'SaaS', score: 40.5, grade: 'F', pass: 7, fail: 11, warn: 3, skip: 5, tokens: 548, seededBecause: 'Product surface — Linear/Stripe competitor' },
  { url: 'https://figma.com', name: 'Figma', tier: 5, category: 'SaaS', score: 52.5, grade: 'F', pass: 9, fail: 8, warn: 3, skip: 6, tokens: 107, seededBecause: 'Design tool surface — token workflow origin' },
  { url: 'https://x.com', name: 'X', tier: 5, category: 'Consumer', score: 47.5, grade: 'F', pass: 8, fail: 9, warn: 3, skip: 6, tokens: 167, seededBecause: 'High-traffic consumer surface — a11y calibration' },
  { url: 'https://wikipedia.org', name: 'Wikipedia', tier: 5, category: 'Reference', score: 31.0, grade: 'F', pass: 5, fail: 13, warn: 3, skip: 5, tokens: 398, seededBecause: 'High-traffic reference — minimal-design baseline' },
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