import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'We scored 57 sites against a real design contract. None of them passed.',
  description: '57 websites scored against a 26-check deterministic design contract. 88% scored D or F. Zero scored a B.',
  path: '/blog/scoring-57-synthesis',
  ogTitle: 'We scored 57 sites against a real design contract. None of them passed.',
  ogDescription: '88% scored D or F. The B tier is empty. The transition from informal to contract-grade design is a cliff.',
});

export default function BlogPost() {
  redirect('https://dev.to/levaiinbey/we-scored-57-sites-against-a-real-design-contract-none-of-them-passed-1ff');
}