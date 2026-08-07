import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Blog — Dev tools are worse than the design awards';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog · Dev Tools',
    title: 'Dev tools are worse',
    lede: '16 dev-tool sites scored. 56% scored F. Zero reached C. The dev tools are worse than the design awards.',
    path: 'designesy.org/blog/scoring-16-devtools',
    kind: 'review',
    badge: '16 sites',
  });
}