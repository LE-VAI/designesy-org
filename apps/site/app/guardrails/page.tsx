import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { GuardrailsForm } from './guardrails-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Guardrails',
  description:
    'Generate a frozen build contract for AI coding agents from any design system — DTCG tokens, Stylelint config, AGENTS.md rules, component contract, and anti-patterns. The product layer.',
  path: '/guardrails',
  ogTitle: 'Guardrails · Designesy',
  ogDescription:
    'Turn your design system into the file AI agents read and the lint that enforces it.',
  twitterDescription: 'Designesy guardrails — designesy.org/guardrails',
});

export default async function GuardrailsPage({ searchParams }: { searchParams?: Promise<{ url?: string }> }) {
  const params = await searchParams;
  const initialUrl = typeof params?.url === 'string' ? params.url : '';

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Product layer</p>
          <h1 className="surface-title" data-scramble>Guardrails</h1>
          <p className="surface-lede">
            Ingest a design system, emit a frozen build contract for AI
            coding agents — the file the agent reads, plus the lint config
            that enforces it. Tokens are a contract, not a library.
          </p>
          <p className="surface-note">
            5 emission checks. The score reflects emission completeness, not
            design quality.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <GuardrailsForm initialUrl={initialUrl} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What it emits</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The guardrails emitter fetches the target URL, extracts all CSS
            and :root custom properties, and generates a 5-part build-contract
            bundle. All static CSS analysis + generation — no browser needed.
          </p>
          <p className="surface-note">
            Scoring: 5 checks. PASS=1, FAIL=0. Score = (points/5) × 100.
            A≥90, B≥80, C≥70, D≥60, F&lt;60.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}