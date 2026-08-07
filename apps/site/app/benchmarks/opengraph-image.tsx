import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Benchmarks — vs hallmark vs slop-eval';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Benchmarks',
    title: 'Designesy vs hallmark vs slop-eval',
    lede: 'Three tools, three questions: hallmark prevents slop, slop-eval scores slop, designesy verifies contracts.',
    path: 'designesy.org/benchmarks',
  });
}