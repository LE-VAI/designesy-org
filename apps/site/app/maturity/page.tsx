// /maturity — Interactive Design Contract Compliance Maturity self-assessment.
//
// Adapts zeroheight's maturity model pattern (zeroheight.com/maturity):
// 6 independent axes, 4 stages each, interactive questionnaire, shareable
// visual result (radar chart). Functions as a lead-gen trust asset —
// completion produces a scored result and a CTA to "Verify your compliance
// with Designesy."
//
// Designesy's 6 axes (mapped to the actual contract categories):
//   1. Token Discipline       — tokens (9%) + spec (4%)
//   2. Motion Consistency     — motion (10%) + takt (8%)
//   3. Accessibility Readiness — accessibility (15%) + interaction (6%)
//   4. Platform Fit           — performance (6%) + responsive (3%) + poise (7%)
//   5. Identity & Copy        — identity (6%) + copywriting (8%) + security (5%)
//   6. Verification Maturity  — cadence (18%) + self-measurement
//
// 4 stages per axis: 01 Ad-hoc → 02 Emerging → 03 Systematic → 04 Verified
//
// All client-side — no API call, no data storage. Results are computed in
// the browser and can be shared via URL hash (base64-encoded answers).

import type { Metadata } from 'next';
import '../instrument.css';
import '../engine.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { MaturityAssessment } from './maturity-form';
import { AgentActions } from '../lib/agent-actions';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { EngineHead, EngineMethod, EngineNext } from '../lib/engine/engine-page';

// ISR — static content that revalidates hourly
export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Design Compliance Maturity',
  description:
    'Chart your design system across six compliance axes. A 24-question self-assessment (~6 minutes) with a shareable radar result. Adapted from the zeroheight maturity model pattern, tuned to design contract compliance.',
  path: '/maturity',
  ogTitle: 'Design Compliance Maturity · Designesy',
  ogDescription:
    'Where does your design system land across six compliance axes? 24 questions, 6 minutes, shareable result.',
  twitterDescription: 'Design Compliance Maturity · designesy.org/maturity',
});

export default function MaturityPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg" data-pagefind-meta="priority:high">
        <EngineHead
          route="/maturity"
          name="Design compliance maturity"
          thesis="Place your design system on six axes, four stages each, in 24 questions. Most systems reach stage four on one axis and stay at stage one on another; the matrix shows which."
          facts={['24 questions', 'about 6 minutes', 'computed in your browser']}
          contract={{ href: '/contracts/design-system', label: `mapped to ${CONTRACT_VERSION}` }}
        >
          <AgentActions mdPath="/maturity.md" label="the maturity assessment" />
        </EngineHead>

        <MaturityAssessment />

        <EngineMethod
          steps={[
            { title: 'Answer 24 questions', text: 'Four per axis, each answer a stage from 1, ad-hoc, to 4, verified.' },
            { title: 'Score each axis', text: 'The average answer times 25, so a full row of fours reads 100.' },
            { title: 'Read the matrix', text: 'Six axes side by side on one scale. The uneven rows are the finding.' },
            { title: 'Check it for real', text: `The ${ENGINE_CHECK_COUNT}-check engine measures the live site against the same ${CONTRACT_VERSION} contract.` },
          ]}
          formula={
            <>
              <span><b>axis</b> = average answer × 25</span>
              <span><b>overall</b> = mean of the answered axes</span>
              <span><b>stage</b> = the average answer, rounded to the nearest whole stage</span>
            </>
          }
        />

        <EngineNext
          items={[
            { title: 'Score the live site', desc: `The ${ENGINE_CHECK_COUNT}-check engine turns self-perception into a measured grade.`, route: '/score' },
            { title: 'Read the contract the axes map to', desc: `The ${CONTRACT_VERSION} design system contract and its 14 weighted categories.`, route: '/contracts/design-system' },
            { title: 'See where others land', desc: 'The public leaderboard, scored by the same engine and dated.', route: '/leaderboard' },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
