import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy design system contract v0.1.1';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts · Design system',
    title: 'Design system contract',
    lede: 'Portable design judgment for designesy.org — Poise interaction rules adopted in v0.1.1.',
    path: 'designesy.org/contracts/design-system',
    kind: 'contract',
    badge: 'v0.1.1',
  });
}
