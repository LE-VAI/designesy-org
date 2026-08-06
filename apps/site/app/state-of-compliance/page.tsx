// /state-of-compliance — the annual "State of Design Compliance" report.
//
// This page is the trust-asset hub: it synthesizes existing leaderboard data
// into a narrative that establishes Designesy as the institution of record
// for design-system contract compliance. Pattern extracted from four
// competitive audits (Artificial Analysis, zeroheight, Material Design 3,
// Arena): "the trust asset IS the product; the product monetizes around it."
//
// Data sources (all existing — no new infrastructure):
//   - leaderboard/seed.ts (30 scored sites, grade distribution, delta badges)
//   - leaderboard/batch-data.ts (per-category breakdowns for M3 flagship finding)
//   - methodology/page.tsx CHECKS array (40 checks, 14 categories, weights)
//   - hero-stats.ts (engine check count, contract version, self-score)
//
// Sections:
//   1. The Trust Contract — independence firewall
//   2. The Cohort — aggregate stats + grade distribution histogram
//   3. The Flagship Finding — Material 3 scores 59/F
//   4. Framework Rankings — Design Systems category sorted by score
//   5. Methodology — summary + link to full /methodology
//   6. The Cadence — 24h SLA + weekly re-score + next report

import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { CountUp } from '../lib/count-up';
import {
  SEED,
  LEADERBOARD_LAST_SCORED,
  LEADERBOARD_SCORED_COUNT,
  type Grade,
} from '../leaderboard/seed';
import { BATCH_CATEGORY_SCORES } from '../leaderboard/batch-data';
import {
  ENGINE_CHECK_COUNT,
  CONTRACT_VERSION,
  SELF_SCORE,
  SELF_GRADE,
} from '../hero-stats';

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'State of Design Compliance',
  description:
    'The first deterministic report on design-system contract compliance across the web. 30 sites scored against a 40-check engine. Material 3 scores 59/F. Only 1 site passes. No surveys, no votes — computed scores.',
  path: '/state-of-compliance',
  ogTitle: 'State of Design Compliance · Designesy',
  ogDescription:
    '30 sites. 40 deterministic checks. 1 A-grade. Material 3 scores 59/F. The first computed report on design compliance — not a survey, not a vote.',
  twitterDescription:
    'State of Design Compliance — 30 sites scored, only 1 passes. Material 3 scores 59/F. designesy.org/state-of-compliance',
});

// ── Derived data ───────────────────────────────────────────────────────────

const SCORED_SITES = SEED.filter((s) => s.score !== null);
const GRADE_COUNTS: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
for (const s of SCORED_SITES) {
  if (s.grade && s.grade in GRADE_COUNTS) GRADE_COUNTS[s.grade]++;
}
const SCORE_VALUES = SCORED_SITES.map((s) => s.score as number);
const MEAN_SCORE =
  SCORE_VALUES.length > 0
    ? Math.round((SCORE_VALUES.reduce((a, b) => a + b, 0) / SCORE_VALUES.length) * 10) / 10
    : 0;
const MEDIAN_SCORE =
  SCORE_VALUES.length > 0
    ? Math.round(
        (SCORE_VALUES.slice().sort((a, b) => a - b)[Math.floor(SCORE_VALUES.length / 2)]) * 10,
      ) / 10
    : 0;

const GRADE_BANDS = [
  { grade: 'A' as Grade, count: GRADE_COUNTS['A'], min: 90, color: 'var(--signal-light)', bg: 'var(--signal-dim)' },
  { grade: 'B' as Grade, count: GRADE_COUNTS['B'], min: 80, color: 'var(--activation)', bg: 'rgba(254,204,52,0.14)' },
  { grade: 'C' as Grade, count: GRADE_COUNTS['C'], min: 70, color: 'var(--line-strong)', bg: 'var(--surface-hover)' },
  { grade: 'D' as Grade, count: GRADE_COUNTS['D'], min: 60, color: 'var(--muted)', bg: 'var(--surface-soft)' },
  { grade: 'F' as Grade, count: GRADE_COUNTS['F'], min: 0, color: 'var(--muted-dim)', bg: 'transparent' },
];
const MAX_GRADE_COUNT = Math.max(1, ...GRADE_BANDS.map((g) => g.count));

