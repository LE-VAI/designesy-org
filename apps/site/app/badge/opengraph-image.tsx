import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Badge: Scored by Designesy';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Badge',
    title: 'Scored by Designesy',
    lede: 'Embed your live score: the grade, the score and the date it was measured.',
    path: 'designesy.org/badge',
  });
}