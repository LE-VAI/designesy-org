import { renderOgCard } from '../lib/og-card';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Methodology — How the engine scores';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Methodology',
    title: 'How the engine scores',
    lede: `The ${ENGINE_CHECK_COUNT}-check scoring methodology — weights, math, grade bands, and the accessibility floor.`,
    path: 'designesy.org/methodology',
  });
}