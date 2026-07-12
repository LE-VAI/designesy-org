import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Kits — Portable instruction packages';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Kits',
    title: 'Portable instruction packages',
    lede: 'Purpose, prompt, output format, and verification — for people and agents. Kit One · Design Review is live.',
    path: 'designesy.org/kits',
    kind: 'kit',
    badge: 'Kit One live',
  });
}
