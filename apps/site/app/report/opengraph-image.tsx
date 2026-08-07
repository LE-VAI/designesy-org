import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Report — One URL, three engines';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Report',
    title: 'One URL, three engines',
    lede: 'Score + drift + readiness in a single composite report. One grade for design intelligence.',
    path: 'designesy.org/report',
  });
}