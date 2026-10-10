/**
 * Designesy Review: the one-time, human-led review offer.
 *
 * ONE MODULE FOR THE OFFER. Every surface that sells or describes the Review
 * reads its price, routes, checkout target and disclosure from here: the card
 * on /pricing, the offer page at /pricing/review, and the quiet prompt under a
 * free score result (lib/review-prompt.tsx). A price or link change lands on
 * all of them at once, so no two surfaces can quote different terms.
 *
 * The terms (price, scope, deliverables, turnaround, re-score, disclosure) are
 * the approved offer spec's. Change the spec first, then this file.
 */

/** The price, as shown. One-time and in US dollars; never a subscription. */
export const REVIEW_PRICE = '$899';

/**
 * CHECKOUT. Every "Get the full Review" button links here.
 *
 * Paste the Stripe Payment Link (https://buy.stripe.com/...) in place of the
 * mailto once it exists. Until then the buttons open an email to
 * hello@designesy.org with the subject filled in, so no call to action on the
 * site is ever a dead end.
 */
export const REVIEW_CHECKOUT_URL =
  'mailto:hello@designesy.org?subject=Designesy%20Review';

/**
 * A published sample Review. While this is null the "See a sample Review"
 * slot on the offer page does not render at all, so it cannot link nowhere.
 */
export const REVIEW_SAMPLE_URL: string | null = null;

/** The offer page. It lives under /pricing because /review is the method. */
export const REVIEW_OFFER_PATH = '/pricing/review';

/** The one call-to-action label, shared by every Review button. */
export const REVIEW_CTA_LABEL = `Get the full Review · ${REVIEW_PRICE}`;

/**
 * Refunds, as approved for the offer spec: a full refund until the Review
 * starts; after delivery the 30-day re-score is the guarantee.
 */
export const REVIEW_REFUND_POLICY =
  'Full refund any time before work starts. After delivery, the 30-day re-score is guaranteed.';

export const REVIEW_CONTACT_EMAIL = 'hello@designesy.org';

/** A question before buying goes to a person, with the subject filled in. */
export const REVIEW_QUESTION_URL =
  'mailto:hello@designesy.org?subject=Designesy%20Review%20question';

/**
 * The claims disclosure, verbatim from the offer spec. Every surface that
 * describes the Review shows it whole. The Review reports findings on a
 * stated sample; it never claims or implies legal conformance.
 */
export const REVIEW_DISCLOSURE =
  'A Designesy Review is a findings report on a stated sample of pages as of the review date. It combines automated and manual checks. It is not legal advice and not a certification of compliance with the ADA, WCAG, or any law. Automated tools find only part of accessibility issues, which is why every Review includes manual checks.';
