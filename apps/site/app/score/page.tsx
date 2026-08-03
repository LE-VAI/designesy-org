import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { VerifyForm } from './verify-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// The opengraph-image.tsx in this segment is auto-wired by Next.js as the
// OG image for /score — it reads searchParams.url and renders the grade card.
export const metadata: Metadata = pageMeta({
  title: 'Verify',
  description:
    'Four engines. One composite grade. Score (40 checks), drift (12), AI readiness (10), and guardrails (6) — all on one URL. Real-time. No login.',
  path: '/score',
  ogTitle: 'Verify any site — Designesy',
  ogDescription:
    '68 automated checks across 4 engines — score, drift, AI readiness, guardrails. Enter a URL, get a composite grade.',
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
          <p className="surface-eyebrow">Verification</p>
          <h1 className="surface-title" data-scramble>
            Verify any site
          </h1>
          <p className="surface-lede">
            Four engines. One composite grade. Score (40 checks), drift (12), AI
            readiness (10), and guardrails (6) — all on one URL, one dashboard.
          </p>
          <p className="surface-note">
            The homepage gives you the quick 40-check score. This is the power surface —
            every engine at once, with a composite grade that synthesizes score, drift, and
            readiness. Find out how close you are.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <VerifyForm initialUrl={initialUrl} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What the engines measure</h2>
          <div className="definition">
            <p className="definition-label">Four engines, one verdict</p>
            <p>
              Every check traces back to a specific token or rule in the{' '}
              {/* Span, not <a>: this definition is inside DefinitionCopyEnhancer
                  which makes the whole block role="button" + tabindex=0 (click-to-copy).
                  An <a> descendant triggers axe-core nested-interactive even when
                  demoted (tabindex=-1 + aria-hidden + href stripped), because the
                  rule keys on element type, not on a11y-tree presence. A span with
                  the same class renders identically (.text-link uses border-bottom +
                  ::after, not text-decoration) and carries no interactive semantics
                  to flag. data-dce-href preserves the link target as metadata. */}
              <span className="text-link" data-dce-href="/contracts/design-system">
                design system contract
              </span>
              . The <strong>Score</strong> engine runs 40 checks — motion, typography, color,
              accessibility, identity. <strong>Drift</strong> detects AI-generated UI drift —
              fabricated tokens, inline values, off-system variance. <strong>AI Readiness</strong>
              probes for machine-readable design context — llms.txt, agent.json, MCP, token files.
              <strong> Guardrails</strong> emits a frozen build-contract bundle — DTCG tokens,
              stylelint config, agent rules. The composite grade synthesizes score, drift, and
              readiness into one defensible number.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}