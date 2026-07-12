import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { openIndex } from '../../lib/open-index';
import { CheckGrid } from '../../lib/check-grid';

export const metadata: Metadata = {
  title: 'Open handoff',
  description:
    'First public handoff pack for Designesy Open — short share copy, agent prompt, package links, and verification paths pointing at /open.',
  openGraph: {
    title: 'Open handoff · Designesy',
    description:
      'Portable share packet for open design intelligence: human path, machine feed, and first post copy.',
    url: 'https://www.designesy.org/open/handoff',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Open handoff · Designesy',
    description: 'Share open design intelligence — designesy.org/open/handoff',
  },
};

const SHARE_POSTS = [
  {
    role: 'Root',
    text: 'Open design intelligence is live.\n\nContracts, kits, labs, and field checks people and agents can fetch, run, and remix.\n\nStart at designesy.org/open\nMachine feed: designesy.org/open.json',
  },
  {
    role: 'Reply 1',
    text: 'What ships in the first catalog:\n\n• Design system contract v0.1.1\n• Use Kit One · Design Review\n• Lab One · Poise\n• Field checks and keyboard path\n\nHuman page and machine export stay synchronized.',
  },
  {
    role: 'Reply 2',
    text: 'How to use it:\n\nPeople open /open and apply a package.\nAgents fetch open.json, then the package machine URL, then run the kit.\nBuilders cite a contract token or name an open tension before shipping UI.',
  },
  {
    role: 'Reply 3',
    text: 'Open is not a blog index.\n\nIt is portable design judgment with verification paths.\nSilence is not adoption.\n\ndesignesy.org/open',
  },
];

const AGENT_PROMPT = `You are reviewing or applying Designesy open design intelligence.

1. Fetch https://www.designesy.org/open.json
2. Choose the package needed (contract, kit, lab, or review).
3. If machine_url is present, fetch it. Prefer machine exports for structured rules.
4. For Design Review, use the kit prompt and eight dimensions; separate observed behavior from judgment.
5. Cite contract tokens when proposing UI changes. If a rule is missing, name an open tension instead of inventing policy.
6. Do not invent private brand systems, monogram logos, or unversioned rules.
7. Default permission is read/inspect. Do not claim write authority the operator did not grant.

Primary human index: https://www.designesy.org/open
Handoff pack: https://www.designesy.org/open/handoff`;

const VERIFY = [
  {
    title: 'Human index resolves',
    meta: 'GET /open returns the catalog people can read',
  },
  {
    title: 'Machine feed resolves',
    meta: 'GET /open.json returns package list + machine_exports',
  },
  {
    title: 'Kit export resolves',
    meta: 'GET /kits/design-review.json returns prompt cargo',
  },
  {
    title: 'Contract export resolves',
    meta: 'GET /contracts/design-system.json returns v0.1.1 rules',
  },
  {
    title: 'Handoff stays short',
    meta: 'Share copy points at /open — no private control-plane names',
  },
];

export default function OpenHandoffPage() {
  const o = openIndex;

  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/open" className="lab-crumb">
              Open
            </Link>
            <span aria-hidden="true"> · </span>
            Handoff
          </p>
          <h1 className="surface-title">Open handoff</h1>
          <p className="surface-lede">
            First public share pack for open design intelligence.
          </p>
          <p className="surface-note">
            Use this when posting, briefing an agent, or pointing a collaborator
            at portable Designesy cargo. The destination is always{' '}
            <Link href="/open" data-cuelume-hover="tick">
              /open
            </Link>{' '}
            and{' '}
            <Link href="/open.json" data-cuelume-hover="tick">
              /open.json
            </Link>
            — not a private control plane.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Public</span>
            <span className="lab-meta-item">Catalog · v{o.version}</span>
            <span className="lab-meta-item">Updated {o.updated}</span>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">One-line handoff</h2>
          <div className="definition">
            <p className="definition-label">Share this</p>
            <p>{o.handoff_line}</p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Primary paths</h2>
          <div className="row-stack" role="list">
            <Link
              href="/open"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Human index</span>
                <span className="row-meta">designesy.org/open</span>
              </span>
            </Link>
            <Link
              href="/open.json"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Machine feed</span>
                <span className="row-meta">designesy.org/open.json · CORS-open</span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">
                  Human + machine · first agent-ready package
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Design system contract v0.1.1</span>
                <span className="row-meta">Portable judgment · human + machine</span>
              </span>
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Suggested public thread</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Institutional voice for a later @designesy post when cleanup and
            operator timing allow. Copy is public-ready; posting still needs
            explicit execute on the social lane.
          </p>
          <div className="row-stack" role="list">
            {SHARE_POSTS.map((post, i) => (
              <div className="row" role="listitem" key={post.role}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{post.role}</span>
                  <span className="row-meta" style={{ whiteSpace: 'pre-wrap' }}>
                    {post.text}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Agent prompt</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Paste into an agent that can fetch URLs. Read-only by default.
          </p>
          <pre className="kit-prompt">
            <code>{AGENT_PROMPT}</code>
          </pre>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Catalog snapshot</h2>
          <div className="row-stack" role="list">
            {o.packages.map((pkg, i) => (
              <Link
                key={pkg.id}
                href={pkg.path}
                className="row"
                role="listitem"
                data-cuelume-hover="whisper"
                data-cuelume-press
                data-cuelume-release
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">
                    {pkg.title}
                    {pkg.version ? ` · v${pkg.version}` : ''}
                  </span>
                  <span className="row-meta">
                    {pkg.path}
                    {pkg.machine_path ? ` · ${pkg.machine_path}` : ' · human surface'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <CheckGrid items={VERIFY} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related</h2>
          <div className="lab-meta">
            <Link href="/open" data-cuelume-hover="tick">
              Open index →
            </Link>
            <Link href="/privacy" data-cuelume-hover="tick">
              Privacy →
            </Link>
            <Link href="/review/keyboard" data-cuelume-hover="tick">
              Keyboard path →
            </Link>
            <Link href="/docs" data-cuelume-hover="tick">
              Docs →
            </Link>
          </div>
        </section>

        <div className="status-note">
          {o.handoff_line} This pack is the public share surface; social
          publication still waits for account readiness and explicit execute.
        </div>
      </main>

      <Footer />
    </>
  );
}
