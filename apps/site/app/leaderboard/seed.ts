// /leaderboard seed — curated sites with batch-scored verification results.
// Shared source for the JSON route (route.ts) and the rendered page (page.tsx).
//
// All 30 sites re-scored 2026-10-12 with the 44-check engine (contract v0.4.5).
// Deterministic — no LLM. Re-scored weekly via .github/workflows/rescore-leaderboard.yml.
// prevScore holds the previous week's score for delta-badge rendering.

import { BATCH_CATEGORY_SCORES } from './batch-data';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { SITE_CONTACT_EMAIL, contactMailto } from '../lib/site-meta';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type Tier = 1 | 2 | 3 | 4 | 5;
export type Relationship = 'operator' | 'competitor';
/**
 * current: measured on the latest run, and ranked.
 * stale: the engine could not re-score it on the latest run. The last
 *   measurement is shown with its date, outside the ranking.
 * unscored: never measured.
 */
export type SiteStatus = 'current' | 'stale' | 'unscored';

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
   * (the weekly re-score, scripts/rescore-leaderboard.mjs -> batch-data.ts). undefined until a site has been batch
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
   * Conflict-of-interest disclosure, in words, for every entry whose
   * relationship to Designesy is not arm's length: the self-score, the other
   * sites Designesy operates, and the products that compete with it.
   */
  coiDisclosure?: string | null;
  /**
   * How the entry relates to Designesy, labelled on every surface that shows
   * it: 'operator' for a site Designesy runs
   * (designesy.org, the Studio), 'competitor' for a product that competes
   * with Designesy's own. Absent for an independent site.
   */
  relationship?: Relationship;
  /**
   * True when the engine could not read this site on the most recent re-score,
   * so the score shown is the PREVIOUS measurement held over rather than a
   * fresh one. Written by scripts/rescore-leaderboard.mjs.
   *
   * This exists because the data model had no way to express "held over": the
   * score and grade looked current, and without this flag the page presented a
   * six-week-old number as if it were measured today. Correct number, false
   * provenance.
   */
  unreachable?: boolean;
  /**
   * The date this score was actually measured (YYYY-MM-DD). For held-over
   * entries this is the date of the run that produced the number, NOT the date
   * of the most recent run.
   */
  scoredAt?: string;
  /** Derived at load time from score and unreachable; never written by hand. */
  status?: SiteStatus;
  /** For a stale entry: "last scored <date> · could not re-score". */
  statusLabel?: string | null;
}

