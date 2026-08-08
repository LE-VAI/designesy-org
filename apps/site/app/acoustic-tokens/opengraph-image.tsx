import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Acoustic tokens — the sound parallel to visual tokens';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Tokens',
    title: 'Acoustic tokens',
    lede: 'The sound parallel to the visual token system. Net-new relative to the W3C Design Tokens Format Module.',
    path: 'designesy.org/acoustic-tokens',
    kind: 'lab',
  });
}