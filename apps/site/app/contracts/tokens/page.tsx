import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { tokensContract } from '../../lib/tokens-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';

export const metadata: Metadata = pageMeta({
  title: 'Tokens contract',
  description:
    'Designesy tokens contract v0.1.0 — W3C DTCG 2025.10 token-format conformance. Color-space rules, custom types, validation criteria.',
  path: '/contracts/tokens',
  ogTitle: 'Tokens contract · v0.1.0',
  ogDescription:
    'Token-format conformance for W3C DTCG 2025.10. OKLCH mandatory, custom types via $extensions. Machine export available.',
  twitterDescription: 'Designesy tokens contract — designesy.org/contracts/tokens',
});

export default function TokensContractPage() {
  const c = tokensContract;
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Tokens</h1>
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
          <h2 className="doctrine-heading">Conformance</h2>
          <div className="definition">
            <p className="definition-label">Required token properties</p>
            <p>
              <strong>$value</strong> (required) · <strong>$type</strong> (required, direct or inherited) ·{' '}
              <strong>$description</strong> (recommended on semantic) · <strong>$extensions</strong> (optional, namespaced)
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Standard DTCG types</p>
            <p>{c.conformance.standard_dtcg_types.join(', ')}</p>
          </div>
          <div className="definition">
            <p className="definition-label">Custom Designesy types</p>
            <p>
              <strong>spring</strong> (via $extensions.designesy.spring) ·{' '}
              <strong>sound</strong> (via $extensions.designesy.sound)
            </p>
          </div>
          <div className="definition">
            <p className="definition-label">Color spaces</p>
            <p>
              OKLCH mandatory for new tokens · Display-P3 permitted · sRGB bare hex legacy (SHOULD migrate)
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification — <CountUp value={c.verification.checks.length} /> checks</h2>
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
          Sibling contract to the design system v0.4.0. Machine export at{' '}
          <Link href="/contracts/tokens.json">/contracts/tokens.json</Link>.
        </div>
      </main>
      <Footer />
    </>
  );
}