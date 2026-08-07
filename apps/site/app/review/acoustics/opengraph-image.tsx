import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Review — Acoustics field check';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Review',
    title: 'Acoustics field check',
    lede: 'Lab Four reviewed with Use Kit One · Design Review. Pass with notes — acoustic rules adopted.',
    path: 'designesy.org/review/acoustics',
    kind: 'review',
    badge: 'Pass with notes',
  });
}