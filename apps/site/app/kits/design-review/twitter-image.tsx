import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt =
  'Design Review · Kit One — Turn taste into inspection';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Kits · Kit One',
    title: 'Design Review',
    lede: 'Turn taste into inspection. Eight dimensions, portable agent prompt, and verification for interfaces, systems, and agent output.',
    path: 'designesy.org/kits/design-review',
    kind: 'kit',
    badge: 'Live',
  });
}
