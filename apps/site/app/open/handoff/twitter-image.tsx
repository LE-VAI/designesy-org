import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Open handoff pack';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Open · Handoff',
    title: 'Share open design intelligence',
    lede: 'Human index, machine feed, agent prompt, and first public thread copy pointing at /open.',
    path: 'designesy.org/open/handoff',
    kind: 'docs',
  });
}