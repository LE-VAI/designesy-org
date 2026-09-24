import { renderOgCard } from '../lib/og-card';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Leaderboard — 30 sites scored';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Leaderboard',
    title: '30 sites scored',
    lede: `Scored by the same deterministic ${ENGINE_CHECK_COUNT}-check engine. Designesy is the only A-grade site.`,
    path: 'designesy.org/leaderboard',
  });
}