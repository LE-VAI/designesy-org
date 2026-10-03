import type { Ref } from 'react';

/**
 * The result slot when a run read nothing (verdict.ts isEmptyRun): the site
 * refused the fetch, timed out, or served no CSS. It takes the result card's
 * place with the same instrument material, and carries no grade ring, no 0%,
 * no counts and no filters, because there is nothing to grade. The reason
 * line is the API's own account; the one action is to try again.
 *
 * Kept free of hooks and client-only imports so scripts/check-score-verdict.mjs
 * can render it on the server and assert on the markup.
 */
export function ScoreEmptyRun({
  url,
  reason,
  onRetry,
  busy = false,
  titleRef,
}: {
  url: string;
  reason: string;
  onRetry?: () => void;
  busy?: boolean;
  /** Focus lands here when the run ends, as it does on the verdict line. */
  titleRef?: Ref<HTMLParagraphElement>;
}) {
  return (
    <div className="score-hero-card score-empty-run" role="group" aria-labelledby="score-empty-run-title">
      <p className="score-empty-run-eyebrow">No score</p>
      <p id="score-empty-run-title" className="score-empty-run-title" tabIndex={-1} ref={titleRef}>
        Could not read this site
      </p>
      <p className="score-empty-run-reason">{reason}</p>
      <div className="score-empty-run-foot">
        <button
          type="button"
          className="score-action-btn score-empty-run-retry"
          onClick={onRetry}
          disabled={busy}
          data-cuelume-press="tick"
        >
          Try again
        </button>
        {url && (
          <span className="score-empty-run-url">
            <span className="score-url-dot is-off" aria-hidden="true" />
            {url}
          </span>
        )}
      </div>
    </div>
  );
}
