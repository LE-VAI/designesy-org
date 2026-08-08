// /frameworks/[slug] — dedicated evaluation page for each scored site.
//
// Pattern from Artificial Analysis: "Click any model name → dedicated page
// with detailed metrics and direct comparisons." Each scored site gets its
// own evaluation article with:
//   - Score + grade header with dial
//   - Per-category breakdown bars (from batch-data.ts)
//   - Check pass/fail/warn/skip summary
//   - Comparison to cohort mean + category mean
//   - Delta since last week (improvement/decline)
//   - Auto-generated evaluation narrative
//   - CTA to re-score live
//
// Pre-rendered at build time via generateStaticParams for all scored sites.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { PageShareButton } from '../../lib/page-share';
import { ScoreDial, gradeColor } from '../../lib/score-dial';
import { RadarChart } from '../../lib/radar-chart';
import { SEED, type Grade, type CategoryBreakdown } from '../../leaderboard/seed';
import { BATCH_CATEGORY_SCORES } from '../../leaderboard/batch-data';

export const revalidate = 3600;

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .replace(/[./]/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

function deslugify(slug: string): string {
  // Find the site whose slugified URL matches
  const site = SEED.find((s) => slugify(s.url) === slug);
  return site?.url || '';
}

const CATEGORY_LABELS: Record<string, string> = {
  cadence: 'Cadence',
  accessibility: 'Accessibility',
  semantic: 'Semantic',
  copywriting: 'Copywriting',
  motion: 'Motion',
  tokens: 'Tokens',
  takt: 'Takt',
  security: 'Security',
  poise: 'Poise',
  identity: 'Identity',
  interaction: 'Interaction',
  performance: 'Performance',
  spec: 'Spec',
  responsive: 'Responsive',
};

// ── Static params (pre-render all scored sites) ─────────────────────────────

export function generateStaticParams() {
  return SEED.filter((s) => s.score !== null).map((s) => ({
    slug: slugify(s.url),
  }));
}

// ── Metadata ────────────────────────────────────────────────────────────────

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
    twitterDescription: `${site.name} scored ${score}/${grade} on the Designesy Compliance Index — designesy.org/frameworks/${slug}`,
  });
}

// ── Cohort stats (computed once) ─────────────────────────────────────────────

const SCORED_SITES = SEED.filter((s) => s.score !== null);
const SCORE_VALUES = SCORED_SITES.map((s) => s.score as number);
const COHORT_MEAN = SCORE_VALUES.reduce((a, b) => a + b, 0) / SCORE_VALUES.length;
const COHORT_MEDIAN = [...SCORE_VALUES].sort((a, b) => a - b)[Math.floor(SCORE_VALUES.length / 2)];

