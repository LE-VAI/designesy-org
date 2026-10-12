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
import { ENGINE_CHECK_COUNT, ENGINE_SCORED_CHECK_COUNT } from '../lib/check-definitions';
import { EngineHead } from '../lib/engine/engine-page';
import { SubmitForm } from './submit-form/submit-form';
import { LEADERBOARD_VERSION, LEADERBOARD_DISPUTE_EMAIL } from './seed';
import { contactMailto } from '../lib/site-meta';
import {
  COHORT,
  COHORT_STATS,
  GRADE_COUNTS,
  GRADES,
  BATCH_CATEGORIES,
  BATCH_RUN_DATE,
  SCORES_DATE,
  SCORES_ENGINE_VERSION,
  CATEGORY_LABELS,
  fmt,
  RANKED,
  STALE,
  type CohortSite,
} from '../lib/data/cohort';
import { DataFigure, DataTable, NotMeasured } from '../lib/data/figure';
import { CohortStrip } from '../lib/data/strip';
import { CategoryProfile, SiteTags } from '../lib/data/cells';

// The share text counts the A grades from the cohort data at build. It used to
// say "Designesy is the only A-grade site in the cohort" while three sites held
// an A.
const OG_A_COUNT = COHORT.filter((s) => s.grade === 'A').length;
const OG_A_SELF = COHORT.some((s) => s.grade === 'A' && s.self);
const OG_A_LINE =
  OG_A_COUNT === 0
    ? 'None reaches A.'
    : OG_A_COUNT === 1
      ? `One reaches A${OG_A_SELF ? ': designesy.org, self-scored and labelled' : ''}.`
      : `${OG_A_COUNT} reach A${OG_A_SELF ? ', including designesy.org, self-scored and labelled' : ''}.`;

export const metadata: Metadata = pageMeta({
  title: 'Leaderboard',
  description:
    `Public design-verification leaderboard: ${COHORT.length} curated sites scored by the deterministic ${ENGINE_CHECK_COUNT}-check Designesy engine. No LLM, no paywall, no pay-to-remove.`,
  path: '/leaderboard',
  ogDescription:
    `${COHORT.length} sites scored by the same deterministic ${ENGINE_CHECK_COUNT}-check engine that scores designesy.org. ${OG_A_LINE}`,
  twitterDescription:
    'Public design-verification leaderboard · designesy.org/leaderboard',
});

// The leaderboard is the cohort the engine scored: one scale, one engine, the
// same checks that grade designesy.org. Every figure below is derived from the
// seed (lib/data/cohort); nothing on this page is typed by hand.

const TOP = COHORT[0];
const LOW = COHORT[COHORT.length - 1];
const A_SITES = COHORT.filter((s) => s.grade === 'A');
const GRADE_LINE = GRADES.map((g) => `${g} ${GRADE_COUNTS[g]}`).join(' · ');
const CATEGORY_LIST = BATCH_CATEGORIES.map((k) => CATEGORY_LABELS[k].toLowerCase()).join(', ');
// The check counts, one column each, so every count sits under its own label.
const COUNTS = ['Pass', 'Warn', 'Fail', 'Skip'] as const;

// One mail for any dispute; the evaluation pages prefill the site's name.
const DISPUTE_HREF = contactMailto('Dispute: leaderboard score');

