import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Leaderboard — 30 sites scored';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Leaderboard',
    title: '30 sites scored',
    lede: 'Scored by the same deterministic 42-check engine. Designesy is the only A-grade site.',
    path: 'designesy.org/leaderboard',
  });
}