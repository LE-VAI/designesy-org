import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { ScoreForm } from './score-form';
import { AgentActions } from '../lib/agent-actions';
import { ENGINE_CHECK_COUNT } from '../lib/check-definitions';
import { CONTRACT_VERSION } from '../lib/design-system-contract';

// The landings show no other site's grade: the Proof pane that carried a
// third-party case study's snapshot is removed with the public leaderboard
// (decided 2026-10-23). The form scores whatever URL the visitor enters.

// The copy payload of THE OUTPUT card: its sentence, without the side key.
//
// What is kept, from the code: /api/score caches each result by URL and scope
// for 24 hours (SCORE_TTL_SECONDS, unstable_cache, keyed per deploy); the
// engine counts calls per day and per client with no URL or address, and those
// counts expire after 400 days (lib/usage.ts, USAGE_TTL_DAYS); the form keeps
// the visitor's last five scores in their own browser (lib/score-history.ts).
// This card used to say "No backend. No data kept."
const OUTPUT_TEXT =
  "A letter grade, a per-check breakdown (pass, fail, needs work, does not apply), the tokens extracted from your site's :root, and a copyable receipt citing the contract version. No login. The server serves each result from a cache for 24 hours before it scores that URL again, and it counts calls per day, with no URL or address, keeping those counts for 400 days. Your last five scores stay in this browser. The score is the artifact.";

/**
 * Shared shell for target-specific score landing pages
 * (/score/lovable, /score/v0, /score/bolt). Each landing page supplies
 * its own copy + example URL; this component keeps the layout consistent.
 *
 * The example URL only fills the ScoreForm field (prefillUrl): nothing runs
 * until the visitor presses Score, on the example or on their own URL. A
 * landing with no example leaves the field empty.
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
  /** Example URL to prefill into the ScoreForm (not scored until the visitor asks) */
  exampleUrl?: string;
};

export function TargetLanding({
  slug,
  platform,
  eyebrow,
  headline,
  lede,
  body,
  exampleUrl,
}: TargetLandingProps) {
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
            Score your <strong>{platform}</strong> site below: the engine
            runs the same {ENGINE_CHECK_COUNT} checks against your URL as it
            does against any other.
          </p>
          <ScoreForm prefillUrl={exampleUrl} />
        </section>

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
                The server serves each result from a cache for 24 hours before it
                scores that URL again, and it counts calls per day, with no URL or
                address, keeping those counts for 400 days. Your last five scores
                stay in this browser. The score is the artifact.
              </p>
            </div>
            <dl className="score-output-side">
              <div>
                <dt>Grade</dt>
                <dd>A to F, with the score out of 100</dd>
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
                <dt>Kept</dt>
                <dd>
                  Results by URL, 24 hours · daily call counts, 400 days ·{' '}
                  <Link href="/privacy" className="text-link">
                    Privacy
                  </Link>
                </dd>
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