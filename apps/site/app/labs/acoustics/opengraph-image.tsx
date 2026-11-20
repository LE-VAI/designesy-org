import { renderOgCard } from '../../lib/og-card';
import { CuesPlate } from '../../lib/og-lab-plates';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Acoustics: Lab Four';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Labs · Lab Four',
    title: 'Acoustics',
    lede: 'Interaction sound as a token system. Nineteen cues, nineteen roles, Cuelume v0.2.2.',
    path: 'designesy.org/labs/acoustics',
    kind: 'lab',
    art: <CuesPlate />,
    badge: 'Live',
  });
}