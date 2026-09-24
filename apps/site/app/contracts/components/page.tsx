import type { Metadata } from 'next';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';
import { AgentActions } from '../../lib/agent-actions';
import { designSystemContract, CONTRACT_VERSION } from '../../lib/design-system-contract';
import { componentsContract } from '../../lib/components-contract';

export const metadata: Metadata = pageMeta({
  title: 'Components contract',
  description:
    'Machine-readable component contract for the Designesy design system — every component with its allowed states, the tokens each state binds, and the accessibility obligations it carries. Derived from the design system contract, so the two cannot disagree.',
  path: '/contracts/components',

  machineSibling: '/contracts/components.json',
  ogTitle: 'Components contract · Designesy',
  ogDescription:
    'Machine-readable component contract — allowed states, token bindings, and accessibility obligations per component.',
  twitterDescription: 'Designesy components contract — machine-readable states and token bindings.',
});

export default function ComponentsContractPage() {
  const { components } = componentsContract;

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Contract</p>
          <h1 className="surface-title" data-scramble>
            Components
          </h1>
          <p className="surface-lede">
            Every component the design system defines, with the states it may
            enter and the token each state binds. Machine-readable, so an agent
            can check a component against the contract instead of guessing at
            it.
          </p>
          <p className="surface-note">
            Version {componentsContract.version} · derived from the design
            system contract v{CONTRACT_VERSION}
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <div className="definition">
            <p className="definition-label">Why this file exists</p>
            <p>
              A token file tells an agent which values are legal. It does not
              tell it which <em>combinations</em> are legal — that a card
              presses at 0.985 while a button presses at 0.96, or that a sound
              toggle carries an <code>aria-pressed</code> obligation a nav link
              does not. Those rules lived in prose on the human contract page,
              where a machine could not use them. This export is the same rules
              in a shape a checker can read.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Components</h2>
          <div className="token-table" role="table" aria-label="Component contract">
            <div role="rowgroup">
              <div role="row" className="token-row token-row-head">
                <span role="columnheader">Component</span>
                <span role="columnheader">States</span>
              </div>
            </div>
            <div role="rowgroup">
              {components.map((c) => (
                <div role="row" className="token-row" key={c.name}>
                  <span role="cell">
                    <strong>{c.name}</strong>
                  </span>
                  <span role="cell">{c.states}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <div className="text-cell">
            <AgentActions
              mdPath="/contracts/components.md"
              label="the components contract"
            />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
