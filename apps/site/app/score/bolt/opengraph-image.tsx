import { renderOgCard } from '../../lib/og-card';
import { ENGINE_CHECK_COUNT } from '../../lib/check-definitions';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Score — Score your Bolt site';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Score',
    title: 'Score your Bolt site',
    lede: `${ENGINE_CHECK_COUNT} checks against a real design contract. Built on Bolt? Score your site.`,
    path: 'designesy.org/score/bolt',
  });
}