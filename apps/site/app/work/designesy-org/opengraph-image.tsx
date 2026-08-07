import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Work — designesy.org D to A case study';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Work',
    title: 'designesy.org',
    lede: 'D 67.4 → A 96.3. The same engine that grades every other site graded the publisher.',
    path: 'designesy.org/work/designesy-org',
    kind: 'review',
    badge: 'D to A',
  });
}