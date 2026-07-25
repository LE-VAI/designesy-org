import { renderOgCard } from './lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy — Design intelligence infrastructure';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Designesy',
    title: 'Design intelligence infrastructure',
    lede: 'Sources into principles. Principles into contracts. Contracts into tools. Tools into better designed work.',
    path: 'designesy.org',
    kind: 'default',
  });
}
