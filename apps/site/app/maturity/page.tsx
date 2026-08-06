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
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { MaturityAssessment } from './maturity-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Design Compliance Maturity',
  description:
    'Chart your design system across six compliance axes. A 24-question self-assessment — ~6 minutes — with a shareable radar result. Adapted from the zeroheight maturity model pattern, tuned to design contract compliance.',
  path: '/maturity',
  ogTitle: 'Design Compliance Maturity · Designesy',
  ogDescription:
    'Where does your design system land across six compliance axes? 24 questions, 6 minutes, shareable result.',
  twitterDescription: 'Design Compliance Maturity — designesy.org/maturity',
});

export default function MaturityPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Self-assessment</p>
          <h1 className="surface-title" data-scramble>Design Compliance Maturity</h1>
          <p className="surface-lede">
            Chart your design system across six independent compliance axes.
            24 questions. ~6 minutes. No survey, no vote — a structured
            self-assessment that maps directly to the same 40-check contract
            the leaderboard scores against.
          </p>
          <p className="surface-note">
            Adapted from the zeroheight maturity model pattern. Six axes, four
            stages each. Your result is computed in your browser and never
            sent anywhere.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <MaturityAssessment />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">How it works</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Each axis has 4 questions. Each answer maps to a stage (1–4).
            Your axis score is the average of its 4 questions, rounded to
            the nearest stage. The radar chart shows all six axes at once —
            most systems are Stage 4 on one axis and Stage 1 on another.
            That asymmetry is the finding.
          </p>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The six axes map to the 14 weighted categories in the Designesy
            v0.4.0 contract. After the self-assessment, the highest-leverage
            next step is almost always a deterministic score — run the same
            40-check engine against your live site and see where
            self-perception meets shipped reality.
          </p>
          <p className="surface-note">
            Scoring: 4 questions per axis, each scored 1–4. Axis score =
            average × 25 (0–100 scale). Stage 1 (0–25), Stage 2 (25–50),
            Stage 3 (50–75), Stage 4 (75–100). The overall score is the
            mean of all six axes — but the radar chart is the point, not
            the number.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}