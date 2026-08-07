import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Accessibility Contract — WCAG 2.2 AA';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Accessibility contract',
    lede: 'WCAG 2.2 AA via axe-core 4.12.1. Brand customization, provenance chain, 11 verification checks.',
    path: 'designesy.org/contracts/a11y',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}