// Framework rankings — Design Systems category, sorted by score desc
const DESIGN_SYSTEMS_SITES = SCORED_SITES.filter((s) => s.category === 'Design Systems').sort(
  (a, b) => (b.score as number) - (a.score as number),
);

// M3 flagship finding — pull its specific category breakdown
const M3_URL = 'https://m3.material.io';
const M3_SITE = SEED.find((s) => s.url === M3_URL);
const M3_CATEGORIES = BATCH_CATEGORY_SCORES[M3_URL] || {};
const M3_SCORED_CATEGORIES = Object.entries(M3_CATEGORIES).filter(
  ([, v]) => v.score !== null,
);
const M3_BEST_CATEGORY = M3_SCORED_CATEGORIES.sort(
  (a, b) => (b[1].score as number) - (a[1].score as number),
)[0];
const M3_WORST_CATEGORY = M3_SCORED_CATEGORIES.sort(
  (a, b) => (a[1].score as number) - (b[1].score as number),
)[0];

// Universal fail patterns — categories where most of the cohort struggles
function categoryFailRate(categoryKey: string): { passRate: number; avgScore: number } {
  let totalScore = 0;
  let count = 0;
  for (const [url, cats] of Object.entries(BATCH_CATEGORY_SCORES)) {
    const cat = cats[categoryKey];
    if (cat && cat.score !== null) {
      totalScore += cat.score;
      count++;
    }
  }
  return {
    avgScore: count > 0 ? Math.round((totalScore / count) * 10) / 10 : 0,
    passRate: count > 0 ? Math.round((totalScore / count)) : 0,
  };
}

const COHORT_STRUGGLES = [
  { category: 'interaction', label: 'Focus visibility', ...categoryFailRate('interaction') },
  { category: 'takt', label: 'Interaction feel', ...categoryFailRate('takt') },
  { category: 'motion', label: 'Motion hygiene', ...categoryFailRate('motion') },
  { category: 'tokens', label: 'Token architecture', ...categoryFailRate('tokens') },
  { category: 'cadence', label: 'Typography discipline', ...categoryFailRate('cadence') },
].sort((a, b) => a.avgScore - b.avgScore);

