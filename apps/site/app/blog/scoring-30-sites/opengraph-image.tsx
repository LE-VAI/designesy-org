import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Blog — 30 sites scored';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog',
    title: '30 sites scored',
    lede: '30 websites scored against a 40-check design contract. 60% scored D or F. Zero scored a B.',
    path: 'designesy.org/blog/scoring-30-sites',
    kind: 'review',
    badge: '30 sites',
  });
}