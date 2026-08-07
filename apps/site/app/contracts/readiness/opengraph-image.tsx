import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy AI Readiness Contract — Machine-readable design systems';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'AI Readiness contract',
    lede: 'Score design-system AI readiness — 10 checks for machine-readable tokens, agent rules, DESIGN.md.',
    path: 'designesy.org/contracts/readiness',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}