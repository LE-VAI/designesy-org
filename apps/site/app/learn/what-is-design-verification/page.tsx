import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'What is design verification?',
  description:
    'Design verification is the automated evaluation of a live site against a published design system contract. What it is, the four-part contract it runs against, and the three checks that distinguish it from adjacent practices.',
  path: '/learn/what-is-design-verification',
  type: 'article',
  ogTitle: 'What is design verification? · Designesy',
  ogDescription:
    'The automated evaluation of a live site against a published design system contract — defined, distinguished from linting and regression, and made runnable.',
  twitterDescription:
    'Design verification, defined — designesy.org/learn/what-is-design-verification',
});

const CONTRACT_LAYERS = [
  {
    num: '01',
    name: 'Tokens',
    desc: 'Named values — color, type, spacing, radius, motion, depth — that a site promises to use and no others. Drift here is the cheapest signal to catch.',
  },
  {
    num: '02',
    name: 'Rules',
    desc: 'Anti-patterns and required patterns the contract forbids or mandates — no raw hex, no magic numbers, focus-visible everywhere a pointer can go.',
  },
  {
    num: '03',
    name: 'Behavior',
    desc: 'How an interface responds to touch, keyboard, sound, and reduced-motion preferences. Poise, Takt, Cadence, and Acoustics are the names Designesy gives these layers.',
  },
  {
    num: '04',
    name: 'Verification',
    desc: 'A runnable checklist — 40 automated checks in Designesy\'s case — that scores a live URL against the tokens, rules, and behavior above and returns a letter grade.',
  },
];

const DISTINGUISHING_CHECKS = [
  {
    label: 'It runs against a live URL, not a source tree',
    desc: 'Design linting reads your code. Visual regression diffs your screenshots. Design verification fetches your production site the way a visitor would, then runs checks against the CSS and HTML the browser actually receives.',
  },
  {
    label: 'It scores against a published contract, not a private baseline',
    desc: 'Regression compares to last week\'s snapshot. Verification compares to a contract that is published, versioned, and citable — the same contract for every site it scores.',
  },
  {
    label: 'It returns a grade, not a diff',
    desc: 'Linting emits warnings. Regression emits pixel deltas. Verification emits a letter grade with a per-check breakdown that resolves to a single, scorable, comparable number.',
  },
];

export default function WhatIsDesignVerificationPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Learn · Category definition</p>
          <h1 className="surface-title" data-scramble>What is design verification?</h1>
          <p className="surface-lede">
            The automated evaluation of a live site against a published design
            system contract.
          </p>
          <p className="surface-note">
            Design verification sits between three established practices —
            design linting, visual regression, and heuristic design review —
            and does something none of them do alone: it asks whether a live
            site keeps the promises its own design system makes, and returns a
            grade that any visitor can read.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Working definition</h2>
          <div className="definition">
            <p className="definition-label">One sentence</p>
            <p>
              Design verification is the automated evaluation of a live site
              against a published design system contract, returning a score
              and per-check findings that resolve to a single letter grade.
            </p>
          </div>
          <p className="surface-note">
            Three words in that sentence do the work. <em>Automated</em>{' '}
            means the same checks run the same way for every URL, with no
            human reviewer in the loop. <em>Live</em> means the input is the
            site your visitors receive, not a source tree or a screenshot.{' '}
            <em>Published contract</em> means the standard is public,
            versioned, and citable — the same one for every site it scores.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The four-part contract</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A design system contract, in the verification sense, is not a
            Figma library. It is a layered agreement a site makes about how
            it will look, feel, and behave — and a checklist that scores
            whether it keeps that agreement.
          </p>
          <div className="principle-list">
            {CONTRACT_LAYERS.map((layer) => (
              <div className="principle" key={layer.num}>
                <span className="principle-num">{layer.num}</span>
                <div className="principle-body">
                  <h3>{layer.name}</h3>
                  <p>{layer.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What distinguishes it</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Three properties, each absent from at least one adjacent practice.
          </p>
          <div className="principle-list">
            {DISTINGUISHING_CHECKS.map((check, i) => (
              <div className="principle" key={i}>
                <span className="principle-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="principle-body">
                  <h3>{check.label}</h3>
                  <p>{check.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What it is not</h2>
          <div className="doctrine-cols">
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                Not design linting
              </h3>
              <CheckGrid items={checkItemsFromStrings([
                'Linters read source files — verification reads the shipped CSS',
                'Linters warn about token misuse — verification scores contract conformance',
                'Linters integrate into CI — verification runs against production',
              ])} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                Not visual regression
              </h3>
              <CheckGrid items={checkItemsFromStrings([
                'Regression diffs screenshots — verification checks behavior',
                'Regression needs a baseline — verification needs a contract',
                'Regression catches drift — verification catches broken promises',
              ])} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                Not heuristic review
              </h3>
              <CheckGrid items={checkItemsFromStrings([
                'Heuristic review needs a reviewer — verification runs the same way every time',
                'Heuristic findings are prose — verification findings are pass, fail, warn, or skip',
                'Heuristic review is ungradeable — verification returns a letter grade',
              ])} />
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why it matters</h2>
          <div className="definition">
            <p className="definition-label">The argument</p>
            <p>
              A design system without verification is a document. A verified
              design system is a contract. The difference is whether anyone
              can run the same checks against the same URL and get the same
              grade — including the people who wrote the contract.
            </p>
          </div>
          <p className="surface-note">
            This is why Designesy publishes its own score on the same terms
            as everyone else&rsquo;s. The /score engine runs against
            designesy.org every time a visitor asks, against the same contract
            every other site is scored against. The same checks that grade
            your site grade ours.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Where to see it</h2>
          <div className="row-stack" role="list">
            <Link
              href="/score"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Score a URL</span>
                <span className="row-meta">Run the 40-check engine against any live site, including this one</span>
              </span>
            </Link>
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Read the contract</span>
                <span className="row-meta">Designesy design system v0.4.0 — tokens, rules, behavior, verification</span>
              </span>
            </Link>
            <Link
              href="/learn/design-verification-vs-linting-vs-visual-regression"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Comparison article</span>
                <span className="row-meta">Design verification vs design linting vs visual regression</span>
              </span>
            </Link>
            <Link
              href="/learn/why-we-built-a-public-design-score"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Why a public score</span>
                <span className="row-meta">The argument for publishing the grade instead of keeping it internal</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          This is a category-defining article, not a marketing page. If you
          cite it, cite the contract version (v0.4.0) and the score endpoint
          (/api/score) as the primary sources.
        </div>
      </main>

      <Footer />
    </>
  );
}