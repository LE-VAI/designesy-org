import type { Metadata } from 'next';
import Link from 'next/link';
import './pricing.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import {
  REVIEW_CHECKOUT_URL,
  REVIEW_CTA_LABEL,
  REVIEW_DISCLOSURE,
  REVIEW_OFFER_PATH,
  REVIEW_PRICE,
} from '../lib/review-offer';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Pricing',
  description:
    'Designesy pricing: open core stays free, CI gate and score API included. Continuity adds scheduled scans, drift alerts, and score history at $29 a month for 5 sites. Enterprise runs private scoring on your own infrastructure.',
  path: '/pricing',
  ogTitle: 'Pricing · Designesy',
  ogDescription:
    'Open core free forever, CI gate included. Continuity at $29 a month for 5 sites: scheduled scans and drift alerts. Enterprise for private, on-prem scoring.',
});

const TIERS = [
  {
    name: 'Open',
    price: 'Free',
    suffix: 'forever',
    sub: `Score any URL with the full ${ENGINE_CHECK_COUNT}-check engine, drift radar, AI readiness, DTCG validation, and gate your CI on the result.`,
    bullets: [
      `${ENGINE_CHECK_COUNT}-check score on any URL`,
      'CI gate (GitHub Action or CLI) + public score API, no key',
      'Your own DESIGN.md or tokens as the contract (coming)',
      '12-check drift radar',
      '10-check AI readiness score',
      'DTCG token file validation',
      'Score history (5 most recent, local)',
      'Embeddable SVG badge + receipt export',
    ],
    cta: { label: 'Start scoring', href: '/score' },
    primary: true,
  },
  {
    name: 'Continuity',
    price: '$29',
    suffix: '/ month',
    sub: 'Watches your sites over time: scheduled scans, email drift alerts, score history, baseline snapshots. 5 sites.',
    bullets: [
      'Everything in Open',
      'Scheduled scans (daily or weekly)',
      'Email drift alerts when a score changes',
      'Score history + trend charts (30-day)',
      'Baseline snapshots for comparison',
      'Multi-site dashboard (5 sites)',
    ],
    cta: { label: 'Join Continuity waitlist', href: '/continuity' },
    primary: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    suffix: '',
    sub: 'Private scoring on your own infrastructure: a private contract instance, SSO, audit trail, on-prem. For teams shipping with agents at scale.',
    bullets: [
      'Everything in Continuity',
      'Private and staging URLs scored on your infrastructure',
      'Private contract instance (on-prem or VPC)',
      'SSO/SAML + audit trail',
      'Unlimited sites + 1-year history',
      'On-prem scoring engine + dedicated CSM + SLA',
    ],
    cta: { label: 'Contact us', href: 'mailto:hello@designesy.org' },
    primary: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Pricing</p>
          <h1 className="surface-title" data-scramble>
            Open core stays free.
          </h1>
          <p className="surface-lede">
            Score any site against the contract for free, forever, and gate your
            CI on it. Continuity adds scheduled scans, drift alerts, and score
            history at $29 a month for 5 sites. Enterprise runs the engine on your
            own infrastructure. A Designesy Review puts a person on your store
            or app flow, one time, for {REVIEW_PRICE}.
          </p>
          <p className="surface-note">
            No credit card to start. The free tier is the whole score engine.
          </p>
          <AgentActions mdPath="/pricing.md" label="the pricing page" />
        </section>

        {/* The tiers follow the header directly. A desk paragraph between
            them restated the lede almost word for word in a hairline-bounded
            section of its own. */}
        <section className="doctrine-section fade-up fade-up-delay-1">
          <div className="pricing-grid">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`pricing-card${tier.primary ? ' pricing-card--primary' : ''}`}
                data-cuelume-press
              >
                <div className="pricing-card-head">
                  <span className="pricing-card-name">{tier.name}</span>
                  <div className="pricing-card-price">
                    <span className="pricing-card-price-value" data-tabular>
                      {tier.price}
                    </span>
                    {tier.suffix && (
                      <span className="pricing-card-price-suffix">
                        {tier.suffix}
                      </span>
                    )}
                  </div>
                  <p className="pricing-card-sub">{tier.sub}</p>
                </div>
                <ul className="pricing-card-bullets">
                  {tier.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <div className="pricing-card-cta">
                  {tier.cta.href.startsWith('mailto:') ? (
                    <a
                      href={tier.cta.href}
                      className="pricing-cta-link"
                      data-cuelume-press="tick"
                    >
                      {tier.cta.label}
                    </a>
                  ) : (
                    <Link
                      href={tier.cta.href}
                      className="pricing-cta-link"
                      data-cuelume-hover="tick"
                      data-cuelume-press="tick"
                    >
                      {tier.cta.label}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The one-time Review sits under the recurring tiers as a card of
            its own, so the row above stays a like-for-like ladder of plans.
            It is the tier card's anatomy laid on the firewall's face/side
            split (pricing.css): name, price and one line in the face, ending
            on the 7-line, with the call to action under them; what the buyer
            receives as key rows behind the divider. Its button takes the
            secondary recipe: Open keeps the page's one filled primary. The
            disclosure follows the card whole, as the offer requires wherever
            the Review is described. */}
        <section
          className="doctrine-section fade-up fade-up-delay-2"
          aria-labelledby="pricing-review-name"
        >
          <div className="pricing-review definition-split">
            <div className="definition-face">
              <div className="pricing-card-head">
                <h2 className="pricing-card-name" id="pricing-review-name">
                  Designesy Review
                </h2>
                <div className="pricing-card-price">
                  <span className="pricing-card-price-value" data-tabular>
                    {REVIEW_PRICE}
                  </span>
                  <span className="pricing-card-price-suffix">one-time</span>
                </div>
                <p className="pricing-card-sub">
                  A person reviews your store or app flow and hands you a
                  prioritized fix list for the barriers your shoppers hit.
                </p>
              </div>
              <div className="pricing-review-actions">
                <a
                  href={REVIEW_CHECKOUT_URL}
                  className="pricing-cta-link"
                  data-cuelume-press="tick"
                >
                  {REVIEW_CTA_LABEL}
                </a>
                <Link
                  href={REVIEW_OFFER_PATH}
                  className="text-link"
                  data-cuelume-hover="tick"
                >
                  See what a Review covers
                </Link>
              </div>
            </div>
            <dl className="definition-side">
              <div>
                <dt>Score</dt>
                <dd>{ENGINE_CHECK_COUNT} automated checks, each failure named</dd>
              </div>
              <div>
                <dt>Review</dt>
                <dd>8 dimensions, a verdict and its evidence</dd>
              </div>
              <div>
                <dt>Spot-check</dt>
                <dd>Manual, WCAG 2.2 AA</dd>
              </div>
              <div>
                <dt>Verdict</dt>
                <dd>Fix list, P0 to P2</dd>
              </div>
              <div>
                <dt>Re-score</dt>
                <dd>1, within 30 days</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>5 business days</dd>
              </div>
            </dl>
          </div>
          <p className="surface-note pricing-review-note">{REVIEW_DISCLOSURE}</p>
        </section>

        {/* The firewall is one reading card in two panes (pricing.css, on
            the shared face/side split): the statement in the face, ending
            on the 7-line, and what is not for sale as key rows behind the
            divider. Its eyebrow names it; no resting stripe. The offer page
            links here by its id. */}
        <section
          className="doctrine-section fade-up fade-up-delay-2"
          id="independence-firewall"
        >
          <div className="pricing-firewall definition-split">
            <div className="definition-face">
              <p className="pricing-firewall-label">Independence firewall</p>
              <p className="pricing-firewall-text">
                <strong>
                  Designesy does not accept payment for scores, methodology
                  changes, or leaderboard placement.
                </strong>{' '}
                Every score is computed by the same deterministic {ENGINE_CHECK_COUNT}-check engine
                against the same published contract. Enterprise customers pay for
                private scoring on their own infrastructure, never for public
                leaderboard placement. If a scored site is also an
                enterprise customer, their public score is computed identically to
                any non-customer&rsquo;s score.
              </p>
            </div>
            <dl className="definition-side">
              <div>
                <dt>Scores</dt>
                <dd>Not for sale</dd>
              </div>
              <div>
                <dt>Methodology</dt>
                <dd>Not for sale</dd>
              </div>
              <div>
                <dt>Placement</dt>
                <dd>Not for sale</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">Questions</h2>
          <div className="pricing-faq">
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                What does &ldquo;early access&rdquo; mean?
              </summary>
              <p className="pricing-faq-a">
                Continuity is not yet live. We are talking to builders who score
                work with agents to shape the monitoring features before
                billing starts. Join the{' '}
                <Link href="/continuity" className="text-link">
                  waitlist
                </Link>{' '}
                if you want in early.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                How many scores can I run on the free tier?
              </summary>
              <p className="pricing-faq-a">
                No hard cap. The free tier scores any URL with the full {ENGINE_CHECK_COUNT}-check
                engine and keeps your last 5 scores in your browser. Continuity
                adds scheduled scans, server-side history, and email drift
                alerts.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                Can I score against my own design system?
              </summary>
              <p className="pricing-faq-a">
                Soon, on every tier, free: point the engine at your DESIGN.md or
                DTCG tokens in place of the Designesy contract. Continuity
                watches your contract over time with scheduled scans, drift
                alerts, and history. Enterprise runs a private contract instance
                on your own infrastructure (on-prem or VPC) with SSO and an
                audit trail.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                How many sites are included in Continuity?
              </summary>
              <p className="pricing-faq-a">
                Continuity is $29 a month for 5 sites. Each site gets scheduled
                scans, drift alerts, and its own score history.
                Need more? Enterprise covers unlimited sites.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                Can I use the free tier commercially?
              </summary>
              <p className="pricing-faq-a">
                Yes. Score any site, embed the badge, and export the receipt,
                commercially or otherwise. The open contract and machine feed
                are published for any agent or tool to consume.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                What happens to my score history if I upgrade?
              </summary>
              <p className="pricing-faq-a">
                Your 5 local scores stay in your browser. Continuity picks up
                server-side history from the moment it activates. Local and
                server-side history are separate stores; neither overwrites the other.
              </p>
            </details>
          </div>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-3">
          <h2 className="doctrine-heading">Feature comparison</h2>
          <div className="surface-note" style={{ marginBottom: '1rem' }}>
            All tiers use the same {ENGINE_CHECK_COUNT}-check engine and the same contract. The
            difference is monitoring, history, and infrastructure.
          </div>
          {/* The table sits in one rimmed reading surface, the FAQ's. */}
          <div className="pricing-compare-wrap">
            <table className="pricing-compare">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Open</th>
                  <th>Continuity</th>
                  <th>Enterprise</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{ENGINE_CHECK_COUNT}-check verification engine</td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>12-check drift radar</td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>10-check AI readiness</td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>DTCG token validation</td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>Embeddable SVG badge + receipt export</td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>Score history</td>
                  <td>5 local</td>
                  <td>30-day server</td>
                  <td>1-year server</td>
                </tr>
                <tr>
                  <td>Scheduled scans</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td>Daily or weekly</td>
                  <td>Custom schedule</td>
                </tr>
                <tr>
                  <td>Email drift alerts</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>Baseline snapshots</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>Multi-site dashboard</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td>5 sites</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Monitor your own contract (coming)</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>CI gate (GitHub Action or CLI) + score API</td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>Score against your own contract (coming)</td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>SSO/SAML + audit trail</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>On-prem scoring engine</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
                <tr>
                  <td>SLA + dedicated CSM</td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-dash" aria-hidden="true">–</span><span className="sr-only">Not included</span></td>
                  <td><span className="pricing-compare-check">✓</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="surface-note" style={{ marginTop: '0.75rem' }}>
            Open features are live today, except those marked coming.
            Continuity features are in early access. Enterprise features are available by conversation:{' '}
            <a href="mailto:hello@designesy.org" className="text-link">
              contact us
            </a>
            .
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-4">
          <p className="pricing-desk-note">
            Continuity is in early access at $29 a month for 5 sites. Join the{' '}
            <Link href="/continuity" className="text-link">
              Continuity waitlist
            </Link>{' '}
            to shape the monitoring features before billing starts.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}