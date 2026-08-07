import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Pricing — Open core, free forever';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Pricing',
    title: 'Open core, free forever',
    lede: 'Score Pass for volume. Continuity for work that continues. Priced for teams that ship.',
    path: 'designesy.org/pricing',
  });
}