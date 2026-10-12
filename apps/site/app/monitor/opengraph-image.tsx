import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Monitor: design drift over time';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Monitor',
    title: 'Design drift over time',
    lede: 'Each run you start compares a URL with your earlier runs, kept in your browser. Optional email alert on regression.',
    path: 'designesy.org/monitor',
  });
}