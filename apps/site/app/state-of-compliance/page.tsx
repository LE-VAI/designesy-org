// /state-of-compliance: the annual report on the scored cohort. Every figure
// is computed from the leaderboard's data (lib/data/cohort): the grades, the
// categories the cohort struggles in, one system read against the cohort, and
// the design-system ranking. Edition 1 is the baseline later editions compare
// against.

import type { Metadata } from 'next';
import Link from 'next/link';
import '../instrument.css';
import '../engine.css';
import '../data.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { ENGINE_CHECK_COUNT, CONTRACT_VERSION } from '../hero-stats';
import { CATEGORY_WEIGHTS, ENGINE_VERSION } from '../lib/check-definitions';
import { EngineHead, EngineNext } from '../lib/engine/engine-page';
import {
  COHORT,
  COHORT_STATS,
  GRADE_COUNTS,
  GRADES,
  GRADE_BANDS,
  BATCH_CATEGORIES,
  BATCH_RUN_DATE,
  SCORES_DATE,
  CATEGORY_LABELS,
  WEIGHT_TOTAL,
  categoryStats,
  inCategory,
  byUrl,
  fmt,
  round1,
  toneOf,
  scoreTone,
} from '../lib/data/cohort';
import { DataFigure, DataTable, NotMeasured } from '../lib/data/figure';
import { BarList } from '../lib/data/bars';

export const metadata: Metadata = pageMeta({
  title: 'State of Design Compliance',
  description:
    `The first deterministic report on design-system contract compliance across the web. 30 sites scored against a ${ENGINE_CHECK_COUNT}-check engine. Material 3 scores 59/F. Only 1 site passes. Computed scores, with no surveys or votes.`,
  path: '/state-of-compliance',
  ogTitle: 'State of Design Compliance · Designesy',
  ogDescription:
    '30 sites. 40 deterministic checks. 1 A-grade. Material 3 scores 59/F. The first computed report on design compliance, measured rather than surveyed.',
  twitterDescription:
    'State of Design Compliance: 30 sites scored, only 1 passes. Material 3 scores 59/F. designesy.org/state-of-compliance',
});

export const revalidate = 3600;

// Stated in the API response too; the report names the index version it was built on.
const COMPLIANCE_INDEX_VERSION = '1.0';

const BAND_TEXT: Record<string, string> = {
  A: '90 and up',
  B: '80 to 89.9',
  C: '70 to 79.9',
  D: '60 to 69.9',
  F: 'under 60',
};
const MAX_COUNT = Math.max(1, ...GRADES.map((g) => GRADE_COUNTS[g]));

// Every category the batch recorded, lowest cohort mean first. Categories the
// batch could not score anywhere are named, never drawn as zero.
const CATS = BATCH_CATEGORIES.map((k) => ({ key: k, ...categoryStats(k) }));
const SCORED_CATS = CATS.filter((c) => c.mean !== null).sort((a, b) => (a.mean as number) - (b.mean as number));
const UNSCORED_CATS = CATS.filter((c) => c.mean === null);
const LOWEST = SCORED_CATS[0];
const HIGHEST = SCORED_CATS[SCORED_CATS.length - 1];

const SYSTEMS = inCategory('Design Systems');
const OUTSIDE = SYSTEMS.filter((s) => !s.self);
const SPREAD = SYSTEMS.length ? round1(SYSTEMS[0].score - SYSTEMS[SYSTEMS.length - 1].score) : 0;

const M3 = byUrl('https://m3.material.io');
const M3_ROWS = M3
  ? BATCH_CATEGORIES.map((k) => ({ key: k, m3: M3.categories?.[k]?.score ?? null, mean: categoryStats(k).mean }))
  : [];
const M3_SCORED = M3_ROWS.filter((r) => r.m3 !== null) as { key: string; m3: number; mean: number | null }[];
const M3_BEST = [...M3_SCORED].sort((a, b) => b.m3 - a.m3)[0];
const M3_WORST = [...M3_SCORED].sort((a, b) => a.m3 - b.m3)[0];
const M3_IN_SYSTEMS = M3 ? SYSTEMS.findIndex((s) => s.url === M3.url) + 1 : 0;

const label = (k: string) => CATEGORY_LABELS[k] ?? k;

