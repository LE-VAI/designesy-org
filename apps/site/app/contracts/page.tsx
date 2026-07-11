import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';

const CONTRACT_CONTENTS = [
  'Source and provenance',
  'Primitive tokens',
  'Semantic tokens',
  'Typography rules',
  'Spacing and layout rules',
  'Shape and surface rules',
  'Component behavior and states',
  'Accessibility requirements',
  'Motion and reduced-motion guidance',
  'Anti-patterns',
  'Implementation notes',
  'Verification criteria',
  'Open tensions',
];

const CONTRACT_ANTI = [
  'Prose-only style guides with no exact values',
  'Token dumps with no rationale',
  'Component values that duplicate raw colors instead of referencing roles',
  'Rules that do not change implementation behavior',
  'Public copy pretending the contract is more mature than it is',
  'Treating screenshots as final proof without visual and accessibility checks',
];

export default function ContractsPage() {
  return (
    <>
      <Topbar scrolled />

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Operating rules</p>
          <h1 className="surface-title">Contracts</h1>
          <p className="surface-lede">
            Design contracts turn principles into reusable operating rules for
            artifacts, interfaces, and review.
          </p>
          <p className="surface-note">
            Designesy Contracts are portable design agreements that let people
            and agents carry design judgment across tools, sessions, codebases,
            and artifacts. They make design judgment inspectable — not reliant
            on slogans or vibes.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why contracts matter</h2>
          <div className="definition">
            <p className="definition-label">The question a contract answers</p>
            <p>
              What exact value should I use? Why does this value exist? Where may
              this value be applied? What behavior does this component need?
              What should I avoid? How do I know if I broke the system?
            </p>
          </div>
          <p className="surface-note">
            A useful contract helps a future agent or team member answer all of
            these without relearning the design system from scratch. Contracts
            are the operational bridge between philosophy and execution.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract contents</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A Designesy Contract should include all of the following —
            structured values for machines, rationale for humans, and
            verification criteria for both.
          </p>
          <ul className="checkmark-list">
            {CONTRACT_CONTENTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract discipline</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Keep upstream-compatible schema names visible when compatibility
            matters: <code style={{ color: 'var(--ink)' }}>colors</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>typography</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>rounded</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>spacing</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>components</code>. Use local
            extensions for doctrine, review, provenance, agent instructions, and
            verification — but do not hide the standard contract from tools.
          </p>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
            Anti-patterns
          </h3>
          <ul className="avoid-list">
            {CONTRACT_ANTI.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <div className="status-note">
          These are design contracts — public artifact discipline, not legal
          advice or client service agreements. The first published contract will
          be the Designesy design system contract itself, derived from the live
          tokens already in use on this site.
        </div>
      </main>

      <Footer />
    </>
  );
}