function Delta({ s }: { s: CohortSite }) {
  if (s.stale || s.prevScore === null) return null;
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
        {s.rank ?? <span className="sr-only">not ranked</span>}
      </td>
      <th scope="row" className="dx-rank-site">
        <Link href={`/frameworks/${s.slug}`}>{s.name}</Link>
        <span className="dx-rank-meta">
          <span>
            {s.host} · {s.category}
          </span>
          <SiteTags s={s} />
        </span>
      </th>
      <td data-num className="dx-rank-score">
        <span className="dx-rank-sg">
          <span className="dx-grade" data-grade={s.grade.toLowerCase()}>
            {s.grade}
          </span>
          <span className="dx-rank-v">{fmt(s.score)}</span>
        </span>
        <Delta s={s} />
      </td>
      <td data-opt className="dx-rank-profile">
        <CategoryProfile name={s.name} cats={s.categories} order={BATCH_CATEGORIES} />
      </td>
      {[s.pass, s.warn, s.fail, s.skip].map((n, i) => (
        <td key={COUNTS[i]} data-num data-opt="wide" className="dx-rank-count">
          {n}
        </td>
      ))}
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
          facts={[`${COHORT.length} sites`, `scored ${SCORES_DATE}`, `engine ${SCORES_ENGINE_VERSION}`]}
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
                contract scores, weekly run of {SCORES_DATE}
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
              <dt>Not re-scored</dt>
              <dd>
                {STALE.length}
                <small>outside the ranking</small>
              </dd>
            </div>
          </dl>

          <DataFigure
            id="lb-strip"
            title="Every site on the grade scale"
            note={
              <>
                Each dot is one site at its contract score, on the bands the engine grades by: F under 60, then a grade every ten
                points. Sites a point or two apart stack. The ringed dot is designesy.org, scored by its own engine; an outlined dot
                is a last score the latest run could not renew, shown but not ranked.
              </>
            }
            source={`Weekly run of ${SCORES_DATE}. Engine ${SCORES_ENGINE_VERSION}, contract v${LEADERBOARD_VERSION}.`}
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
                heldLabel: s.staleLabel,
              }))}
              median={COHORT_STATS.median}
              label={`Contract scores of ${COHORT_STATS.count} sites on a scale from 40 to 100. ${GRADE_LINE}. Median ${fmt(
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
                by contract score · a site&apos;s name opens its evaluation
              </p>
            </div>
          </div>

          <div className="dx-table-box">
            <table className="dx-table dx-rank">
              <caption className="sr-only">
                {RANKED.length} sites measured on the latest weekly run, ranked by contract score, with grade, change since the
                previous run, score by category, and check counts.
              </caption>
              <thead>
                <tr>
                  <th scope="col" data-num className="dx-col-n">
                    #
                  </th>
                  <th scope="col" className="dx-col-site">
                    Site
                  </th>
                  <th scope="col" data-num className="dx-col-score">
                    Score
                  </th>
                  <th scope="col" data-opt className="dx-col-cat">
                    By category
                  </th>
                  {COUNTS.map((c) => (
                    <th key={c} scope="col" data-num data-opt="wide" className="dx-col-count">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RANKED.map((s) => (
                  <Row key={s.url} s={s} />
                ))}
              </tbody>
            </table>
          </div>

          {STALE.length > 0 && (
            <>
              <h3 className="dx-h3" id="lb-stale-h">
                Could not re-score
              </h3>
              <p className="dx-lead">
                The latest weekly run could not read {STALE.length === 1 ? 'this site' : `these ${STALE.length} sites`}. Each keeps
                its last score, with the date it was measured, and stays out of the ranking until the engine can measure it again.
              </p>
              <div className="dx-table-box">
                <table className="dx-table dx-rank" aria-labelledby="lb-stale-h">
                  <thead>
                    <tr>
                      <th scope="col" data-num className="dx-col-n">
                        <span className="sr-only">Rank</span>
                      </th>
                      <th scope="col" className="dx-col-site">
                        Site
                      </th>
                      <th scope="col" data-num className="dx-col-score">
                        Last score
                      </th>
                      <th scope="col" data-opt className="dx-col-cat">
                        By category
                      </th>
                      {COUNTS.map((c) => (
                        <th key={c} scope="col" data-num data-opt="wide" className="dx-col-count">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STALE.map((s) => (
                      <Row key={s.url} s={s} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="dx-lead">
            Think a score is wrong? <a href={DISPUTE_HREF}>Dispute this score</a> by email to {LEADERBOARD_DISPUTE_EMAIL}: name
            the site and the check, and say what the engine got wrong. Every evaluation page has the same link, with the
            site&apos;s name filled in.
          </p>

          <p className="dx-src">
            By category: one column per category, heaviest first ({CATEGORY_LIST}), filled to its score and tinted by grade
            band; dashed where the engine scored nothing. Category scores come from the batch run of {BATCH_RUN_DATE}; contract
            scores and ranks from {SCORES_DATE}. A signed figure beside a score is its change since the previous run. Labels
            mark the self-score, the other site Designesy operates, and the products that compete with it.
          </p>

          <details className="dx-data">
            <summary>Category scores, every site</summary>
            <div className="dx-table-box">
              <DataTable
                caption={`Score by category for each site, batch run of ${BATCH_RUN_DATE}. Sites the latest run could not re-score are included with their last scores.`}
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
            Any public URL is scored on the spot by the same {ENGINE_CHECK_COUNT}-check engine. The submission is not stored, so a
            site does not join the leaderboard by being scored here. To propose one, email {LEADERBOARD_DISPUTE_EMAIL}. No
            paywall, and no pay-to-remove.
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
                The contract score the engine reports at <Link href="/score">/score</Link>: {ENGINE_SCORED_CHECK_COUNT} checks it can
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
              <dt>Could not re-score</dt>
              <dd>
                When the engine cannot read a site on the weekly run, the site keeps its last score, marked &ldquo;last scored
                &lt;date&gt; · could not re-score&rdquo;, and moves out of the ranking until it is measured again. It is never
                re-graded from a failed fetch.
              </dd>
            </div>
            <div>
              <dt>Labels</dt>
              <dd>
                &ldquo;Operated by Designesy&rdquo; marks a site Designesy runs, and &ldquo;competing product&rdquo; marks one that
                competes with Designesy&apos;s own. The same engine scores them all; the labels say who has a stake in the result.
              </dd>
            </div>
            <div>
              <dt>Disputes</dt>
              <dd>
                Email {LEADERBOARD_DISPUTE_EMAIL} with the site and the check you dispute. A person reads it, and a score changes
                only when the engine, run again, measures something different.
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
            <a href="/api/leaderboard">/api/leaderboard</a> · CSV at <a href="/api/leaderboard.csv">/api/leaderboard.csv</a> ·
            scoring by POST to /api/leaderboard/submit (discarded after scoring) · disputes to {LEADERBOARD_DISPUTE_EMAIL}
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
