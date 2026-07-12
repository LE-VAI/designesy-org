import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '../lib/og-card';

export const alt = 'Designesy Open design intelligence';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Open · Design intelligence',
    title: 'Open design intelligence',
    lede: 'Portable contracts, kits, labs, and field checks — human index and machine feed.',
    path: 'designesy.org/open',
    kind: 'docs',
    badge: 'v0.1',
  });
}
