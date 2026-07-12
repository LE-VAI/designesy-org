import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Contracts — Portable design agreements';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Portable design agreements',
    lede: 'Exact values, roles, behavior, anti-patterns, and verification — judgment agents and teams can carry.',
    path: 'designesy.org/contracts',
    kind: 'contract',
    badge: 'v0.1.1',
  });
}
