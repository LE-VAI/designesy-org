import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Frameworks — Every scored site';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Frameworks',
    title: 'Every scored site',
    lede: '30 sites scored against a 40-check design contract. Each has a dedicated evaluation.',
    path: 'designesy.org/frameworks',
  });
}