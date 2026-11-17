import { renderOgCard } from '../../lib/og-card';
import { TaktPlate } from '../../lib/og-lab-plates';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Takt: Lab Two';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs · Lab Two',
    title: 'Takt',
    lede: 'How an interface feels under your hands. Concentric radii, press feedback, image outlines, hit areas.',
    path: 'designesy.org/labs/takt',
    kind: 'lab',
    art: <TaktPlate />,
    badge: 'Live',
  });
}