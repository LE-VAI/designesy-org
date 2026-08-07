import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Work — Continuity case study';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Work',
    title: 'Continuity',
    lede: 'A founder-narrative article reviewed against the design system contract. Channel-format mismatch.',
    path: 'designesy.org/work/continuity',
    kind: 'review',
    badge: 'case study',
  });
}