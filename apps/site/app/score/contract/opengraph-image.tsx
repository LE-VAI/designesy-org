import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy: score a live page against your own design contract';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Your contract',
    title: 'Your contract, verified',
    lede: 'Score a live page against your own DESIGN.md or design tokens. Two numbers, never blended: fidelity to your contract, and the baseline every site is held to.',
    path: 'designesy.org/score/contract',
  });
}
