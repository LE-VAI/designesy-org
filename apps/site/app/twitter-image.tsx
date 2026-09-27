import { ENGINE_CHECK_COUNT } from './lib/check-definitions';
import { renderOgCard } from './lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy: AI makes execution free. We make execution provable.';

// Mirrors the root share card (opengraph-image.tsx) so a link previews the same
// claim on every network. It previously carried the retired tagline "Design
// intelligence infrastructure".
export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'The design standard, verified live',
    title: 'AI makes execution free. We make execution provable.',
    lede: `Verify any site against a real design contract. ${ENGINE_CHECK_COUNT} checks. One grade.`,
    path: 'designesy.org',
    kind: 'default',
  });
}
