import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { driftContract } from '../../lib/drift-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';

export const metadata: Metadata = pageMeta({
  title: 'Drift contract',
  description:
    'Designesy Drift Contract v0.1.0 — detects the four documented AI-generated UI drift failure modes: token fabrication, within-session drift, between-session amnesia, silent breaking changes. 12 verification checks.',
  path: '/contracts/drift',
  ogTitle: 'Drift contract · Designesy',
  ogDescription:
    'Detect AI-generated UI drift — 12 checks for token fabrication, value variance, and off-contract patterns.',
  twitterDescription: 'Designesy drift detection — designesy.org/contracts/drift',
});

const c = driftContract;

export default function DriftContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Drift</h1>
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
            <p className="definition-label">Drift taxonomy</p>
            <p>{c.source_authority.drift_modes}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Scale signal</p>
            <p>{c.source_authority.scale_signal}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Drift rate</p>
            <p>{c.source_authority.drift_rate}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The four drift modes</h2>
          <div className="row-stack" role="list">
            {c.conformance.four_drift_modes.map((mode, i) => (
              <div key={mode.mode} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{mode.mode.replace(/_/g, ' ')}</span>
                  <span className="row-meta">{mode.description}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Conformance</h2>
          <div className="definition">
            <p className="definition-label">Detection method</p>
            <p>{c.conformance.detection_method}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            <CountUp value={c.verification.checks.length} /> checks — {c.verification.scoring}
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
            Score any URL for drift:
          </p>
          <div className="hero-actions">
            <Link href="/drift" className="button primary" data-cuelume-hover="tick" data-cuelume-press="tick">
              Drift radar →
            </Link>
            <Link href="/api/drift" className="button ghost" data-cuelume-hover="tick" data-cuelume-press="tick">
              API endpoint
            </Link>
          </div>
        </section>

        <div className="status-note">
          The drift contract is the first scoring engine that detects
          AI-generated UI drift deterministically — not prose advice, but
          12 checks against compiled CSS. <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}