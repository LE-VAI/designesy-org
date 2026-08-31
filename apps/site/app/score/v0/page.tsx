import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';
import { TargetLanding } from '../target-landing';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Score your v0 site',
  description:
    'Score any v0-built site against the Designesy design system contract. 42 checks, one grade, no login.',
  path: '/score/v0',
  ogTitle: 'Score your v0 site · Designesy',
  ogDescription:
    '42 automated verification checks against a real design contract. Built on v0? Score your site.',
  twitterDescription: 'Score your v0 site — designesy.org/score/v0',
});

export default function ScoreV0Page() {
  return (
    <TargetLanding
      platform="v0"
      slug="v0"
      eyebrow="Score · v0"
      headline="Score your v0 site"
      lede="42 checks. One grade. Built on v0? See how close you are to a published design contract."
      body="v0 generates production React. The Designesy engine runs the same 42 checks against any v0-built URL and returns an honest grade — pass, fail, warn, or skip — against tokens, motion, typography, accessibility, and identity rules. The example below is prefilled with v0.dev — score it live to see where it stands today."
      exampleUrl="v0.dev"
    />
  );
}