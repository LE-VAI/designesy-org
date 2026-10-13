import { renderOgCard } from '../../lib/og-card';
import { driftContract } from '../../lib/drift-contract';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Drift Contract: AI-generated UI drift detection';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Drift contract',
    lede: 'Detect AI-generated UI drift: 12 checks for token fabrication, value variance, off-contract values.',
    path: 'designesy.org/contracts/drift',
    kind: 'contract',
    badge: `v${driftContract.version}`,
  });
}