// Compliance index version — exposed in the API response, stated here for transparency
const COMPLIANCE_INDEX_VERSION = '1.0';

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function StateOfCompliancePage() {
  return (
    <>
      <Topbar scrolled />

      <main
        id="main-content"
        className="surface-page soc-page"
        data-pagefind-meta="priority:high"
      >
        <style>{`
          .soc-page .soc-section { max-width: var(--maxw, 1080px); margin: 0 auto; padding: clamp(2.5rem, 5vw, 4rem) 1.5rem; }
          .soc-page .soc-prose { max-width: 66ch; }
          .soc-page .soc-prose p { color: var(--muted); font-size: 1rem; line-height: 1.65; margin: 0 0 1rem; }
          .soc-page .soc-prose strong { color: var(--ink); font-weight: 600; }
          .soc-page .soc-prose code { color: var(--ink); background: var(--surface-soft); padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.88em; font-family: var(--mono, ui-monospace, monospace); }
          .soc-page .soc-trust { padding: 1.5rem 1.75rem; background: var(--surface); background-image: var(--surface-card-gradient); border: 1px solid var(--line); border-left: 3px solid var(--signal); border-radius: 6px; margin: 0 0 2rem; max-width: 66ch; box-shadow: var(--inner-light); }
          .soc-page .soc-trust-eyebrow { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--signal-light); font-weight: 700; margin: 0 0 0.75rem; font-family: var(--mono, ui-monospace, monospace); }
          .soc-page .soc-trust p { color: var(--muted); font-size: 0.95rem; line-height: 1.6; margin: 0; }
          .soc-page .soc-trust strong { color: var(--ink); font-weight: 600; }
          .soc-page .soc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; margin: 1.5rem 0; }
          .soc-page .soc-stat { padding: 1rem 1.25rem; background: var(--surface); background-image: var(--surface-card-gradient); border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--inner-light); text-align: center; }
          .soc-page .soc-stat-num { display: block; font-family: var(--mono, ui-monospace, monospace); font-size: 1.6rem; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1; }
          .soc-page .soc-stat-suffix { font-size: 0.85rem; font-weight: 400; color: var(--muted-dim); }
          .soc-page .soc-stat-label { display: block; margin-top: 0.4rem; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted-dim); }
          .soc-page .soc-histogram { margin: 1.5rem 0; }
          .soc-page .soc-histogram-bars { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.625rem; align-items: end; min-height: 140px; padding: 0.5rem 0; }
          .soc-page .soc-hist-col { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
          .soc-page .soc-hist-bar-wrap { display: flex; flex-direction: column; justify-content: flex-end; width: 100%; height: 100px; }
          .soc-page .soc-hist-bar { width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; border: 1px solid var(--line-faint); border-bottom: none; transform-origin: bottom center; animation: socBarGrow var(--duration, 0.8s) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)) both; }
          @keyframes socBarGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
          @media (prefers-reduced-motion: reduce) { .soc-page .soc-hist-bar { animation: none; transform: none; } }
          .soc-page .soc-hist-bar-count { font-family: var(--mono, ui-monospace, monospace); font-size: 0.82rem; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
          .soc-page .soc-hist-label { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; padding-top: 0.3rem; border-top: 1px solid var(--line); width: 100%; }
          .soc-page .soc-hist-grade { font-family: var(--mono, ui-monospace, monospace); font-weight: 700; font-size: 0.92rem; }
          .soc-page .soc-hist-range { font-family: var(--mono, ui-monospace, monospace); font-size: 0.62rem; color: var(--muted-dim); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
          .soc-page .soc-flagship { padding: 1.75rem 2rem; background: var(--surface); background-image: var(--surface-card-gradient); border: 1px solid var(--line); border-radius: 8px; margin: 1.5rem 0; box-shadow: var(--inner-light); }
          .soc-page .soc-flagship-header { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
          .soc-page .soc-flagship-grade { display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: 6px; font-weight: 700; font-size: 1.1rem; font-family: var(--mono, ui-monospace, monospace); border: 1px solid var(--line-faint); background: transparent; color: var(--muted-dim); flex-shrink: 0; }
          .soc-page .soc-flagship-score { font-family: var(--mono, ui-monospace, monospace); font-size: 2rem; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1; }
          .soc-page .soc-flagship-score-suffix { color: var(--muted-dim); font-weight: 400; font-size: 1rem; }
          .soc-page .soc-flagship-name { font-size: 1.1rem; font-weight: 600; color: var(--ink); }
          .soc-page .soc-flagship-sub { font-size: 0.85rem; color: var(--muted-dim); margin-top: 0.2rem; }
          .soc-page .soc-cat-bars { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.25rem; }
          .soc-page .soc-cat-bar-row { display: grid; grid-template-columns: 7rem 1fr 3rem; gap: 0.75rem; align-items: center; }
          .soc-page .soc-cat-bar-label { font-size: 0.78rem; color: var(--muted); text-align: right; }
          .soc-page .soc-cat-bar-track { height: 6px; background: var(--surface-soft); border-radius: 3px; overflow: hidden; }
          .soc-page .soc-cat-bar-fill { height: 100%; border-radius: 3px; transition: width var(--duration, 0.8s) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)); }
          .soc-page .soc-cat-bar-val { font-family: var(--mono, ui-monospace, monospace); font-size: 0.75rem; color: var(--muted-dim); font-variant-numeric: tabular-nums; text-align: right; }
          .soc-page .soc-rank-table { width: 100%; border-collapse: separate; border-spacing: 0; }
          .soc-page .soc-rank-table th { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-dim); font-weight: 600; text-align: left; padding: 0.5rem 0.625rem; border-bottom: 1px solid var(--line); }
          .soc-page .soc-rank-table th.soc-th-score { text-align: right; }
          .soc-page .soc-rank-table td { padding: 0.7rem 0.625rem; border-bottom: 1px solid var(--line-faint); vertical-align: middle; }
          .soc-page .soc-rank-table td.soc-td-score { text-align: right; font-family: var(--mono, ui-monospace, monospace); font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
          .soc-page .soc-rank-name { color: var(--ink); text-decoration: none; border-bottom: 1px solid transparent; font-weight: 500; }
          .soc-page .soc-rank-name:hover { color: var(--ink); border-bottom-color: var(--line-strong); }
          .soc-page .soc-rank-host { font-size: 0.75rem; color: var(--muted-dim); margin-top: 0.15rem; }
          .soc-page .soc-rank-grade { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; border-radius: 4px; font-weight: 700; font-size: 0.72rem; font-family: var(--mono, ui-monospace, monospace); border: 1px solid var(--line); }
          .soc-page .soc-rank-grade-a { background: var(--signal-dim); color: var(--ink); border-color: var(--signal-light); }
          .soc-page .soc-rank-grade-c { background: var(--surface-hover); color: var(--ink); border-color: var(--line-strong); }
          .soc-page .soc-rank-grade-d { background: var(--surface-hover); color: var(--muted); border-color: var(--line); }
          .soc-page .soc-rank-grade-f { background: transparent; color: var(--muted-dim); border-color: var(--line-faint); }
          .soc-page .soc-rank-self { background: var(--signal-dim); }
          .soc-page .soc-rank-self:hover { background: var(--signal-dim); }
          .soc-page .soc-struggle-bars { display: flex; flex-direction: column; gap: 0.625rem; margin: 1rem 0; }
          .soc-page .soc-struggle-row { display: grid; grid-template-columns: 9rem 1fr 3rem; gap: 0.75rem; align-items: center; }
          .soc-page .soc-struggle-label { font-size: 0.82rem; color: var(--muted); }
          .soc-page .soc-struggle-track { height: 8px; background: var(--surface-soft); border-radius: 4px; overflow: hidden; }
          .soc-page .soc-struggle-fill { height: 100%; border-radius: 4px; transition: width var(--duration, 0.8s) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)); }
          .soc-page .soc-struggle-val { font-family: var(--mono, ui-monospace, monospace); font-size: 0.78rem; color: var(--muted-dim); font-variant-numeric: tabular-nums; text-align: right; }
          .soc-page .soc-cadence-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1.25rem 0; }
          .soc-page .soc-cadence-card { padding: 1.25rem 1.5rem; background: var(--surface); background-image: var(--surface-card-gradient); border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--inner-light); }
          .soc-page .soc-cadence-card-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted-dim); font-weight: 600; margin: 0 0 0.5rem; font-family: var(--mono, ui-monospace, monospace); }
          .soc-page .soc-cadence-card-val { font-size: 0.95rem; color: var(--ink); font-weight: 600; line-height: 1.4; }
          .soc-page .soc-cadence-card-detail { font-size: 0.82rem; color: var(--muted); margin-top: 0.35rem; line-height: 1.45; }
          .soc-page .soc-version-stamp { font-family: var(--mono, ui-monospace, monospace); font-size: 0.72rem; color: var(--muted-dim); letter-spacing: 0.02em; padding: 0.4rem 0.75rem; background: var(--surface-soft); border: 1px solid var(--line-faint); border-radius: 4px; display: inline-block; }
          @media (max-width: 560px) {
            .soc-page .soc-histogram-bars { gap: 0.375rem; }
            .soc-page .soc-hist-bar-wrap { height: 70px; }
            .soc-page .soc-hist-range { display: none; }
            .soc-page .soc-cat-bar-row { grid-template-columns: 5rem 1fr 2.5rem; gap: 0.5rem; }
            .soc-page .soc-cat-bar-label { font-size: 0.72rem; }
            .soc-page .soc-struggle-row { grid-template-columns: 7rem 1fr 2.5rem; gap: 0.5rem; }
            .soc-page .soc-struggle-label { font-size: 0.75rem; }
            .soc-page .soc-flagship { padding: 1.25rem 1.25rem; }
          }
        `}</style>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <section className="surface-header fade-up soc-section">
          <p className="surface-eyebrow" data-scramble>
            Annual report · Edition 1
          </p>
          <h1 className="surface-title" data-scramble>
            State of Design Compliance
          </h1>
          <p className="surface-lede">
            The first deterministic report on design-system contract compliance
            across the web. <strong>{LEADERBOARD_SCORED_COUNT}</strong> sites
            scored against a <strong>{ENGINE_CHECK_COUNT}-check</strong> engine.
            No surveys. No votes. No self-reported data. Every score is computed
            from the live CSS the site ships at <code>{':root'}</code>.
          </p>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <Link className="button primary" href="/leaderboard" data-cuelume-press>
              View the leaderboard
            </Link>
            <Link
              className="button ghost"
              href="/methodology"
              data-cuelume-press
              style={{ marginLeft: '0.5rem' }}
            >
              Read the methodology
            </Link>
          </div>
          <p
            className="surface-note"
            style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}
          >
            <span className="soc-version-stamp">
              compliance_index_version: {COMPLIANCE_INDEX_VERSION}
            </span>
            <span className="soc-version-stamp">contract {CONTRACT_VERSION}</span>
            <span className="soc-version-stamp">last scored {LEADERBOARD_LAST_SCORED}</span>
          </p>
        </section>

        {/* ── §1 The Trust Contract ──────────────────────────────────────── */}
        <section className="doctrine-section fade-up soc-section">
          <h2 className="doctrine-heading">The trust contract</h2>
          <div className="soc-trust">
            <p className="soc-trust-eyebrow">Independence firewall</p>
            <p>
              <strong>Designesy does not accept payment for scores, methodology
              changes, or leaderboard placement.</strong> Every score is computed
              by the same deterministic {ENGINE_CHECK_COUNT}-check engine against
              the same published contract. Enterprise customers pay for private
              scoring, custom contracts, and CI integration — never for public
              leaderboard placement. If a scored site is also an enterprise
              customer, their public score is computed identically to any
              non-customer&rsquo;s score. No pre-release optimization. No score
              suppression. The engine is open: run it yourself with{' '}
              <code>npx designesy-score</code> or the{' '}
              <Link href="/docs/mcp">MCP server</Link>.
            </p>
          </div>
          <p className="surface-note" style={{ marginTop: '0.75rem' }}>
            This is the structural separation Artificial Analysis and Arena
            pioneered: the public trust asset is non-monetizable; the consulting
            and private-scoring layer around it is. The difference is that
            Designesy&rsquo;s data is deterministic — there is no vote to
            manipulate, no survey to game, no subjective judge to influence.
          </p>
        </section>

        {/* ── §2 The Cohort ──────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up soc-section">
          <h2 className="doctrine-heading">The cohort</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            {LEADERBOARD_SCORED_COUNT} sites across five tiers — frontier
            references, competitors, design-system exemplars, inspiration, and
            high-traffic surfaces. Scored against contract {CONTRACT_VERSION}{' '}
            with the {ENGINE_CHECK_COUNT}-check engine. Re-scored weekly.
          </p>

          <div className="soc-stats">
            <div className="soc-stat">
              <span className="soc-stat-num">
                <CountUp value={LEADERBOARD_SCORED_COUNT} />
              </span>
              <span className="soc-stat-label">Sites scored</span>
            </div>
            <div className="soc-stat">
              <span className="soc-stat-num">
                <CountUp value={ENGINE_CHECK_COUNT} />
              </span>
              <span className="soc-stat-label">Checks per site</span>
            </div>
            <div className="soc-stat">
              <span className="soc-stat-num">
                <CountUp value={MEAN_SCORE} decimals={1} />
                <span className="soc-stat-suffix">%</span>
              </span>
              <span className="soc-stat-label">Cohort mean</span>
            </div>
            <div className="soc-stat">
              <span className="soc-stat-num">
                <CountUp value={MEDIAN_SCORE} decimals={1} />
                <span className="soc-stat-suffix">%</span>
              </span>
              <span className="soc-stat-label">Median</span>
            </div>
            <div className="soc-stat">
              <span className="soc-stat-num">
                <CountUp value={GRADE_COUNTS['A']} />
              </span>
              <span className="soc-stat-label">A-grade sites</span>
            </div>
            <div className="soc-stat">
              <span className="soc-stat-num">
                <CountUp value={GRADE_COUNTS['F']} />
              </span>
              <span className="soc-stat-label">F-grade sites</span>
            </div>
          </div>

          <h3 className="doctrine-subheading" style={{ marginTop: '2rem' }}>
            Grade distribution
          </h3>
          <div className="soc-histogram">
            <div
              className="soc-histogram-bars"
              role="img"
              aria-label={`Grade distribution: ${GRADE_COUNTS['A']} A, ${GRADE_COUNTS['B']} B, ${GRADE_COUNTS['C']} C, ${GRADE_COUNTS['D']} D, ${GRADE_COUNTS['F']} F`}
            >
              {GRADE_BANDS.map((band) => (
                <div key={band.grade} className="soc-hist-col">
                  <span className="soc-hist-bar-count">
                    <CountUp value={band.count} />
                  </span>
                  <div className="soc-hist-bar-wrap">
                    <div
                      className="soc-hist-bar"
                      style={{
                        height: `${(band.count / MAX_GRADE_COUNT) * 100}%`,
                        background: band.bg,
                        borderColor: band.color,
                      }}
                      title={`${band.grade}: ${band.count} site${band.count !== 1 ? 's' : ''} (score ≥ ${band.min})`}
                    />
                  </div>
                  <div className="soc-hist-label">
                    <span className="soc-hist-grade" style={{ color: band.color }}>
                      {band.grade}
                    </span>
                    <span className="soc-hist-range">≥{band.min}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="surface-note" style={{ marginTop: '0.75rem', maxWidth: '66ch' }}>
            <strong>One A-grade site</strong> in a cohort of{' '}
            {LEADERBOARD_SCORED_COUNT}. The contract is demanding — most sites
            land in D or F because they don&rsquo;t ship the primitives (token
            systems, reduced-motion blocks, font-synthesis rules) at{' '}
            <code style={{ color: 'var(--ink)' }}>{':root'}</code>. That is the
            point: the gap between what a site <em>documents</em> and what it{' '}
            <em>ships</em> is exactly what this report surfaces.
          </p>

          <h3 className="doctrine-subheading" style={{ marginTop: '2.5rem' }}>
            Where the cohort struggles
          </h3>
          <p className="surface-note" style={{ marginBottom: '0.75rem' }}>
            Average category scores across the scored cohort. The lowest-scoring
            categories reveal which contract primitives the industry has not yet
            adopted at the shipped-surface level.
          </p>
          <div className="soc-struggle-bars">
            {COHORT_STRUGGLES.map((cat) => (
              <div key={cat.category} className="soc-struggle-row">
                <span className="soc-struggle-label">{cat.label}</span>
                <div className="soc-struggle-track">
                  <div
                    className="soc-struggle-fill"
                    style={{
                      width: `${cat.avgScore}%`,
                      background:
                        cat.avgScore < 55
                          ? 'var(--muted-dim)'
                          : cat.avgScore < 70
                            ? 'var(--muted)'
                            : 'var(--signal)',
                    }}
                  />
                </div>
                <span className="soc-struggle-val">{cat.avgScore.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── §3 The Flagship Finding — M3 ───────────────────────────────── */}
        <section className="doctrine-section fade-up soc-section">
          <h2 className="doctrine-heading">The flagship finding</h2>
          <p className="soc-prose">
            <strong>Material Design 3</strong> — Google&rsquo;s design system,
            the most influential on Earth — has no public conformance,
            verification, or certification tool. None. m3.material.io provides
            guidelines but no automated conformance checker. We scored it.
          </p>

          {M3_SITE && M3_SITE.score !== null && M3_SITE.grade !== null && (
            <div className="soc-flagship">
              <div className="soc-flagship-header">
                <span className="soc-flagship-grade soc-rank-grade-f">
                  {M3_SITE.grade}
                </span>
                <div>
                  <div>
                    <span className="soc-flagship-score">
                      <CountUp value={M3_SITE.score} decimals={1} />
                    </span>
                    <span className="soc-flagship-score-suffix">%</span>
                  </div>
                  <div className="soc-flagship-name">Material Design 3</div>
                  <div className="soc-flagship-sub">
                    {M3_SITE.pass} pass · {M3_SITE.fail} fail ·{' '}
                    {M3_SITE.warn} warn · {M3_SITE.skip} skip ·{' '}
                    {M3_SITE.tokens} tokens detected
                  </div>
                </div>
              </div>

              <p
                className="surface-note"
                style={{ margin: '1rem 0 0', maxWidth: '60ch' }}
              >
                M3&rsquo;s guidelines specify accessibility, motion, and token
                architecture in prose. The contract verifies whether those
                guidelines are actually <em>shipped</em> on the live surface.
                The gap between documented and shipped is the finding.
              </p>

              {M3_BEST_CATEGORY && M3_WORST_CATEGORY && (
                <div className="soc-cat-bars">
                  {Object.entries(M3_CATEGORIES)
                    .filter(([, v]) => v.score !== null)
                    .sort((a, b) => (b[1].score as number) - (a[1].score as number))
                    .map(([catKey, cat]) => (
                      <div key={catKey} className="soc-cat-bar-row">
                        <span className="soc-cat-bar-label">
                          {catKey.charAt(0).toUpperCase() + catKey.slice(1)}
                        </span>
                        <div className="soc-cat-bar-track">
                          <div
                            className="soc-cat-bar-fill"
                            style={{
                              width: `${cat.score}%`,
                              background:
                                (cat.score as number) >= 75
                                  ? 'var(--signal)'
                                  : (cat.score as number) >= 50
                                    ? 'var(--muted)'
                                    : 'var(--muted-dim)',
                            }}
                          />
                        </div>
                        <span className="soc-cat-bar-val">
                          {(cat.score as number).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                </div>
              )}

              <p
                className="surface-note"
                style={{ marginTop: '1rem', fontSize: '0.82rem' }}
              >
                Best category: <strong>{M3_BEST_CATEGORY[0]}</strong> at{' '}
                {(M3_BEST_CATEGORY[1].score as number).toFixed(1)}%. Worst
                scored category: <strong>{M3_WORST_CATEGORY[0]}</strong> at{' '}
                {(M3_WORST_CATEGORY[1].score as number).toFixed(1)}%. M3&rsquo;s
                token architecture (DSP) was{' '}
                <a
                  href="https://github.com/material-foundation/material-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line-faint)' }}
                >
                  archived October 2024
                </a>{' '}
                and does not emit W3C DTCG format. M3 Expressive ships
                spring-based motion with no published reduced-motion token. The
                contract catches what the guidelines leave as prose.
              </p>

              <div style={{ marginTop: '1rem' }}>
                <Link
                  href={`/score?url=${encodeURIComponent('m3.material.io')}`}
                  className="lb-score-link"
                  style={{ fontSize: '0.85rem' }}
                  data-cuelume-press
                >
                  Re-score m3.material.io live →
                </Link>
              </div>
            </div>
          )}

          <p className="soc-prose" style={{ marginTop: '1.25rem' }}>
            This is the demonstration. The system that wrote the guidelines
            doesn&rsquo;t have a tool to verify its own output — we do. The same
            engine that scores M3 scores designesy.org (self-score:{' '}
            <strong>{SELF_SCORE.toFixed(1)}% / {SELF_GRADE}</strong>), in
            public, with the same 40 checks. Transparency earns trust.
          </p>
        </section>

        {/* ── §4 Framework Rankings ──────────────────────────────────────── */}
        <section className="doctrine-section fade-up soc-section">
          <h2 className="doctrine-heading">Framework rankings</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Design-system frameworks and documentation platforms in the cohort,
            ranked by compliance score. Each framework is a potential case
            study — each score is a piece of content.
          </p>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="soc-rank-table">
              <thead>
                <tr>
                  <th scope="col">Framework</th>
                  <th scope="col" className="soc-th-score">Grade</th>
                  <th scope="col" className="soc-th-score">Score</th>
                  <th scope="col" className="soc-th-score">Checks</th>
                </tr>
              </thead>
              <tbody>
                {DESIGN_SYSTEMS_SITES.map((site) => {
                  const isSelf = site.url === 'https://www.designesy.org';
                  const gradeClass = `soc-rank-grade-${(site.grade as string).toLowerCase()}`;
                  return (
                    <tr
                      key={site.url}
                      className={isSelf ? 'soc-rank-self' : ''}
                      style={isSelf ? { background: 'var(--signal-dim)' } : undefined}
                    >
                      <td>
                        <Link
                          href={`/score?url=${encodeURIComponent(hostOf(site.url))}`}
                          className="soc-rank-name"
                          data-cuelume-hover="whisper"
                          data-cuelume-press
                        >
                          {site.name}
                          {isSelf && (
                            <span
                              className="lb-self-tag"
                              style={{ marginLeft: '0.5rem' }}
                            >
                              self
                            </span>
                          )}
                        </Link>
                        <div className="soc-rank-host">{hostOf(site.url)}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`soc-rank-grade ${gradeClass}`}>
                          {site.grade}
                        </span>
                      </td>
                      <td className="soc-td-score">
                        <CountUp value={site.score as number} decimals={1} />
                        <span style={{ color: 'var(--muted-dim)', fontWeight: 400 }}>
                          {' '}
                          %
                        </span>
                      </td>
                      <td className="soc-td-score" style={{ fontSize: '0.75rem', color: 'var(--muted-dim)' }}>
                        {site.pass}p · {site.fail}f · {site.warn}w
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="surface-note" style={{ marginTop: '0.75rem', maxWidth: '66ch' }}>
            The spread is <strong>{Math.round((DESIGN_SYSTEMS_SITES[0].score as number) - (DESIGN_SYSTEMS_SITES[DESIGN_SYSTEMS_SITES.length - 1].score as number))} points</strong>{' '}
            between the highest and lowest design-system framework. Primer leads
            the non-self cohort at 77.6/C. Material 3 — the most influential
            system on Earth — scores 59/F. The contract does not grade on a
            curve.
          </p>
        </section>

        {/* ── §5 Methodology ─────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up soc-section">
          <h2 className="doctrine-heading">Methodology</h2>
          <div className="soc-prose">
            <p>
              Every score in this report is computed by the same deterministic{' '}
              {ENGINE_CHECK_COUNT}-check engine — no LLM, no human judgment, no
              subjective vote. Each check is a regex, token-resolution, or
              spec-linter test against the live fetched CSS and HTML. The engine
              extracts CSS from the URL, parses <code>{':root'}</code> custom
              properties, and runs {ENGINE_CHECK_COUNT} checks across{' '}
              <strong>14 weighted categories</strong>.
            </p>
            <p>
              The score is a weighted average of PASS/WARN/FAIL results, with an
              accessibility floor: if the accessibility category scores below
              60%, the overall grade is capped at C. Twelve anti-slop rules
              subtract up to 20 points. Seven originality signals add up to 8
              points. Taste is part of the number.
            </p>
            <p>
              The full methodology — every check, its category weight, the
              scoring math, the grade bands, and what the engine cannot measure
              — is documented in full on the{' '}
              <Link href="/methodology" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line-faint)' }}>
                methodology page
              </Link>
              . The engine is open: score any URL at{' '}
              <Link href="/score" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line-faint)' }}>
                /score
              </Link>
              , run it locally with{' '}
              <code>npx designesy-score</code>, or integrate it in CI with the{' '}
              <a
                href="https://github.com/marketplace/actions/designesy-contract-check"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line-faint)' }}
              >
                GitHub Action
              </a>
              .
            </p>
          </div>
        </section>

        {/* ── §6 The Cadence ─────────────────────────────────────────────── */}
        <section className="doctrine-section fade-up soc-section">
          <h2 className="doctrine-heading">The cadence</h2>
          <div className="soc-cadence-grid">
            <div className="soc-cadence-card">
              <p className="soc-cadence-card-label">24-hour SLA</p>
              <p className="soc-cadence-card-val">
                New framework releases scored within 24 hours
              </p>
              <p className="soc-cadence-card-detail">
                When Radix, shadcn/ui, Mantine, Park UI, or Ark UI ship a new
                version, Designesy re-scores their default theme against the
                contract within 24 hours and publishes the result.
              </p>
            </div>
            <div className="soc-cadence-card">
              <p className="soc-cadence-card-label">Weekly re-score</p>
              <p className="soc-cadence-card-val">
                Every site re-scored weekly with delta badges
              </p>
              <p className="soc-cadence-card-detail">
                The leaderboard is re-scored every week via a GitHub Action
                (Mondays 10:00 UTC). Each site shows a delta badge — up, down,
                or flat — since the previous week&rsquo;s score.
              </p>
            </div>
            <div className="soc-cadence-card">
              <p className="soc-cadence-card-label">Annual report</p>
              <p className="soc-cadence-card-val">
                State of Design Compliance published yearly with YoY trends
              </p>
              <p className="soc-cadence-card-detail">
                Each annual edition adds year-over-year trend tables: which
                categories improved, which frameworks moved, which primitives
                the industry adopted. Edition 1 establishes the baseline.
              </p>
            </div>
          </div>
          <p className="surface-note" style={{ marginTop: '1rem', maxWidth: '66ch' }}>
            This is the content engine. Each scored site is a data point. Each
            framework release is a scoring event. Each annual report is a link
            magnet. The longer the leaderboard runs, the more unreplicable the
            dataset becomes — competitors can build a verification engine; they
            cannot replicate years of accumulated scores and trust.
          </p>
        </section>

        <div className="status-note">
          State of Design Compliance · Edition 1 ·{' '}
          {LEADERBOARD_SCORED_COUNT} sites scored against contract{' '}
          {CONTRACT_VERSION} ({ENGINE_CHECK_COUNT} checks, compliance index v
          {COMPLIANCE_INDEX_VERSION}) · last scored{' '}
          {LEADERBOARD_LAST_SCORED} · data derived from the{' '}
          <Link href="/leaderboard">public leaderboard</Link> · re-scored weekly
          via GitHub Action
        </div>
      </main>

      <Footer />
    </>
  );
}