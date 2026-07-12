import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Labs — Experiments that compile into contracts';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs',
    title: 'Experiments that compile into contracts',
    lede: 'A workbench where a thesis becomes a live artifact, review checklist, and portable rules.',
    path: 'designesy.org/labs',
    kind: 'lab',
    badge: 'Poise live',
  });
}
