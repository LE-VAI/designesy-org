import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'The fintech sites that handle your money can\'t pass a design contract';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog',
    title: 'Fintech can\'t pass',
    lede: '11 fintech sites scored. All failed. Klarna button contrast 1.00:1. Robinhood 39.1/F.',
    path: 'designesy.org/blog/scoring-11-fintech',
    badge: 'Article',
  });
}