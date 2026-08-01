import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Pricing',
  description:
    'Designesy pricing — open core stays free. Score Pass adds credits and export. Continuity adds saved projects, re-score, and drift. Priced after early access.',
  path: '/pricing',
  ogTitle: 'Pricing · Designesy',
  ogDescription:
    'Open core free forever. Score Pass for volume. Continuity for work that continues. Priced after early access.',
});

const TIERS = [
  {
    name: 'Open',
    price: 'Free',
    suffix: 'forever',
    sub: 'Contract, Kit One, labs, open feed, Director Q&A, score + export.',
    bullets: [
      '40-check score on any URL',
      'Score history (5 most recent, local)',
      'Embeddable SVG badge',
      'Verification receipt export',
      'Open contract + machine feed',
    ],
    cta: { label: 'Start scoring', href: '/score' },
    primary: true,
  },
  {
    name: 'Score Pass',
    price: 'TBD',
    suffix: 'after early access',
    sub: 'Higher score throughput, richer exports, 90-day server-side history.',
    bullets: [
      '90-day server-side score history',
      'Higher daily score throughput',
      'Richer per-check export (CSV + JSON)',
      'Drift comparison between scores',
      'Priority score queue',
    ],
    cta: { label: 'Join Score Pass waitlist', href: '/continuity' },
    primary: false,
  },
  {
    name: 'Continuity',
    price: 'TBD',
    suffix: 'after early access',
    sub: 'Saved projects, scheduled re-score, drift alerts, private contract host.',
    bullets: [
      'Everything in Score Pass',
      'Saved projects with re-score schedule',
      'Drift alerts when a score changes',
      'Private contract host (your own rules)',
      'Team seats',
    ],
    cta: { label: 'Join Continuity waitlist', href: '/continuity' },
    primary: false,
  },
  {
    name: 'Enterprise',
    price: 'Talk to us',
    suffix: '',
    sub: 'Private contract instances, SSO, audit trail, on-prem scoring.',
    bullets: [
      'Everything in Continuity',
      'Private contract instances',
      'SSO + audit trail',
      'On-prem scoring engine',
      'SLA + dedicated support',
    ],
    cta: { label: 'Contact us', href: 'mailto:hello@designesy.org' },
    primary: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Pricing</p>
          <h1 className="surface-title" data-scramble>
            Open core stays free.
          </h1>
          <p className="surface-lede">
            Score any site against the contract — free, forever. Score Pass and
            Continuity add throughput, history, and drift for work that continues.
            Priced after early access.
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
              — 40 checks, one grade, real-time. The paid tiers add volume,
              history, and continuity for teams shipping with agents.
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
          <div className="pricing-faq">
            <details className="pricing-faq-item">
              <summary className="pricing-faq-q">
                What does &ldquo;early access&rdquo; mean?
              </summary>
              <p className="pricing-faq-a">
                Score Pass and Continuity are not yet live. We are talking to
                builders who score work with agents to shape the paid tiers
                before pricing is set. Join the{' '}
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
                engine and keeps your last 5 scores in your browser. Score Pass
                will add higher daily throughput and 90-day server-side history.
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
                How many team seats in Continuity?
              </summary>
              <p className="pricing-faq-a">
                Seat count will be set during early access based on what teams
                actually need. The waitlist exists to learn that number —
                tell us your team size when you join.
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
                Your 5 local scores stay in your browser. Score Pass will pick
                up server-side history from the moment it activates. Local and
                server-side history are separate stores — one does not
                overwrite the other.
              </p>
            </details>
          </div>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-3">
          <p className="pricing-desk-note">
            Score Pass and Continuity are in early access. Pricing will be
            set after the early access period — join the{' '}
            <Link href="/continuity" className="text-link">
              Continuity waitlist
            </Link>{' '}
            to shape it.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}