import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Privacy — Trust surface for the public site';

export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Privacy',
    title: 'Trust as infrastructure',
    lede: 'What this surface collects, what it does not, and how open design packages stay fetchable without turning visitors into product.',
    path: 'designesy.org/privacy',
    kind: 'docs',
  });
}