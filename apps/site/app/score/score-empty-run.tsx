import type { Ref } from 'react';

/**
 * The result slot when a run read nothing (verdict.ts isEmptyRun): the site
 * refused the fetch, timed out, or served no CSS. It takes the result card's
 * place with the same instrument material, and carries no grade ring, no 0%,
 * no counts and no filters, because there is nothing to grade. The reason
 * line is the API's own account; the one action is to try again.
 *
 * /score/contract uses the same card for its empty runs (WIREFRAMES W8, W9):
 * its own eyebrow and title for an app shell or a page with no CSS, a line
 * saying the contract was read and is valid, what the visitor can do, and
 * its own action ("Score another page"). Every one of those is optional: a
 * caller that passes none renders the card exactly as before.
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
  eyebrow = 'No score',
  title = 'Could not read this site',
  contractLine,
  todo,
  actionLabel = 'Try again',
}: {
  url: string;
  reason: string;
  onRetry?: () => void;
  busy?: boolean;
  /** Focus lands here when the run ends, as it does on the verdict line. */
  titleRef?: Ref<HTMLParagraphElement>;
  eyebrow?: string;
  title?: string;
  /** /score/contract: the contract was read and is valid (W8, W9). */
  contractLine?: string;
  /** /score/contract: what the visitor can do instead (W8). Text between
      backticks is set as code, e.g. `<style>`. */
  todo?: string[];
  actionLabel?: string;
}) {
  return (
    <div className="score-hero-card score-empty-run" role="group" aria-labelledby="score-empty-run-title">
      <p className="score-empty-run-eyebrow">{eyebrow}</p>
      <p id="score-empty-run-title" className="score-empty-run-title" tabIndex={-1} ref={titleRef}>
        {title}
      </p>
      <p className="score-empty-run-reason">{reason}</p>
      {contractLine && <p className="score-empty-run-contract">{contractLine}</p>}
      {todo && todo.length > 0 && (
        <div className="score-empty-run-todo">
          <p className="score-empty-run-eyebrow">What you can do</p>
          <ul>
            {todo.map((t) => (
              <li key={t}>{t.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="score-empty-run-foot">
        <button
          type="button"
          className="score-action-btn score-empty-run-retry"
          onClick={onRetry}
          disabled={busy}
          data-cuelume-press="tick"
        >
          {actionLabel}
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
