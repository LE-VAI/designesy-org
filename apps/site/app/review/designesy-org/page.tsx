import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';

export const metadata: Metadata = {
  title: 'designesy.org review',
  description:
    'Public review of the Designesy site against design system contract v0.1 and Lab One: Poise.',
  openGraph: {
    title: 'designesy.org review · Designesy',
    description:
      'A public surface checked against its own contract — holds, tensions, and next system states.',
  },
};

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
      'Live UI draws from a single token foundation. Contract v0.1, the machine export, and Poise reference the same values. New public UI is expected to cite a contract token or an open tension.',
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
      'Reduced motion and sound preference are first-class. A published keyboard-path verification for every route is not yet part of the public record.',
    next: 'Keyboard and focus verification belongs in the next contract verification pass.',
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
  'Poise behaviors remain candidates for design system contract v0.1.1 until explicitly adopted',
  'Public product names stay human and premium; research-demo vocabulary stays off public surfaces',
  'A second accent or light theme ships only after it is contracted',
  'Homepage field cards point to the contract home and Poise using existing tokens and opacity-only mark liveliness',
];

const SCOPE = [
  { href: '/', label: 'Home', meta: '/' },
  { href: '/docs', label: 'Docs', meta: '/docs' },
  { href: '/labs', label: 'Labs', meta: '/labs' },
  { href: '/labs/poise', label: 'Poise', meta: '/labs/poise' },
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
            A public review against design system contract v0.1.
          </p>
          <p className="surface-note">
            Review leads with consequences, not taste. This packet checks the
            live public site — including Lab One, Poise — for purpose, clarity,
            coherence, and honesty about what is still open.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Published</span>
            <span className="lab-meta-item">Baseline · contract v0.1</span>
            <span className="lab-meta-item">Date · 2026-07-12</span>
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
                data-cuelume-release
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
              verification proof, and deliberate adoption of Poise into contract
              v0.1.1 — not a redesign.
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
          <div className="row-stack" role="list">
            {NEXT_STATES.map((item, i) => (
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
          <h2 className="doctrine-heading">Evidence</h2>
          <div className="row-stack" role="list">
            {EVIDENCE.map((item, i) => {
              const body = (
                <>
                  <span className="row-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="row-body">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">{item.meta}</span>
                  </span>
                </>
              );

              if (item.href) {
                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="row"
                    role="listitem"
                    data-cuelume-hover="whisper"
                    data-cuelume-press
                    data-cuelume-release
                  >
                    {body}
                  </Link>
                );
              }

              return (
                <div
                  key={item.title}
                  className="row"
                  role="listitem"
                  data-cuelume-hover="whisper"
                >
                  {body}
                </div>
              );
            })}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Adoption stance</h2>
          <div className="definition">
            <p className="definition-label">Poise and contract v0.1.1</p>
            <p>
              Poise is Lab One. Its portable rules are recorded as candidates in
              the design system contract. They become contract material only when
              explicitly adopted — silence is not adoption.
            </p>
          </div>
        </section>

        <div className="status-note">
          Public review of the live designesy.org surface against contract v0.1.
          This is institutional quality discipline, not a client report or legal
          audit. Poise candidates remain open until adopted into v0.1.1.
        </div>
      </main>

      <Footer />
    </>
  );
}
