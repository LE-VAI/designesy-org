import type { Metadata } from 'next';
import Link from 'next/link';
import './graph.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { graph } from '../lib/graph';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { AgentActions } from '../lib/agent-actions';

export const metadata: Metadata = pageMeta({
  title: 'Graph: provenance chain',
  description:
    'The living knowledge tree: how sources become shipped work through the Designesy pipeline. Source to Observation to Claim to Tension to Principle to Pattern to Contract Rule to Token to Verification to Shipped Work.',
  path: '/graph',
  ogTitle: 'Graph · Designesy',
  ogDescription:
    'Provenance chain from source to shipped work. No competitor exposes this chain publicly.',
  twitterDescription: 'Provenance graph · designesy.org/graph',
});

type Stage = (typeof graph.chain)[number]['stage'];

// Where each stage's public examples can be read on this site: the side pane's
// data. Each route renders the examples it is listed for (the DTCG research,
// Cuelume and the DTCG gap on /acoustic-tokens; better-typography on
// /labs/cadence; press scale 0.97 and "louder than the action" on /labs/poise;
// the motion purpose line on /contracts/motion; the three open tensions on
// /contracts/design-system and dual-source drift on /review/takt; the
// principles on /docs; labs, field checks and case studies on /labs, /review
// and /work; press settle, concentric radii and the rem scale on
// /contracts/design-system; --ease-out and the radius on /contracts and
// --cue:action on /acoustic-tokens; the field checks on /review and the
// keyboard path on /review/keyboard; the shipped work on /work). Keyed by the
// stage's own name, so a renamed or added stage fails the type check rather
// than rendering an empty pane. The pane used to hold a pip count of the
// bullets beside it, which told the reader nothing the face did not.
const STAGE_ROUTES: Record<Stage, readonly string[]> = {
  Source: ['/acoustic-tokens', '/labs/cadence'],
  Observation: ['/acoustic-tokens', '/labs/poise'],
  Claim: ['/contracts/motion', '/labs/poise'],
  Tension: ['/contracts/design-system', '/review/takt'],
  Principle: ['/docs'],
  Pattern: ['/labs', '/review', '/work'],
  'Contract Rule': ['/contracts/design-system'],
  'Token / Component / Behavior': ['/contracts', '/acoustic-tokens'],
  'Verification Artifact': ['/review', '/review/keyboard'],
  'Shipped Work': ['/work', '/work/designesy-org'],
};

