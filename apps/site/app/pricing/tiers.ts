import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';

// The three tiers, as /pricing lists them. Data only, so the page and its
// share card read one list.
export const TIERS = [
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
    sub: 'Private scoring on your own infrastructure: a private contract instance, audit trail, on-prem. For teams shipping with agents at scale.',
    bullets: [
      'Everything in Continuity',
      'Private and staging URLs scored on your infrastructure',
      'Private contract instance (on-prem or VPC)',
      'Audit trail',
      'Unlimited sites + 1-year history',
      'On-prem scoring engine + dedicated CSM + SLA',
    ],
    cta: { label: 'Contact us', href: 'mailto:hello@designesy.org' },
    primary: false,
  },
];
