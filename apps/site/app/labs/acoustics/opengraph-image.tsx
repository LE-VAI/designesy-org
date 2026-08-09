import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Acoustics — Lab Four';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs',
    title: 'Acoustics — Lab Four',
    lede: 'Interaction sound as a token system. Nineteen cues, nineteen roles, Cuelume v0.2.2.',
    path: 'designesy.org/labs/acoustics',
    kind: 'lab',
    badge: 'Lab Four',
  });
}