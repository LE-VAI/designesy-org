import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy design system contract v0.4.0';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Contracts · Design system',
    title: 'Design system contract',
    lede: 'Portable design judgment for designesy.org — Poise, Takt, Cadence, and Copywriting rules adopted through v0.4.0.',
    path: 'designesy.org/contracts/design-system',
    kind: 'contract',
    badge: 'v0.4.0',
  });
}
