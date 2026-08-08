import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Learn — design verification reference';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Learn',
    title: 'Design verification reference',
    lede: 'What design verification is, how it differs from linting and visual regression, and why a public design score matters.',
    path: 'designesy.org/learn',
    kind: 'docs',
  });
}