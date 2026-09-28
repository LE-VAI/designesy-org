import type { Metadata } from 'next';
import Link from 'next/link';
import '../instrument.css';
import '../engine.css';
import '../data.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { PageShareButton } from '../lib/page-share';
import { AgentActions } from '../lib/agent-actions';
import { ENGINE_CHECK_COUNT, ENGINE_SCORED_CHECK_COUNT, ENGINE_VERSION } from '../lib/check-definitions';
import { EngineHead } from '../lib/engine/engine-page';
import { SubmitForm } from './submit-form/submit-form';
import { LEADERBOARD_VERSION } from './seed';
import {
  COHORT,
  COHORT_STATS,
  GRADE_COUNTS,
  GRADES,
  BATCH_CATEGORIES,
  BATCH_RUN_DATE,
  SCORES_DATE,
  CATEGORY_LABELS,
  fmt,
  toneOf,
  type CohortSite,
} from '../lib/data/cohort';
import { DataFigure, DataTable, NotMeasured } from '../lib/data/figure';
import { CohortStrip } from '../lib/data/strip';
import { CategoryProfile } from '../lib/data/cells';

export const metadata: Metadata = pageMeta({
  title: 'Leaderboard',
  description:
    `Public design-verification leaderboard — 30 curated sites scored by the deterministic ${ENGINE_CHECK_COUNT}-check Designesy engine. No LLM, no paywall, no pay-to-remove.`,
  path: '/leaderboard',
  ogDescription:
    `30 sites scored by the same deterministic ${ENGINE_CHECK_COUNT}-check engine that scores designesy.org. Designesy is the only A-grade site in the cohort.`,
  twitterDescription:
    'Public design-verification leaderboard — designesy.org/leaderboard',
});

// The leaderboard is the cohort the engine scored: one scale, one engine, the
// same checks that grade designesy.org. Every figure below is derived from the
// seed (lib/data/cohort); nothing on this page is typed by hand.

const TOP = COHORT[0];
const LOW = COHORT[COHORT.length - 1];
const A_SITES = COHORT.filter((s) => s.grade === 'A');
const GRADE_LINE = GRADES.map((g) => `${g} ${GRADE_COUNTS[g]}`).join(' · ');
const CATEGORY_LIST = BATCH_CATEGORIES.map((k) => CATEGORY_LABELS[k].toLowerCase()).join(', ');

function Delta({ s }: { s: CohortSite }) {
  if (s.unreachable || s.prevScore === null) return null;
  const d = Math.round((s.score - s.prevScore) * 10) / 10;
  if (d === 0) return null;
  return (
    <span className="dx-delta" data-dir={d > 0 ? 'up' : 'down'}>
      {d > 0 ? '+' : '−'}
      {Math.abs(d).toFixed(1)}
      <span className="sr-only"> since the previous run</span>
    </span>
  );
}

function Row({ s }: { s: CohortSite }) {
  return (
    <tr data-self={s.self || undefined}>
      <td data-num className="dx-rank-n">
        {s.rank}
      </td>
      <th scope="row" className="dx-rank-site">
        <Link href={`/frameworks/${s.slug}`}>{s.name}</Link>
        <span className="dx-rank-meta">
          <span>
            {s.host} · {s.category}
          </span>
          {s.self && <span className="dx-tag">self-scored</span>}
          {s.unreachable && (
            <span className="dx-tag" data-kind="held">
              held over from {s.scoredAt}
            </span>
          )}
        </span>
      </th>
      <td data-num className="dx-rank-score">
        <span className="dx-rank-sg">
          <span className="dx-grade" data-tone={toneOf(s.grade)}>
            {s.grade}
          </span>
          <span className="dx-rank-v">{fmt(s.score)}</span>
        </span>
        <Delta s={s} />
      </td>
      <td data-opt className="dx-rank-profile">
        <CategoryProfile name={s.name} cats={s.categories} order={BATCH_CATEGORIES} />
      </td>
      <td data-num data-opt="wide" className="dx-rank-checks">
        {s.pass} · {s.warn} · {s.fail} · {s.skip}
      </td>
    </tr>
  );
}