export default function GraphPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Graph</p>
          <h1 className="surface-title" data-scramble>Provenance chain</h1>
          <p className="surface-lede" data-scramble>
            How sources become shipped work.
          </p>
          <p className="surface-note">
            {graph.description} The Graph prevents design knowledge from
            becoming anonymous taste: every shipped artifact should trace
            backwards through this chain to a source.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="lab-meta-item">Version · {graph.version}</span>
            <span className="lab-meta-item">Machine export · /graph.json</span>
          </div>
          <AgentActions mdPath="/graph.md" label="the graph page" />
        </section>

        <section className="doctrine-section fade-up" id="chain">
          <h2 className="doctrine-heading" data-scramble>The chain</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Ten stages from source to shipped work. Each stage has public
            examples drawn from real evidence.
          </p>
          {/* Each stage is a reading card split on the page's 7-line: the
              stage and its examples in the face; in the side pane behind a
              hairline, the routes where those examples can be read and the
              stage it hands on to (graph.css). */}
          <div className="chain-rail" data-reveal-group>
            {graph.chain.map((stage, i) => {
              const num = String(i + 1).padStart(2, '0');
              const isLast = i === graph.chain.length - 1;
              const next = graph.chain[i + 1];

              return (
                <div className="chain-cell" key={stage.stage} data-reveal data-terminal={isLast || undefined}>
                  <span className="chain-rail-node" aria-hidden="true" />
                  <div className="chain-cell-main">
                    <div className="chain-cell-face">
                      <div className="chain-cell-header">
                        <span className="chain-cell-num">{num}</span>
                        <h3 className="chain-cell-title" data-scramble>{stage.stage}</h3>
                      </div>
                      <p className="chain-cell-definition">{stage.description}</p>
                      <ul className="chain-cell-examples">
                        {stage.public_examples.map((ex, j) => (
                          <li key={j}>{ex}</li>
                        ))}
                      </ul>
                    </div>
                    <dl className="chain-cell-side">
                      <div className="chain-cell-fact">
                        <dt>On the site</dt>
                        {/* Links straight in the <dd>, not a <ul>: the markdown
                            twin keeps every <ul>, and a second bullet list
                            right after the examples would merge into them
                            and read as two more examples. */}
                        <dd className="chain-cell-routes">
                          {STAGE_ROUTES[stage.stage].map((route) => (
                            <Link key={route} href={route} className="chain-cell-route">
                              <span className="chain-cell-route-path">{route}</span>
                              <span className="chain-cell-route-arrow" aria-hidden="true" />
                            </Link>
                          ))}
                        </dd>
                      </div>
                      {next ? (
                        <div className="chain-cell-fact chain-cell-fact--feeds">
                          <dt>Feeds</dt>
                          <dd className="chain-cell-next">
                            <span className="chain-cell-next-num">
                              {String(i + 2).padStart(2, '0')}
                            </span>{' '}
                            {next.stage}
                          </dd>
                        </div>
                      ) : (
                        <div className="chain-cell-fact">
                          <dt>Status</dt>
                          <dd>
                            <span className="row-side-chip chain-cell-live" data-state="pass">
                              Live
                            </span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="what-this-is">
          <h2 className="doctrine-heading" data-scramble>What this is</h2>
          <div className="definition">
            <p className="definition-label">Public read-only surface</p>
            <p>
              The Graph is the internal knowledge tree of Designesy. This
              public surface shows the chain with real examples, leaving out
              internal paths, control-plane naming,
              and private doctrine. It is the provenance layer: a visitor can trace how
              a source became a principle, a principle became a contract,
              a contract became a token, a token became a verification, and
              a verification became shipped work.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="boundaries">
          <h2 className="doctrine-heading" data-scramble>Boundaries</h2>
          <ul className="checkmark-list">
            <li>A knowledge graph of design concepts: curated, versioned, and read-only.</li>
            <li>Examples are hand-selected rather than live-streamed from production.</li>
            <li>Companion to the contract and review surfaces.</li>
            <li>Internal paths and control-plane naming stay private.</li>
          </ul>
        </section>

        <section className="doctrine-section fade-up" id="sources">
          <h2 className="doctrine-heading" data-scramble>Related</h2>
          <div className="row-stack" role="list">
            <div role="listitem">
              <Link
                href="/contracts/design-system"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">01</span>
                <span className="row-body">
                  <span className="row-title">Design system contract {CONTRACT_VERSION}</span>
                  <span className="row-meta">Contract rules and tokens</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/contracts/design-system</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
            <div role="listitem">
              <Link
                href="/review"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">02</span>
                <span className="row-body">
                  <span className="row-title">Review surface</span>
                  <span className="row-meta">Verification artifacts</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/review</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
            <div role="listitem">
              <Link
                href="/work"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">03</span>
                <span className="row-body">
                  <span className="row-title">Work · case studies</span>
                  <span className="row-meta">Shipped work</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/work</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
            <div role="listitem">
              <Link
                href="/graph.json"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">04</span>
                <span className="row-body">
                  <span className="row-title">Machine export</span>
                  <span className="row-meta">graph.json</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/graph.json</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
            <div role="listitem">
              <Link
                href="/docs"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">05</span>
                <span className="row-body">
                  <span className="row-title">Docs</span>
                  <span className="row-meta">Architecture and eight layers</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/docs</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
        </section>

        <div className="status-note">
          Provenance chain v{graph.version}. The Graph prevents design
          knowledge from becoming anonymous taste. Machine export at
          /graph.json.
        </div>
      </main>

      <Footer />
    </>
  );
}