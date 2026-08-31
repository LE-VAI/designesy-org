import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Methodology — How the engine scores';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Methodology',
    title: 'How the engine scores',
    lede: 'The 42-check scoring methodology — weights, math, grade bands, and the accessibility floor.',
    path: 'designesy.org/methodology',
  });
}