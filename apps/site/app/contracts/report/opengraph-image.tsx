import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Report Contract — The synthesis capstone';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Report contract',
    lede: 'The synthesis capstone — one URL, three engines, one composite grade. Score + drift + readiness.',
    path: 'designesy.org/contracts/report',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}