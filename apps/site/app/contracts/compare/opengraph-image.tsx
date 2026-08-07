import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Compare Contract — Cross-site token diff';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Compare contract',
    lede: 'Diff two design systems from live URLs — tokens added, removed, renamed, value-changed.',
    path: 'designesy.org/contracts/compare',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}