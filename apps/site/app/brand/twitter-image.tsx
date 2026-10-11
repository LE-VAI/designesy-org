import { renderOgCard } from '../lib/og-card';
import { designSystemContract } from '../lib/design-system-contract';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Brand: the flame is Azure, inverted';

const AZURE = designSystemContract.colors.signal.value.toUpperCase();
const FLAME = designSystemContract.colors.activation.value.toUpperCase();

// The page leaves the endorsement line off (D71), so its card does too.
export default function TwitterImage() {
  return renderOgCard({
    eyebrow: 'Brand',
    title: 'The flame is Azure, inverted.',
    lede: `Designesy's blue is ${AZURE}. Invert it, the way Ctrl+I inverts a screen, and you get ${FLAME}.`,
    path: 'designesy.org/brand',
    kind: 'kit',
    endorsement: false,
  });
}
