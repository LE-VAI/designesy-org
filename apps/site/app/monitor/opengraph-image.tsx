import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Monitor — Continuous drift monitoring';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Monitor',
    title: 'Continuous drift monitoring',
    lede: 'Re-scores on a cadence, stores snapshots, compares deltas, sends email alerts on regression.',
    path: 'designesy.org/monitor',
  });
}