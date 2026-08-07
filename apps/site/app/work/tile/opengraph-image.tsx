import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Work — Tile case study';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Work',
    title: 'Tile',
    lede: 'One story, many tiles, shared spine. Shipped, published, reviewed — 617 views on X.',
    path: 'designesy.org/work/tile',
    kind: 'review',
    badge: 'case study',
  });
}