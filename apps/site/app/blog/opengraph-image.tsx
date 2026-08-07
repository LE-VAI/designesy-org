import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Blog — Design verification findings';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Blog',
    title: 'Design verification findings',
    lede: '57 sites scored against a 26-check deterministic design contract. 88% scored D or F.',
    path: 'designesy.org/blog',
    badge: 'Field reports',
  });
}