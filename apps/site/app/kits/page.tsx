import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Kits',
  description:
    'Designesy Use Kits — portable instruction packages for people and agents. Kit One is Design Review.',
  path: '/kits',
  ogDescription:
    'Portable instruction packages agents and teams can run. Kit One · Design Review is live.',
  twitterDescription:
    'Portable instruction packages for people and agents — designesy.org/kits',
});

const KIT_ANATOMY = [
  'Purpose',
  'When to use',
  'Required inputs',
  'Permission level',
  'Core method or dimensions',
  'Agent prompt',
  'Output format',
  'Verification checklist',
  'Anti-patterns',
  'Related contracts and surfaces',
];

const NOT_KITS = [
  'Not a prompt dump',
  'Not a generic AI template marketplace',
  'Not a replacement for contracts',
  'Not an unbounded agent permission grant',
  'Not a blog of tips',
  'Not filler cards for future ideas',
];

export default function KitsPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Use lane</p>
          <h1 className="surface-title">Kits</h1>
          <p className="surface-lede">
            Portable instruction packages for people and agents.
          </p>
          <p className="surface-note">
            A Use Kit bundles purpose, inputs, method, prompt, output shape,
            verification, and boundaries so design judgment can travel. Kits do
            not invent taste. They package living rules from contracts, labs,
            and review into something you can hand to an agent or a teammate.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Live kits</h2>
          <Link
            href="/kits/design-review"
            className="lab-card"
            data-cuelume-hover="tick"
            data-cuelume-press
            data-cuelume-release
          >
            <div className="lab-card-top">
              <span className="status-badge status-badge--kit">Kit One</span>
              <span className="lab-card-status">Live</span>
            </div>
            <h3 className="lab-card-title">Design Review</h3>
            <p className="lab-card-lede">
              Turn taste into inspection.
            </p>
            <p className="lab-card-desc">
              Eight dimensions, a portable agent prompt, output format, and
              verification — for interfaces, systems, and agent output.
            </p>
            <span className="lab-card-arrow">Open kit →</span>
          </Link>
          <p className="surface-note" style={{ marginTop: '1.25rem' }}>
            One live kit is intentional. Machine export lives at{' '}
            <Link href="/kits/design-review.json" data-cuelume-hover="tick">
              /kits/design-review.json
            </Link>
            . The lane stays empty until the next package earns full anatomy —
            not a teaser card.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related surfaces</h2>
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
                <span className="row-title">Open design intelligence</span>
                <span className="row-meta">
                  Package catalog · human + machine feed
                </span>
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
                <span className="row-title">Review</span>
                <span className="row-meta">
                  Quality gate and public field checks
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
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">
                  Portable values and verification · v0.1.2
                </span>
              </span>
            </Link>
            <Link
              href="/labs/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Lab One · Poise</span>
                <span className="row-meta">
                  Source lab · rules adopted into contract v0.1.1
                </span>
              </span>
            </Link>
            <Link
              href="/labs/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">Lab Two · Takt</span>
                <span className="row-meta">
                  Source lab · rules adopted into contract v0.1.2
                </span>
              </span>
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Kit anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Package map for a mature Use Kit. Missing parts mean the package is
            not ready to publish.
          </p>
          <CheckGrid dense items={checkItemsFromStrings(KIT_ANATOMY)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What Kits are not</h2>
          <CheckGrid
            items={checkItemsFromStrings(NOT_KITS, { avoid: true })}
          />
        </section>

        <div className="status-note">
          Kits ship as named packages with permission level, verification, and
          related contracts. Kit One is Design Review. Future kits follow the
          same anatomy and the site drift rule: every public UI change cites a
          contract token or an open tension.
        </div>
      </main>

      <Footer />
    </>
  );
}
