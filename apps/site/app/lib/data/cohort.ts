// The scored cohort, derived once from the seed. The public leaderboard and
// the pages built on it (state of compliance, framework evaluations) are
// withdrawn (decided 2026-10-23), and the seed now holds the designesy.org
// row alone, so this module serves that self row, the category order and the grade
// helpers to /methodology, /benchmarks and the home page's category rack.
// Anything a page states about a scored site comes from here.
//
// Two dates, because there are two sources: the composite score is dated by
// seed.ts (LEADERBOARD_LAST_SCORED); the per-category breakdowns come from one
// batch run (batch-data.ts, BATCH_RUN_DATE). A figure that uses both says
// both.

import {
  SEED,
  LEADERBOARD_LAST_SCORED,
  LEADERBOARD_ENGINE_VERSION,
  LEADERBOARD_VERSION,
  staleLabel,
  type Grade,
  type SeedSite,
  type CategoryBreakdown,
  type Relationship,
} from '../../leaderboard/seed';
import { BATCH_CATEGORY_SCORES, BATCH_RUN_DATE } from '../../leaderboard/batch-data';
import { CATEGORY_WEIGHTS } from '../check-definitions';

export { BATCH_RUN_DATE };
export const SCORES_DATE = LEADERBOARD_LAST_SCORED;
/** The engine version that produced the scores dated SCORES_DATE (not the repo's current engine). */
export const SCORES_ENGINE_VERSION = LEADERBOARD_ENGINE_VERSION;
/** The contract version those scores were measured against, in display form
    (not the registry's current CONTRACT_VERSION, which can move between runs). */
export const SCORES_CONTRACT_VERSION = `v${LEADERBOARD_VERSION}`;
export const SELF_URL = 'https://www.designesy.org';

export type CohortSite = {
  url: string;
  host: string;
  slug: string;
  name: string;
  score: number;
  grade: Grade;
  /** Rank among the sites measured on the latest run; null for a stale site. */
  rank: number | null;
  tier: number;
  category: string;
  prevScore: number | null;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  tokens: number | null;
  self: boolean;
  /** The engine could not read the site on the last run; the score is held over. */
  unreachable: boolean;
  /** Not re-scored on the latest run: shown with its last score, never ranked. */
  stale: boolean;
  /** "last scored <date> · could not re-score", or null for a current site. */
  staleLabel: string | null;
  scoredAt: string | null;
  categories: Record<string, CategoryBreakdown> | null;
  seededBecause: string;
  coi: string | null;
  liveScoreUrl: string | null;
  /** 'operator' (Designesy runs it), 'competitor' (a competing product), or null. */
  relationship: Relationship | null;
};

/** The words on a labelled entry, wherever it is listed. */
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  operator: 'operated by Designesy',
  competitor: 'competing product',
};

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The framework page slug (frameworks/[slug]), one rule for every link to it. */
export function slugify(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .replace(/[./]/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

function toSite(s: SeedSite): CohortSite {
  return {
    url: s.url,
    host: hostOf(s.url),
    slug: slugify(s.url),
    name: s.name,
    score: s.score as number,
    grade: s.grade as Grade,
    rank: s.rank,
    tier: s.tier,
    category: s.category,
    prevScore: s.prevScore,
    pass: s.pass ?? 0,
    fail: s.fail ?? 0,
    warn: s.warn ?? 0,
    skip: s.skip ?? 0,
    tokens: s.tokens,
    self: s.url === SELF_URL,
    unreachable: !!s.unreachable,
    stale: s.status === 'stale',
    staleLabel: s.status === 'stale' ? staleLabel(s.scoredAt) : null,
    scoredAt: s.scoredAt ?? null,
    categories: BATCH_CATEGORY_SCORES[s.url] ?? null,
    seededBecause: s.seededBecause,
    coi: s.coiDisclosure ?? null,
    liveScoreUrl: s.liveScoreUrl ?? null,
    relationship: s.relationship ?? null,
  };
}

/** Scored sites: the ranked ones in rank order, then the stale ones (a last
    score the latest run could not renew), highest first. */
export const COHORT: CohortSite[] = SEED.filter((s) => s.score !== null && s.grade !== null)
  .map(toSite)
  .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score);

/** The ranking: sites measured on the latest run. */
export const RANKED: CohortSite[] = COHORT.filter((s) => s.rank !== null);
/** Sites the latest run could not re-score, shown apart from the ranking. */
export const STALE: CohortSite[] = COHORT.filter((s) => s.stale);

/** "rank 4 of 27", or the stale label for a site outside the ranking. */
export function rankText(s: CohortSite): string {
  return s.rank !== null ? `rank ${s.rank} of ${RANKED.length}` : (s.staleLabel ?? 'not ranked');
}

/** Seed entries with no score yet (none today; the page says so when there are). */
export const UNSCORED = SEED.filter((s) => s.score === null);

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** One decimal, as the engine reports: 70 prints as 70.0 in a column of scores. */
export function fmt(n: number): string {
  return n.toFixed(1);
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const scores = COHORT.map((s) => s.score);

export const COHORT_STATS = {
  count: COHORT.length,
  mean: round1(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)),
  median: round1(median(scores)),
  min: Math.min(...scores),
  max: Math.max(...scores),
  heldOver: COHORT.filter((s) => s.unreachable).length,
  ranked: RANKED.length,
};

export const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'F'];

