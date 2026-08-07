import { renderOgCard } from '../../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Tokens Contract — W3C DTCG 2025.10 conformance';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Contracts',
    title: 'Tokens contract',
    lede: 'Token-format conformance for W3C DTCG 2025.10. OKLCH mandatory, custom types via $extension.',
    path: 'designesy.org/contracts/tokens',
    kind: 'contract',
    badge: 'v0.1.0',
  });
}