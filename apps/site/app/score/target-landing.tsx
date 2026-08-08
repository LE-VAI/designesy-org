import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { ScoreForm } from './score-form';

/**
 * Shared shell for target-specific score landing pages
 * (/score/lovable, /score/v0, /score/bolt). Each landing page supplies
 * its own copy + example URL; this component keeps the layout consistent.
 *
 * The example URL is prefilled into ScoreForm via initialUrl — the visitor
 * can edit it to their own URL or just hit Score to run the engine against
 * the example. Either way the engine runs the same 40 checks.
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
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>{eyebrow}</p>
          <h1 className="surface-title" data-scramble>{headline}</h1>
          <p className="surface-lede">{lede}</p>
          <p className="surface-note">{body}</p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            {exampleScore ? (
              <>
                <strong>{platform}</strong> currently scores{' '}
                <strong>{exampleScore}</strong> on the contract. Score your own{' '}
                {platform} site below — the engine runs the same 40 checks
                against your URL.
              </>
            ) : (
              <>
                Score your <strong>{platform}</strong> site below — the engine
                runs the same 40 checks against your URL as it does against
                any other.
              </>
            )}
          </p>
          <ScoreForm initialUrl={exampleUrl} />
        </section>

        {caseStudyHref && caseStudyTitle && (
          <section className="doctrine-section fade-up fade-up-delay-2">
            <h2 className="doctrine-heading">Proof</h2>
            <div className="row-stack" role="list">
              <Link
                href={caseStudyHref}
                className="row"
                role="listitem"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">01</span>
                <span className="row-body">
                  <span className="row-title">{caseStudyTitle}</span>
                  <span className="row-meta">{caseStudyMeta}</span>
                </span>
              </Link>
            </div>
          </section>
        )}

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What you get</h2>
          <div className="definition">
            <p className="definition-label">The output</p>
            <p>
              A letter grade, a per-check breakdown (pass, fail, warn, skip),
              the tokens extracted from your site&rsquo;s <code>:root</code>,
              and a copyable receipt citing the contract version. No login.
              No backend. No data kept. The score is the artifact.
            </p>
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