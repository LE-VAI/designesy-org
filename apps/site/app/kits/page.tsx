import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';

export const metadata: Metadata = {
  title: 'Kits',
  description:
    'Designesy Use Kits — portable instruction packages for people and agents. Kit One is Design Review.',
  openGraph: {
    title: 'Kits · Designesy',
    description:
      'Portable instruction packages agents and teams can run. Kit One · Design Review is live.',
    url: 'https://www.designesy.org/kits',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kits · Designesy',
    description:
      'Tell your agent to review with Designesy — designesy.org/kits/design-review',
  },
};

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

      <main className="surface-page">
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
                  Portable values and verification · v0.1.1
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
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Kit anatomy</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A mature Use Kit includes all of the following. Missing parts mean
            the package is not ready to publish.
          </p>
          <div className="row-stack" role="list">
            {KIT_ANATOMY.map((item, i) => (
              <div className="row" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What Kits are not</h2>
          <div className="row-stack" role="list">
            {NOT_KITS.map((item, i) => (
              <div className="row is-avoid" role="listitem" key={item}>
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item}</span>
                </span>
              </div>
            ))}
          </div>
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
