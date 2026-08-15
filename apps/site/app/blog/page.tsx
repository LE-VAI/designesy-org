import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Blog — Design verification findings',
  description: 'Field reports from scoring the web against a real design contract. 57 sites scored, 88% failed.',
  path: '/blog',
  ogTitle: 'Designesy Blog — Design verification findings',
  ogDescription: '57 sites scored against a 40-check deterministic design contract. 88% scored D or F.',
});

export default function BlogIndex() {
  redirect('https://dev.to/levainbey');
}