import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Motion Contract — Lottie v1.0.1 validation';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Motion contract',
    lede: 'Lottie v1.0.1 JSON Schema validation + Designesy §16 block-on-sight list. Reduced-motion markers.',
    path: 'designesy.org/contracts/motion',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}