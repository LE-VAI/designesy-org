import { renderOgCard } from '../../lib/og-card';
import { CadencePlate } from '../../lib/og-lab-plates';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Cadence: Lab Three';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs · Lab Three',
    title: 'Cadence',
    lede: 'The rhythm of text on a page. Font declaration, scale, leading, tracking, measure, wrapping.',
    path: 'designesy.org/labs/cadence',
    kind: 'lab',
    art: <CadencePlate />,
    badge: 'Live',
  });
}