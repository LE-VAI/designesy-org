import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Review — Cadence field check';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Review',
    title: 'Cadence field check',
    lede: 'Lab Three reviewed with Use Kit One · Design Review. Pass with notes — typography rules adopted.',
    path: 'designesy.org/review/cadence',
    kind: 'review',
    badge: 'Pass with notes',
  });
}