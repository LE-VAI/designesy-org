import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { monitorContract } from '../../lib/monitor-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { AgentActions } from '../../lib/agent-actions';
import { CheckSide, KvValue } from '../contract-parts';
import '../contracts.css';

export const metadata: Metadata = pageMeta({
  title: 'Monitor contract',
  description:
    `Designesy Monitor Contract v${monitorContract.version}: continuous design-drift monitoring. Re-scores a URL on a cadence, stores snapshots, computes drift deltas against the baseline, emails you when drift is detected, and surfaces regressions before they compound. 10 verification checks.`,
  path: '/contracts/monitor',
  ogTitle: 'Monitor contract · Designesy',
  ogDescription:
    'Continuous design-drift monitoring with email alerts: 10 checks for score delta, trend slope, new violations, token mutation, and alert delivery.',
  twitterDescription: 'Designesy monitor · designesy.org/contracts/monitor',
});

const c = monitorContract;

// Each snapshot field's JSON type, as the /api/monitor Snapshot carries it
// (app/api/monitor/route.ts) and as its description defines it.
const FIELD_TYPE: Record<string, string> = {
  url: 'string',
  timestamp: 'string',
  score: 'number',
  grade: 'string',
  checks: 'CheckResult[]',
  tokensExtracted: 'number',
};

// A cadence's interval, read from its own description ("every 24 hours").
function interval(description: string): string | null {
  const m = /every (\d+) (hour|day)s?/.exec(description);
  return m ? `${m[1]}${m[2] === 'hour' ? 'h' : 'd'}` : null;
}

// A trigger's condition and the run it compares against, both read from its
// own description: the default threshold where it states one, and baseline
// where it names the baseline (every other trigger names the previous run).
function triggerSide(description: string): { condition: string | null; against: string } {
  const threshold = /default threshold: (\d+)/.exec(description);
  const states = /(PASS\/WARN)\b.*\bnow (FAIL)/.exec(description);
  const example = /\(e\.g\. ([^)]+)\)/.exec(description);
  const changes = /^Tokens (added), (removed), or (renamed)\b/.exec(description);
  const condition = threshold
    ? `drop > ${threshold[1]} points`
    : states
      ? `${states[1]} → ${states[2]}`
      : example
        ? `e.g. ${example[1]}`
        : changes
          ? changes.slice(1).join(' · ')
          : null;
  return { condition, against: /baseline/.test(description) ? 'vs baseline' : 'vs previous run' };
}

export default function MonitorContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Monitor</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url.replace('https://www.designesy.org', '')}>machine export</Link>
          </p>
          <AgentActions mdPath="/contracts/monitor.md" label="the monitor contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>Temporal gap</dt>
              <KvValue text={c.source_authority.temporal_gap} />
            </dl>
            <dl className="kv-cell">
              <dt>Drift shape</dt>
              <KvValue text={c.source_authority.drift_shape} />
            </dl>
            <dl className="kv-cell">
              <dt>Compounding</dt>
              <KvValue text={c.source_authority.compounding} />
            </dl>
            <dl className="kv-cell is-wide">
              <dt>Competitor lane</dt>
              <KvValue text={c.source_authority.competitor_lane} />
            </dl>
            <dl className="kv-cell is-foot">
              <dt>Primary source</dt>
              <dd>{c.source_authority.primary}</dd>
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Monitoring model</h2>
          <div className="definition">
            <p className="definition-label">How it works</p>
            <p>{c.conformance.monitoring_model}</p>
          </div>
          <h3 className="contract-eyebrow is-spaced">Snapshot structure</h3>
          <div className="row-stack" role="list">
            {c.conformance.snapshot_structure.map((field, i) => (
              <div key={field.field} className="row" role="listitem">
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                <span className="row-body">
                  <span className="row-title contract-ident">{field.field}</span>{' '}
                  <span className="row-meta">{field.description}</span>
                </span>{' '}
                <span className="row-side">
                  <span className="row-side-line">{FIELD_TYPE[field.field] ?? 'JSON'}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Cadence options</h2>
          <div className="row-stack" role="list">
            {c.conformance.cadence_options.map((opt, i) => (
              <div key={opt.cadence} className="row" role="listitem">
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                <span className="row-body">
                  <span className="row-title">{opt.cadence}</span>{' '}
                  <span className="row-meta">{opt.description}</span>
                </span>{' '}
                <span className="row-side">
                  <span className="row-side-line">{interval(opt.description) ?? opt.cadence}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Alert triggers</h2>
          <div className="row-stack" role="list">
            {c.conformance.alert_triggers.map((trigger, i) => {
              const side = triggerSide(trigger.description);
              return (
                <div key={trigger.trigger} className="row" role="listitem">
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                  <span className="row-body">
                    <span className="row-title">{trigger.trigger.replace(/-/g, ' ')}</span>{' '}
                    <span className="row-meta">{trigger.description}</span>
                  </span>{' '}
                  <span className="row-side">
                    {side.condition ? <span className="row-side-line">{side.condition}</span> : null}{' '}
                    <span className="row-side-line">{side.against}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            <CountUp value={c.verification.checks.length} /> checks. {c.verification.scoring.replace(/^\d+ (?:synthesis )?checks[^.]*\.\s*/, '')}
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
          The monitor contract is the continuous-governance layer: it turns
          every prior designesy surface from a snapshot into a watched series.{' '}
          <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}