function categoryMean(category: string): number | null {
  const scores = SCORED_SITES
    .map((s) => BATCH_CATEGORY_SCORES[s.url]?.[category]?.score)
    .filter((s): s is number => s !== null && s !== undefined);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ── Narrative generation ────────────────────────────────────────────────────

function generateNarrative(site: typeof SEED[number]): string {
  const score = site.score as number;
  const grade = site.grade as Grade;
  const name = site.name;
  const catScores = BATCH_CATEGORY_SCORES[site.url] || {};
  const scoredCats = Object.entries(catScores).filter(([, v]) => v.score !== null);
  const bestCat = scoredCats.sort((a, b) => (b[1].score as number) - (a[1].score as number))[0];
  const worstCat = scoredCats.sort((a, b) => (a[1].score as number) - (b[1].score as number))[0];
  const delta = site.prevScore !== null ? score - site.prevScore : null;

  const parts: string[] = [];

  // Opening
  parts.push(
    `${name} scores ${score}/${grade} on the Designesy Compliance Index — ` +
    `${site.pass} of 40 checks passed, ${site.fail} failed, ${site.warn} warned, ${site.skip} skipped. ` +
    `The cohort mean is ${COHORT_MEAN.toFixed(1)}/D across ${SCORED_SITES.length} scored sites. ` +
    (score > COHORT_MEAN
      ? `${name} sits ${((score - COHORT_MEAN) / COHORT_MEAN * 100).toFixed(0)}% above the cohort mean.`
      : score < COHORT_MEAN
      ? `${name} sits ${((COHORT_MEAN - score) / COHORT_MEAN * 100).toFixed(0)}% below the cohort mean.`
      : `${name} is at the cohort mean.`)
  );

  // Best/worst category
  if (bestCat && worstCat && bestCat[0] !== worstCat[0]) {
    parts.push(
      `Strongest category: ${CATEGORY_LABELS[bestCat[0]] || bestCat[0]} at ${(bestCat[1].score as number).toFixed(1)}%. ` +
      `Weakest scored category: ${CATEGORY_LABELS[worstCat[0]] || worstCat[0]} at ${(worstCat[1].score as number).toFixed(1)}%. ` +
      `The gap between best and worst is the finding — most systems are strong in one dimension and absent in another.`
    );
  }

  // Delta
  if (delta !== null && delta !== 0) {
    parts.push(
      delta > 0
        ? `Since last week's score, ${name} improved by ${delta.toFixed(1)} points — moving from ${site.prevScore} to ${score}.`
        : `Since last week's score, ${name} dropped by ${Math.abs(delta).toFixed(1)} points — moving from ${site.prevScore} to ${score}.`
    );
  }

  // Token detection
  if (site.tokens !== null && site.tokens > 0) {
    parts.push(
      site.tokens > 100
        ? `The engine detected ${site.tokens} custom properties at :root — a rich token layer. The question is whether those tokens are structured (primitive → semantic → component) or flat.`
        : site.tokens > 10
        ? `The engine detected ${site.tokens} custom properties at :root — a modest token layer.`
        : `The engine detected only ${site.tokens} custom properties at :root — tokens are minimal or absent.`
    );
  }

  // Grade context
  if (grade === 'A') {
    parts.push(`${name} is the only A-grade site in the cohort. This is the bar — every check the engine can statically verify, ${name} passes.`);
  } else if (grade === 'F') {
    parts.push(`${grade}-grade means ${name} scores below 60 — the contract's pass threshold. The failing checks are not subjective: they are missing CSS primitives that the contract requires at :root.`);
  }

  // Closing
  parts.push(
    `This evaluation is deterministic — no LLM, no human judgment, no survey. The same 40-check engine that scored ${name} scores every site on the leaderboard. Re-score ${site.url.replace(/^https?:\/\//, '')} live to see if anything has changed since ${'2026-08-03'}.`
  );

  return parts.join('\n\n');
}

// ── Category bar component ──────────────────────────────────────────────────

function CategoryBar({
  label,
  breakdown,
  cohortAvg,
}: {
  label: string;
  breakdown: CategoryBreakdown;
  cohortAvg: number | null;
}) {
  const score = breakdown.score;
  const isScored = score !== null;
  const barWidth = isScored ? score : 0;
  const fillClass = !isScored
    ? 'cat-bar-fill--unscored'
    : score >= 75
    ? 'cat-bar-fill--scored-high'
    : score >= 50
    ? 'cat-bar-fill--scored-mid'
    : 'cat-bar-fill--scored-low';

  return (
    <div className="cat-bar">
      <div className="cat-bar-header">
        <span className="cat-bar-label">{label}</span>
        <span className={`cat-bar-score${isScored ? '' : ' cat-bar-score--unscored'}`}>
          {isScored ? `${score.toFixed(1)}%` : 'unscored'}
          {isScored && cohortAvg !== null && (
            <span className="cat-bar-cohort">
              (cohort: {cohortAvg.toFixed(1)}%)
            </span>
          )}
        </span>
      </div>
      <div className="cat-bar-track">
        <div className={`cat-bar-fill ${fillClass}`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="cat-bar-meta">
        {breakdown.pass} pass · {breakdown.fail} fail · {breakdown.warn} warn · {breakdown.skip} skip
        {breakdown.weight > 0 && ` · ${breakdown.weight}% weight`}
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default async function FrameworkEvaluationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = SEED.find((s) => slugify(s.url) === slug);

  if (!site || site.score === null) {
    notFound();
  }

  const score = site.score as number;
  const grade = site.grade as Grade;
  const catScores = BATCH_CATEGORY_SCORES[site.url] || {};
  const delta = site.prevScore !== null ? score - site.prevScore : null;

  // Category peers (same category)
  const categoryPeers = SCORED_SITES
    .filter((s) => s.category === site.category && s.url !== site.url)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 5);

  const categoryRank = SCORED_SITES
    .filter((s) => s.category === site.category)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .findIndex((s) => s.url === site.url) + 1;

  const categoryTotal = SCORED_SITES.filter((s) => s.category === site.category).length;

  const narrative = generateNarrative(site);
  const narrativeParagraphs = narrative.split('\n\n');

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        {/* Header with dial + score */}
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>
            {site.category} · Evaluation
          </p>
          <h1 className="surface-title" data-scramble>{site.name}</h1>
          <p className="surface-lede">
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--signal)', textDecoration: 'none' }}
            >
              {site.url.replace(/^https?:\/\//, '')}
            </a>
          </p>
          <div className="hero-actions" style={{ marginTop: '1.5rem' }}>
            <PageShareButton
              text={`${site.name} · Grade ${site.grade} · ${site.score}/100 on the Designesy 40-check design contract — designesy.org/frameworks/${slug}`}
              label={`Share ${site.name} evaluation`}
            />
          </div>
        </section>

        {/* Score summary */}
        <section className="doctrine-section fade-up fade-up-delay-1">
          <div style={{
            display: 'flex',
            gap: '2rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            padding: '1.5rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius, 12px)',
            border: '1px solid var(--line)',
          }}>
            <ScoreDial score={score} grade={grade} colorMode="grade" />

            <div style={{ flex: '1 1 300px' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>
                Compliance Index score
              </p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 0.5rem' }}>
                {score}/100 · {grade}
              </p>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--muted)' }}>
                <span><strong style={{ color: 'var(--ink)' }}>{site.pass}</strong> pass</span>
                <span><strong style={{ color: 'var(--error)' }}>{site.fail}</strong> fail</span>
                <span><strong style={{ color: 'var(--warn)' }}>{site.warn}</strong> warn</span>
                <span><strong style={{ color: 'var(--muted-dim)' }}>{site.skip}</strong> skip</span>
                {site.tokens !== null && (
                  <span><strong style={{ color: 'var(--ink)' }}>{site.tokens}</strong> tokens</span>
                )}
              </div>
              {delta !== null && (
                <p style={{ fontSize: '0.8rem', margin: '0.75rem 0 0', color: delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--error)' : 'var(--muted)' }}>
                  {delta > 0 ? '↑' : delta < 0 ? '↓' : '='} {delta !== 0 ? `${Math.abs(delta).toFixed(1)} pts` : 'flat'} since last week
                  {delta !== 0 && ` (${site.prevScore} → ${score})`}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Link
                href={`/score?url=${site.url.replace(/^https?:\/\//, '')}`}
                className="button primary"
                style={{ fontSize: '0.85rem' }}
              >
                Re-score live →
              </Link>
              <Link
                href="/leaderboard"
                className="button ghost"
                style={{ fontSize: '0.85rem' }}
              >
                View leaderboard
              </Link>
            </div>
          </div>
        </section>

        {/* Per-category breakdown */}
        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">Per-category breakdown</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each category is scored independently. The cohort average shows how
            this site compares to the {SCORED_SITES.length}-site cohort in each dimension.
          </p>
          {Object.entries(catScores).length > 0 ? (
            <div>
              <RadarChart
                data={Object.entries(catScores)
                  .sort((a, b) => b[1].weight - a[1].weight)
                  .map(([cat, breakdown]) => ({
                    label: CATEGORY_LABELS[cat] || cat,
                    score: breakdown.score,
                    cohortAvg: categoryMean(cat),
                  }))}
              />
              {Object.entries(catScores)
                .sort((a, b) => b[1].weight - a[1].weight)
                .map(([cat, breakdown]) => (
                  <CategoryBar
                    key={cat}
                    label={CATEGORY_LABELS[cat] || cat}
                    breakdown={breakdown}
                    cohortAvg={categoryMean(cat)}
                  />
                ))}
            </div>
          ) : (
            <p className="surface-note">
              No per-category breakdown available — this site was not included
              in the last batch run. Run a live score to see the full breakdown.
            </p>
          )}
        </section>

        {/* Evaluation narrative */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Evaluation</h2>
          <div style={{ maxWidth: '65ch' }}>
            {narrativeParagraphs.map((para, i) => (
              <p
                key={i}
                style={{
                  fontSize: '0.9rem',
                  lineHeight: 1.7,
                  color: 'var(--ink)',
                  marginBottom: '1rem',
                }}
              >
                {para}
              </p>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            Scored 2026-08-03 against contract v0.4.0 (40 checks, 14 weighted
            categories). Re-scored weekly via GitHub Action.
          </p>
        </section>

        {/* Comparison: category peers */}
        {categoryPeers.length > 0 && (
          <section className="doctrine-section fade-up">
            <h2 className="doctrine-heading">
              Compared to {site.category} peers
            </h2>
            <p className="surface-note" style={{ marginBottom: '1rem' }}>
              {site.name} ranks #{categoryRank} of {categoryTotal} in the {site.category} category.
            </p>
            <div className="row-stack" role="list">
              {categoryPeers.map((peer, i) => (
                <Link
                  key={peer.url}
                  href={`/frameworks/${slugify(peer.url)}`}
                  className="row"
                  role="listitem"
                  style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                >
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row-body">
                    <span className="row-title">
                      {peer.name}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '22px',
                          height: '22px',
                          borderRadius: '4px',
                          background: gradeColor(peer.grade as string) || 'var(--muted)',
                          color: 'var(--paper)',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          marginLeft: '0.5rem',
                          flexShrink: 0,
                        }}
                      >
                        {peer.grade}
                      </span>
                    </span>
                    <span className="row-meta">
                      {peer.url.replace(/^https?:\/\//, '')} · {peer.score}/100
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Cohort context */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Cohort context</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
            }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
                This site
              </p>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                {score}/100
              </p>
            </div>
            <div style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
            }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
                Cohort mean
              </p>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--muted)', margin: 0 }}>
                {COHORT_MEAN.toFixed(1)}/100
              </p>
            </div>
            <div style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
            }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
                Cohort median
              </p>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--muted)', margin: 0 }}>
                {COHORT_MEDIAN.toFixed(1)}/100
              </p>
            </div>
            <div style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
            }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' }}>
                Delta from mean
              </p>
              <p style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                color: score > COHORT_MEAN ? 'var(--ok)' : score < COHORT_MEAN ? 'var(--error)' : 'var(--muted)',
                margin: 0,
              }}>
                {score > COHORT_MEAN ? '+' : ''}{(score - COHORT_MEAN).toFixed(1)}
              </p>
            </div>
          </div>
        </section>

        {/* Why this site is scored */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why this site is scored</h2>
          <p className="surface-note" style={{ maxWidth: '65ch' }}>
            {site.seededBecause}
          </p>
        </section>

        {/* Navigation footer */}
        <section className="doctrine-section fade-up">
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/frameworks" className="button ghost" style={{ fontSize: '0.85rem' }}>
              ← All evaluations
            </Link>
            <Link
              href={`/score?url=${site.url.replace(/^https?:\/\//, '')}`}
              className="button primary"
              style={{ fontSize: '0.85rem' }}
            >
              Re-score {site.name} live →
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}