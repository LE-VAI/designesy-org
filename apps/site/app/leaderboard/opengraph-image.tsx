import { renderOgCard } from '../lib/og-card';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { COHORT, GRADE_COUNTS } from '../lib/data/cohort';

// Counted from the cohort data at build: this card said "Designesy is the only
// A-grade site" while three sites held an A.
const A = GRADE_COUNTS.A;

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `Designesy Leaderboard: ${COHORT.length} sites scored`;

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Leaderboard',
    title: `${COHORT.length} sites scored`,
    lede: `Scored by the same deterministic ${ENGINE_CHECK_COUNT}-check engine. ${A === 1 ? 'One site reaches' : `${A} sites reach`} A.`,
    path: 'designesy.org/leaderboard',
  });
}