// Unranked seed — re-scored 2026-08-03.
// Rank is computed at load time (sorted by score desc, nulls last).
const RAW_SEED: Omit<SeedSite, 'rank'>[] = [
  { url: 'https://linear.app', name: 'Linear', tier: 1, category: 'SaaS', score: 70, grade: 'C', pass: 21, fail: 1, warn: 11, skip: 8, tokens: 191, seededBecause: 'Frontier reference: invariant-craft tier', prevScore: 70, scoredAt: '2026-10-12' },
  { url: 'https://vercel.com', name: 'Vercel', tier: 1, category: 'SaaS', score: 81.1, grade: 'B', pass: 21, fail: 3, warn: 8, skip: 9, tokens: 253, seededBecause: 'Frontier reference: Geist design system', prevScore: 81.1, scoredAt: '2026-10-12' },
  { url: 'https://stripe.com', name: 'Stripe', tier: 1, category: 'SaaS', score: 70, grade: 'C', pass: 19, fail: 1, warn: 11, skip: 10, tokens: 714, seededBecause: 'Frontier reference: mature design system', prevScore: 70, scoredAt: '2026-10-12' },
  { url: 'https://apple.com', name: 'Apple', tier: 1, category: 'Hardware', score: 83.1, grade: 'B', pass: 15, fail: 2, warn: 10, skip: 14, tokens: 90, seededBecause: 'Apple HIG: tiered reduced-motion reference', prevScore: 83.1, scoredAt: '2026-10-12' },
  { url: 'https://nytimes.com', name: 'The New York Times', tier: 1, category: 'Editorial', score: 75.8, grade: 'C', pass: 12, fail: 2, warn: 11, skip: 14, tokens: 85, seededBecause: 'Editorial typography: Cadence rules origin', prevScore: 75.8, scoredAt: '2026-09-22', unreachable: true },
  { url: 'https://mozaika.design', name: 'Mozaika', tier: 2, category: 'Design Systems', score: 64.3, grade: 'D', pass: 6, fail: 1, warn: 9, skip: 25, tokens: 0, seededBecause: 'Closest competitor: 0-100 score comparison', prevScore: 64.3, coiDisclosure: 'Competing product: it offers a 0-100 design score for any URL', relationship: 'competitor', scoredAt: '2026-10-12' },
  { url: 'https://www.designesy.org', name: 'Designesy', tier: 2, category: 'Design Systems', score: 100, grade: 'A', pass: 38, fail: 0, warn: 3, skip: 0, tokens: 227, seededBecause: 'Self-score: transparency earns trust. Conflict of interest: Designesy operates the scoring engine. Re-run live: /score?url=designesy.org', prevScore: 100, liveScoreUrl: '/score/report?url=designesy.org', coiDisclosure: 'Self-scored by the engine operator', relationship: 'operator', scoredAt: '2026-10-12' },
  { url: 'https://designesy.ai.studio', name: 'Designesy AI Studio', tier: 2, category: 'Design Systems', score: 74.5, grade: 'C', pass: 13, fail: 1, warn: 11, skip: 16, tokens: 91, seededBecause: 'AI Studio mirror: parity relationship', prevScore: 74.5, coiDisclosure: 'Operated by Designesy and scored by its engine', relationship: 'operator', scoredAt: '2026-10-12' },
  { url: 'https://getdesy.com', name: 'Desy Guard', tier: 2, category: 'Design Systems', score: 73.4, grade: 'C', pass: 19, fail: 1, warn: 8, skip: 11, tokens: 61, seededBecause: 'AST-gate competitor', prevScore: 73.4, coiDisclosure: 'Competing product: it offers a design-system health score for codebases', relationship: 'competitor', scoredAt: '2026-08-31', unreachable: true },
  { url: 'https://stitch.withgoogle.com', name: 'Google Stitch', tier: 2, category: 'Design Systems', score: 68.5, grade: 'D', pass: 7, fail: 1, warn: 8, skip: 25, tokens: 2, seededBecause: 'DESIGN.md ecosystem', prevScore: 68.5, scoredAt: '2026-10-12' },
  { url: 'https://zeroheight.com', name: 'zeroheight', tier: 2, category: 'Design Systems', score: 70, grade: 'C', pass: 19, fail: 2, warn: 8, skip: 12, tokens: 182, seededBecause: 'DTCG 2025.10 incumbent', prevScore: 70, scoredAt: '2026-10-12' },
  { url: 'https://roastbyai.com', name: 'Roast by AI', tier: 2, category: 'Design Systems', score: 81.7, grade: 'B', pass: 18, fail: 1, warn: 6, skip: 16, tokens: 46, seededBecause: 'Roast competitor: leaderboard model reference', prevScore: 81.7, coiDisclosure: 'Competing product: it offers AI website scores that include design', relationship: 'competitor', scoredAt: '2026-10-12' },
  { url: 'https://atlassian.design', name: 'Atlassian Design System', tier: 3, category: 'Design Systems', score: 89.9, grade: 'B', pass: 18, fail: 2, warn: 6, skip: 15, tokens: 28, seededBecause: 'Motion + tokens exemplar', prevScore: 89.9, scoredAt: '2026-10-12' },
  { url: 'https://primer.style', name: 'GitHub Primer', tier: 3, category: 'Design Systems', score: 89.9, grade: 'B', pass: 25, fail: 2, warn: 5, skip: 9, tokens: 523, seededBecause: 'Contract-adjacent', prevScore: 89.9, scoredAt: '2026-10-12' },
  { url: 'https://carbondesignsystem.com', name: 'IBM Carbon', tier: 3, category: 'Design Systems', score: 82.8, grade: 'B', pass: 21, fail: 2, warn: 7, skip: 11, tokens: 661, seededBecause: 'Mature token system', prevScore: 82.8, scoredAt: '2026-10-12' },
  { url: 'https://spectrum.adobe.com', name: 'Adobe Spectrum', tier: 3, category: 'Design Systems', score: 65.1, grade: 'D', pass: 7, fail: 1, warn: 8, skip: 25, tokens: 0, seededBecause: 'Motion $type reference', prevScore: 65.1, scoredAt: '2026-10-12' },
  { url: 'https://m3.material.io', name: 'Material 3', tier: 3, category: 'Design Systems', score: 66.4, grade: 'D', pass: 7, fail: 2, warn: 10, skip: 22, tokens: 158, seededBecause: 'MotionScheme + Sound: closest to designesy combo', prevScore: 66.4, scoredAt: '2026-10-12' },
  { url: 'https://radix-ui.com', name: 'Radix Colors', tier: 3, category: 'Design Systems', score: 70, grade: 'C', pass: 15, fail: 3, warn: 11, skip: 12, tokens: 59, seededBecause: '12-step semantic color', prevScore: 70, scoredAt: '2026-10-12' },
  { url: 'https://geist.dev', name: 'Vercel Geist', tier: 3, category: 'Design Systems', score: 64.4, grade: 'D', pass: 7, fail: 1, warn: 7, skip: 26, tokens: 0, seededBecause: '.md-for-agents pattern (replaced dead geist-ui.com)', prevScore: 64.4, scoredAt: '2026-10-12' },
  { url: 'https://plex.ibm.com', name: 'IBM Plex', tier: 3, category: 'Typography', score: 56.8, grade: 'F', pass: 7, fail: 2, warn: 10, skip: 22, tokens: 0, seededBecause: 'Org-first type system', prevScore: 56.8, scoredAt: '2026-10-12' },
  { url: 'https://awwwards.com', name: 'Awwwards', tier: 4, category: 'Inspiration', score: 72.1, grade: 'C', pass: 14, fail: 3, warn: 10, skip: 14, tokens: 98, seededBecause: 'Exemplar discovery surface', prevScore: 72.1, scoredAt: '2026-10-12' },
  { url: 'https://fwa.org', name: 'FWA', tier: 4, category: 'Inspiration', score: 54.6, grade: 'F', pass: 9, fail: 3, warn: 11, skip: 18, tokens: 44, seededBecause: 'Creative exemplars', prevScore: 54.6, scoredAt: '2026-10-12' },
  { url: 'https://cssdesignawards.com', name: 'CSS Design Awards', tier: 4, category: 'Inspiration', score: 44.9, grade: 'F', pass: 6, fail: 3, warn: 14, skip: 16, tokens: 0, seededBecause: 'Design awards', prevScore: 44.9, scoredAt: '2026-08-31', unreachable: true },
  { url: 'https://pentagram.com', name: 'Pentagram', tier: 4, category: 'Agency', score: 56.6, grade: 'F', pass: 12, fail: 2, warn: 10, skip: 17, tokens: 181, seededBecause: 'Parent-system posture analog', prevScore: 56.6, scoredAt: '2026-10-12' },
  { url: 'https://vam.ac.uk', name: 'V&A Museum', tier: 4, category: 'Cultural', score: 70, grade: 'C', pass: 14, fail: 3, warn: 7, skip: 17, tokens: 51, seededBecause: 'Pentagram brand identity case study', prevScore: 70, scoredAt: '2026-10-12' },
  { url: 'https://github.com', name: 'GitHub', tier: 5, category: 'SaaS', score: 65, grade: 'D', pass: 23, fail: 4, warn: 6, skip: 8, tokens: 597, seededBecause: 'High-traffic dev surface: Primer in production', prevScore: 65, scoredAt: '2026-10-12' },
  { url: 'https://notion.so', name: 'Notion', tier: 5, category: 'SaaS', score: 65.5, grade: 'D', pass: 16, fail: 4, warn: 9, skip: 12, tokens: 544, seededBecause: 'Product surface: Linear/Stripe competitor', prevScore: 65.5, scoredAt: '2026-10-12' },
  { url: 'https://figma.com', name: 'Figma', tier: 5, category: 'SaaS', score: 84.4, grade: 'B', pass: 18, fail: 1, warn: 6, skip: 16, tokens: 105, seededBecause: 'Design tool surface: token workflow origin', prevScore: 84.4, scoredAt: '2026-10-12' },
  { url: 'https://x.com', name: 'X', tier: 5, category: 'Consumer', score: 87.8, grade: 'B', pass: 20, fail: 0, warn: 8, skip: 13, tokens: 297, seededBecause: 'High-traffic consumer surface: a11y calibration', prevScore: 87.8, scoredAt: '2026-10-12' },
  { url: 'https://wikipedia.org', name: 'Wikipedia', tier: 5, category: 'Reference', score: 83.8, grade: 'B', pass: 17, fail: 2, warn: 6, skip: 16, tokens: 421, seededBecause: 'High-traffic reference: minimal-design baseline', prevScore: 83.8, scoredAt: '2026-10-12' },
];

