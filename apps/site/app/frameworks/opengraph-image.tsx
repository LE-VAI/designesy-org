import { renderOgCard } from '../lib/og-card';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Frameworks — Every scored site';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Frameworks',
    title: 'Every scored site',
    lede: `30 sites scored against a ${ENGINE_CHECK_COUNT}-check design contract. Each has a dedicated evaluation.`,
    path: 'designesy.org/frameworks',
  });
}