export default function LeaderboardPage() {
  const shareText =
    A_SITES.length === 1 && A_SITES[0].self
      ? `${COHORT.length} sites scored by one deterministic ${ENGINE_CHECK_COUNT}-check engine. Only designesy.org, scored by its own engine, reaches A.`
      : `${COHORT.length} sites scored by one deterministic ${ENGINE_CHECK_COUNT}-check engine. ${A_SITES.length} reach A.`;

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg dx">
        <EngineHead
          route="/leaderboard"
          name="Leaderboard"
          thesis={`${COHORT.length} sites on one scale. The engine that grades designesy.org grades every one of them with the same ${ENGINE_CHECK_COUNT} checks, and re-scores them every Monday.`}
          facts={[`${COHORT.length} sites`, `scored ${SCORES_DATE}`, `engine ${ENGINE_VERSION}`]}
          contract={{ href: '/methodology', label: 'how a score is made' }}
        >
          <div className="dx-actions">
            <Link className="button primary" href="/score" data-cuelume-press>
              Score a site
            </Link>
            <PageShareButton text={shareText} label="Share the leaderboard" />
          </div>
          <AgentActions mdPath="/leaderboard.md" label="the leaderboard" />
        </EngineHead>

        <section className="eg-section" aria-labelledby="lb-cohort-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="lb-cohort-h">
                The cohort
              </h2>
              <p className="eg-section-sub">
                composite scores, weekly run of {SCORES_DATE}
              </p>
            </div>
          </div>

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
              <dt>Range</dt>
              <dd>
                {fmt(COHORT_STATS.min)}
                <small>to</small> {fmt(COHORT_STATS.max)}
              </dd>
            </div>
            <div>
              <dt>At A or B</dt>
              <dd>
                {GRADE_COUNTS.A + GRADE_COUNTS.B}
                <small>of {COHORT_STATS.count}</small>
              </dd>
            </div>
            <div>
              <dt>Held over</dt>
              <dd>{COHORT_STATS.heldOver}</dd>
            </div>
          </dl>

          <DataFigure
            id="lb-strip"
            title="Every site on the grade scale"
            note={
              <>
                Each dot is one site at its composite score, on the bands the engine grades by: F under 60, then a grade every ten
                points. Sites a point or two apart stack. The ringed dot is designesy.org, scored by its own engine; an outlined dot
                is a score held over from an earlier run.
              </>
            }
            source={`Weekly run of ${SCORES_DATE}. Engine ${ENGINE_VERSION}, contract v${LEADERBOARD_VERSION}.`}
            tableRef={{ id: 'ranking', label: 'the ranking below' }}
          >
            <CohortStrip
              sites={COHORT.map((s) => ({
                slug: s.slug,
                name: s.name,
                score: s.score,
                grade: s.grade,
                rank: s.rank,
                self: s.self,
                held: s.unreachable,
              }))}
              median={COHORT_STATS.median}
              label={`Composite scores of ${COHORT_STATS.count} sites on a scale from 40 to 100. ${GRADE_LINE}. Median ${fmt(
                COHORT_STATS.median,
              )}. Highest ${TOP.name} at ${fmt(TOP.score)}, lowest ${LOW.name} at ${fmt(LOW.score)}.`}
              idle={
                <>
                  <b>{GRADE_LINE}</b>
                  <span className="dx-readout-meta">point at a dot, or tap it, to read the site</span>
                </>
              }
            />
          </DataFigure>
        </section>

        <section className="eg-section" id="ranking" aria-labelledby="lb-rank-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="lb-rank-h">
                Ranking
              </h2>
              <p className="eg-section-sub">
                by composite score · a site&apos;s name opens its evaluation
              </p>
            </div>
          </div>

          <div className="dx-table-box">
            <table className="dx-table dx-rank">
              <caption className="sr-only">
                {COHORT_STATS.count} sites ranked by composite score, with grade, change since the previous weekly run, score by
                category, and check counts.
              </caption>
              <thead>
                <tr>
                  <th scope="col" data-num>
                    #
                  </th>
                  <th scope="col">Site</th>
                  <th scope="col" data-num>
                    Score
                  </th>
                  <th scope="col" data-opt>
                    By category
                  </th>
                  <th scope="col" data-num data-opt="wide">
                    Pass · warn · fail · skip
                  </th>
                </tr>
              </thead>
              <tbody>
                {COHORT.map((s) => (
                  <Row key={s.url} s={s} />
                ))}
              </tbody>
            </table>
          </div>

          <p className="dx-src">
            By category: one column per category, heaviest first ({CATEGORY_LIST}), filled to its score and tinted by grade
            band; dashed where the engine scored nothing. Category scores come from the batch run of {BATCH_RUN_DATE}; composite
            scores and ranks from {SCORES_DATE}. A signed figure beside a score is its change since the previous run.
          </p>

          <details className="dx-data">
            <summary>Category scores, every site</summary>
            <div className="dx-table-box">
              <DataTable
                caption={`Score by category for each site, batch run of ${BATCH_RUN_DATE}.`}
                head={['Site', ...BATCH_CATEGORIES.map((k) => CATEGORY_LABELS[k])]}
                numeric={BATCH_CATEGORIES.map((_, i) => i + 1)}
                rows={COHORT.map((s) => [
                  s.name,
                  ...BATCH_CATEGORIES.map((k) => {
                    const c = s.categories?.[k];
                    return c && c.score !== null ? fmt(c.score) : <NotMeasured />;
                  }),
                ])}
              />
            </div>
          </details>
        </section>

        <section className="eg-section" aria-labelledby="lb-submit-h">
          <h2 className="eg-h2" id="lb-submit-h">
            Submit a site
          </h2>
          <p className="dx-lead">
            Any public URL is scored on the spot by the same {ENGINE_CHECK_COUNT}-check engine. Submissions are reviewed for the
            seed at the next weekly run. No paywall, and no pay-to-remove.
          </p>
          <SubmitForm />
        </section>

        <section className="eg-section" aria-labelledby="lb-read-h">
          <h2 className="eg-h2" id="lb-read-h">
            How to read it
          </h2>
          <dl className="dx-defs">
            <div>
              <dt>The score</dt>
              <dd>
                The composite the engine reports at <Link href="/score">/score</Link>: {ENGINE_SCORED_CHECK_COUNT} checks it can
                run from the delivered page, weighted by category, less anti-slop deductions and plus originality credit. The{' '}
                <Link href="/methodology">methodology</Link> shows every weight.
              </dd>
            </div>
            <div>
              <dt>What it reads</dt>
              <dd>
                The markup and CSS a site ships over the wire. It runs no JavaScript, so a site that builds its content in the
                browser is judged on the shell that arrives first.
              </dd>
            </div>
            <div>
              <dt>Held over</dt>
              <dd>
                When the engine cannot read a site on the weekly run, the site keeps its previous score, marked with the date it
                was measured. It is never re-graded from a failed fetch.
              </dd>
            </div>
            <div>
              <dt>Self-scored</dt>
              <dd>
                designesy.org is scored by its own engine, a conflict of interest stated here and in the data. Run it yourself at{' '}
                <Link href="/score?url=designesy.org">/score?url=designesy.org</Link>.
              </dd>
            </div>
          </dl>
          <p className="dx-src">
            Leaderboard v{LEADERBOARD_VERSION} · re-scored Mondays 10:00 UTC · JSON at{' '}
            <Link href="/api/leaderboard">/api/leaderboard</Link> · submissions by POST to /api/leaderboard/submit
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
