import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Cadence — Lab Three';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs',
    title: 'Cadence — Lab Three',
    lede: 'The rhythm of text on a page. Font declaration, scale, leading, tracking, measure, wrapping.',
    path: 'designesy.org/labs/cadence',
    kind: 'lab',
    badge: 'Lab Three',
  });
}