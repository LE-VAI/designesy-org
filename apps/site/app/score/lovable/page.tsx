import type { Metadata } from 'next';
import { pageMeta } from '../../lib/site-meta';
import { TargetLanding } from '../target-landing';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Score your Lovable site',
  description:
    'Score any Lovable-built site against the Designesy design system contract. 42 checks, one grade, no login.',
  path: '/score/lovable',
  ogTitle: 'Score your Lovable site · Designesy',
  ogDescription:
    '42 automated verification checks against a real design contract. Built on Lovable? Score your site.',
  twitterDescription: 'Score your Lovable site — designesy.org/score/lovable',
});

export default function ScoreLovablePage() {
  return (
    <TargetLanding
      platform="Lovable"
      slug="lovable"
      eyebrow="Score · Lovable"
      headline="Score your Lovable site"
      lede="42 checks. One grade. Built on Lovable? See how close you are to a published design contract."
      body="Lovable ships good defaults. The Designesy engine runs the same 42 checks against any Lovable-built URL and returns an honest grade — pass, fail, warn, or skip — against tokens, motion, typography, accessibility, and identity rules. The example below is prefilled with lovable.dev — score it live to see where it stands today."
      exampleUrl="lovable.dev"
      caseStudyHref="/work/lovable-dev"
      caseStudyTitle="lovable.dev · A on arrival"
      caseStudyMeta="Case study — a snapshot score with full per-check breakdown"
    />
  );
}