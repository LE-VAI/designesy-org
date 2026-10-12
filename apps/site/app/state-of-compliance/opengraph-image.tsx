import { renderOgCard } from '../lib/og-card';
import { ENGINE_CHECK_COUNT } from '../hero-stats';
import { COHORT_STATS, GRADE_COUNTS } from '../lib/data/cohort';

// Counts from the cohort data at build, never typed: this card said "1 A-grade"
// while three sites held an A.
const TITLE = `${COHORT_STATS.count} sites, ${ENGINE_CHECK_COUNT} checks, ${GRADE_COUNTS.A} at grade A`;

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `Designesy State of Compliance: ${TITLE}`;

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'State of Compliance',
    title: TITLE,
    lede: `A deterministic report on design-contract compliance across ${COHORT_STATS.count} sites: computed, not surveyed.`,
    path: 'designesy.org/state-of-compliance',
  });
}