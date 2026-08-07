import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Blog — 57 sites. None passed.';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog',
    title: '57 sites. None passed.',
    lede: '57 websites scored against a 26-check design contract. 88% scored D or F. Zero scored a B.',
    path: 'designesy.org/blog/scoring-57-synthesis',
    kind: 'review',
    badge: '57 sites',
  });
}