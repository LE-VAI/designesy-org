import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'designesy.org public surface review';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Review · Public surface',
    title: 'designesy.org',
    lede: 'A public field check against design system contract v0.1.3 — holds, tensions, and standing rules.',
    path: 'designesy.org/review/designesy-org',
    kind: 'review',
    badge: 'Published',
  });
}
