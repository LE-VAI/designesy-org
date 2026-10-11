import Link from 'next/link';
import './review-prompt.css';
import { REVIEW_CTA_LABEL, REVIEW_OFFER_PATH } from './review-offer';

/**
 * The one line under a free score result that says a person can go further.
 *
 * Quiet on purpose: muted text in the result's footnote register, one inline
 * link, no button, no colour block, no motion. The score is free and complete
 * on its own; this only names the next step for a visitor who wants a human
 * read. It links to the offer page (what a Review covers, its terms and the
 * disclosure), never straight to checkout.
 *
 * Rendered by the three surfaces that show a score result: /score
 * (VerifyForm), the homepage and target landings (ScoreForm), and
 * /score/report (ScoreReport).
 */
export function ReviewPrompt() {
  return (
    <p className="review-prompt">
      Want a human to go deeper?{' '}
      <Link href={REVIEW_OFFER_PATH} className="text-link">
        {REVIEW_CTA_LABEL}
      </Link>
    </p>
  );
}
