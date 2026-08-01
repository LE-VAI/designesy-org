import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { openIndex } from '../lib/open-index';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { ToggleRow } from '../lib/toggle-row';
import { pageMeta } from '../lib/site-meta';
import {
  JsonLd,
  creativeWorkJsonLd,
  datasetJsonLd,
} from '../lib/json-ld';

export const metadata: Metadata = pageMeta({
  title: 'Open design intelligence',
  description:
    'Canonical public source for Designesy open design intelligence — portable design judgment as contracts, kits, labs, and field checks for people and agents. Prefer open.json for machine ingest.',
  path: '/open',
  ogDescription:
    'Fetchable design rules, review kits, labs, and field checks. Human index and machine feed — the primary Designesy reference.',
  twitterDescription:
    'Portable design judgment · machine catalog open.json — designesy.org/open',
});

const KIND_LABEL: Record<string, string> = {
  contract: 'Contract',
  kit: 'Kit',
  lab: 'Lab',
  review: 'Review',
};

export default function OpenPage() {
  const o = openIndex;

  return (
    <>
      <JsonLd
        data={[
          creativeWorkJsonLd({
            name: o.name,
            description: o.lede,
            url: o.public_url,
            version: o.version,
            related: [o.machine_url, o.discovery.llms_txt, o.discovery.agent_json],
          }),
          datasetJsonLd({
            name: o.name,
            description: o.identity,
            url: o.public_url,
            machineUrl: o.machine_url,
            version: o.version,
            keywords: [...o.topics],
            dateModified: o.updated,
          }),
        ]}
      />
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Open · v{o.version}</p>
          <h1 className="surface-title" data-scramble>{o.name}</h1>
          <p className="surface-lede">{o.lede}</p>
          <p className="surface-note">
            Portable design rules, prompts, and verification people and agents
            can fetch, run, and remix. This is the canonical Designesy
            reference — human index and machine feed stay synchronized.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Public</span>
            <span className="lab-meta-item">
              Machine ·{' '}
              <Link href="/open.json" data-cuelume-hover="chime">
                /open.json
              </Link>
            </span>
            <span className="lab-meta-item">
              Agents ·{' '}
              <Link href="/llms.txt" data-cuelume-hover="chime">
                /llms.txt
              </Link>
            </span>
            <span className="lab-meta-item">
              Stack · contracts · kits · labs · reviews
            </span>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Thesis</h2>
          <div className="definition">
            <p className="definition-label">What open means here</p>
            <p>{o.thesis}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">How to use</h2>
          <div className="row-stack" role="list">
            {o.how_to_use.map((item, i) => (
              <ToggleRow key={item.title} index={String(i + 1).padStart(2, '0')}>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </ToggleRow>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Packages</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Live portable cargo. Machine URLs are CORS-open JSON for agents and
            tools.
          </p>
          <div className="row-stack" role="list">
            {o.packages.map((pkg, i) => (
              <div className="row" role="listitem" key={pkg.id}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">
                    {pkg.number
                      ? `${KIND_LABEL[pkg.kind]} ${pkg.number} · `
                      : `${KIND_LABEL[pkg.kind]} · `}
                    {pkg.title}
                    {pkg.version ? ` · v${pkg.version}` : ''}
                  </span>
                  <span className="row-meta">{pkg.lede}</span>
                  <span className="row-meta open-package-paths">
                    <Link href={pkg.path} data-cuelume-hover="tick">
                      {pkg.path}
                    </Link>
                    {pkg.machine_path ? (
                      <>
                        <span className="open-path-sep" aria-hidden="true">
                          ·
                        </span>
                        <Link href={pkg.machine_path} data-cuelume-hover="chime">
                          {pkg.machine_path}
                        </Link>
                      </>
                    ) : (
                      <span className="open-path-note"> · human surface</span>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Machine exports</h2>
          <div className="row-stack" role="list">
            {o.machine_exports.map((item, i) => (
              <Link
                className="row"
                role="listitem"
                href={item.path}
                key={item.path}
                data-cuelume-hover="whisper"
                data-cuelume-press
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">
                    {item.path} · {item.meta}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Standing rules</h2>
          <CheckGrid items={checkItemsFromStrings(o.standing_rules)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Anti-patterns</h2>
          <CheckGrid
            items={checkItemsFromStrings(o.anti_patterns, { avoid: true })}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related</h2>
          <div className="row-stack" role="list">
            <Link
              className="row"
              role="listitem"
              href="/contracts/design-system"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">v0.4.0 · human + machine</span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/kits/design-review"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">
                  Portable agent prompt · human + machine
                </span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/open/handoff"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Open handoff pack</span>
                <span className="row-meta">
                  Share copy, agent prompt, verification paths
                </span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/review/keyboard"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Keyboard path · site-wide</span>
                <span className="row-meta">
                  Skip link, main landmark, shared chrome
                </span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/docs"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">Docs</span>
                <span className="row-meta">
                  Mission, principles, architecture
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">External standards</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Designesy builds on open standards and open-source libraries.
            These are the external surfaces cited in the contract and labs.
          </p>
          <div className="row-stack" role="list">
            <a
              href="https://www.designtokens.org/"
              className="row"
              role="listitem"
              target="_blank"
              rel="noopener noreferrer"
              data-cuelume-hover="chime"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">W3C Design Tokens Format Module 2025.10</span>
                <span className="row-meta">Canonical token standard — color, dimension, motion (duration, cubicBezier, transition)</span>
              </span>
            </a>
            <a
              href="https://llmstxt.org"
              className="row"
              role="listitem"
              target="_blank"
              rel="noopener noreferrer"
              data-cuelume-hover="chime"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">llms.txt</span>
                <span className="row-meta">Agent-facing website context standard (Jeremy Howard, 2024)</span>
              </span>
            </a>
            <a
              href="https://agents.md"
              className="row"
              role="listitem"
              target="_blank"
              rel="noopener noreferrer"
              data-cuelume-hover="chime"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">AGENTS.md</span>
                <span className="row-meta">Repo-level agent guidance format (Linux Foundation, 60k+ projects)</span>
              </span>
            </a>
            <a
              href="https://github.com/Danilaa1/cuelume"
              className="row"
              role="listitem"
              target="_blank"
              rel="noopener noreferrer"
              data-cuelume-hover="chime"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Cuelume v0.1.0</span>
                <span className="row-meta">Interaction sound engine (MIT, Daniel Belyi) — powers acoustic tokens</span>
              </span>
            </a>
            <a
              href="https://transitions.dev"
              className="row"
              role="listitem"
              target="_blank"
              rel="noopener noreferrer"
              data-cuelume-hover="chime"
              data-cuelume-press
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">transitions.dev</span>
                <span className="row-meta">Motion reference — duration scale cross-referenced in contract</span>
              </span>
            </a>
          </div>
        </section>

        <div className="status-note">
          {o.handoff_line} Machine feed is CORS-open JSON. Packages without a
          machine URL are human-first evidence surfaces until a schema is
          published.
        </div>
      </main>

      <Footer />
    </>
  );
}
