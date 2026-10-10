import type { Metadata } from 'next';
import Link from 'next/link';
import '../pricing.css';
import './review.css';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';
import { AgentActions } from '../../lib/agent-actions';
import { ENGINE_CHECK_COUNT } from '../../lib/check-definitions';
import {
  REVIEW_CHECKOUT_URL,
  REVIEW_CONTACT_EMAIL,
  REVIEW_CTA_LABEL,
  REVIEW_DISCLOSURE,
  REVIEW_PRICE,
  REVIEW_QUESTION_URL,
  REVIEW_REFUND_POLICY,
  REVIEW_SAMPLE_URL,
} from '../../lib/review-offer';

// ISR: static content that revalidates hourly, as /pricing does.
export const revalidate = 3600;

// WHY /pricing/review. /review is the review method (the eight dimensions)
// and the page says "Published reviews live under /review": its children are
// field checks. A paid offer there would read as one more published review.
// The offer is a priced product listed on /pricing, so it sits under the page
// that lists it, with a real parent one level up.
export const metadata: Metadata = pageMeta({
  title: 'Full Review',
  description:
    'Designesy Review: a one-time, human-led review of your online store or app flow. The automated contract score, eight design dimensions, a manual WCAG 2.2 AA spot-check, and a prioritized fix list, in 5 business days for $899.',
  path: '/pricing/review',
  ogTitle: 'Designesy Review · $899 one-time',
  ogDescription:
    'A person reviews your store or app flow and hands you a prioritized fix list for the barriers your shoppers hit. Delivered in 5 business days.',
});

const AUDIENCE = [
  {
    scope: 'Website',
    title: 'Online stores',
    body: 'Your home page and up to 4 key pages, such as product, collection, cart, and the start of checkout: the path a shopper takes to buy.',
  },
  {
    scope: 'App flow',
    title: 'Product teams',
    body: 'One flow of up to 5 screens, such as sign-up, onboarding, or a purchase, reviewed screen by screen.',
  },
];

