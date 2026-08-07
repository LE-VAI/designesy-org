import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Score — Score your Lovable site';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Score',
    title: 'Score your Lovable site',
    lede: '40 checks against a real design contract. Built on Lovable? Score your site.',
    path: 'designesy.org/score/lovable',
  });
}