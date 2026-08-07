import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'We scored 16 more sites. The dev tools are worse than the design awards.';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog',
    title: 'Dev tools are worse',
    lede: '56% of dev-tool sites scored F. The highest score was 64.6/D. Zero reached C.',
    path: 'designesy.org/blog/scoring-16-devtools',
    badge: 'Article',
  });
}