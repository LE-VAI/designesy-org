import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Compare — Diff two design systems';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Compare',
    title: 'Diff two design systems',
    lede: 'Tokens added, removed, renamed, value-changed — from live URLs, deterministically.',
    path: 'designesy.org/compare',
  });
}