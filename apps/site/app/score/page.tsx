import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ScoreForm } from './score-form';

export const metadata: Metadata = pageMeta({
  title: 'Score',
  description:
    'Score any site against the Designesy design system contract. 26 checks. One grade. Real-time. No login.',
  path: '/score',
  ogTitle: 'Score any site — Designesy',
  ogDescription:
    '26 automated verification checks against a real design contract. Enter a URL, get a grade.',
});

export default function ScorePage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Labs · Score</p>
          <h1 className="surface-title" data-scramble>
            Score any site
          </h1>
          <p className="surface-lede">
            26 checks. One grade. Enter a URL and get a verified score against the Designesy
            design system contract.
          </p>
          <p className="surface-note">
            The contract defines the floor. Nobody passes it yet — not generators, not builders,
            not even the best-designed sites on the web. Find out how close you are.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <ScoreForm />
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