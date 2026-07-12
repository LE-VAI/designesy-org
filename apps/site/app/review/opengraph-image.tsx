import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Review — Quality gate for public artifacts';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Review',
    title: 'Review leads with consequences',
    lede: 'Eight dimensions and field checks for interfaces, systems, and agent output — not personal taste.',
    path: 'designesy.org/review',
    kind: 'review',
  });
}
