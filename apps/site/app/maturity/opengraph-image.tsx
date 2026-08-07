import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Maturity — Six compliance axes';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Maturity',
    title: 'Six compliance axes',
    lede: 'Where does your design system land? 24 questions, 6 minutes, sharable scorecard.',
    path: 'designesy.org/maturity',
  });
}