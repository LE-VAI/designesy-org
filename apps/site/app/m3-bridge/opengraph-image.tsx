import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy M3 Bridge — Material 3 to W3C DTCG converter';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Tools',
    title: 'M3 → DTCG Bridge',
    lede: 'Convert Material 3 design tokens to W3C DTCG 2025.10 format. M3 DSP export was archived 2024 — this bridge fills the gap.',
    path: 'designesy.org/m3-bridge',
    kind: 'kit',
  });
}