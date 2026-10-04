import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { driftContract } from '../../lib/drift-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { AgentActions } from '../../lib/agent-actions';
import { CheckSide, KvFigures, KvValue } from '../contract-parts';
import '../contracts.css';

export const metadata: Metadata = pageMeta({
  title: 'Drift contract',
  description:
    'Designesy Drift Contract v0.1.0 detects the four documented AI-generated UI drift failure modes: token fabrication, within-session drift, between-session amnesia, silent breaking changes. 12 verification checks.',
  path: '/contracts/drift',
  ogTitle: 'Drift contract · Designesy',
  ogDescription:
    'Detect AI-generated UI drift: 12 checks for token fabrication, value variance, and off-contract patterns.',
  twitterDescription: 'Designesy drift detection · designesy.org/contracts/drift',
});

const c = driftContract;

// The two statistics, read out of the contract's own sentences so the figure
// cannot drift from its source. If a sentence is reworded and no longer
// matches, the cell prints the sentence instead.
//   "OverlayQA: ~160 visual issues per AI-generated app (Jason Arbon, 1000+ checks)"
const SCALE = /^(.+?):\s*(~?\d[\d,]*)\s+(.+?)\s*\((.+)\)$/.exec(c.source_authority.scale_signal);
//   "Figma 2025: 23% design-system drift in 8 weeks without formal review vs 4% with it"
const RATE = /^(.+?):\s*(\d+%)\s+(.+?)\s+without\s+(.+?)\s+vs\s+(\d+%)\s+with it$/.exec(c.source_authority.drift_rate);

// The checks that detect each mode, and the limit the contract's own open
// questions name for it. Ids are the verification list's own.
const MODE_SIDE: Record<string, { checks?: string; gap?: string }> = {
  token_fabrication: { checks: 'd02 · d11 · d12' },
  within_session_drift: { checks: 'd04 · d05 · d06 · d07 · d08 · d09', gap: 'on the fetched URL only' },
  between_session_amnesia: { gap: 'needs historical snapshots' },
  silent_breaking_changes: { gap: 'needs version tracking' },
};

export default function DriftContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Drift</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url}>machine export</Link>
          </p>
          <AgentActions mdPath="/contracts/drift.md" label="the drift contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>Drift taxonomy</dt>
              <KvValue text={c.source_authority.drift_modes} />
            </dl>
            <dl className="kv-cell">
              <dt>Scale of the problem</dt>
              {SCALE ? (
                <KvFigures figures={[{ value: SCALE[2], caption: SCALE[3] }]} source={`${SCALE[1]} · ${SCALE[4]}`} />
              ) : (
                <KvValue text={c.source_authority.scale_signal} />
              )}
            </dl>
            <dl className="kv-cell">
              <dt>Drift rate</dt>
              {RATE ? (
                <KvFigures
                  figures={[
                    { value: RATE[2], caption: `without ${RATE[4]}` },
                    { value: RATE[5], caption: `with ${RATE[4]}` },
                  ]}
                  note={RATE[3]}
                  source={RATE[1]}
                />
              ) : (
                <KvValue text={c.source_authority.drift_rate} />
              )}
            </dl>
            <dl className="kv-cell is-foot">
              <dt>Primary source</dt>
              <dd>{c.source_authority.primary}</dd>
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The four drift modes</h2>
          <div className="row-stack" role="list">
            {c.conformance.four_drift_modes.map((mode, i) => {
              const side = MODE_SIDE[mode.mode] ?? {};
              return (
                <div key={mode.mode} className="row" role="listitem">
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                  <span className="row-body">
                    <span className="row-title">{mode.mode.replace(/_/g, ' ')}</span>{' '}
                    <span className="row-meta">{mode.description}</span>
                  </span>{' '}
                  <span className="row-side">
                    {side.checks ? (
                      <span className="row-side-line">{side.checks}</span>
                    ) : (
                      <span className="row-side-line">
                        <span className="row-side-chip" data-state="hold">No check</span>
                      </span>
                    )}
                    {side.gap ? <>{' '}<span className="row-side-line">{side.gap}</span></> : null}
                  </span>
                </div>
              );
            })}
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
          AI-generated UI drift deterministically: 12 checks against compiled
          CSS. <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}