export const GRADE_COUNTS: Record<Grade, number> = Object.fromEntries(
  GRADES.map((g) => [g, COHORT.filter((s) => s.grade === g).length]),
) as Record<Grade, number>;

/** The engine's grade bands (computeGrade in api/score/route.ts). */
export const GRADE_BANDS: { grade: Grade; min: number; max: number }[] = [
  { grade: 'F', min: 0, max: 60 },
  { grade: 'D', min: 60, max: 70 },
  { grade: 'C', min: 70, max: 80 },
  { grade: 'B', min: 80, max: 90 },
  { grade: 'A', min: 90, max: 100 },
];

/** A and B pass, C and D warn, F fails: the three-tier band of a grade, for
    category bars on the grade thresholds. A grade itself is never drawn
    in a band: chips, dots, zones and grade bars take data-grade and the grade
    palette. */
export function toneOf(grade: string): 'pass' | 'warn' | 'fail' {
  return grade === 'A' || grade === 'B' ? 'pass' : grade === 'C' || grade === 'D' ? 'warn' : 'fail';
}

/** A category score on the same thresholds as a grade. */
export function scoreTone(score: number): 'pass' | 'warn' | 'fail' {
  return score >= 80 ? 'pass' : score >= 60 ? 'warn' : 'fail';
}

export const CATEGORY_LABELS: Record<string, string> = {
  cadence: 'Typography',
  accessibility: 'Accessibility',
  semantic: 'Color roles',
  motion: 'Motion',
  tokens: 'Tokens',
  takt: 'Interface feel',
  poise: 'Control polish',
  identity: 'Page basics',
  interaction: 'Interaction',
  performance: 'Performance',
  responsive: 'Responsive',
  copywriting: 'Copywriting',
  security: 'Security',
  spec: 'DESIGN.md',
};

/** The engine's categories, heaviest first (lib/check-definitions, which
    mirrors the route's CATEGORY_WEIGHTS). */
export const CATEGORY_ORDER: string[] = Object.entries(CATEGORY_WEIGHTS)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([k]) => k);

export const WEIGHT_TOTAL = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);

/** The categories the batch run recorded, heaviest first. */
export const BATCH_CATEGORIES: string[] = CATEGORY_ORDER.filter((k) =>
  Object.values(BATCH_CATEGORY_SCORES).some((cats) => k in cats),
);

/** One category across the cohort: its mean where scored, how many sites the
    batch could score in it, and how many carried at least one failed check. */
export function categoryStats(key: string): { mean: number | null; scored: number; failing: number } {
  const cats = COHORT.map((s) => s.categories?.[key]).filter((c): c is CategoryBreakdown => !!c);
  const vals = cats.map((c) => c.score).filter((v): v is number => typeof v === 'number');
  return {
    mean: vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    scored: vals.length,
    failing: cats.filter((c) => c.fail > 0).length,
  };
}

/** "designesy.org (scored by its own engine), A and B": the sites at one
    grade, named as the seed names them. */
export function namesAt(grade: Grade): string {
  const names = COHORT.filter((s) => s.grade === grade).map((s) =>
    s.self ? `${s.host} (scored by its own engine)` : s.name,
  );
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The grade (or grades, on a tie) holding the most sites. */
export const WIDEST_GRADES: Grade[] = GRADES.filter(
  (g) => GRADE_COUNTS[g] === Math.max(...GRADES.map((x) => GRADE_COUNTS[x])),
);

export function bySlug(slug: string): CohortSite | undefined {
  return COHORT.find((s) => s.slug === slug);
}

export function byUrl(url: string): CohortSite | undefined {
  return COHORT.find((s) => s.url === url);
}

/** Sites in one seed category, best first; the engine's own site can be left out. */
export function inCategory(category: string, withSelf = true): CohortSite[] {
  return COHORT.filter((s) => s.category === category && (withSelf || !s.self));
}
