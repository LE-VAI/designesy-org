import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { CASE_STUDIES, type CaseStudy } from '../lib/case-studies';

export const metadata: Metadata = pageMeta({
  title: 'Work — case studies',
  description:
    'Shipped artifacts and before/after scores reviewed against the design system contract. Outcome evidence: the Sources to Artifacts chain applied to real work, including the publisher scoring itself.',
  path: '/work',
  ogTitle: 'Work · Designesy',
  ogDescription:
    'Case studies — shipped artifacts and before/after scores reviewed against the design system contract. Sources into principles, principles into contracts, contracts into tools, tools into better designed work.',
  twitterDescription: 'Case studies — designesy.org/work',
});

function scoreLine(cs: CaseStudy): string {
  if (cs.beforeScore != null && cs.afterScore != null) {
    return `${cs.gradeBefore} ${cs.beforeScore} → ${cs.gradeAfter} ${cs.afterScore}`;
  }
  if (cs.beforeScore != null) {
    return `${cs.gradeBefore} ${cs.beforeScore}`;
  }
  return cs.metrics;
}

export default function WorkPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Work</p>
          <h1 className="surface-title" data-scramble>Case studies</h1>
          <p className="surface-lede">
            Shipped artifacts and before/after scores reviewed against the
            contract.
          </p>
          <p className="surface-note">
            The pipeline promises tools into better designed work. These are
            the artifacts — real tools, real publication, real engagement,
            reviewed with Use Kit One. The review format is the same
            eight-dimension method used on Labs and the public surface itself.
            Before/after scores are real values from the live /api/score
            endpoint, captured on the date each case study lists.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each case study follows the field-check anatomy: summary, inputs,
            eight dimension findings (observation, judgment, action),
            verification, corrections, and sources. Before/after case
            studies add a score-delta table showing which checks moved and
            why. Outcomes include what did not work.
          </p>
          <div className="row-stack" role="list">
            {CASE_STUDIES.map((cs, i) => (
              <Link
                key={cs.slug}
                href={`/work/${cs.slug}`}
                className="row"
                role="listitem"
                data-cuelume-hover="whisper"
                data-cuelume-press
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{cs.title}</span>
                  <span className="row-meta">
                    {cs.lede} · {cs.status} · {scoreLine(cs)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="what-this-is">
          <h2 className="doctrine-heading">What this is</h2>
          <div className="definition">
            <p className="definition-label">Outcome evidence</p>
            <p>
              Sources become principles. Principles become contracts. Contracts
              become tools. Tools become better designed work. These case
              studies are the evidence for that last step — shipped artifacts,
              reviewed against the contract, with engagement metrics and
              documented outcomes. The before/after pattern is newer: it
              scores a real URL, fixes the gaps, and scores again — on the
              same engine, with the same thresholds, as every other site.
            </p>
          </div>
        </section>

        <div className="status-note">
          Case studies publish when an artifact is shipped and reviewed, or
          when a real URL has a real score. Empty slots are not advertised as
          upcoming work.
        </div>
      </main>

      <Footer />
    </>
  );
}