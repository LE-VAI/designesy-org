import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { a11yContract } from '../../lib/a11y-contract';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Accessibility contract',
  description:
    'Designesy accessibility contract v0.1.0 — axe-core 4.12.1 + WCAG 2.2 AA + ACT Rules. Machine-checkable accessibility verification with provenance chain.',
  path: '/contracts/a11y',
  ogTitle: 'Accessibility contract · v0.1.0',
  ogDescription:
    'WCAG 2.2 AA via axe-core 4.12.1. Brand customization, provenance chain, 11 verification checks. Machine export available.',
  twitterDescription: 'Designesy accessibility contract — designesy.org/contracts/a11y',
});

export default function A11yContractPage() {
  const c = a11yContract;
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Accessibility</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} ·{' '}
            <Link href={c.machine_url}>machine export</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="definition">
            <p className="definition-label">Primary engine</p>
            <p>{c.source_authority.primary}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Conformance standard</p>
            <p>{c.source_authority.wcag}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Provenance layer</p>
            <p>{c.source_authority.act_rules}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Conformance</h2>
          <div className="definition">
            <p className="definition-label">Conformance level</p>
            <p>{c.conformance.level}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Ruleset export</p>
            <p><code>{c.conformance.ruleset_export_command}</code></p>
          </div>
          <div className="definition">
            <p className="definition-label">Provenance chain</p>
            <p>{c.conformance.provenance_chain}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification — {c.verification.checks.length} checks</h2>
          <div className="row-stack" role="list">
            {c.verification.checks.map((check, i) => (
              <div key={check.id} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{check.id} · {check.item}</span>
                  <span className="row-meta">
                    PASS: {check.pass}
                    {'fail' in check ? ` · FAIL: ${check.fail}` : ''}
                    {'warn' in check ? ` · WARN: ${check.warn}` : ''}
                    {'na' in check ? ` · N/A: ${check.na}` : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1rem' }}>{c.verification.scoring}</p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Open questions</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {c.open_questions.map((q, i) => (
              <li key={i} style={{ marginBottom: '0.75rem', color: 'var(--muted)' }}>{q}</li>
            ))}
          </ul>
        </section>

        <div className="status-note">
          Sibling contract to the design system v0.4.0. Machine export at{' '}
          <Link href="/contracts/a11y.json">/contracts/a11y.json</Link>.
        </div>
      </main>
      <Footer />
    </>
  );
}