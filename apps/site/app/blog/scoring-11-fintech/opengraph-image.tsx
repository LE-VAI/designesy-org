import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Blog — Fintech sites can\'t pass a design contract';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog · Fintech',
    title: 'Fintech can\'t pass',
    lede: '11 fintech sites scored against a 40-check design contract. All failed. The best was a D.',
    path: 'designesy.org/blog/scoring-11-fintech',
    kind: 'review',
    badge: '11 sites',
  });
}