import { renderOgCard } from '../../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Poise keyboard path · Designesy verification';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Review · Verification',
    title: 'Poise keyboard path',
    lede: 'Tab order, focus-visible, activation, and reduced-motion proof for Lab One controls.',
    path: 'designesy.org/review/poise/keyboard',
    kind: 'review',
    badge: 'Published',
  });
}
