import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';
import { TargetLanding } from '../target-landing';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Score your Bolt site',
  description:
    'Score any Bolt-built site against the Designesy design system contract. 42 checks, one grade, no login.',
  path: '/score/bolt',
  ogTitle: 'Score your Bolt site · Designesy',
  ogDescription:
    '42 automated verification checks against a real design contract. Built on Bolt? Score your site.',
  twitterDescription: 'Score your Bolt site — designesy.org/score/bolt',
});

export default function ScoreBoltPage() {
  return (
    <TargetLanding
      platform="Bolt"
      slug="bolt"
      eyebrow="Score · Bolt"
      headline="Score your Bolt site"
      lede="42 checks. One grade. Built on Bolt? See how close you are to a published design contract."
      body="Bolt ships full-stack apps from prompts. The Designesy engine runs the same 42 checks against any Bolt-built URL and returns an honest grade — pass, fail, warn, or skip — against tokens, motion, typography, accessibility, and identity rules. The example below is prefilled with bolt.new — score it live to see where it stands today."
      exampleUrl="bolt.new"
    />
  );
}