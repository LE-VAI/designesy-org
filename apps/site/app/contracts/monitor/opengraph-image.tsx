import { renderOgCard } from '../../lib/og-card';
import { monitorContract } from '../../lib/monitor-contract';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Monitor Contract: design drift over time';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Monitor contract',
    lede: 'Each call compares a URL with the history you pass in: score deltas, trend slopes, new violations.',
    path: 'designesy.org/contracts/monitor',
    kind: 'contract',
    badge: `v${monitorContract.version}`,
  });
}