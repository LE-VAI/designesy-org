import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Specs — The findings schema';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Specs',
    title: 'The findings schema',
    lede: 'The canonical review-findings schema — designesy, Google design.md, Lighthouse, and jakubkoczorowicz compatible.',
    path: 'designesy.org/specs',
  });
}