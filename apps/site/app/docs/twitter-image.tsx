import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Docs — Mission, principles, architecture';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Docs',
    title: 'Orientation for a live system',
    lede: 'Mission, nine operating principles, architecture layers, and public voice — with paths to live engines.',
    path: 'designesy.org/docs',
    kind: 'docs',
  });
}
