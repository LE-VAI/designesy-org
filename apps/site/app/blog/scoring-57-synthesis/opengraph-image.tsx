import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'We scored 57 sites against a real design contract. None of them passed.';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog',
    title: '57 sites. None passed.',
    lede: '88% scored D or F. The B tier is empty. The transition from informal to contract-grade design is a cliff.',
    path: 'designesy.org/blog/scoring-57-synthesis',
    badge: 'Article',
  });
}