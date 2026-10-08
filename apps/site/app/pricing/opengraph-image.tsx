import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Pricing: Open core, free forever';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Pricing',
    title: 'Open core, free forever',
    lede: 'Free forever, CI gate included. Continuity at $29 a month for 5 sites. Enterprise for private, on-prem scoring.',
    path: 'designesy.org/pricing',
  });
}