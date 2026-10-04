import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { guardrailsContract } from '../../lib/guardrails-contract';
import { registry } from '../../lib/engine/registry';
import { pageMeta } from '../../lib/site-meta';
import { CountUp } from '../../lib/count-up';
import { AgentActions } from '../../lib/agent-actions';
import { CheckSide, KvFigures, KvValue } from '../contract-parts';
import '../contracts.css';

export const metadata: Metadata = pageMeta({
  title: 'Guardrails contract',
  description:
    'Designesy Guardrails Contract v0.1.0 ingests a design system and emits a frozen build contract for AI coding agents: DTCG tokens, Stylelint config, AGENTS.md rules, component contract, anti-patterns, and DESIGN.md (Google open spec). The product layer.',
  path: '/contracts/guardrails',
  ogTitle: 'Guardrails contract · Designesy',
  ogDescription:
    'Emit a frozen build contract for AI coding agents: tokens, lint config, agent rules, DESIGN.md.',
  twitterDescription: 'Designesy guardrails · designesy.org/contracts/guardrails',
});

const c = guardrailsContract;

// The adoption statistic, read out of the contract's own sentence so the
// figure cannot drift from its source (the sentence prints if it stops
// matching).
//   "zeroheight Design Systems Report 2025: token adoption 84% (up from 56% in
//    2024), but 40% still sync tokens by hand"
const ADOPTION = /^(.+?):\s*(.+?)\s+(\d+%)\s+\((.+?)\),\s*but\s+(\d+%)\s+(.+)$/.exec(c.source_authority.adoption_signal);

// Each bundle key is emitted by one check, and that check names the file
// (lib/engine/registry.ts, the /guardrails instrument's own list). The format
// is the file's, as the contract describes it.
const EMITTED_BY: Record<string, string> = {
  tokens: 'g01',
  lintConfig: 'g02',
  agentRules: 'g03',
  componentContract: 'g04',
  antiPatterns: 'g05',
  designMd: 'g06',
};
const FORMAT: Record<string, string> = {
  tokens: 'DTCG JSON',
  lintConfig: 'Stylelint',
  agentRules: 'Markdown',
  componentContract: 'JSON',
  antiPatterns: 'JSON',
  designMd: 'Markdown',
};
const FILE = new Map(registry('guardrails').checks.map((k) => [k.id, k.file]));

export default function GuardrailsContractPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Sibling contract</p>
          <h1 className="surface-title" data-scramble>Guardrails</h1>
          <p className="surface-lede">{c.purpose}</p>
          <p className="surface-note">
            Version {c.version} · {c.status} · <Link href={c.machine_url.replace('https://www.designesy.org', '')}>machine export</Link>
          </p>
          <AgentActions mdPath="/contracts/guardrails.md" label="the guardrails contract" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Source authority</h2>
          <div className="kv-grid">
            <dl className="kv-cell">
              <dt>Contract shift</dt>
              <KvValue text={c.source_authority.contract_shift} />
            </dl>
            <dl className="kv-cell">
              <dt>Tokens as types</dt>
              <KvValue text={c.source_authority.types_not_suggestions} />
            </dl>
            <dl className="kv-cell">
              <dt>Adoption data</dt>
              {ADOPTION ? (
                <KvFigures
                  figures={[
                    { value: ADOPTION[3], caption: `${ADOPTION[2]}, ${ADOPTION[4]}` },
                    { value: ADOPTION[5], caption: ADOPTION[6] },
                  ]}
                  source={ADOPTION[1]}
                />
              ) : (
                <KvValue text={c.source_authority.adoption_signal} />
              )}
            </dl>
            <dl className="kv-cell is-foot">
              <dt>Primary source</dt>
              <dd>{c.source_authority.primary}</dd>
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Output bundle</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            {c.conformance.emission_method}
          </p>
          <div className="row-stack" role="list">
            {c.conformance.output_bundle.map((item, i) => {
              const file = FILE.get(EMITTED_BY[item.component] ?? '');
              return (
                <div key={item.component} className="row" role="listitem">
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>{' '}
                  <span className="row-body">
                    <span className="row-title contract-ident">{item.component}</span>{' '}
                    <span className="row-meta">{item.description}</span>
                  </span>{' '}
                  <span className="row-side">
                    <span className="row-side-line">
                      <span className="contract-format">{FORMAT[item.component] ?? 'File'}</span>
                      {file ? <>{' '}{file}</> : null}
                    </span>
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
            Generate a guardrail bundle for any URL:
          </p>
          <div className="hero-actions">
            <Link href="/guardrails" className="button primary" data-cuelume-hover="tick" data-cuelume-press="tick">
              Generate guardrails →
            </Link>
            <Link href="/api/guardrails" className="button ghost" data-cuelume-hover="tick" data-cuelume-press="tick">
              API endpoint
            </Link>
          </div>
        </section>

        <div className="status-note">
          The guardrails emitter is the product layer: it turns a design
          system into the file AI agents read and the lint that enforces it.{' '}
          <Link href={c.machine_url}>Machine export</Link>.
        </div>
      </main>

      <Footer />
    </>
  );
}
