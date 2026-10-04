import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { openIndex } from '../lib/open-index';
import { ENGINE_CHECK_COUNT } from '../hero-stats';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { ToggleRow } from '../lib/toggle-row';
import { pageMeta } from '../lib/site-meta';
import { ListenButton } from '../lib/listen-button';
import { OPEN_AUDIO } from '../lib/open-audio';
import { AgentActions } from '../lib/agent-actions';
import {
  JsonLd,
  creativeWorkJsonLd,
  datasetJsonLd,
} from '../lib/json-ld';
import { CONTRACT_VERSION } from '../lib/design-system-contract';

/**
 * A path as one unbreakable span per "/"-segment. On a phone the path column
 * is ~280px, and "/contracts/design-system.json" was split mid-word
 * ("…system.js" / "on") by break-all. Each nowrap segment moves to the next
 * line whole. The text content, and so the link name and copy, is unchanged.
 */
function breakablePath(path: string) {
  return path.split(/(?=\/)/).map((part, i) => (
    <span key={i} className="open-path-seg">
      {part}
    </span>
  ));
}

// Where each kind of reader starts (the line beside it says what they do).
const START_AT: Record<string, string> = {
  People: '/open',
  Agents: '/open.json',
  Builders: '/contracts/design-system',
};

// The side pane of "Related": what each surface is.
const RELATED = [
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: `${CONTRACT_VERSION} · tokens, motion, components, adopted lab rules`,
    side: 'Contract · human + machine',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Portable agent prompt',
    side: 'Kit · human + machine',
  },
  {
    href: '/open/handoff',
    title: 'Open handoff pack',
    meta: 'Share copy, agent prompt, verification paths',
    side: 'Share pack',
  },
  {
    href: '/review/keyboard',
    title: 'Keyboard path · site-wide',
    meta: 'Skip link, main landmark, shared chrome',
    side: 'Verification',
  },
  {
    href: '/docs',
    title: 'Docs',
    meta: 'Mission, principles, architecture',
    side: 'Doctrine',
  },
];

// "External references": each standard or library and who publishes it.
const EXTERNAL = [
  {
    href: 'https://www.designtokens.org/',
    title: 'W3C Design Tokens Format Module 2025.10',
    meta: 'Canonical token standard: color, dimension, motion (duration, cubicBezier, transition)',
    side: 'W3C Community Group',
  },
  {
    href: 'https://llmstxt.org',
    title: 'llms.txt',
    meta: 'Agent-facing website context standard',
    side: 'Jeremy Howard · 2024',
  },
  {
    href: 'https://agents.md',
    title: 'AGENTS.md',
    meta: 'Repo-level agent guidance format, used by 60k+ projects',
    side: 'Linux Foundation',
  },
  {
    href: 'https://github.com/Danilaa1/cuelume',
    title: 'Cuelume v0.2.2',
    meta: 'Interaction sound engine: powers acoustic tokens',
    side: 'MIT · Daniel Belyi',
  },
  {
    href: 'https://transitions.dev',
    title: 'transitions.dev',
    meta: 'Transition gallery: duration scale cross-referenced in contract',
    side: 'Matthew Antalik',
  },
  {
    href: 'https://github.com/google-labs-code/design.md',
    title: 'design.md',
    meta: `Input format for AI coding agents: YAML tokens + markdown prose. The brief layer this contract extends with ${ENGINE_CHECK_COUNT} verification checks.`,
    side: 'Google Labs',
  },
];

export const metadata: Metadata = pageMeta({
  title: 'Open design intelligence',
  description:
    'Canonical public source for Designesy open design intelligence: portable design judgment as contracts, kits, labs, and field checks for people and agents. Prefer open.json for machine ingest.',
  path: '/open',
  ogDescription:
    'Fetchable design rules, review kits, labs, and field checks. Human index and machine feed: the primary Designesy reference.',
  twitterDescription:
    'Portable design judgment · machine catalog open.json · designesy.org/open',
});

const KIND_LABEL: Record<string, string> = {
  contract: 'Contract',
  kit: 'Kit',
  lab: 'Lab',
  review: 'Review',
  tool: 'Tool',
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

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Open · v{o.version}</p>
          <h1 className="surface-title" data-scramble>{o.name}</h1>
          <p className="surface-lede">{o.lede}</p>
          <p className="surface-note">
            Portable design rules, prompts, and verification people and agents
            can fetch, run, and remix. This is the canonical Designesy
            reference: human index and machine feed stay synchronized.
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
              Stack · contracts · kits · labs · reviews · tools
            </span>
          </div>
          <AgentActions mdPath="/open.md" label="the open index" />
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
                {START_AT[item.title] ? (
                  <span className="row-side">
                    <span className="row-side-line">{START_AT[item.title]}</span>
                  </span>
                ) : null}
              </ToggleRow>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Packages</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Live portable cargo. Machine URLs are CORS-open JSON for agents and
            tools. Each package carries a spoken abstract: automated voice,
            synthesized at build time, served as static audio.
          </p>
          <div className="row-stack" role="list">
            {o.packages.map((pkg, i) => (
              <div
                className={`row row--listen${OPEN_AUDIO[pkg.id] ? ' has-listen' : ''}`}
                role="listitem"
                key={pkg.id}
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">
                    {pkg.number
                      ? `${KIND_LABEL[pkg.kind]} ${pkg.number} · `
                      : `${KIND_LABEL[pkg.kind]} · `}
                    {pkg.title}
                  </span>
                  <span className="row-meta">{pkg.lede}</span>
                  {/* The paths: human, then machine. A separator leads the
                      second and is clipped when the pair wraps, so no line
                      starts or ends on one. */}
                  <span className="row-meta open-package-paths">
                    <span className="open-paths">
                      <span className="open-path">
                        <Link href={pkg.path} data-cuelume-hover="tick">
                          {breakablePath(pkg.path)}
                        </Link>
                      </span>
                      {pkg.machine_path ? (
                        <span className="open-path">
                          <span className="open-path-sep" aria-hidden="true">
                            ·
                          </span>
                          <Link href={pkg.machine_path} data-cuelume-hover="chime">
                            {breakablePath(pkg.machine_path)}
                          </Link>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </span>
                <ListenButton pkgId={pkg.id} title={pkg.title} />
                <span className="row-side">
                  <span className="row-side-line">
                    v{pkg.version} ·{' '}
                    {pkg.machine_path ? 'JSON, CORS-open' : 'human surface'}
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
              <div role="listitem" key={item.path}>
                <Link
                  className="row"
                  href={item.path}
                  data-cuelume-hover="bloom"
                  data-cuelume-press
                >
                  <span className="row-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="row-body">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">{item.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{item.path}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
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
            {RELATED.map((item, i) => (
              <div role="listitem" key={item.href}>
                <Link
                  className="row"
                  href={item.href}
                  data-cuelume-hover="bloom"
                  data-cuelume-press
                >
                  <span className="row-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="row-body">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">{item.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{item.side}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">External references</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Designesy builds on open standards, community proposals, and open-source
            libraries. These are the external surfaces cited in the contract and labs.
          </p>
          <div className="row-stack" role="list">
            {EXTERNAL.map((item, i) => (
              <div role="listitem" key={item.href}>
                <a
                  href={item.href}
                  className="row"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cuelume-hover="chime"
                  data-cuelume-press
                >
                  <span className="row-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="row-body">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">{item.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{item.side}</span>
                    {/* Leaves the site: the arrow points out. */}
                    <span className="row-side-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </span>
                </a>
              </div>
            ))}
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
