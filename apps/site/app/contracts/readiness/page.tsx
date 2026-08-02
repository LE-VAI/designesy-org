import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { readinessContract } from '../../lib/readiness-contract';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'AI Readiness contract',
  description:
    'Designesy AI Readiness Contract v0.1.0 — scores whether a design system is the default context AI tools build from. 10 checks probe for machine-readable tokens, llms.txt, agent.json, MCP, DESIGN.md, sitemap, robots.txt, and social meta.',
  path: '/contracts/readiness',
  ogTitle: 'AI Readiness contract · Designesy',
  ogDescription:
    'Score design-system AI readiness — the 6th maturity axis. 10 checks for machine-readable context.',
  twitterDescription: 'Designesy AI readiness — designesy.org/contracts/readiness',
});

const c = readinessContract;

export default function ReadinessContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>AI Readiness</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url}>machine export</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="definition">
            <p className="definition-label">Primary</p>
            <p>{c.source_authority.primary}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Definition</p>
            <p>{c.source_authority.ai_ready_definition}</p>
          </div>
          <div className="definition">
            <p className="definition-label">How-to</p>
            <p>{c.source_authority.how_to}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The six maturity axes</h2>
          <div className="row-stack" role="list">
            {c.conformance.six_maturity_axes.map((axis, i) => (
              <div key={axis.axis} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{axis.axis}{axis.axis === 'AI Readiness' && ' (new)'}</span>
                  <span className="row-meta">{axis.description}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">AI-readiness signals</h2>
          <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: 'var(--muted)', lineHeight: 1.8 }}>
            {c.conformance.ai_readiness_signals.map((signal, i) => (
              <li key={i}>{signal}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            {c.verification.checks.length} checks — {c.verification.scoring}
          </p>
          <div className="row-stack" role="list">
            {c.verification.checks.map((check, i) => (
              <div key={check.id} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{check.id} · {check.item}</span>
                  <span className="row-meta">
                    PASS: {check.pass} · FAIL: {check.fail}
                    {'warn' in check ? ` · WARN: ${check.warn}` : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            Validation: {c.verification.validation_tools.primary}. Method: {c.verification.validation_tools.method}. Browser-only checks: {c.verification.validation_tools.browser_only}.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Open questions</h2>
          <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', color: 'var(--muted)', lineHeight: 1.8 }}>
            {c.open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Run it</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Score any URL for AI readiness:
          </p>
          <div className="hero-actions">
            <Link href="/readiness" className="button primary" data-cuelume-hover="tick" data-cuelume-press="tick">
              AI Readiness score →
            </Link>
            <Link href="/api/readiness" className="button ghost" data-cuelume-hover="tick" data-cuelume-press="tick">
              API endpoint
            </Link>
          </div>
        </section>

        <div className="status-note">
          The AI Readiness contract is the first automated scorer for the 6th
          maturity axis — no questionnaire, just scan. <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}