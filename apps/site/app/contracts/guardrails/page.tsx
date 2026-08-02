import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { guardrailsContract } from '../../lib/guardrails-contract';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Guardrails contract',
  description:
    'Designesy Guardrails Contract v0.1.0 — ingests a design system and emits a frozen build contract for AI coding agents: DTCG tokens, Stylelint config, AGENTS.md rules, component contract, and anti-patterns. The product layer.',
  path: '/contracts/guardrails',
  ogTitle: 'Guardrails contract · Designesy',
  ogDescription:
    'Emit a frozen build contract for AI coding agents — tokens, lint config, agent rules.',
  twitterDescription: 'Designesy guardrails — designesy.org/contracts/guardrails',
});

const c = guardrailsContract;

export default function GuardrailsContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Guardrails</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url}>machine export</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="definition">
            <p className="definition-label">Contract shift</p>
            <p>{c.source_authority.contract_shift}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Types, not suggestions</p>
            <p>{c.source_authority.types_not_suggestions}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Adoption signal</p>
            <p>{c.source_authority.adoption_signal}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Output bundle</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            {c.conformance.emission_method}
          </p>
          <div className="row-stack" role="list">
            {c.conformance.output_bundle.map((item, i) => (
              <div key={item.component} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{item.component}</span>
                  <span className="row-meta">{item.description}</span>
                </span>
              </div>
            ))}
          </div>
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
                  <span className="row-meta">PASS: {check.pass} · FAIL: {check.fail}</span>
                </span>
              </div>
            ))}
          </div>
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
            Generate a guardrail bundle for any URL:
          </p>
          <div className="hero-actions">
            <Link href="/guardrails" className="button primary" data-cuelume-hover="tick" data-cuelume-press="tick">
              Generate guardrails →
            </Link>
            <Link href="/api/guardrails" className="button ghost" data-cuelume-hover="tick" data-cuelume-press="tick">
              API endpoint
            </Link>
          </div>
        </section>

        <div className="status-note">
          The guardrails emitter is the product layer — it turns a design
          system into the file AI agents read and the lint that enforces it.
          <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}