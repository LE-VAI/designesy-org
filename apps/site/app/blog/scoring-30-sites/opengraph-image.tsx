import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'We scored 30 real websites against a 40-check design contract';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog',
    title: '30 sites scored',
    lede: '60% scored D or F. Zero scored a B. One site scored A — the publisher.',
    path: 'designesy.org/blog/scoring-30-sites',
    badge: 'Article',
  });
}