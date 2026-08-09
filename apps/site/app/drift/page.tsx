import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { DriftForm } from './drift-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Drift radar',
  description:
    'Score any URL for AI-generated UI drift — 12 checks detect token fabrication, value variance, and off-contract patterns. The four documented 2026 drift failure modes, scored deterministically from compiled CSS.',
  path: '/drift',
  ogTitle: 'Drift radar · Designesy',
  ogDescription:
    'Detect AI-generated UI drift — 12 deterministic checks against compiled CSS.',
  twitterDescription: 'Designesy drift radar — designesy.org/drift',
});

export default async function DriftPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Verification</p>
          <h1 className="surface-title" data-scramble>Drift radar</h1>
          <p className="surface-lede">
            Detect AI-generated UI drift — 12 checks against compiled CSS for
            token fabrication, value variance, and off-contract patterns.
          </p>
          <p className="surface-note">
            The four documented 2026 drift failure modes: token fabrication,
            within-session drift, between-session amnesia, silent breaking changes.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <DriftForm initialUrl={initialUrl} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What it checks</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The drift engine fetches the target URL, extracts all CSS (inline +
            linked stylesheets), parses :root custom property declarations, and
            runs 12 checks covering the four drift failure modes. All checks
            are static analysis — no browser needed.
          </p>
          <p className="surface-note">
            Scoring: 12 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/12) ×
            100. A≥90, B≥80, C≥70, D≥60, F&lt;60.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}