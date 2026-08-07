import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'We scored 16 more sites. The dev tools are worse than the design awards.',
  description: '56% of dev-tool sites scored F. Zero reached C. The dev tools are worse than the design awards.',
  path: '/blog/scoring-16-devtools',
  ogTitle: 'We scored 16 more sites. The dev tools are worse than the design awards.',
  ogDescription: '56% of dev-tool sites scored F. The highest score was 64.6/D. Zero reached C.',
});

export default function BlogPost() {
  redirect('https://dev.to/levaiinbey/we-scored-16-more-sites-the-dev-tools-are-worse-than-the-design-awards');
}