import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Takt — Lab Two';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs',
    title: 'Takt — Lab Two',
    lede: 'How an interface feels under your hands. Concentric radii, press feedback, image outlines, hit areas.',
    path: 'designesy.org/labs/takt',
    kind: 'lab',
    badge: 'Lab Two',
  });
}