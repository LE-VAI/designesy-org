// /frameworks/[slug]: one scored site read against the cohort. Its place among
// every site on the grade scale, each category against the cohort's mean in
// that category, what changed, and its peers. Every sentence is computed from
// the seed and the batch (lib/data/cohort); pre-rendered for every site.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import '../../instrument.css';
import '../../engine.css';
import '../../data.css';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';
import { PageShareButton } from '../../lib/page-share';
import { CATEGORY_WEIGHTS } from '../../lib/check-definitions';
import { SEED, type Grade } from '../../leaderboard/seed';
import { EngineHead, EngineNext } from '../../lib/engine/engine-page';
import { display } from '../../lib/engine/types';
import {
  COHORT,
  COHORT_STATS,
  BATCH_CATEGORIES,
  BATCH_RUN_DATE,
  SCORES_DATE,
  SCORES_ENGINE_VERSION,
  CATEGORY_LABELS,
  bySlug,
  slugify,
  categoryStats,
  inCategory,
  fmt,
  round1,
  scoreTone,
} from '../../lib/data/cohort';
import { DataFigure, DataTable, NotMeasured } from '../../lib/data/figure';
import { CohortStrip } from '../../lib/data/strip';
import { BarList } from '../../lib/data/bars';
import { SiteTable } from '../../lib/data/site-table';

