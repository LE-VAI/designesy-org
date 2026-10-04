import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { compareContract } from '../../lib/compare-contract';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { AgentActions } from '../../lib/agent-actions';
import { CheckSide, KvValue } from '../contract-parts';
import '../contracts.css';

export const metadata: Metadata = pageMeta({
  title: 'Compare contract',
  description:
    'Designesy Compare Contract v0.1.0: cross-site design-token diff engine. Fetches two URLs, extracts their :root token systems, and produces a structured diff: tokens added, removed, renamed, value-changed, scale-stop-changed, contrast drift, structure delta, and score delta. 8 verification checks.',
  path: '/contracts/compare',
  ogTitle: 'Compare contract · Designesy',
  ogDescription:
    'Diff two design systems from live URLs: tokens added, removed, renamed, value-changed, scale drift, contrast drift.',
  twitterDescription: 'Designesy compare · designesy.org/contracts/compare',
});

const c = compareContract;

// Where each diff dimension lands in the /api/compare response (CompareResponse
// in app/api/compare/route.ts): the key a client reads it from.
const RESPONSE_KEY: Record<string, string> = {
  'token-added': 'added[]',
  'token-removed': 'removed[]',
  'token-renamed': 'renamed[]',
  'token-value-changed': 'valueChanged[]',
  'scale-stop-changed': 'scaleDiff',
  'contrast-drift-per-pair': 'contrastDrift[]',
  'structure-delta': 'structureDelta',
  'score-delta': 'scoreDelta',
};

export default function CompareContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Compare</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url.replace('https://www.designesy.org', '')}>machine export</Link>
          </p>
          <AgentActions mdPath="/contracts/compare.md" label="the compare contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>File-level diff</dt>
              <KvValue text={c.source_authority.file_level} />
            </dl>
            <dl className="kv-cell">
              <dt>Hosted diff</dt>
              <KvValue text={c.source_authority.hosted} />
            </dl>
            <dl className="kv-cell">
              <dt>Slug-level diff</dt>
              <KvValue text={c.source_authority.slug_level} />
            </dl>
            <dl className="kv-cell is-wide">
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
          <h2 className="doctrine-heading">Diff method</h2>
          <div className="definition">
            <p className="definition-label">How it works</p>
            <p>{c.conformance.diff_method}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Diff dimensions</h2>
          <div className="row-stack" role="list">
            {c.conformance.diff_dimensions.map((dim, i) => (
              <div key={dim.dimension} className="row" role="listitem">
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                <span className="row-body">
                  <span className="row-title">{dim.dimension.replace(/-/g, ' ')}</span>{' '}
                  <span className="row-meta">{dim.description}</span>
                </span>{' '}
                <span className="row-side">
                  <span className="row-side-line">{RESPONSE_KEY[dim.dimension] ?? dim.dimension}</span>
                </span>
              </div>
            ))}
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
            Compare two URLs to see how their design systems differ:
          </p>
          <div className="hero-actions">
            <Link href="/compare" className="button primary" data-cuelume-hover="tick" data-cuelume-press="tick">
              Compare two URLs →
            </Link>
            <Link href="/api/compare" className="button ghost" data-cuelume-hover="tick" data-cuelume-press="tick">
              API endpoint
            </Link>
          </div>
        </section>

        <div className="status-note">
          The compare contract is the diff engine: it answers &ldquo;what
          actually changed between two design systems&rdquo; deterministically from
          live production URLs. <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}
