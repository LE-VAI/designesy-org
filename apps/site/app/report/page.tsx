import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ReportForm } from './report-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Design-intelligence report',
  description:
    'Generate a unified design-intelligence report for any URL — score + drift + readiness synthesized into one composite grade. One input, one output, one grade. The synthesis capstone of the Designesy dynasty.',
  path: '/report',
  ogTitle: 'Design-intelligence report · Designesy',
  ogDescription:
    'One URL, three engines, one composite grade. Score + drift + readiness in a single report.',
  twitterDescription: 'Designesy report — designesy.org/report',
});

export default async function ReportPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Synthesis</p>
          <h1 className="surface-title" data-scramble>Design-intelligence report</h1>
          <p className="surface-lede">
            Generate a unified design-intelligence report for any URL — score,
            drift, and AI readiness synthesized into one composite grade. One
            input, one output, one grade.
          </p>
          <p className="surface-note">
            Fires /score (40-check audit), /drift (12-check drift radar), and
            /readiness (10-check AI readiness) in parallel, then computes a
            weighted composite: score × 0.5 + drift × 0.3 + readiness × 0.2.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <ReportForm initialUrl={initialUrl} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What it does</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The report engine fires three internal APIs in parallel against the
            target URL. Each engine independently fetches the page, extracts CSS
            and :root tokens, and runs its own checks. The results are then
            synthesized into a composite score using a weighted formula.
          </p>
          <p className="surface-note">
            Weighting: score (50%) is the broadest quality measure — tokens,
            typography, motion, accessibility, anti-generic, runtime. Drift (30%)
            is the 2026 crisis — AI-generated UI drift, token fabrication, value
            variance. Readiness (20%) is the emergent axis — machine-readable
            tokens, llms.txt, agent.json, MCP, DESIGN.md.
          </p>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            Composite: <code style={{ color: 'var(--ink)' }}>round(score × 0.5 + drift × 0.3 + readiness × 0.2)</code>.
            Grade: A≥90, B≥80, C≥70, D≥60, F&lt;60. 8 synthesis checks verify the
            report itself ran correctly.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}