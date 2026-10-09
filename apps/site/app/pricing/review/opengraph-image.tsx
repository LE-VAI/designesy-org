import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Review: find the barriers your shoppers hit';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Designesy Review',
    title: 'Find the barriers your shoppers hit',
    lede: 'A person reviews your store or app flow and hands you a prioritized fix list. $899 one-time, 5 business days.',
    path: 'designesy.org/pricing/review',
  });
}
