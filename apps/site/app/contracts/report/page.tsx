import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { reportContract } from '../../lib/report-contract';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Report contract',
  description:
    'Designesy Report Contract v0.1.0 — the synthesis capstone. Fetch one URL, fire score + drift + readiness in parallel, and produce a unified design-intelligence report with a single composite grade. One input, one output, one grade. 8 synthesis checks.',
  path: '/contracts/report',
  ogTitle: 'Report contract · Designesy',
  ogDescription:
    'The synthesis capstone — one URL, three engines, one composite grade. Score + drift + readiness in a single report.',
  twitterDescription: 'Designesy report — designesy.org/contracts/report',
});

const c = reportContract;

export default function ReportContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Synthesis contract</p>
          <h1 className="surface-title" data-scramble>Report</h1>
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
            <p className="definition-label">Composition</p>
            <p>{c.source_authority.composition}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Weighting</p>
            <p>{c.source_authority.weighting}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Shareability</p>
            <p>{c.source_authority.shareability}</p>
          </div>
          <div className="definition">
            <p className="definition-label">URL gap</p>
            <p>{c.source_authority.url_gap}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Method</h2>
          <div className="definition">
            <p className="definition-label">How it works</p>
            <p>{c.conformance.method}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Weighting</h2>
          <div className="row-stack" role="list">
            {c.conformance.weighting.map((w, i) => (
              <div key={w.dimension} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{w.dimension} × {w.weight}</span>
                  <span className="row-meta">{w.description}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            {c.conformance.composite_formula}
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            {c.verification.checks.length} synthesis checks — {c.verification.scoring}
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
          <h2 className="doctrine-heading">Relationship to core</h2>
          <div className="definition">
            <p className="definition-label">/score</p>
            <p>{c.relationship_to_core['designesy.org /score']}</p>
          </div>
          <div className="definition">
            <p className="definition-label">/drift</p>
            <p>{c.relationship_to_core['designesy.org /drift']}</p>
          </div>
          <div className="definition">
            <p className="definition-label">/readiness</p>
            <p>{c.relationship_to_core['designesy.org /readiness']}</p>
          </div>
          <div className="definition">
            <p className="definition-label">/guardrails</p>
            <p>{c.relationship_to_core['designesy.org /guardrails']}</p>
          </div>
          <div className="definition">
            <p className="definition-label">/monitor</p>
            <p>{c.relationship_to_core['designesy.org /monitor']}</p>
          </div>
          <div className="definition">
            <p className="definition-label">/compare</p>
            <p>{c.relationship_to_core['designesy.org /compare']}</p>
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
            Generate a unified design-intelligence report for any URL:
          </p>
          <div className="hero-actions">
            <Link href="/report" className="button primary" data-cuelume-hover="tick" data-cuelume-press="tick">
              Generate a report →
            </Link>
            <Link href="/api/report" className="button ghost" data-cuelume-hover="tick" data-cuelume-press="tick">
              API endpoint
            </Link>
          </div>
        </section>

        <div className="status-note">
          The report contract is the synthesis capstone — it answers &ldquo;how
          good is this design, is AI breaking it, and can agents use it&rdquo; in
          one composite grade. <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}