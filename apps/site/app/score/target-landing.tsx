import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { ScoreForm } from './score-form';
import { AgentActions } from '../lib/agent-actions';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { CONTRACT_VERSION } from '../lib/design-system-contract';

// The snapshot each Proof row's case study records, for the row's side pane:
// the grade and score the engine returned, and the day it ran. Source: the
// case study page itself (app/work/lovable-dev/page.tsx: A, 93.2, captured
// 2026-07-25). A landing without an entry shows no side pane.
const CASE_SNAPSHOTS: Record<string, { grade: string; score: string; date: string }> = {
  lovable: { grade: 'A', score: '93.2', date: '2026-07-25' },
};

// The copy payload of THE OUTPUT card: its sentence, without the side key.
const OUTPUT_TEXT =
  "A letter grade, a per-check breakdown (pass, fail, needs work, does not apply), the tokens extracted from your site's :root, and a copyable receipt citing the contract version. No login. No backend. No data kept. The score is the artifact.";

/**
 * Shared shell for target-specific score landing pages
 * (/score/lovable, /score/v0, /score/bolt). Each landing page supplies
 * its own copy + example URL; this component keeps the layout consistent.
 *
 * The example URL is prefilled into ScoreForm via initialUrl — the visitor
 * can edit it to their own URL or just hit Score to run the engine against
 * the example. Either way the engine runs the same checks.
 */
export type TargetLandingProps = {
  /** Platform name, e.g. 'Lovable' */
  platform: string;
  /** URL slug under /score/, e.g. 'lovable' */
  slug: string;
  /** Eyebrow label */
  eyebrow: string;
  /** H1 headline */
  headline: string;
  /** Lede paragraph */
  lede: string;
  /** Body paragraph expanding the value prop */
  body: string;
  /** Example URL to prefill into the ScoreForm */
  exampleUrl: string;
  /** The score that exampleUrl got, if known (e.g. 'A · 93.2') */
  exampleScore?: string;
  /** Case study link for the proof section */
  caseStudyHref?: string;
  caseStudyTitle?: string;
  caseStudyMeta?: string;
};

export function TargetLanding({
  slug,
  platform,
  eyebrow,
  headline,
  lede,
  body,
  exampleUrl,
  exampleScore,
  caseStudyHref,
  caseStudyTitle,
  caseStudyMeta,
}: TargetLandingProps) {
  const snapshot = CASE_SNAPSHOTS[slug];
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>{eyebrow}</p>
          <h1 className="surface-title" data-scramble>{headline}</h1>
          <p className="surface-lede">{lede}</p>
          <p className="surface-note">{body}</p>
          {/* One insertion here covers every platform landing that uses
              TargetLanding (currently /score/bolt, /score/lovable, /score/v0).
              The AgentActions migration script could not place these itself --
              it looks for a surface-header section in each PAGE file, and these
              pages are thin wrappers around this shared component. */}
          <AgentActions mdPath={`/score/${slug}.md`} label={`the ${platform} score page`} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            {exampleScore ? (
              <>
                <strong>{platform}</strong> currently scores{' '}
                <strong>{exampleScore}</strong> on the contract. Score your own{' '}
                {platform} site below: the engine runs the same {ENGINE_CHECK_COUNT} checks
                against your URL.
              </>
            ) : (
              <>
                Score your <strong>{platform}</strong> site below: the engine
                runs the same {ENGINE_CHECK_COUNT} checks against your URL as it
                does against any other.
              </>
            )}
          </p>
          <ScoreForm initialUrl={exampleUrl} />
        </section>

        {caseStudyHref && caseStudyTitle && (
          <section className="doctrine-section fade-up fade-up-delay-2">
            <h2 className="doctrine-heading">Proof</h2>
            <div className="row-stack" role="list">
              <div role="listitem">
                <Link
                  href={caseStudyHref}
                  className="row"
                  data-cuelume-hover="bloom"
                  data-cuelume-press
                >
                  <span className="row-index">01</span>
                  <span className="row-body">
                    <span className="row-title">{caseStudyTitle}</span>
                    <span className="row-meta">{caseStudyMeta}</span>
                  </span>
                  {/* The side pane carries the snapshot the case study is
                      about (grade, score, date) and the route's arrow. */}
                  {snapshot && (
                    <span className="row-side">
                      <span className="row-side-line">
                        <span className="row-side-chip" data-state="pass">
                          {snapshot.grade} · {snapshot.score}
                        </span>
                      </span>
                      <span className="row-side-line">
                        Snapshot · <time dateTime={snapshot.date}>{snapshot.date}</time>
                      </span>
                      <span className="row-side-arrow" aria-hidden="true" />
                    </span>
                  )}
                </Link>
              </div>
            </div>
          </section>
        )}

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What you get</h2>
          {/* Face and side pane (globals.css .score-output): the paragraph in
              the 7-column face, under the result column above, and its key in
              the side pane. data-copy keeps the copy payload to the sentence. */}
          <div className="definition score-output" data-copy={OUTPUT_TEXT} data-copy-label="output summary">
            <div className="score-output-face">
              <p className="definition-label">The output</p>
              <p>
                A letter grade, a per-check breakdown (pass, fail, needs work, does not apply),
                the tokens extracted from your site&rsquo;s <code>:root</code>,
                and a copyable receipt citing the contract version. No login.
                No backend. No data kept. The score is the artifact.
              </p>
            </div>
            <dl className="score-output-side">
              <div>
                <dt>Grade</dt>
                <dd>A to F, with the percentage</dd>
              </div>
              <div>
                <dt>Checks</dt>
                <dd>{ENGINE_CHECK_COUNT}, each pass, fail, needs work or does not apply</dd>
              </div>
              <div>
                <dt>Receipt</dt>
                <dd>Cites contract {CONTRACT_VERSION}</dd>
              </div>
              <div>
                <dt>Data kept</dt>
                <dd>None</dd>
              </div>
            </dl>
          </div>
          <p className="surface-note">
            The contract the engine runs against is public at{' '}
            <Link href="/contracts/design-system" className="text-link">
              /contracts/design-system
            </Link>
            . The category it defines is explained at{' '}
            <Link href="/learn/what-is-design-verification" className="text-link">
              /learn/what-is-design-verification
            </Link>
            .
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}