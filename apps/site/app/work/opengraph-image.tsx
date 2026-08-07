import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Work — Case studies';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Work',
    title: 'Case studies',
    lede: 'Shipped artifacts and before/after scores reviewed against the design system contract.',
    path: 'designesy.org/work',
    kind: 'review',
  });
}