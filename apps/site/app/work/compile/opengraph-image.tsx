import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Work — Compile case study';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Work',
    title: 'Compile',
    lede: 'A principle compiled into tokens, a test, and a checklist. Built, verified, pending hosting.',
    path: 'designesy.org/work/compile',
    kind: 'review',
    badge: 'case study',
  });
}