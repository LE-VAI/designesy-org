import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy: The pause button that emptied our pages';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Learn',
    title: 'The pause button that emptied our pages',
    lede: 'Our WCAG 2.2.2 pause control left 8 pages blank for the visitors who used it. How we found it, fixed it, and gated it.',
    path: 'designesy.org/learn/the-pause-button-that-emptied-our-pages',
    kind: 'docs',
  });
}
