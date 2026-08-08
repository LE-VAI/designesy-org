import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy — Design verification vs linting vs visual regression';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Learn',
    title: 'Verification vs linting vs regression',
    lede: 'Three adjacent practices, three different questions. Token drift, baseline diffing, and contract conformance.',
    path: 'designesy.org/learn/design-verification-vs-linting-vs-visual-regression',
    kind: 'docs',
  });
}