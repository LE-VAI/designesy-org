import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { motionContract } from '../../lib/motion-contract';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { AgentActions } from '../../lib/agent-actions';
import { CheckSide, KvValue } from '../contract-parts';
import '../contracts.css';

export const metadata: Metadata = pageMeta({
  title: 'Motion contract',
  description:
    'Designesy motion contract v0.1.0: Lottie spec v1.0.1 JSON Schema + Designesy §16 Ten Non-Negotiable Motion Standards. Reduced-motion, format conformance, 10 verification checks.',
  path: '/contracts/motion',
  ogTitle: 'Motion contract · v0.1.0',
  ogDescription:
    'Lottie v1.0.1 JSON Schema validation + Designesy §16 block-on-sight list. Reduced-motion via markers/slots. Machine export available.',
  twitterDescription: 'Designesy motion contract · designesy.org/contracts/motion',
});

// The scoring note leads with the live count, so the contract's own leading
// "10 checks." is dropped (every sibling page drops it the same way).
const scoringRest = (s: string) => s.replace(/^\d+ (?:synthesis )?checks[^.]*\.\s*/, '');

export default function MotionContractPage() {
  const c = motionContract;
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Motion</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} ·{' '}
            <Link href={c.machine_url}>machine export</Link>
          </p>
          <AgentActions mdPath="/contracts/motion.md" label="the motion contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>Primary standard</dt>
              <KvValue text={c.source_authority.primary} />
            </dl>
            <dl className="kv-cell">
              <dt>JSON Schema</dt>
              <dd className="kv-mono">
                <a href={c.source_authority.json_schema}>{c.source_authority.json_schema}</a>
              </dd>
            </dl>
            <dl className="kv-cell">
              <dt>Reference validator</dt>
              <KvValue text={c.source_authority.reference_validator} mono />
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Ten non-negotiable motion standards</h2>
          <div className="row-stack" role="list">
            {c.conformance.ten_non_negotiable.map((std) => (
              <div key={std.num} className="row" role="listitem">
                <span className="row-index">{String(std.num).padStart(2, '0')}</span>{' '}
                <span className="row-body">
                  <span className="row-title">{std.rule}</span>{' '}
                  <span className="row-meta">{std.detail}</span>
                </span>
              </div>
            ))}
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
          <Link href="/contracts/motion.json">/contracts/motion.json</Link>.
        </div>
      </main>
      <Footer />
    </>
  );
}
