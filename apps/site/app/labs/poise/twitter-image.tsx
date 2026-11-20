import { renderOgCard } from '../../lib/og-card';
import { PoisePlate } from '../../lib/og-lab-plates';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt =
  'Poise · Lab One: How Designesy responds when someone touches it';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Labs · Lab One',
    title: 'Poise',
    lede: 'How Designesy responds when someone touches it. Wordmark, press, sound, reduced motion.',
    path: 'designesy.org/labs/poise',
    kind: 'lab',
    art: <PoisePlate />,
    badge: 'Live',
  });
}
