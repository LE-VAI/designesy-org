import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ReadinessForm } from './readiness-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'AI Readiness score',
  description:
    'Score any URL for design-system AI readiness — 10 checks probe for machine-readable tokens, llms.txt, agent.json, MCP endpoint, DESIGN.md, sitemap, robots.txt, and social meta. The 6th maturity axis, automated.',
  path: '/readiness',
  ogTitle: 'AI Readiness score · Designesy',
  ogDescription:
    'Is your design system the default context AI tools build from? 10 automated checks.',
  twitterDescription: 'Designesy AI readiness — designesy.org/readiness',
});

export default async function ReadinessPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Verification</p>
          <h1 className="surface-title" data-scramble>AI Readiness score</h1>
          <p className="surface-lede">
            Is your design system the default context AI tools build from — or
            is AI silently working around it? 10 checks probe for
            machine-readable artifacts.
          </p>
          <p className="surface-note">
            The 6th maturity axis (zeroheight 2026). No questionnaire — just
            scan.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <ReadinessForm initialUrl={initialUrl} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What it probes</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The readiness engine fetches the target URL and probes the origin
            for machine-readable artifacts: token files, llms.txt,
            agent.json, MCP endpoint, DESIGN.md, sitemap, robots.txt, and
            social meta tags. All checks are HTTP probes — no browser needed.
          </p>
          <p className="surface-note">
            Scoring: 10 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/10)
            × 100. A≥90, B≥80, C≥70, D≥60, F&lt;60.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}