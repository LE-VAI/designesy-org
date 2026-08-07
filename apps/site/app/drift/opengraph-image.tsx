import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Drift — Detect AI-generated UI drift';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Drift',
    title: 'Detect AI-generated UI drift',
    lede: '12 deterministic checks against compiled CSS — token fabrication, value variance, off-contract values.',
    path: 'designesy.org/drift',
  });
}