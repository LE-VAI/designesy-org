import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'We scored 30 real websites against a 40-check design contract',
  description: '60% scored D or F. Zero scored a B. The gap between "looks good" and "passes a deterministic design contract" is enormous.',
  path: '/blog/scoring-30-sites',
  ogTitle: 'We scored 30 real websites against a 40-check design contract',
  ogDescription: '60% scored D or F. Zero scored a B. One site scored A — the publisher.',
});

export default function BlogPost() {
  redirect('https://dev.to/levainbey/we-scored-30-real-websites-against-a-40-check-design-contract-heres-what-we-found-2hf4');
}