// Merge in the real per-category fingerprints captured in batch-data.ts
// (generated by the weekly re-score, scripts/rescore-leaderboard.mjs against the live engine). A site with no entry
// renders its MiniConstellation ring entirely as the unscored dashed state.
const merged: Omit<SeedSite, 'rank'>[] = RAW_SEED.map((s) =>
  BATCH_CATEGORY_SCORES[s.url]
    ? { ...s, categoryScores: BATCH_CATEGORY_SCORES[s.url] }
    : s
);

/** The words a stale entry carries wherever it is shown. */
export function staleLabel(scoredAt: string | null | undefined): string {
  return `last scored ${scoredAt ?? 'on an earlier run'} · could not re-score`;
}

// Assign ranks. Only a site measured on the latest run is ranked: one the
// engine could not re-score (unreachable, set by scripts/rescore-leaderboard.mjs
// on any run that gets no score back) keeps its last measurement, dated and
// labelled, but is not ranked as if it were current.
const byScore = (a: Omit<SeedSite, 'rank'>, b: Omit<SeedSite, 'rank'>) => (b.score as number) - (a.score as number);
const current = merged.filter((s) => s.score !== null && !s.unreachable).sort(byScore);
const stale = merged.filter((s) => s.score !== null && s.unreachable).sort(byScore);
const unscored = merged.filter((s) => s.score === null);

