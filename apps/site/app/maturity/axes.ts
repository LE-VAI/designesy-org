// The six axes and four stages of the maturity assessment. Data only, so
// the form (a client component) and the page's share card (a server route)
// read one list.

export interface Axis {
  id: string;
  label: string;
  symbol: string;
  description: string;
  categories: string;
  contractWeight: string;
}

export const AXES: Axis[] = [
  {
    id: 'tokens',
    label: 'Token discipline',
    symbol: 'T',
    description: 'Are design tokens defined, structured, and enforced?',
    categories: 'tokens, spec',
    contractWeight: '13% of contract',
  },
  {
    id: 'motion',
    label: 'Motion consistency',
    symbol: 'M',
    description: 'Are duration, easing, and interaction feel tokenized and applied?',
    categories: 'motion, takt',
    contractWeight: '18% of contract',
  },
  {
    id: 'a11y',
    label: 'Accessibility readiness',
    symbol: 'A',
    description: 'WCAG conformance, focus visibility, reduced-motion tiering.',
    categories: 'accessibility, interaction',
    contractWeight: '21% of contract',
  },
  {
    id: 'platform',
    label: 'Platform fit',
    symbol: 'P',
    description: 'Core Web Vitals, responsive, interaction poise across devices.',
    categories: 'performance, responsive, poise',
    contractWeight: '16% of contract',
  },
  {
    id: 'identity',
    label: 'Identity and copy',
    symbol: 'I',
    description: 'Semantic landmarks, UX copy discipline, security hygiene.',
    categories: 'identity, copywriting, security',
    contractWeight: '19% of contract',
  },
  {
    id: 'verification',
    label: 'Verification maturity',
    symbol: 'V',
    description: 'Is compliance measured deterministically, or by vibes?',
    categories: 'cadence, self-measurement',
    contractWeight: '18% of contract + the moat',
  },
];

export const STAGE_LABELS: Record<number, string> = {
  1: 'Ad-hoc',
  2: 'Emerging',
  3: 'Systematic',
  4: 'Verified',
};
