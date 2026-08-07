import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Score Report — Full verification report';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Score Report',
    title: 'Full verification report',
    lede: '40 deterministic checks against the Designesy design system contract.',
    path: 'designesy.org/score/report',
  });
}