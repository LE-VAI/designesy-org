import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { reportContract } from '../../lib/report-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { AgentActions } from '../../lib/agent-actions';
import { CheckSide, KvValue } from '../contract-parts';
import '../contracts.css';

export const metadata: Metadata = pageMeta({
  title: 'Report contract',
  description:
    'Designesy Report Contract v0.1.0: the synthesis capstone. Fetch one URL, fire score + drift + readiness in parallel, and produce a unified design-intelligence report with a single composite grade. One input, one output, one grade. 8 synthesis checks.',
  path: '/contracts/report',
  ogTitle: 'Report contract · Designesy',
  ogDescription:
    'The synthesis capstone: one URL, three engines, one composite grade. Score + drift + readiness in a single report.',
  twitterDescription: 'Designesy report · designesy.org/contracts/report',
});

const c = reportContract;

// The weight each sub-engine carries in the composite, by route. A related
// surface the report does not run carries none.
const WEIGHT = new Map<string, number>(c.conformance.weighting.map((w) => [`/${w.dimension}`, w.weight]));

// The six surfaces "Relationship to core" names, in the contract's order.
const RELATED = Object.entries(c.relationship_to_core)
  .filter(([key]) => key.startsWith('designesy.org /'))
  .map(([key, text]) => ({ route: key.slice('designesy.org '.length), text }));

export default function ReportContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Synthesis contract</p>
          <h1 className="surface-title" data-scramble>Report</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url.replace('https://www.designesy.org', '')}>machine export</Link>
          </p>
          <AgentActions mdPath="/contracts/report.md" label="the report contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>Composition</dt>
              <KvValue text={c.source_authority.composition} />
            </dl>
            <dl className="kv-cell">
              <dt>Shareability</dt>
              <KvValue text={c.source_authority.shareability} />
            </dl>
            <dl className="kv-cell">
              <dt>URL gap</dt>
              <KvValue text={c.source_authority.url_gap} />
            </dl>
            <dl className="kv-cell is-foot">
              <dt>Primary source</dt>
              <dd>{c.source_authority.primary}</dd>
            </dl>
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
              <div key={w.dimension} className="row" role="listitem">
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                <span className="row-body">
                  <span className="row-title">{w.dimension}</span>{' '}
                  <span className="row-meta">{w.description}</span>
                </span>{' '}
                <span className="row-side report-weight">
                  <span
                    className="report-weight-bar"
                    aria-hidden="true"
                    style={{ '--weight': w.weight } as CSSProperties}
                  />
                  <span className="report-weight-num">
                    <span className="sr-only">Weight </span>
                    {w.weight}
                  </span>
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
            <CountUp value={c.verification.checks.length} /> synthesis checks. {c.verification.scoring.replace(/^\d+ (?:synthesis )?checks[^.]*\.\s*/, '')}
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
          <div className="contract-validation">
            <p className="contract-eyebrow">Validation</p>
            <p className="surface-note">
              {c.verification.validation_tools.primary}. Method: {c.verification.validation_tools.method}. Browser-only checks: {c.verification.validation_tools.browser_only}.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Relationship to core</h2>
          <div className="row-stack" role="list">
            {RELATED.map(({ route, text }, i) => {
              const weight = WEIGHT.get(route);
              return (
                <div key={route} className="row" role="listitem">
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                  <span className="row-body">
                    <span className="row-title contract-ident">{route}</span>{' '}
                    <span className="row-meta">{text}</span>
                  </span>{' '}
                  <span className="row-side">
                    {weight === undefined ? (
                      <span className="row-side-line">
                        <span className="row-side-chip" data-state="hold">Not run</span>
                      </span>
                    ) : (
                      <span className="row-side-line">weight {weight}</span>
                    )}
                  </span>
                </div>
              );
            })}
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
          The report contract is the synthesis capstone: it answers &ldquo;how
          good is this design, is AI breaking it, and can agents use it&rdquo; in
          one composite grade. <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}