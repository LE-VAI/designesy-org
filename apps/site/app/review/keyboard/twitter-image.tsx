import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy site-wide keyboard path verification';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Review · Keyboard',
    title: 'Keyboard path, site-wide',
    lede: 'Skip link, main landmark, tab order, focus-visible, and reduced-motion notes for shared chrome.',
    path: 'designesy.org/review/keyboard',
    kind: 'review',
  });
}