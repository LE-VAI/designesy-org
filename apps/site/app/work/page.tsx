import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { CASE_STUDIES, type CaseStudy } from '../lib/case-studies';
import { AgentActions } from '../lib/agent-actions';
import '../instrument.css';
import './work.css';

export const metadata: Metadata = pageMeta({
  title: 'Work: case studies',
  description:
    'Shipped artifacts and before/after scores reviewed against the design system contract. Outcome evidence: the Sources to Artifacts chain applied to real work, including the publisher scoring itself.',
  path: '/work',
  ogTitle: 'Work · Designesy',
  ogDescription:
    'Case studies: shipped artifacts and before/after scores reviewed against the design system contract. Sources into principles, principles into contracts, contracts into tools, tools into better designed work.',
  twitterDescription: 'Case studies · designesy.org/work',
});

/* The side pane of each index row (work.css, "Work index"): a lamp for the
   study's state, its status, a grade chip and a mono readout. Everything is
   read from the case-study record; nothing here is a new number. */

/** The lamp states the status beside it: verified by the engine, live, or
    built and not yet hosted. The review verdict is the chip's to state. */
function lampFor(cs: CaseStudy): 'pass' | 'live' | 'pending' {
  if (cs.status === 'Verified · public') return 'pass';
  if (cs.status === 'Shipped · live') return 'live';
  return 'pending';
}

/** The chip's tone: a scored A or a passing review reads pass; a revision, warn. */
function toneFor(cs: CaseStudy): 'pass' | 'warn' | 'neutral' {
  if (cs.badge === 'Needs revision') return 'warn';
  if (cs.gradeBefore != null || /^pass/i.test(cs.badge)) return 'pass';
  return 'neutral';
}

/** The readout: the score move where one was measured, else the study's metric. */
function readoutFor(cs: CaseStudy): string {
  if (cs.beforeScore != null && cs.afterScore != null) {
    const delta = (cs.afterScore - cs.beforeScore).toFixed(1);
    return `${cs.gradeBefore} ${cs.beforeScore} → ${cs.gradeAfter} ${cs.afterScore} · +${delta}`;
  }
  return cs.metrics;
}

export default function WorkPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Work</p>
          <h1 className="surface-title" data-scramble>Case studies</h1>
          <p className="surface-lede">
            Shipped artifacts and before/after scores reviewed against the
            contract.
          </p>
          <p className="surface-note">
            The pipeline promises to turn tools into better designed work. These
            are the artifacts: real tools, real publication, real engagement,
            reviewed with Use Kit One. The review format is the same
            eight-dimension method used on Labs and the public surface itself.
            Before/after scores are real values from the live /api/score
            endpoint, captured on the date each case study lists.
          </p>
          <AgentActions mdPath="/work.md" label="the work index" />
        </section>

        <section className="doctrine-section fade-up">
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each case study follows the field-check anatomy: summary, inputs,
            eight dimension findings (observation, judgment, action),
            verification, corrections, and sources. Before/after case
            studies add a score-delta table showing which checks moved and
            why. Outcomes include what did not work.
          </p>
          {/* The side pane's text spans carry "work-row-meta" in their class:
              the markdown twin (scripts/generate-markdown.js) reads each
              row's row-title and row-meta spans, so the status, grade and
              readout stay in /work.md now that they left the meta line. */}
          <div className="row-stack work-index" role="list">
            {CASE_STUDIES.map((cs, i) => (
              <div role="listitem" key={cs.slug}>
                <Link
                  href={`/work/${cs.slug}`}
                  className="row work-row"
                  data-cuelume-hover="bloom"
                  data-cuelume-press
                >
                  <span className="row-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="row-body">
                    <span className="row-title">{cs.title}</span>
                    <span className="row-meta">{cs.lede}</span>
                  </span>
                  <span className="work-row-side">
                    <span className="cs-led" data-lamp={lampFor(cs)} aria-hidden="true" />
                    <span className="work-row-meta work-row-status">{cs.status}</span>
                    <span className="work-row-meta work-row-grade" data-tone={toneFor(cs)}>
                      {cs.badge}
                    </span>
                    <span className="work-row-meta work-row-readout">{readoutFor(cs)}</span>
                  </span>
                </Link>
              </div>
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
              studies are the evidence for that last step: shipped artifacts,
              reviewed against the contract, with engagement metrics and
              documented outcomes. The before/after pattern is newer: it
              scores a real URL, fixes the gaps, and scores again on the same
              engine, with the same thresholds, as every other site.
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