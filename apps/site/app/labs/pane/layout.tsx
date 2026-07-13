import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Pane',
  description:
    'True glass for institutional surfaces — bend, not fog. Progressive glass: solid, frost, and optics-based refraction.',
  path: '/labs/pane',
  ogTitle: 'Pane · Lab Three',
  ogDescription:
    'True glass for institutional surfaces. Progressive tiers: solid, frost, refract.',
  twitterDescription: 'Progressive true glass lab — designesy.org/labs/pane',
});

export default function PaneLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
