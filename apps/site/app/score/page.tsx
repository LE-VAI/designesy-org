import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ScoreForm } from './score-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// The opengraph-image.tsx in this segment is auto-wired by Next.js as the
// OG image for /score — it reads searchParams.url and renders the grade card.
export const metadata: Metadata = pageMeta({
  title: 'Score',
  description:
    'Score any site against the Designesy design system contract. 40 checks. One grade. Real-time. No login.',
  path: '/score',
  ogTitle: 'Score any site — Designesy',
  ogDescription:
    '40 automated verification checks against a real design contract. Enter a URL, get a grade.',
});

export default async function ScorePage({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Labs · Score</p>
          <h1 className="surface-title" data-scramble>
            Score any site
          </h1>
          <p className="surface-lede">
            40 checks. One grade. Enter a URL and get a verified score against the Designesy
            design system contract.
          </p>
          <p className="surface-note">
            The contract defines a high floor. Most sites score D or F — including
            sites you&apos;d expect to pass. Find out how close you are.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <ScoreForm initialUrl={initialUrl} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What the checks measure</h2>
          <div className="definition">
            <p className="definition-label">The contract, automated</p>
            <p>
              Every check traces back to a specific token or rule in the{' '}
              <a href="/contracts/design-system" className="text-link">
                design system contract
              </a>
              . Motion standards, typography cadence, color discipline, accessibility thresholds,
              and identity rules — all codified, all verifiable. The score is the output metric:
              not whether you read the contract, but whether your design actually passes it.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}