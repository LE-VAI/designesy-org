import { renderOgCard } from '../../lib/og-card';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `Designesy design system contract ${CONTRACT_VERSION}`;

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts · Design system',
    title: 'Design system contract',
    lede: `Portable design judgment for designesy.org — Poise, Takt, Cadence, Acoustics, and Copywriting rules adopted through ${CONTRACT_VERSION}.`,
    path: 'designesy.org/contracts/design-system',
    kind: 'contract',
    badge: CONTRACT_VERSION,
  });
}