export default function ReviewOfferPage() {
  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Designesy Review</p>
          <h1 className="surface-title" data-scramble>
            Find the barriers your shoppers hit.
          </h1>
          <p className="surface-lede">
            A person reviews your store or app flow: the automated contract
            score, the eight review dimensions, and a manual accessibility
            spot-check, written up as a prioritized fix list.
          </p>
          <p className="surface-note">
            {REVIEW_PRICE} one-time for one website or one app flow. Delivered
            in 5 business days, with one re-score within 30 days after you ship
            fixes.
          </p>
          <div className="hero-actions review-offer-actions">
            <a
              href={REVIEW_CHECKOUT_URL}
              className="button primary"
              data-cuelume-press="tick"
            >
              {REVIEW_CTA_LABEL}
            </a>
            <a
              href={REVIEW_QUESTION_URL}
              className="button ghost"
              data-cuelume-press="tick"
            >
              Ask a question first
            </a>
          </div>
          <AgentActions mdPath="/pricing/review.md" label="the Designesy Review offer" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Who it is for</h2>
          <div className="principle-list">
            {AUDIENCE.map((a) => (
              <div className="principle" key={a.title}>
                <span className="principle-num">{a.scope}</span>
                <div className="principle-body">
                  <h3>{a.title}</h3>
                  <p>{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What you receive</h2>
          <div className="principle-list">
            <div className="principle">
              <span className="principle-num">01</span>
              <div className="principle-body">
                <h3>Contract score</h3>
                <p>
                  The automated Designesy score: {ENGINE_CHECK_COUNT} checks
                  across accessibility, tokens and drift, motion, readiness,
                  and typography, with every failing check named.
                </p>
              </div>
            </div>
            <div className="principle">
              <span className="principle-num">02</span>
              <div className="principle-body">
                <h3>Human design review</h3>
                <p>
                  The eight dimensions of the Designesy{' '}
                  <Link href="/review" className="text-link">
                    review method
                  </Link>
                  , from purpose to responsibility, each with a verdict and the
                  evidence behind it.
                </p>
              </div>
            </div>
            <div className="principle">
              <span className="principle-num">03</span>
              <div className="principle-body">
                <h3>Manual WCAG 2.2 AA spot-check</h3>
                <p>
                  On your stated page sample: keyboard-only navigation, visible
                  focus, color contrast, form labels and error messages,
                  headings and landmarks, image alternatives, reflow at 320 px,
                  and motion with reduced motion.
                </p>
              </div>
            </div>
            <div className="principle">
              <span className="principle-num">04</span>
              <div className="principle-body">
                <h3>Written verdict</h3>
                <p>
                  A prioritized fix list in three tiers, P0, P1 and P2. Each
                  item names the element, the criterion it fails, why it
                  matters to a shopper, and the fix.
                </p>
              </div>
            </div>
            <div className="principle">
              <span className="principle-num">05</span>
              <div className="principle-body">
                <h3>Re-score</h3>
                <p>
                  One re-score within 30 days, after you ship fixes, so you can
                  see what moved.
                </p>
              </div>
            </div>
          </div>
          {/* The sample slot renders only once a sample Review is published
              (REVIEW_SAMPLE_URL in lib/review-offer.ts). Until then there is
              nothing to show and no link that leads nowhere. */}
          {REVIEW_SAMPLE_URL && (
            <p className="review-offer-sample">
              <a href={REVIEW_SAMPLE_URL} className="text-link">
                See a sample Review
              </a>
            </p>
          )}
        </section>

        {/* The terms card is the /pricing Review card's recipe (pricing.css,
            imported above): how a Review runs in the face, ending on the
            7-line; the terms as key rows behind the divider. */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Terms</h2>
          <div className="pricing-review definition-split">
            <div className="definition-face">
              <p className="definition-label">How a Review runs</p>
              <ol className="review-steps" role="list">
                <li>
                  <span>
                    <strong>You order.</strong> One payment of {REVIEW_PRICE}.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>You confirm the sample.</strong> Reply with the
                    URLs of the pages or screens to review.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>We review.</strong> The Review arrives within 5
                    business days of payment and confirmed URLs.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>You ship fixes.</strong> One re-score within 30
                    days shows what moved.
                  </span>
                </li>
              </ol>
            </div>
            <dl className="definition-side">
              <div>
                <dt>Price</dt>
                <dd>{REVIEW_PRICE} one-time, USD</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>Home page and up to 4 key pages, or 1 app flow of up to 5 screens</dd>
              </div>
              <div>
                <dt>Turnaround</dt>
                <dd>5 business days</dd>
              </div>
              <div>
                <dt>Re-score</dt>
                <dd>1, within 30 days</dd>
              </div>
              <div>
                <dt>Refunds</dt>
                <dd>{REVIEW_REFUND_POLICY}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  <a href={`mailto:${REVIEW_CONTACT_EMAIL}`} className="review-offer-mail">
                    {REVIEW_CONTACT_EMAIL}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Seller</dt>
                <dd>Designesy LLC, Florida</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What a Review is</h2>
          <div className="pricing-review definition-split">
            <div className="definition-face">
              <p className="definition-label">Findings, as of the review date</p>
              <p className="review-disclosure">{REVIEW_DISCLOSURE}</p>
            </div>
            <dl className="definition-side">
              <div>
                <dt>Method</dt>
                <dd>Automated and manual checks</dd>
              </div>
              <div>
                <dt>Score engine</dt>
                <dd>The same as every free score</dd>
              </div>
              <div>
                <dt>Public score</dt>
                <dd>Not for sale</dd>
              </div>
            </dl>
          </div>
          <p className="surface-note review-offer-note">
            The contract score in a Review comes from the engine and published
            contract that score every site for free. Designesy does not accept
            payment for scores or leaderboard placement; the{' '}
            <Link href="/pricing#independence-firewall" className="text-link">
              independence firewall
            </Link>{' '}
            covers the Review too.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Start a Review</h2>
          <p className="surface-note">
            Order below, then confirm your URLs by email. Questions first?
            Write to{' '}
            <a href={REVIEW_QUESTION_URL} className="text-link">
              {REVIEW_CONTACT_EMAIL}
            </a>
            .
          </p>
          <div className="hero-actions review-offer-actions">
            <a
              href={REVIEW_CHECKOUT_URL}
              className="button primary"
              data-cuelume-press="tick"
            >
              {REVIEW_CTA_LABEL}
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