export function generateStaticParams() {
  return SEED.filter((s) => s.score !== null).map((s) => ({
    slug: slugify(s.url),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = SEED.find((s) => slugify(s.url) === slug);
  if (!site) return {};

  const title = `${site.name} evaluation`;
  const score = site.score as number;
  const grade = site.grade as Grade;
  const description = `${site.name} scored ${score}/${grade} on the Designesy Compliance Index. ${site.pass} checks passed, ${site.fail} failed, ${site.warn} warned. See the full per-category breakdown.`;

  return pageMeta({
    title,
    description,
    path: `/frameworks/${slug}`,
    ogTitle: `${site.name} · ${grade} · ${score}/100 · Designesy`,
    ogDescription: description,
    twitterDescription: `${site.name} scored ${score}/${grade} on the Designesy Compliance Index · designesy.org/frameworks/${slug}`,
  });
}

export const revalidate = 3600;

const TIER_LABEL: Record<number, string> = {
  1: 'a frontier reference',
  2: 'a competitor',
  3: 'a design-system exemplar',
  4: 'an inspiration source',
  5: 'a high-traffic surface',
};

const label = (k: string) => CATEGORY_LABELS[k] ?? k;

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;

export default async function FrameworkEvaluationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = bySlug(slug);
  if (!site) notFound();

  const n = COHORT_STATS.count;
  const vsMedian = round1(site.score - COHORT_STATS.median);
  const delta = site.unreachable || site.prevScore === null ? null : round1(site.score - site.prevScore);

  const rows = BATCH_CATEGORIES.map((k) => ({ key: k, c: site.categories?.[k] ?? null, mean: categoryStats(k).mean }));
  const scored = rows
    .filter((r) => r.c && r.c.score !== null)
    .map((r) => ({ key: r.key, score: r.c!.score as number, mean: r.mean }));
  const hi = scored.length ? Math.max(...scored.map((r) => r.score)) : 0;
  const lo = scored.length ? Math.min(...scored.map((r) => r.score)) : 0;
  // Ties are named together: three categories at 100 are all the strongest.
  const best = scored.filter((r) => r.score === hi).map((r) => label(r.key).toLowerCase());
  const worst = scored.filter((r) => r.score === lo).map((r) => label(r.key).toLowerCase());
  const above = scored.filter((r) => r.mean !== null && r.score > r.mean).length;
  const ran = site.pass + site.warn + site.fail + site.skip;

  const peers = inCategory(site.category);
  const place = peers.findIndex((s) => s.slug === site.slug) + 1;

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg dx">
        <EngineHead
          route={`/frameworks/${slug}`}
          name={site.name}
          thesis={`${site.name} scores ${fmt(site.score)}, grade ${site.grade}: rank ${site.rank} of ${n} on the leaderboard, ${fmt(
            Math.abs(vsMedian),
          )} points ${vsMedian >= 0 ? 'above' : 'below'} the cohort median of ${fmt(COHORT_STATS.median)}.`}
          facts={[site.host, site.category, `scored ${site.scoredAt ?? SCORES_DATE}`]}
          contract={{ href: '/leaderboard', label: 'the leaderboard' }}
        >
          <div className="dx-actions">
            <Link className="button primary" href={`/score?url=${encodeURIComponent(site.host)}`} data-cuelume-press>
              Score it again
            </Link>
            <a className="button ghost" href={site.url} target="_blank" rel="noopener noreferrer">
              Visit {site.host}
            </a>
            <PageShareButton
              text={`${site.name} scores ${fmt(site.score)} (${site.grade}) on the Designesy leaderboard, rank ${site.rank} of ${n}.`}
              label="Share this evaluation"
            />
          </div>
        </EngineHead>

        <section className="eg-section" aria-labelledby="fw-scale-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="fw-scale-h">
                {`Among the ${n}`}
              </h2>
              <p className="eg-section-sub">composite score, weekly run of {SCORES_DATE}</p>
            </div>
          </div>
          <DataFigure
            id="fw-strip"
            title={`${site.name} on the grade scale`}
            note={`Every scored site at its composite score; ${site.name} is the larger dot, read out above. Sites a point or two apart stack.`}
            source={`Weekly run of ${SCORES_DATE}. Engine ${SCORES_ENGINE_VERSION}.`}
            tableLabel="Every site's score"
            table={
              <DataTable
                caption={`Composite score of every site, weekly run of ${SCORES_DATE}.`}
                head={['Site', 'Rank', 'Grade', 'Score']}
                numeric={[1, 3]}
                rows={COHORT.map((s) => [s.slug === slug ? `${s.name} (this page)` : s.name, s.rank, s.grade, fmt(s.score)])}
              />
            }
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
              focus={slug}
              label={`${site.name} at ${fmt(site.score)}, grade ${site.grade}, rank ${site.rank} among ${n} sites whose scores run from ${fmt(
                COHORT_STATS.min,
              )} to ${fmt(COHORT_STATS.max)}, median ${fmt(COHORT_STATS.median)}.`}
            />
          </DataFigure>
        </section>

        <section className="eg-section" aria-labelledby="fw-cats-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="fw-cats-h">
                By category
              </h2>
              <p className="eg-section-sub">batch run of {BATCH_RUN_DATE}</p>
            </div>
          </div>
          {scored.length > 1 && hi !== lo ? (
            <p className="dx-lead">
              Strongest in {list(best)} at <b>{fmt(hi)}</b>, weakest in {list(worst)} at <b>{fmt(lo)}</b>. Above the
              cohort&apos;s mean in {above} of {scored.length} categories the batch could score.
            </p>
          ) : scored.length ? (
            <p className="dx-lead">
              Every category the batch could score reads <b>{fmt(hi)}</b>. Above the cohort&apos;s mean in {above} of{' '}
              {scored.length}.
            </p>
          ) : (
            <p className="dx-lead">The batch run scored no category for this site.</p>
          )}
          <DataFigure
            id="fw-cats"
            title={`${site.name} by category, against the cohort`}
            note="Each bar is the site's score in one category, heaviest category first; the tick is the cohort's mean there. A dashed track is a category the engine could not score for this site."
            source={`Batch run of ${BATCH_RUN_DATE}. Weights are relative and sum to ${Object.values(CATEGORY_WEIGHTS).reduce(
              (a, b) => a + b,
              0,
            )} across all ${Object.keys(CATEGORY_WEIGHTS).length} categories.`}
            table={
              <DataTable
                caption={`${site.name}'s category scores against the cohort mean, batch run of ${BATCH_RUN_DATE}.`}
                head={['Category', 'Weight', 'Score', 'Cohort mean', 'Pass', 'Warn', 'Fail', 'Skip']}
                numeric={[1, 2, 3, 4, 5, 6, 7]}
                opt={[1, 4, 5, 6, 7]}
                rows={rows.map((r) => [
                  label(r.key),
                  CATEGORY_WEIGHTS[r.key],
                  r.c && r.c.score !== null ? fmt(r.c.score) : <NotMeasured />,
                  r.mean === null ? <NotMeasured /> : fmt(r.mean),
                  r.c?.pass ?? 0,
                  r.c?.warn ?? 0,
                  r.c?.fail ?? 0,
                  r.c?.skip ?? 0,
                ])}
              />
            }
          >
            <BarList
              label={`${site.name} by category, with the cohort mean for comparison: ${scored
                .map((r) => `${label(r.key)} ${fmt(r.score)} against ${r.mean === null ? 'no mean' : fmt(r.mean)}`)
                .join(', ')}.`}
              markName="cohort mean"
              bars={rows.map((r) => ({
                key: r.key,
                label: label(r.key),
                meta: `weight ${CATEGORY_WEIGHTS[r.key]}`,
                value: r.c && r.c.score !== null ? r.c.score : null,
                mark: r.mean,
                tone: r.c && r.c.score !== null ? scoreTone(r.c.score) : undefined,
              }))}
            />
          </DataFigure>
        </section>

        <section className="eg-section" aria-labelledby="fw-read-h">
          <h2 className="eg-h2" id="fw-read-h">
            Reading
          </h2>
          <dl className="dx-defs">
            <div>
              <dt>This week</dt>
              <dd>
                {site.unreachable
                  ? `The engine could not read ${site.host} on the last weekly run, so this is the score measured on ${site.scoredAt}, held over.`
                  : delta === null
                    ? 'No previous weekly score to compare with.'
                    : delta === 0
                      ? `Unchanged since the previous weekly run, at ${fmt(site.score)}.`
                      : `${signed(delta)} since the previous weekly run, from ${fmt(site.prevScore as number)} to ${fmt(site.score)}.`}
              </dd>
            </div>
            <div>
              <dt>Checks</dt>
              <dd>
                Of the {ran} checks the engine ran, {site.pass} passed, {site.warn} warned, {site.fail} failed and {site.skip}{' '}
                were skipped as not applicable.
              </dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>
                {site.tokens === null
                  ? 'The engine recorded no token count for this site.'
                  : `${site.tokens} custom properties declared on :root, the layer the tokens category reads.`}
              </dd>
            </div>
            <div>
              <dt>Why it is here</dt>
              <dd>
                Seeded as {TIER_LABEL[site.tier] ?? `a tier ${site.tier} site`}: {display(site.seededBecause)}
                {/[.!?]$/.test(display(site.seededBecause)) ? '' : '.'}
                {site.self ? ' Scored by its own engine; the conflict of interest is stated in the data.' : ''}
              </dd>
            </div>
          </dl>
        </section>

        <section className="eg-section" aria-labelledby="fw-peers-h">
          <div className="eg-section-head">
            <div>
              <h2 className="eg-h2" id="fw-peers-h">
                Peers in {site.category}
              </h2>
              <p className="eg-section-sub">
                {place} of {peers.length} in the group · rank is among all {n}
              </p>
            </div>
          </div>
          <SiteTable sites={peers} current={slug} caption={`${site.category}: ${peers.length} scored sites, by cohort rank.`} />
        </section>

        <EngineNext
          items={[
            { title: 'Score it again', desc: `Run the ${site.host} audit live: the same checks, on the page as it is now.`, route: `/score?url=${encodeURIComponent(site.host)}` },
            { title: 'The leaderboard', desc: `All ${n} sites, ranked, with each one's category profile.`, route: '/leaderboard' },
            { title: 'How a score is made', desc: 'Every check, its weight, the grade bands and what the engine cannot see.', route: '/methodology' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
