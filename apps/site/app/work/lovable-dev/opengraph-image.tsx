import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Work — lovable.dev A on arrival case study';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Work',
    title: 'lovable.dev',
    lede: 'An AI app platform site that scored A on the Designesy contract without citing it.',
    path: 'designesy.org/work/lovable-dev',
    kind: 'review',
    badge: 'A on arrival',
  });
}