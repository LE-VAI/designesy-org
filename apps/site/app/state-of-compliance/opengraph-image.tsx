import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy State of Compliance — 30 sites, 40 checks, 1 A-grade';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'State of Compliance',
    title: '30 sites, 40 checks, 1 A-grade',
    lede: 'The first deterministic report on design-system contract compliance across the web.',
    path: 'designesy.org/state-of-compliance',
  });
}