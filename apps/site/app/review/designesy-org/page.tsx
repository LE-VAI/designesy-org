import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'designesy.org review',
  description:
    'Public review of the Designesy site against design system contract v0.3.0, Lab One: Poise, Lab Two: Takt, and Lab Three: Cadence.',
  path: '/review/designesy-org',
  ogTitle: 'designesy.org · public surface review',
  ogDescription:
    'A public surface checked against its own contract — holds, tensions, and standing rules.',
  twitterDescription:
    'Field check against design system contract v0.3.0 — designesy.org/review/designesy-org',
});

const HOLDS = [
  {
    dim: 'Purpose',
    finding:
      'The site makes design judgment inspectable: docs, labs, review, and contracts each have a job. Poise shows the system can leave doctrine and become behavior.',
  },
  {
    dim: 'Clarity',
    finding:
      'Hierarchy is quiet and readable. Primary paths — Docs, Review, Contracts, Labs, Poise — are discoverable without competing chrome.',
  },
  {
    dim: 'System coherence',
    finding:
      'Live UI draws from a single token foundation. Contract v0.3.0, the machine export, Poise, Takt, and Cadence reference the same values — including adopted interaction, interface-feel, and typography rules. New public UI is expected to cite a contract token or an open tension.',
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
      'The surface is dense by design. Mobile layouts hold, but long contract tables and review text still ask for patience on small screens.',
    next: 'Token tables stack on narrow widths; multi-column doctrine remains a large-screen pattern.',
  },
  {
    dim: 'Inclusion',
    finding:
      'Reduced motion and sound preference are first-class. Lab One keyboard-path verification is published; site-wide route packets are not yet complete.',
    next: 'Expand keyboard verification route by route; Poise proof lives at /review/poise/keyboard.',
  },
  {
    dim: 'Durability',
    finding:
      'Human contract page and machine export remain dual sources until a single generator owns both. That is an open tension, not a failure.',
    next: 'Token changes update both the human contract and the machine export together.',
  },
  {
    dim: 'Responsibility',
    finding:
      'Web Analytics is active. Public privacy language for measurement is not yet published.',
    next: 'Privacy language ships when ready as clear visitor-facing copy — not as a placeholder.',
  },
];

const NEXT_STATES = [
  'Poise rules adopted in v0.1.1; Takt in v0.1.2; Cadence in v0.1.3; labs remain the inspectable demos',
  'Public product names stay human and premium; research-demo vocabulary stays off public surfaces',
  'A second accent or light theme ships only after it is contracted',
  'Homepage field cards point to the contract home, Poise, Takt, and Cadence using existing tokens and opacity-only mark liveliness',
];

const SCOPE = [
  { href: '/', label: 'Home', meta: '/' },
  { href: '/docs', label: 'Docs', meta: '/docs' },
  { href: '/labs', label: 'Labs', meta: '/labs' },
  { href: '/labs/poise', label: 'Poise', meta: '/labs/poise' },
  { href: '/labs/takt', label: 'Takt', meta: '/labs/takt' },
  { href: '/contracts', label: 'Contracts', meta: '/contracts' },
  {
    href: '/contracts/design-system',
    label: 'Design system',
    meta: '/contracts/design-system',
  },
  {
    href: '/contracts/design-system.json',
    label: 'Machine export',
    meta: '/contracts/design-system.json',
  },
];

const EVIDENCE = [
  {
    title: 'Contract (full)',
    meta: '/contracts#design-system-contract',
    href: '/contracts#design-system-contract',
  },
  {
    title: 'Contract home',
    meta: '/contracts/design-system',
    href: '/contracts/design-system',
  },
  {
    title: 'Machine export',
    meta: '/contracts/design-system.json',
    href: '/contracts/design-system.json',
  },
  {
    title: 'Lab One · Poise',
    meta: '/labs/poise',
    href: '/labs/poise',
  },
  {
    title: 'Tokens',
    meta: 'Live design tokens — paper, surface, accent, radius, motion',
  },
  {
    title: 'Motion',
    meta: 'Wordmark opacity breath · press scale(0.97) · reduced-motion collapse',
  },
  {
    title: 'Sound',
    meta: 'Designesy owns preference · audio engine only applies it',
  },
];

export default function PublicSurfaceReviewPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/review" className="lab-crumb">
              Review
            </Link>
            <span aria-hidden="true"> · </span>
            Public surface
          </p>
          <h1 className="surface-title" data-scramble>designesy.org</h1>
          <p className="surface-lede">
            A public review against design system contract v0.3.0.
          </p>
          <p className="surface-note">
            Review leads with consequences, not taste. This packet checks the
            live public site — including Lab One · Poise, Lab Two · Takt, and
            Lab Three · Cadence — for purpose, clarity, coherence, and honesty
            about what is still open.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Published</span>
            <span className="lab-meta-item">Baseline · contract v0.3.0</span>
            <span className="lab-meta-item">Date · 2026-07-13</span>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Scope</h2>
          <div className="row-stack" role="list">
            {SCOPE.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="row"
                role="listitem"
                data-cuelume-hover="whisper"
                data-cuelume-press
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.label}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verdict</h2>
          <div className="definition">
            <p className="definition-label">Considered after functional</p>
            <p>
              The public surface is functional and largely considered. It earns
              its restraint. What remains is synchronization, fuller
              verification proof, and keeping adopted Poise and Takt rules
              synchronized — not a redesign.
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
                    System state · {item.next}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Standing rules</h2>
          <CheckGrid items={checkItemsFromStrings(NEXT_STATES)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Evidence</h2>
          <CheckGrid items={EVIDENCE} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Adoption stance</h2>
          <div className="definition">
            <p className="definition-label">Poise, Takt, Cadence, and contract v0.3.0</p>
            <p>
              Poise is Lab One; its portable interaction rules were adopted into
              contract v0.1.1. Takt is Lab Two; its interface-feel rules were
              adopted into contract v0.1.2. Cadence is Lab Three; its typography
              rules were adopted into contract v0.1.3. The labs remain the live
              demos; the contract carries the rules.
            </p>
          </div>
        </section>

        <div className="status-note">
          Public review of the live designesy.org surface against contract
          v0.3.0. This is institutional quality discipline, not a client report
          or legal audit. Poise, Takt, and Cadence rules are adopted; the labs remain the
          inspectable source demos.
        </div>
      </main>

      <Footer />
    </>
  );
}
