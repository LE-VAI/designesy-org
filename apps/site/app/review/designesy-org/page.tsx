import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';

export const metadata: Metadata = {
  title: 'designesy.org review',
  description:
    'Self-review of the Designesy public site against design system contract v0.1 and Lab One: Poise.',
  openGraph: {
    title: 'designesy.org review · Designesy',
    description:
      'A public surface checked against its own contract — holds, tensions, and concrete next moves.',
  },
};

const HOLDS = [
  {
    dim: 'Purpose',
    finding:
      'The site makes design judgment inspectable: docs, labs, review, and contracts each have a job. Poise proves the system can leave doctrine and become behavior.',
  },
  {
    dim: 'Clarity',
    finding:
      'Hierarchy is quiet and readable. Primary paths (Read docs, Review, Contracts, Labs → Poise) are discoverable without competing chrome.',
  },
  {
    dim: 'System coherence',
    finding:
      'Live UI draws from a single token file. Contract v0.1, machine export, and Poise all point at the same values. Drift rule is explicit.',
  },
  {
    dim: 'Delight',
    finding:
      'Wordmark breath and short press settle add finish without spectacle. Emotional quality supports trust rather than performance.',
  },
];

const TENSIONS = [
  {
    dim: 'Context',
    finding:
      'Public surface is desktop-first in density; mobile holds, but deep contract tables and long review text still ask for patience on small screens.',
    action: 'Keep token tables stacking; avoid new multi-column doctrine blocks under 720px.',
  },
  {
    dim: 'Inclusion',
    finding:
      'Reduced motion and sound preference are first-class. Full keyboard audit of every route is not yet published as a verification artifact.',
    action: 'Add a short keyboard path note to the next contract verification pass.',
  },
  {
    dim: 'Durability',
    finding:
      'Human contract page and machine JSON are dual sources until a generator owns both. That is an open tension, not a failure.',
    action: 'When either surface changes tokens, update lib/design-system-contract.ts and globals.css together.',
  },
  {
    dim: 'Responsibility',
    finding:
      'Analytics is live; visitors are counted. The site does not yet state analytics presence in public privacy language.',
    action: 'Add a brief, honest privacy line when legal copy is ready — not before.',
  },
];

const CORRECTIONS = [
  'Promote Poise rules into contract v0.1.1 only after this review is accepted',
  'Keep public names in the mini-flagship register; never ship AI-lab product vocabulary',
  'Do not invent a second accent or light theme without contracting it first',
  'Homepage may later link the contract and Poise — only with existing tokens, no new decoration',
];

const SCOPE = [
  { href: '/', label: 'Home' },
  { href: '/docs', label: 'Docs' },
  { href: '/labs', label: 'Labs' },
  { href: '/labs/poise', label: 'Poise' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/contracts/design-system', label: 'Machine contract' },
];

export default function PublicSurfaceReviewPage() {
  return (
    <>
      <Topbar scrolled />

      <main className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/review" className="lab-crumb">
              Review
            </Link>
            <span aria-hidden="true"> · </span>
            Public surface
          </p>
          <h1 className="surface-title">designesy.org</h1>
          <p className="surface-lede">
            A self-review against design system contract v0.1.
          </p>
          <p className="surface-note">
            Review leads with consequences, not taste. This packet checks the
            live public site — including Lab One, Poise — for purpose, clarity,
            coherence, and honesty about what is still open.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Field check</span>
            <span className="lab-meta-item">Baseline · contract v0.1</span>
            <span className="lab-meta-item">Date · 2026-07-12</span>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Scope</h2>
          <ul className="checkmark-list">
            {SCOPE.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
                <span style={{ color: 'var(--muted-dim)' }}> · {item.href}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verdict</h2>
          <div className="definition">
            <p className="definition-label">Considered after functional</p>
            <p>
              The public surface is functional and largely considered. It earns
              its restraint. Remaining work is synchronization, verification
              proof, and careful promotion of Poise into contract v0.1.1 — not a
              redesign.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Holds</h2>
          <div className="principle-list">
            {HOLDS.map((item, i) => (
              <div className="principle" key={item.dim}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <h3>{item.dim}</h3>
                  <p>{item.finding}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Tensions</h2>
          <div className="principle-list">
            {TENSIONS.map((item, i) => (
              <div className="principle" key={item.dim}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <h3>{item.dim}</h3>
                  <p>{item.finding}</p>
                  <p style={{ marginTop: '0.5rem', color: 'var(--muted-dim)' }}>
                    Next · {item.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Concrete corrections</h2>
          <ul className="checkmark-list">
            {CORRECTIONS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Evidence</h2>
          <ul className="checkmark-list">
            <li>
              Contract (human) ·{' '}
              <Link href="/contracts#design-system-contract">
                /contracts#design-system-contract
              </Link>
            </li>
            <li>
              Contract (machine) ·{' '}
              <Link href="/contracts/design-system">
                /contracts/design-system
              </Link>
            </li>
            <li>
              Lab One · <Link href="/labs/poise">/labs/poise</Link>
            </li>
            <li>
              Tokens · globals.css :root (paper, surface, accent, radius, motion)
            </li>
            <li>
              Motion · wordmark opacity breath; press scale(0.97); reduced-motion collapse
            </li>
            <li>Sound · Designesy preference key; Cuelume applies only</li>
          </ul>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Promotion stance</h2>
          <div className="definition">
            <p className="definition-label">Poise → contract v0.1.1</p>
            <p>
              Poise is accepted as Lab One. Its portable rules are listed as
              promotion candidates in the machine contract. They become contract
              law only when explicitly promoted — not by silence.
            </p>
          </div>
        </section>

        <div className="status-note">
          This is a public self-review packet, not a client report or legal
          audit. Status: field check complete for contract v0.1 baseline.
          Promote Poise rules only on operator order.
        </div>
      </main>

      <Footer />
    </>
  );
}
