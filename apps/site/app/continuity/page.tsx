import type { Metadata } from 'next';
import Link from 'next/link';
import './continuity.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { ContinuityWaitlistForm } from './waitlist-form';

export const metadata: Metadata = pageMeta({
  title: 'Continuity',
  description:
    'Designesy Continuity — design judgment that stays current. Score, contract, verify, and keep the receipt. Early access waitlist. Open core stays free.',
  path: '/continuity',
  ogTitle: 'Continuity · Designesy',
  ogDescription:
    'Design judgment that stays current. Early access for Continuity — scheduled scans, drift alerts, and score history on work you ship with agents.',
  twitterDescription:
    'Design judgment that stays current — early access waitlist. designesy.org/continuity',
});

const CARDS = [
  {
    tag: 'Problem',
    title: 'Reviews that do not travel',
    body: '“Looks fine” dies in the handoff. Agents invent taste. Tokens stay in sync while judgment drifts.',
  },
  {
    tag: 'Promise',
    title: 'Judgment with a receipt',
    body: 'Score surfaces against a citable contract. Export the artifact. Re-score later and see what moved.',
  },
  {
    tag: 'For',
    title: 'Builders who ship with agents',
    body: 'Solo operators, product designers, and small studios who need a portable standard — not another token GUI.',
  },
  {
    tag: 'Not',
    title: 'A canvas or a prompt pack',
    body: 'Not a design tool clone. Not template commerce. Infrastructure for verification that compounds.',
  },
];

const LADDER = [
  {
    name: 'Open',
    title: 'Free forever',
    body: '42-check score, drift radar, AI readiness, DTCG validation. No credit card. 5 local score history.',
  },
  {
    name: 'Continuity',
    title: '$29 / site / month',
    body: 'Scheduled scans (daily/weekly), email drift alerts, 30-day score history + trend charts, baseline snapshots, multi-site dashboard (5 sites included).',
  },
  {
    name: 'Enterprise',
    title: 'Custom',
    body: 'API access, CI/CD gates, custom contract scoring, SSO/SAML, unlimited sites, on-prem scoring, dedicated CSM + SLA.',
  },
];

export default function ContinuityPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>
            Early access
          </p>
          <h1 className="surface-title" data-scramble>
            Design judgment that stays current.
          </h1>
          <p className="surface-lede">
            Continuity keeps score, contract, and verification on the work you
            ship — so taste does not reset every sprint or every agent run.
          </p>
          <p className="surface-note">
            Open core stays free: 42-check scoring, drift radar, AI readiness,
            DTCG validation. Continuity is the layer that remembers — scheduled
            scans, drift alerts, and score history at $29/site/month.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Waitlist</span>
            <span className="lab-meta-item">No charge to join</span>
            <span className="lab-meta-item">Designesy LLC</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" aria-label="What Continuity is for">
          <div className="continuity-card-grid">
            {CARDS.map((card) => (
              <article className="continuity-card" key={card.tag}>
                <p className="continuity-card-tag">{card.tag}</p>
                <h2 className="continuity-card-title">{card.title}</h2>
                <p className="continuity-card-body">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Offer ladder</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            No live prices on this page. Founding access opens after early
            conversations — open tools stay free either way.
          </p>
          <div className="continuity-ladder" role="list">
            {LADDER.map((row) => (
              <div className="continuity-ladder-row" role="listitem" key={row.name}>
                <div className="continuity-ladder-name">{row.name}</div>
                <div className="continuity-ladder-body">
                  <strong>{row.title}</strong>
                  <span>{row.body}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" aria-labelledby="waitlist-title">
          <div className="continuity-panel">
            <h2 className="doctrine-heading" id="waitlist-title">
              Join the Continuity waitlist
            </h2>
            <p className="surface-note" style={{ marginBottom: '1.25rem' }}>
              No charge. No spam cadence. We write when founding access opens —
              and only about Continuity.
            </p>
            <ContinuityWaitlistForm />
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Already live free</h2>
          <div className="row-stack" role="list">
            <Link
              href="/open"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Open index</span>
                <span className="row-meta">Portable design intelligence catalog</span>
              </span>
            </Link>
            <Link
              href="/kits/design-review"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Kit One · Design Review</span>
                <span className="row-meta">Eight-dimension inspection method</span>
              </span>
            </Link>
            <a
              href="https://designesy.ai.studio/"
              className="row"
              role="listitem"
              target="_blank"
              rel="noopener noreferrer"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Score a site</span>
                <span className="row-meta">
                  Director + portable score export on designesy.ai.studio
                </span>
              </span>
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
