import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Badge — Verified by Designesy';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Badge',
    title: 'Verified by Designesy',
    lede: 'Embed the badge. Link to your live score. Design coherence as a trust signal.',
    path: 'designesy.org/badge',
  });
}