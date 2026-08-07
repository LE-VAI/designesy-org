import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Review — Takt field check';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Review',
    title: 'Takt field check',
    lede: 'Lab Two reviewed with Use Kit One · Design Review. Pass with notes — takt rules adopted.',
    path: 'designesy.org/review/takt',
    kind: 'review',
    badge: 'Pass with notes',
  });
}