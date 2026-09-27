import { ENGINE_CHECK_COUNT } from './lib/check-definitions';
import { renderOgCard } from './lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy — AI makes execution free. We make execution yours.';

// Same claim as the homepage hero (app/page.tsx HERO_HEADLINE) so a shared link
// and the page it opens say the same thing.
export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'The compliance layer for AI-generated UI',
    title: 'AI makes execution free. We make execution yours.',
    lede: `Verify any site against a real design contract. ${ENGINE_CHECK_COUNT} checks. One grade.`,
    path: 'designesy.org',
    kind: 'default',
  });
}
