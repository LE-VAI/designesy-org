import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import {
  SEED,
  LEADERBOARD_POLICY,
  LEADERBOARD_LAST_SCORED,
  LEADERBOARD_SCORED_COUNT,
  type Grade,
  type SeedSite,
} from './seed';

export const metadata: Metadata = pageMeta({
  title: 'Leaderboard',
  description:
    'Public design-verification leaderboard — 30 curated sites scored by the deterministic 34-check Designesy engine. No LLM, no paywall, no pay-to-remove.',
  path: '/leaderboard',
  ogDescription:
    '30 sites scored by the same deterministic 34-check engine that scores designesy.org. Designesy is the only A-grade site in the cohort.',
  twitterDescription:
    'Public design-verification leaderboard — designesy.org/leaderboard',
});

const GRADE_LABEL: Record<Grade, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  F: 'F',
};

const TIER_LABEL: Record<number, string> = {
  1: 'Reference',
  2: 'Competitors',
  3: 'Design-system exemplars',
  4: 'Inspiration',
  5: 'High-traffic',
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function GradeBadge({ grade, score }: { grade: Grade; score: number }) {
  const needsWork = score < 50;
  return (
    <span
      className={`lb-grade lb-grade-${grade.toLowerCase()}${needsWork ? ' lb-needs-work' : ''}`}
      aria-label={`Grade ${grade}, ${score.toFixed(1)} percent`}
      title={`Grade ${grade} · ${score.toFixed(1)}%${needsWork ? ' · needs work' : ''}`}
    >
      {GRADE_LABEL[grade]}
    </span>
  );
}

function ScoreCell({ site }: { site: SeedSite }) {
  if (site.score === null) {
    return <span className="lb-score lb-score-pending">pending</span>;
  }
  return (
    <span className="lb-score" data-tabular>
      {site.score.toFixed(1)}
      <span className="lb-score-pct">%</span>
    </span>
  );
}

function SiteRow({ site }: { site: SeedSite }) {
  const isSelf = site.url === 'https://www.designesy.org';
  const needsWork = site.score !== null && site.score < 50;
  const scoreHref = `/score?url=${encodeURIComponent(hostOf(site.url))}`;
  const externalHref = site.url;

  return (
    <div
      className={`row lb-row${isSelf ? ' lb-row-self' : ''}${needsWork ? ' lb-row-needs-work' : ''}`}
      role="listitem"
    >
      <span className="row-index lb-rank" data-tabular>
        {site.rank !== null ? String(site.rank).padStart(2, '0') : '—'}
      </span>
      <span className="row-body lb-row-body">
        <span className="lb-row-head">
          <Link href={scoreHref} className="row-title lb-name" data-cuelume-hover="whisper" data-cuelume-press>
            {site.name}
            {isSelf && <span className="lb-self-tag">self</span>}
          </Link>
          <span className="lb-row-meta">
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="lb-host"
            >
              {hostOf(site.url)}
            </a>
            <span className="lb-tier-tag" aria-label={`Tier ${site.tier}: ${TIER_LABEL[site.tier]}`}>
              T{site.tier} · {site.category}
            </span>
          </span>
        </span>
        <span className="lb-row-foot">
          {site.score !== null && site.grade !== null ? (
            <>
              <GradeBadge grade={site.grade} score={site.score} />
              <ScoreCell site={site} />
              <span className="lb-breakdown" data-tabular>
                {site.pass} pass · {site.fail} fail · {site.warn} warn · {site.skip} skip
              </span>
            </>
          ) : (
            <span className="lb-pending-note">unscored — pending re-score</span>
          )}
          <Link href={scoreHref} className="lb-score-link" data-cuelume-press>
            re-score →
          </Link>
        </span>
      </span>
    </div>
  );
}

export default function LeaderboardPage() {
  // Sort: scored by rank asc, unscored at the end.
  const ranked = [...SEED].sort((a, b) => {
    if (a.rank === null && b.rank === null) return a.name.localeCompare(b.name);
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });

  const aCount = SEED.filter((s) => s.grade === 'A').length;
  const dCount = SEED.filter((s) => s.grade === 'D').length;
  const fCount = SEED.filter((s) => s.grade === 'F').length;
  const needsWorkCount = SEED.filter((s) => s.score !== null && s.score < 50).length;

  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page lb-page">
        <style>{`
          .lb-page .lb-table { display: flex; flex-direction: column; gap: 0.5rem; }
          .lb-row { display: grid; grid-template-columns: 2.5rem 1fr; gap: 1rem; align-items: start; padding: 1rem 1.25rem; }
          .lb-row .lb-rank { font-family: var(--mono, ui-monospace, monospace); font-size: 0.85rem; color: var(--muted-dim); font-variant-numeric: tabular-nums; padding-top: 0.125rem; }
          .lb-row:hover .lb-rank { color: var(--ink); }
          .lb-row-body { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
          .lb-row-head { display: flex; flex-direction: column; gap: 0.25rem; }
          .lb-row-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; font-size: 0.78rem; color: var(--muted-dim); }
          .lb-host { color: var(--muted); text-decoration: none; border-bottom: 1px solid var(--line-faint); }
          .lb-host:hover { color: var(--ink); border-bottom-color: var(--line-strong); }
          .lb-tier-tag { font-family: var(--mono, ui-monospace, monospace); letter-spacing: 0.04em; }
          .lb-row-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.875rem; font-size: 0.82rem; color: var(--muted); }
          .lb-grade { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem; font-family: var(--mono, ui-monospace, monospace); border: 1px solid var(--line); }
          .lb-grade-a { background: var(--signal-dim); color: var(--ink); border-color: var(--signal-light); }
          .lb-grade-b { background: rgba(254,204,52,0.18); color: var(--ink); border-color: var(--activation); }
          .lb-grade-c { background: var(--surface-hover); color: var(--ink); border-color: var(--line-strong); }
          .lb-grade-d { background: var(--surface-hover); color: var(--muted); border-color: var(--line); }
          .lb-grade-f { background: transparent; color: var(--muted-dim); border-color: var(--line-faint); }
          .lb-needs-work { opacity: 0.85; }
          .lb-score { font-family: var(--mono, ui-monospace, monospace); font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; font-size: 0.95rem; }
          .lb-score-pending { color: var(--muted-dim); font-style: italic; font-weight: 400; font-family: inherit; font-size: 0.82rem; }
          .lb-score-pct { color: var(--muted-dim); font-weight: 400; margin-left: 0.125rem; font-size: 0.78rem; }
          .lb-breakdown { font-family: var(--mono, ui-monospace, monospace); font-size: 0.72rem; color: var(--muted-dim); letter-spacing: 0.02em; }
          .lb-pending-note { color: var(--muted-dim); font-style: italic; font-size: 0.8rem; }
          .lb-score-link { margin-left: auto; font-size: 0.78rem; color: var(--muted-dim); text-decoration: none; border-bottom: 1px solid transparent; }
          .lb-score-link:hover { color: var(--ink); border-bottom-color: var(--line-strong); }
          .lb-self-tag { display: inline-block; margin-left: 0.5rem; padding: 0.05rem 0.4rem; font-size: 0.62rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink); background: var(--signal-dim); border-radius: 3px; vertical-align: middle; }
          .lb-row-self { background: var(--signal-dim); border-color: var(--signal-light) !important; }
          .lb-row-self:hover { background: var(--signal-dim); border-color: var(--signal) !important; }
          .lb-row-needs-work .lb-name { color: var(--muted); }
          .lb-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin: 1.5rem 0; }
          .lb-stat { padding: 0.875rem 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
          .lb-stat-num { display: block; font-family: var(--mono, ui-monospace, monospace); font-size: 1.4rem; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1; }
          .lb-stat-label { display: block; margin-top: 0.35rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted-dim); }
          .lb-policy { padding: 1rem 1.25rem; background: var(--surface-soft); border: 1px solid var(--line); border-radius: 6px; color: var(--muted); font-size: 0.88rem; line-height: 1.55; }
          .lb-policy strong { color: var(--ink); font-weight: 600; }
          @media (max-width: 560px) {
            .lb-row { grid-template-columns: 1.75rem 1fr; gap: 0.625rem; padding: 0.875rem 1rem; }
            .lb-row-foot { gap: 0.4rem 0.625rem; }
            .lb-breakdown { display: none; }
          }
        `}</style>

        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Public verification</p>
          <h1 className="surface-title" data-scramble>Leaderboard</h1>
          <p className="surface-lede">
            30 curated sites scored by the same deterministic 34-check engine
            that scores designesy.org. No LLM, no paywall, no pay-to-remove.
          </p>
          <p className="surface-note">
            Scores reflect what the engine measures on the live fetched surface
            — token architecture, motion hygiene, accessibility primitives,
            typography discipline. A site can look world-class and still score
            low if it doesn&rsquo;t ship the contract primitives at{' '}
            <code style={{ color: 'var(--ink)' }}>{':root'}</code>. That is the
            point.
          </p>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <Link
              className="button primary"
              href="/score"
              data-cuelume-press
            >
              Score a site
            </Link>
            <a
              className="button ghost"
              href="mailto:hello@designesy.org?subject=Leaderboard%20submission"
              data-cuelume-press
            >
              Submit a site
            </a>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Cohort snapshot</h2>
          <div className="lb-stats">
            <div className="lb-stat">
              <span className="lb-stat-num">{LEADERBOARD_SCORED_COUNT}</span>
              <span className="lb-stat-label">Scored</span>
            </div>
            <div className="lb-stat">
              <span className="lb-stat-num">{aCount}</span>
              <span className="lb-stat-label">A grade</span>
            </div>
            <div className="lb-stat">
              <span className="lb-stat-num">{dCount}</span>
              <span className="lb-stat-label">D grade</span>
            </div>
            <div className="lb-stat">
              <span className="lb-stat-num">{needsWorkCount}</span>
              <span className="lb-stat-label">Needs work (&lt;50)</span>
            </div>
            <div className="lb-stat">
              <span className="lb-stat-num" title={LEADERBOARD_LAST_SCORED}>{LEADERBOARD_LAST_SCORED.slice(5)}</span>
              <span className="lb-stat-label">Last scored</span>
            </div>
          </div>
          <p className="lb-policy">
            <strong>Policy.</strong> {LEADERBOARD_POLICY}{' '}
            Scores re-run weekly. The seed list is curated across five tiers
            (reference, competitors, design-system exemplars, inspiration,
            high-traffic). Open submission is a follow-up — for now, mail{' '}
            <a href="mailto:hello@designesy.org">hello@designesy.org</a>.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Ranking</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Ranked by total score. The top site is the only A-grade site in the
            cohort. Select any row to re-score it live at{' '}
            <Link href="/score">/score</Link>.
          </p>
          <div className="row-stack lb-table" role="list">
            {ranked.map((site) => (
              <SiteRow key={site.url} site={site} />
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">How to read this</h2>
          <div className="definition">
            <p className="definition-label">What the engine measures</p>
            <p>
              34 deterministic checks across 11 weighted categories — token
              architecture, motion hygiene, accessibility primitives,
              typography discipline, reduced-motion handling, AI disclosure,
              forced-colors readiness. Not an LLM impression. Not a roast. The
              same engine scores designesy.org itself, in public, at{' '}
              <Link href="/score?url=designesy.org">/score?url=designesy.org</Link>.
            </p>
          </div>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            The engine measures what is <em>shipped</em>, not what is
            documented. A design-system site can publish a rich token taxonomy
            in storybook and still score low if the marketing surface
            doesn&rsquo;t expose those tokens at <code style={{ color: 'var(--ink)' }}>{':root'}</code>.
            That gap — between documented and shipped — is exactly what the
            leaderboard surfaces.
          </p>
        </section>

        <div className="status-note">
          Leaderboard v0.2 · curated seed (30 sites) · last scored{' '}
          {LEADERBOARD_LAST_SCORED} · open submission is a follow-up. Scores are
          deterministic and re-run weekly. The JSON endpoint lives at{' '}
          <Link href="/leaderboard">/leaderboard</Link> (the API). Submit a site
          via <a href="mailto:hello@designesy.org">hello@designesy.org</a>.
        </div>
      </main>

      <Footer />
    </>
  );
}