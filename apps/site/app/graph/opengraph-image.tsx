import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Graph — Provenance chain';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Graph',
    title: 'Provenance chain',
    lede: 'The living knowledge tree: how sources become shipped work through the Designesy pipeline.',
    path: 'designesy.org/graph',
  });
}