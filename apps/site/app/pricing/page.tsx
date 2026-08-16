import type { Metadata } from 'next';
import Link from 'next/link';
import './pricing.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Pricing',
  description:
    'Designesy pricing — open core stays free. Continuity adds scheduled scans, drift alerts, and score history at $29/site/month. Enterprise for CI/CD gates and on-prem scoring.',
  path: '/pricing',
  ogTitle: 'Pricing · Designesy',
  ogDescription:
    'Open core free forever. Continuity at $29/site/month for scheduled scans and drift alerts. Enterprise for CI gates and on-prem.',
});

const TIERS = [
  {
    name: 'Open',
    price: 'Free',
    suffix: 'forever',
    sub: 'Score any URL with the full 40-check engine, drift radar, AI readiness, DTCG validation.',
    bullets: [
      '40-check score on any URL',
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
    suffix: '/site / month',
    sub: 'Scheduled scans, email drift alerts, score history, baseline snapshots. 5 sites included.',
    bullets: [
      'Everything in Open',
      'Scheduled scans (daily or weekly)',
      'Email drift alerts when a score changes',
      'Score history + trend charts (30-day)',
      'Baseline snapshots for comparison',
      'Multi-site dashboard (5 sites included)',
    ],
    cta: { label: 'Join Continuity waitlist', href: '/continuity' },
    primary: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    suffix: '',
    sub: 'API access, CI/CD gates, custom contract scoring, SSO, on-prem. For teams shipping with agents at scale.',
    bullets: [
      'Everything in Continuity',
      'API access + CI/CD gates (GitHub Actions, GitLab CI)',
      'Custom contract scoring (your rules)',
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
            Score any site against the contract — free, forever. Continuity adds
            scheduled scans, drift alerts, and score history at $29 per site per
            month. Enterprise for CI gates and on-prem.
          </p>
          <p className="surface-note">
            No credit card to start. The free tier is the whole score engine,
            not a teaser.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <div className="pricing-desk">
            <p className="pricing-desk-lede">
              The free tier is not a trial. It is the whole verification engine
              — 40 checks, one grade, real-time. Continuity adds scheduled
              monitoring and drift alerts for teams shipping with agents.
              Enterprise adds CI gates and on-prem for organizations at scale.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
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

        <section className="doctrine-section fade-up fade-up-delay-2">
          <div
            style={{
              padding: '1.5rem 1.75rem',
              background: 'var(--surface)',
              backgroundImage: 'var(--surface-card-gradient)',
              border: '1px solid var(--line)',
              borderLeft: '3px solid var(--signal)',
              borderRadius: '6px',
              margin: '0 0 2rem',
              maxWidth: '66ch',
              boxShadow: 'var(--inner-light)',
            }}
          >
            <p
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--signal-light)',
                fontWeight: 700,
                margin: '0 0 0.75rem',
                fontFamily: 'var(--mono, ui-monospace, monospace)',
              }}
            >
              Independence firewall
            </p>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
                Designesy does not accept payment for scores, methodology
                changes, or leaderboard placement.
              </strong>{' '}
              Every score is computed by the same deterministic 40-check engine
              against the same published contract. Enterprise customers pay for
              private scoring, custom contracts, and CI integration — never for
              public leaderboard placement. If a scored site is also an
              enterprise customer, their public score is computed identically to
              any non-customer&rsquo;s score.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
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
                No hard cap. The free tier scores any URL with the full 40-check
                engine and keeps your last 5 scores in your browser. Continuity
                adds scheduled scans, server-side history, and email drift
                alerts.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                What&rsquo;s the difference between a private contract host
                and a private contract instance?
              </summary>
              <p className="pricing-faq-a">
                Continuity lets you host your own contract — your rules, your
                scoring thresholds, on infrastructure Designesy runs. Enterprise
                gives you a private contract instance on your own
                infrastructure (on-prem or VPC) with SSO and audit trail.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                How many sites are included in Continuity?
              </summary>
              <p className="pricing-faq-a">
                5 sites are included with the $29/site/month plan. Each site
                gets scheduled scans, drift alerts, and its own score history.
                Need more? Enterprise covers unlimited sites.
              </p>
            </details>
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                Can I use the free tier commercially?
              </summary>
              <p className="pricing-faq-a">
                Yes. Score any site, embed the badge, export the receipt —
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
                server-side history are separate stores — one does not
                overwrite the other.
              </p>
            </details>
          </div>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-3">
          <h2 className="doctrine-heading">Feature comparison</h2>
          <div className="surface-note" style={{ marginBottom: '1rem' }}>
            All tiers use the same 40-check engine and the same contract. The
            difference is monitoring, history, and infrastructure.
          </div>
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
                <td>40-check verification engine</td>
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
                <td><span className="pricing-compare-dash">—</span></td>
                <td>Daily or weekly</td>
                <td>Custom schedule</td>
              </tr>
              <tr>
                <td>Email drift alerts</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
              <tr>
                <td>Baseline snapshots</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
              <tr>
                <td>Multi-site dashboard</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td>5 sites included</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Private contract host</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
              <tr>
                <td>API access + CI/CD gates</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
              <tr>
                <td>Custom contract scoring</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
              <tr>
                <td>SSO/SAML + audit trail</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
              <tr>
                <td>On-prem scoring engine</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
              <tr>
                <td>SLA + dedicated CSM</td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-dash">—</span></td>
                <td><span className="pricing-compare-check">✓</span></td>
              </tr>
            </tbody>
          </table>
          <p className="surface-note" style={{ marginTop: '0.75rem' }}>
            Open features are live today. Continuity features are in early
            access. Enterprise features are available by conversation —{' '}
            <a href="mailto:hello@designesy.org" className="text-link">
              contact us
            </a>
            .
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-4">
          <p className="pricing-desk-note">
            Continuity is in early access at $29/site/month. Join the{' '}
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