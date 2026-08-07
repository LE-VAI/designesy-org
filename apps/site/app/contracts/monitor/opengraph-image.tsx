import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Monitor Contract — Continuous design-drift monitoring';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Monitor contract',
    lede: 'Continuous design-drift monitoring with email alerts — score deltas, trend slopes, new violations.',
    path: 'designesy.org/contracts/monitor',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}