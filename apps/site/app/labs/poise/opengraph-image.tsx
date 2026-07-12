import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt =
  'Poise · Lab One — How Designesy responds when someone touches it';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs · Lab One',
    title: 'Poise',
    lede: 'How Designesy responds when someone touches it. Restrained interaction — wordmark, press, sound, reduced motion.',
    path: 'designesy.org/labs/poise',
    kind: 'lab',
    badge: 'Live',
  });
}
