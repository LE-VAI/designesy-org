// /frameworks — index page listing all scored framework evaluation articles.
//
// Pattern from Artificial Analysis: each scored entity gets a dedicated
// evaluation page with detailed metrics. This index lists all scored
// sites as evaluation articles, sorted by score.
//
// Each entry links to /frameworks/[slug] for the full evaluation.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { CountUp } from '../lib/count-up';
import { PageShareButton } from '../lib/page-share';
import { SEED, type Grade } from '../leaderboard/seed';

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Framework Evaluations',
  description:
    'Every scored site, each with its own evaluation article. 30 sites scored against the 40-check engine — browse by category, compare scores, read the findings.',
  path: '/frameworks',
  ogTitle: 'Framework Evaluations · Designesy',
  ogDescription:
    '30 sites scored against a 40-check design contract engine. Each has a dedicated evaluation page with per-category breakdowns.',
  twitterDescription: 'Framework evaluations — designesy.org/frameworks',
});

const GRADE_COLORS: Record<string, string> = {
  A: 'var(--ok)',
  B: 'var(--signal)',
  C: 'var(--warn)',
  D: 'var(--warn)',
  F: 'var(--error)',
};

function slugify(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .replace(/[./]/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

const SCORED = SEED.filter((s) => s.score !== null).sort((a, b) => (b.score as number) - (a.score as number));

// Group by category
const CATEGORIES = [...new Set(SCORED.map((s) => s.category))].sort();

export default function FrameworksIndexPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Evaluations</p>
          <h1 className="surface-title" data-scramble>Framework Evaluations</h1>
          <p className="surface-lede">
            Every scored site has its own evaluation page — score, grade,
            per-category breakdown, comparison to cohort, and the findings.
            <CountUp value={SCORED.length} /> sites across{' '}
            <CountUp value={CATEGORIES.length} /> categories.
          </p>
          <p className="surface-note">
            Pattern from Artificial Analysis: each scored entity gets a
            dedicated page with detailed metrics. Click any framework to read
            its evaluation.
          </p>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <PageShareButton
              text="30 sites scored against a 40-check design contract — each with its own evaluation page."
              label="Share the framework evaluations"
            />
          </div>
        </section>

        {CATEGORIES.map((cat) => {
          const catSites = SCORED.filter((s) => s.category === cat);
          return (
            <section key={cat} className="doctrine-section fade-up">
              <h2 className="doctrine-heading">{cat}</h2>
              <div className="row-stack" role="list">
                {catSites.map((site, i) => {
                  const slug = slugify(site.url);
                  const grade = site.grade as Grade;
                  const delta = site.prevScore !== null ? (site.score as number) - site.prevScore : null;
                  return (
                    <Link
                      key={site.url}
                      href={`/frameworks/${slug}`}
                      className="row"
                      role="listitem"
                      style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                    >
                      <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                      <span className="row-body">
                        <span className="row-title">
                          {site.name}
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '5px',
                              background: GRADE_COLORS[grade] || 'var(--muted)',
                              color: 'var(--paper)',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              marginLeft: '0.75rem',
                              flexShrink: 0,
                            }}
                          >
                            {grade}
                          </span>
                        </span>
                        <span className="row-meta">
                          {site.url.replace(/^https?:\/\//, '')} · {site.score}/100
                          {delta !== null && delta !== 0 && (
                            <span style={{
                              marginLeft: '0.5rem',
                              color: delta > 0 ? 'var(--ok)' : 'var(--error)',
                              fontSize: '0.75rem',
                            }}>
                              {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
                            </span>
                          )}
                        </span>
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted-dim)' }}>
                        {site.pass}p · {site.fail}f · {site.warn}w
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
      <Footer />
    </>
  );
}