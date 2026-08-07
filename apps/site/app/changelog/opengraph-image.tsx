import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Changelog — Every contract change';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Changelog',
    title: 'Every contract change',
    lede: 'Design contract changes by dimension. Every version bump, every new check, every rule addition.',
    path: 'designesy.org/changelog',
  });
}