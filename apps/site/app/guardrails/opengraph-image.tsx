import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Guardrails — Frozen build contracts for agents';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Guardrails',
    title: 'Frozen build contracts for agents',
    lede: 'Turn your design system into the file AI agents read and the lint that enforces it.',
    path: 'designesy.org/guardrails',
  });
}