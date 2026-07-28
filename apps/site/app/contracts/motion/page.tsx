import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { motionContract } from '../../lib/motion-contract';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Motion contract',
  description:
    'Designesy motion contract v0.1.0 — Lottie spec v1.0.1 JSON Schema + Designesy §16 Ten Non-Negotiable Motion Standards. Reduced-motion, format conformance, 10 verification checks.',
  path: '/contracts/motion',
  ogTitle: 'Motion contract · v0.1.0',
  ogDescription:
    'Lottie v1.0.1 JSON Schema validation + Designesy §16 block-on-sight list. Reduced-motion via markers/slots. Machine export available.',
  twitterDescription: 'Designesy motion contract — designesy.org/contracts/motion',
});

export default function MotionContractPage() {
  const c = motionContract;
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Motion</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} ·{' '}
            <Link href={c.machine_url}>machine export</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="definition">
            <p className="definition-label">Primary standard</p>
            <p>{c.source_authority.primary}</p>
          </div>
          <div className="definition">
            <p className="definition-label">JSON Schema</p>
            <p><a href={c.source_authority.json_schema}>{c.source_authority.json_schema}</a></p>
          </div>
          <div className="definition">
            <p className="definition-label">Reference validator</p>
            <p>{c.source_authority.reference_validator}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Ten Non-Negotiable Motion Standards</h2>
          <div className="row-stack" role="list">
            {c.conformance.ten_non_negotiable.map((std) => (
              <div key={std.num} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                <span className="row-index">{String(std.num).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">{std.rule}</span>
                  <span className="row-meta">{std.detail}</span>
                </span>
              </div>
            ))}
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
          Sibling contract to the design system v0.3.0. Machine export at{' '}
          <Link href="/contracts/motion.json">/contracts/motion.json</Link>.
        </div>
      </main>
      <Footer />
    </>
  );
}