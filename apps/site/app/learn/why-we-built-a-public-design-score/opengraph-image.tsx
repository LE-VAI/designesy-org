import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy — Why we built a public design score';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Learn',
    title: 'Why a public design score',
    lede: 'A score is a contract you can run. Making it public forces honesty — the same checks score ours as yours.',
    path: 'designesy.org/learn/why-we-built-a-public-design-score',
    kind: 'docs',
  });
}