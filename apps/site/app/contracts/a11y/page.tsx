import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { a11yContract } from '../../lib/a11y-contract';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { AgentActions } from '../../lib/agent-actions';
import { CheckSide, KvValue } from '../contract-parts';
import '../contracts.css';

export const metadata: Metadata = pageMeta({
  title: 'Accessibility contract',
  description:
    'Designesy accessibility contract v0.1.1: axe-core 4.13.0 + WCAG 2.2 AA + ACT Rules. Machine-checkable accessibility verification with provenance chain.',
  path: '/contracts/a11y',
  ogTitle: 'Accessibility contract · v0.1.1',
  ogDescription:
    'WCAG 2.2 AA via axe-core 4.13.0. Brand customization, provenance chain, 11 verification checks. Machine export available.',
  twitterDescription: 'Designesy accessibility contract · designesy.org/contracts/a11y',
});

// The scoring note leads with the live count, so the contract's own leading
// "11 checks." is dropped (every sibling page drops it the same way).
const scoringRest = (s: string) => s.replace(/^\d+ (?:synthesis )?checks[^.]*\.\s*/, '');

export default function A11yContractPage() {
  const c = a11yContract;
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Accessibility</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} ·{' '}
            <Link href={c.machine_url}>machine export</Link>
          </p>
          <AgentActions mdPath="/contracts/a11y.md" label="the accessibility contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>Primary engine</dt>
              <KvValue text={c.source_authority.primary} mono />
            </dl>
            <dl className="kv-cell">
              <dt>Conformance standard</dt>
              <KvValue text={c.source_authority.wcag} />
            </dl>
            <dl className="kv-cell">
              <dt>Provenance layer</dt>
              <KvValue text={c.source_authority.act_rules} />
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Conformance</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>Conformance level</dt>
              <KvValue text={c.conformance.level} />
            </dl>
            <dl className="kv-cell">
              <dt>Ruleset export</dt>
              <dd className="kv-mono">
                <code>{c.conformance.ruleset_export_command}</code>
              </dd>
            </dl>
            <dl className="kv-cell">
              <dt>Provenance chain</dt>
              <KvValue text={c.conformance.provenance_chain} />
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            <CountUp value={c.verification.checks.length} /> checks. {scoringRest(c.verification.scoring)}
          </p>
          <div className="row-stack" role="list">
            {c.verification.checks.map((check, i) => (
              <div key={check.id} className="row" role="listitem">
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                <span className="row-body">
                  <span className="row-title">{check.id} · {check.item}</span>
                </span>{' '}
                <CheckSide check={check} />
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Open questions</h2>
          <ul className="open-questions">
            {c.open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>

        <div className="status-note">
          Sibling contract to the design system {CONTRACT_VERSION}. Machine export at{' '}
          <Link href="/contracts/a11y.json">/contracts/a11y.json</Link>.
        </div>
      </main>
      <Footer />
    </>
  );
}
