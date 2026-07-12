import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Poise field check · Designesy Review';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Review · Field check',
    title: 'Poise',
    lede: 'Lab One reviewed with Use Kit One · Design Review. Pass with notes — interaction rules adopted in contract v0.1.1.',
    path: 'designesy.org/review/poise',
    kind: 'review',
    badge: 'Pass with notes',
  });
}
