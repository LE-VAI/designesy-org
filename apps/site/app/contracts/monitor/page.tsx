import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { monitorContract } from '../../lib/monitor-contract';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Monitor contract',
  description:
    'Designesy Monitor Contract v0.1.0 — continuous design-drift monitoring. Re-scores a URL on a cadence, stores snapshots, computes drift deltas against the baseline, and surfaces regressions before they compound. 10 verification checks.',
  path: '/contracts/monitor',
  ogTitle: 'Monitor contract · Designesy',
  ogDescription:
    'Continuous design-drift monitoring — 10 checks for score delta, trend slope, new violations, token mutation, and alert delivery.',
  twitterDescription: 'Designesy monitor — designesy.org/contracts/monitor',
});

const c = monitorContract;

export default function MonitorContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Monitor</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url.replace('https://www.designesy.org', '')}>machine export</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="definition">
            <p className="definition-label">Primary source</p>
            <p>{c.source_authority.primary}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Temporal gap</p>
            <p>{c.source_authority.temporal_gap}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Drift shape</p>
            <p>{c.source_authority.drift_shape}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Compounding</p>
            <p>{c.source_authority.compounding}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Competitor lane</p>
            <p>{c.source_authority.competitor_lane}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Monitoring model</h2>
          <div className="definition">
            <p className="definition-label">How it works</p>
            <p>{c.conformance.monitoring_model}</p>
          </div>
          <p className="surface-note" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            <strong style={{ color: 'var(--ink)' }}>Snapshot structure</strong>
          </p>
          <div className="row-stack" role="list">
            {c.conformance.snapshot_structure.map((field, i) => (
              <div key={field.field} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{field.field}</span>
                  <span className="row-meta">{field.description}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Cadence options</h2>
          <div className="row-stack" role="list">
            {c.conformance.cadence_options.map((opt, i) => (
              <div key={opt.cadence} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{opt.cadence}</span>
                  <span className="row-meta">{opt.description}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Alert triggers</h2>
          <div className="row-stack" role="list">
            {c.conformance.alert_triggers.map((trigger, i) => (
              <div key={trigger.trigger} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{trigger.trigger.replace(/-/g, ' ')}</span>
                  <span className="row-meta">{trigger.description}</span>
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
            Monitor any URL for drift over time:
          </p>
          <div className="hero-actions">
            <Link href="/monitor" className="button primary" data-cuelume-hover="tick" data-cuelume-press="tick">
              Monitor a URL →
            </Link>
            <Link href="/api/monitor" className="button ghost" data-cuelume-hover="tick" data-cuelume-press="tick">
              API endpoint
            </Link>
          </div>
        </section>

        <div className="status-note">
          The monitor contract is the continuous-governance layer — it turns
          every prior designesy surface from a snapshot into a watched series.
          <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}