export const SEED: SeedSite[] = [
  ...current.map((s, i) => ({ ...s, rank: i + 1, status: 'current' as const, statusLabel: null })),
  ...stale.map((s) => ({ ...s, rank: null, status: 'stale' as const, statusLabel: staleLabel(s.scoredAt) })),
  ...unscored.map((s) => ({ ...s, rank: null, status: 'unscored' as const, statusLabel: 'not scored yet' })),
];

/** Disputes go to the address the site publishes (lib/site-meta). */
export const LEADERBOARD_DISPUTE_EMAIL = SITE_CONTACT_EMAIL;

/** A prefilled dispute mail for one site, its subject URL-encoded. */
export function disputeMailto(siteName: string): string {
  return contactMailto(`Dispute: ${siteName} leaderboard score`);
}

export const LEADERBOARD_LAST_SCORED = '2026-10-12';

// The engine version that produced these scores, read from the engine's own
// receipt by scripts/rescore-leaderboard.mjs. The pages used to print the
// repo's ENGINE_VERSION beside these numbers, so an engine bump labelled
// scores the previous engine made with the new version until the next run.
export const LEADERBOARD_ENGINE_VERSION = '1.3.0';

export const LEADERBOARD_POLICY =
  `Curated seed (30 sites). Scores are deterministic: ${ENGINE_CHECK_COUNT} checks, no LLM. ` +
  'Only sites measured on the latest weekly run are ranked; a site the engine could not re-score keeps its last score, dated, outside the ranking. ' +
  'Entries Designesy operates and competing products are labelled. ' +
  `Any URL can be scored on submission, but a submission is not stored or added to the seed. To propose a site or dispute a score, email ${SITE_CONTACT_EMAIL}. ` +
  'No paywall, no pay-to-remove.';

/** Ranked (current) entries, for "rank N of M". */
export const LEADERBOARD_RANKED_COUNT = SEED.filter((s) => s.status === 'current').length;
/** Entries shown with their last score because the latest run could not re-score them. */
export const LEADERBOARD_STALE_COUNT = SEED.filter((s) => s.status === 'stale').length;

export const LEADERBOARD_VERSION = '0.4.5';

export const LEADERBOARD_SCORED_COUNT = SEED.filter((s) => s.score !== null).length;
