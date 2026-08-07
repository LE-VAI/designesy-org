import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Guardrails Contract — Frozen build contracts for agents';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Guardrails contract',
    lede: 'Emit a frozen build contract for AI coding agents — tokens, lint config, agent rules, DESIGN.md.',
    path: 'designesy.org/contracts/guardrails',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}