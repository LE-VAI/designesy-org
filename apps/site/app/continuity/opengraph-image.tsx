import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Continuity — Judgment that stays current';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Continuity',
    title: 'Judgment that stays current',
    lede: 'Score, contract, verify, and keep current. History, delta, and trend for every URL.',
    path: 'designesy.org/continuity',
  });
}