export default function StateOfCompliancePage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg dx" data-pagefind-meta="priority:high">
        <EngineHead
          route="/state-of-compliance"
          name="State of Design Compliance"
          thesis={`Edition 1: ${COHORT_STATS.count} sites, one deterministic engine, ${ENGINE_CHECK_COUNT} checks. Every figure here comes from the same data as the public leaderboard; none of it is surveyed, voted on or self-reported.`}
          facts={[`edition 1`, `index v${COMPLIANCE_INDEX_VERSION}`, `contract ${CONTRACT_VERSION}`, `scored ${SCORES_DATE}`]}
          contract={{ href: '/leaderboard', label: 'the leaderboard' }}
        >
          <div className="dx-actions">
            <Link className="button primary" href="/leaderboard" data-cuelume-press>
              View the leaderboard
            </Link>
            <Link className="button ghost" href="/methodology" data-cuelume-press>
              Read the methodology
            </Link>
          </div>
          <AgentActions mdPath="/state-of-compliance.md" label="the state of compliance report" />
        </EngineHead>

        <section className="eg-section" aria-labelledby="soc-cohort-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="soc-cohort-h">
                The cohort
              </h2>
              <p className="eg-section-sub">composite scores, weekly run of {SCORES_DATE}</p>
            </div>
          </div>
          <p className="dx-lead">
            {COHORT_STATS.count} sites across five tiers: frontier references, competitors, design-system exemplars,
            inspiration and high-traffic surfaces, scored against contract {CONTRACT_VERSION} and re-scored every week.
          </p>
          <dl className="dx-stats">
            <div>
              <dt>Sites</dt>
              <dd>{COHORT_STATS.count}</dd>
            </div>
            <div>
              <dt>Median</dt>
              <dd>{fmt(COHORT_STATS.median)}</dd>
            </div>
            <div>
              <dt>Mean</dt>
              <dd>{fmt(COHORT_STATS.mean)}</dd>
            </div>
            <div>
              <dt>Grade A</dt>
              <dd>{GRADE_COUNTS.A}</dd>
            </div>
            <div>
              <dt>Grade F</dt>
              <dd>{GRADE_COUNTS.F}</dd>
            </div>
          </dl>

          <DataFigure
            id="soc-grades"
            title="How the grades fall"
            note={
              <>
                Sites per grade. {GRADE_COUNTS.D} of {COHORT_STATS.count} land in D, the widest band; {GRADE_COUNTS.A} reaches A, and
                that one is designesy.org, scored by its own engine.
              </>
            }
            source={`Weekly run of ${SCORES_DATE}, engine ${ENGINE_VERSION}.`}
            table={
              <DataTable
                caption={`Sites per grade, weekly run of ${SCORES_DATE}.`}
                head={['Grade', 'Band', 'Sites', 'Share']}
                numeric={[2, 3]}
                rows={GRADES.map((g) => [
                  g,
                  BAND_TEXT[g],
                  GRADE_COUNTS[g],
                  `${Math.round((GRADE_COUNTS[g] / COHORT_STATS.count) * 100)}%`,
                ])}
              />
            }
          >
            <BarList
              max={MAX_COUNT}
              label={`Sites per grade, of ${COHORT_STATS.count}: ${GRADES.map((g) => `${g} ${GRADE_COUNTS[g]}`).join(', ')}.`}
              bars={GRADES.map((g) => ({
                key: g,
                label: `Grade ${g}`,
                meta: BAND_TEXT[g],
                value: GRADE_COUNTS[g],
                display: String(GRADE_COUNTS[g]),
                tone: toneOf(g),
              }))}
            />
          </DataFigure>
        </section>

        <section className="eg-section" aria-labelledby="soc-struggle-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="soc-struggle-h">
                Where the cohort struggles
              </h2>
              <p className="eg-section-sub">category means, batch run of {BATCH_RUN_DATE}</p>
            </div>
          </div>
          <DataFigure
            id="soc-cats"
            title="Mean score by category, lowest first"
            note={
              <>
                {label(LOWEST.key)} is the weakest category at {fmt(LOWEST.mean as number)}, and {LOWEST.failing} of{' '}
                {LOWEST.scored} sites fail at least one of its checks. {label(HIGHEST.key)} is the strongest at{' '}
                {fmt(HIGHEST.mean as number)}.
                {UNSCORED_CATS.length > 0 && (
                  <>
                    {' '}
                    The batch scored no site in {UNSCORED_CATS.map((c) => label(c.key).toLowerCase()).join(', ')}, so those stay
                    off the chart.
                  </>
                )}
              </>
            }
            source={`Batch run of ${BATCH_RUN_DATE}: every site's category scores from one engine pass.`}
            table={
              <DataTable
                caption={`Cohort mean by category, batch run of ${BATCH_RUN_DATE}.`}
                head={['Category', 'Weight', 'Mean', 'Sites scored', 'With a failed check']}
                numeric={[1, 2, 3, 4]}
                opt={[1, 3]}
                rows={CATS.map((c) => [
                  label(c.key),
                  CATEGORY_WEIGHTS[c.key],
                  c.mean === null ? <NotMeasured /> : fmt(c.mean),
                  c.scored,
                  c.failing,
                ])}
              />
            }
          >
            <BarList
              label={`Mean category score across the cohort, lowest first: ${SCORED_CATS.map(
                (c) => `${label(c.key)} ${fmt(c.mean as number)}`,
              ).join(', ')}.`}
              bars={SCORED_CATS.map((c) => ({
                key: c.key,
                label: label(c.key),
                meta: `${c.failing} of ${c.scored} sites fail a check`,
                value: c.mean,
                tone: scoreTone(c.mean as number),
              }))}
            />
          </DataFigure>
        </section>

        {M3 && M3_BEST && M3_WORST && (
          <section className="eg-section" aria-labelledby="soc-m3-h">
            <div className="eg-section-head">
              <div>
                <h2 className="eg-h2" id="soc-m3-h">
                  One system up close: Material 3
                </h2>
                <p className="eg-section-sub">
                  m3.material.io · {fmt(M3.score)} · grade {M3.grade} · rank {M3.rank} of {COHORT_STATS.count}
                </p>
              </div>
            </div>
            <p className="dx-lead">
              Material Design 3 publishes its guidance on accessibility, motion and tokens in prose, and ships no public
              checker for it. Read by the same engine as everything else, m3.material.io scores <b>{fmt(M3.score)}</b>, grade{' '}
              <b>{M3.grade}</b>: {M3_IN_SYSTEMS} of {SYSTEMS.length} among the design systems scored here. Its strongest
              category is {label(M3_BEST.key).toLowerCase()} at {fmt(M3_BEST.m3)}; its weakest is{' '}
              {label(M3_WORST.key).toLowerCase()} at {fmt(M3_WORST.m3)}.
            </p>
            <DataFigure
              id="soc-m3"
              title="Material 3 by category, against the cohort"
              note="Each bar is m3.material.io's score in one category; the tick is the cohort's mean in the same category."
              source={`Batch run of ${BATCH_RUN_DATE}. Composite and rank from ${SCORES_DATE}.`}
              table={
                <DataTable
                  caption={`Material 3 against the cohort mean, by category, batch run of ${BATCH_RUN_DATE}.`}
                  head={['Category', 'Material 3', 'Cohort mean', 'Difference']}
                  numeric={[1, 2, 3]}
                  rows={M3_ROWS.map((r) => [
                    label(r.key),
                    r.m3 === null ? <NotMeasured /> : fmt(r.m3),
                    r.mean === null ? <NotMeasured /> : fmt(r.mean),
                    r.m3 === null || r.mean === null ? <NotMeasured />
                      : `${r.m3 - r.mean >= 0 ? '+' : '−'}${fmt(Math.abs(round1(r.m3 - r.mean)))}`,
                  ])}
                />
              }
            >
              <BarList
                label={`Material 3 by category with the cohort mean for comparison: ${M3_SCORED.map(
                  (r) => `${label(r.key)} ${fmt(r.m3)} against ${r.mean === null ? 'no mean' : fmt(r.mean)}`,
                ).join(', ')}.`}
                markName="cohort mean"
                bars={M3_ROWS.map((r) => ({
                  key: r.key,
                  label: label(r.key),
                  value: r.m3,
                  mark: r.mean,
                  tone: r.m3 === null ? undefined : scoreTone(r.m3),
                }))}
              />
            </DataFigure>
            <p className="dx-src">
              Material&apos;s design-token tooling (DSP) was{' '}
              <a href="https://github.com/material-foundation/material-tokens" target="_blank" rel="noopener noreferrer">
                archived in October 2024
              </a>{' '}
              and emits no W3C DTCG. The <Link href="/m3-bridge">M3 bridge</Link> converts its tokens. Re-run the score:{' '}
              <Link href="/score?url=m3.material.io">/score?url=m3.material.io</Link>.
            </p>
          </section>
        )}

        <section className="eg-section" aria-labelledby="soc-systems-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="soc-systems-h">
                Design systems, ranked
              </h2>
              <p className="eg-section-sub">
                {SYSTEMS.length} systems and documentation platforms · weekly run of {SCORES_DATE}
              </p>
            </div>
          </div>
          <p className="dx-lead">
            The spread between the highest and lowest design system is <b>{fmt(SPREAD)} points</b>. Among systems other than
            designesy.org, {OUTSIDE[0].name} leads at {fmt(OUTSIDE[0].score)} ({OUTSIDE[0].grade}). The contract grades
            every system on the same scale, with no curve.
          </p>
          <div className="dx-table-box">
            <DataTable
              caption={`Design systems in the cohort, ranked by composite score, weekly run of ${SCORES_DATE}.`}
              head={['System', 'Grade', 'Score', 'Cohort rank', 'Pass · warn · fail']}
              numeric={[2, 3, 4]}
              opt={[3, 4]}
              rows={SYSTEMS.map((s) => [
                <Link key={s.slug} href={`/frameworks/${s.slug}`}>
                  {s.name}
                  {s.self ? ' (self-scored)' : ''}
                </Link>,
                <span key="g" className="dx-grade" data-tone={toneOf(s.grade)}>
                  {s.grade}
                </span>,
                fmt(s.score),
                s.rank,
                `${s.pass} · ${s.warn} · ${s.fail}`,
              ])}
            />
          </div>
        </section>

        <section className="eg-section" aria-labelledby="soc-method-h">
          <h2 className="eg-h2" id="soc-method-h">
            How the scores are made
          </h2>
          <dl className="dx-defs">
            <div>
              <dt>Deterministic</dt>
              <dd>
                The same {ENGINE_CHECK_COUNT}-check engine for every site: regex, token resolution and spec tests against the CSS
                and HTML a site serves. No language model, no human judgment, no vote.
              </dd>
            </div>
            <div>
              <dt>Weighted</dt>
              <dd>
                {Object.keys(CATEGORY_WEIGHTS).length} categories weighted from {Math.min(...Object.values(CATEGORY_WEIGHTS))} to{' '}
                {Math.max(...Object.values(CATEGORY_WEIGHTS))}, {WEIGHT_TOTAL} in all, normalised over the checks a site can be
                scored on. A pass counts 1, a warning half.
              </dd>
            </div>
            <div>
              <dt>Floors and caps</dt>
              <dd>
                Accessibility under 60 caps the grade at C. Six severe failures, such as unreadable contrast, cap the score
                lower. Anti-slop rules take off up to 20 points; originality credit adds up to 8.
              </dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>
                Every check, weight and band is on the <Link href="/methodology">methodology page</Link>. Score any URL at{' '}
                <Link href="/score">/score</Link>, or run the engine yourself with <code>npx designesy-score</code>.
              </dd>
            </div>
          </dl>
        </section>

        <section className="eg-section" aria-labelledby="soc-trust-h">
          <h2 className="eg-h2" id="soc-trust-h">
            Independence and cadence
          </h2>
          <dl className="dx-defs">
            <div>
              <dt>No paid placement</dt>
              <dd>
                Designesy accepts no payment for scores, method changes or placement. Enterprise work (private scoring, custom
                contracts, CI) is billed separately, and a customer&apos;s public score is computed like anyone else&apos;s.
              </dd>
            </div>
            <div>
              <dt>Weekly</dt>
              <dd>
                A GitHub Action re-scores every site on Mondays at 10:00 UTC and keeps the previous week&apos;s score, so each
                change is visible on the <Link href="/leaderboard">leaderboard</Link>.
              </dd>
            </div>
            <div>
              <dt>Yearly</dt>
              <dd>
                Each edition of this report adds year-over-year tables: which categories rose, which systems moved. Edition 1
                sets the baseline.
              </dd>
            </div>
          </dl>
          <p className="dx-src">
            State of Design Compliance · edition 1 · compliance index v{COMPLIANCE_INDEX_VERSION} · {COHORT_STATS.count} sites ·
            contract {CONTRACT_VERSION} · engine {ENGINE_VERSION} · scored {SCORES_DATE} · categories from the batch of{' '}
            {BATCH_RUN_DATE}
          </p>
        </section>

        <EngineNext
          items={[
            { title: 'The leaderboard', desc: 'Every site in this report, ranked, with its category profile and weekly change.', route: '/leaderboard' },
            { title: 'Framework evaluations', desc: 'One page per scored site: every category against the cohort, and its peers.', route: '/frameworks' },
            { title: 'The methodology', desc: 'Each check, its weight, the grade bands and what the engine cannot see.', route: '/methodology' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
