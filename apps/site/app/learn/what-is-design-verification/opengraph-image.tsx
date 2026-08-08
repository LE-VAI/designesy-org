import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy — What is design verification?';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Learn',
    title: 'What is design verification?',
    lede: 'The automated evaluation of a live site against a published design system contract — defined and made runnable.',
    path: 'designesy.org/learn/what-is-design-verification',
    kind: 'docs',
  });
}