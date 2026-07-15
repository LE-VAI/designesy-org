import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { graph } from '../lib/graph';

export const metadata: Metadata = pageMeta({
  title: 'Graph — provenance chain',
  description:
    'The living knowledge tree: how sources become shipped work through the Designesy pipeline. Source to Observation to Claim to Tension to Principle to Pattern to Contract Rule to Token to Verification to Shipped Work.',
  path: '/graph',
  ogTitle: 'Graph · Designesy',
  ogDescription:
    'Provenance chain from source to shipped work. No competitor exposes this chain publicly.',
  twitterDescription: 'Provenance graph — designesy.org/graph',
});

export default function GraphPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Graph</p>
          <h1 className="surface-title">Provenance chain</h1>
          <p className="surface-lede">
            How sources become shipped work.
          </p>
          <p className="surface-note">
            {graph.description} The Graph prevents design knowledge from
            becoming anonymous taste — every shipped artifact should trace
            backwards through this chain to a source.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="lab-meta-item">Version · {graph.version}</span>
            <span className="lab-meta-item">Machine export · /graph.json</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="chain">
          <h2 className="doctrine-heading">The chain</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Ten stages from source to shipped work. Each stage has public
            examples — real evidence, not abstract theory.
          </p>
          <div className="chain-rail">
            {graph.chain.map((stage, i) => {
              const count = stage.public_examples.length;
              const maxCount = 4;
              const fillPct = Math.round((count / maxCount) * 100);
              const num = String(i + 1).padStart(2, '0');
              const isLast = i === graph.chain.length - 1;

              return (
                <div className="chain-cell" key={stage.stage}>
                  <span className="chain-rail-node" aria-hidden="true" />
                  <div className="chain-cell-main">
                    <div className="chain-cell-header">
                      <span className="chain-cell-num">{num}</span>
                      <h3 className="chain-cell-title">{stage.stage}</h3>
                      <div className="chain-cell-meter" aria-label={`${count} examples`}>
                        <div className="chain-cell-meter-bar">
                          <span
                            className="chain-cell-meter-fill"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <span className="chain-cell-meter-label">{count}</span>
                      </div>
                    </div>
                    <p className="chain-cell-definition">{stage.description}</p>
                    <ul className="chain-cell-examples">
                      {stage.public_examples.map((ex, j) => (
                        <li key={j}>{ex}</li>
                      ))}
                    </ul>
                    {isLast && <span className="chain-cell-badge">LIVE</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="what-this-is">
          <h2 className="doctrine-heading">What this is</h2>
          <div className="definition">
            <p className="definition-label">Public read-only surface</p>
            <p>
              The Graph is the internal knowledge tree of Designesy. This
              public surface shows the chain with real examples — but
              without internal paths, control-plane naming, or private
              doctrine. It is the provenance layer: a visitor can trace how
              a source became a principle, a principle became a contract,
              a contract became a token, a token became a verification, and
              a verification became shipped work.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="what-this-is-not">
          <h2 className="doctrine-heading">What this is not</h2>
          <ul className="checkmark-list">
            <li>Not a dependency graph or build-system diagram.</li>
            <li>Not a live data feed — examples are curated and versioned.</li>
            <li>Not a replacement for the contract or review surfaces.</li>
            <li>Not internal doctrine — no source paths or control-plane naming.</li>
          </ul>
        </section>

        <section className="doctrine-section fade-up" id="sources">
          <h2 className="doctrine-heading">Related</h2>
          <div className="row-stack" role="list">
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Design system contract v0.1.4</span>
                <span className="row-meta">Contract rules and tokens</span>
              </span>
            </Link>
            <Link
              href="/review"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Review surface</span>
                <span className="row-meta">Verification artifacts</span>
              </span>
            </Link>
            <Link
              href="/work"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Work — case studies</span>
                <span className="row-meta">Shipped work</span>
              </span>
            </Link>
            <Link
              href="/graph.json"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Machine export</span>
                <span className="row-meta">graph.json</span>
              </span>
            </Link>
            <Link
              href="/docs"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">Docs</span>
                <span className="row-meta">Architecture and seven layers</span>
              </span>
            </Link>
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