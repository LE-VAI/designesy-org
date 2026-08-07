import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'The fintech sites that handle your money can\'t pass a design contract',
  description: 'We scored 11 fintech sites against a 26-check design contract. Every one failed. The best score was a D.',
  path: '/blog/scoring-11-fintech',
  ogTitle: 'The fintech sites that handle your money can\'t pass a design contract',
  ogDescription: '11 fintech sites scored. All failed. Klarna button contrast 1.00:1. Robinhood 39.1/F.',
});

export default function BlogPost() {
  redirect('https://dev.to/levaiinbey/the-fintech-sites-that-handle-your-money-cant-pass-a-design-contract-klf');
}