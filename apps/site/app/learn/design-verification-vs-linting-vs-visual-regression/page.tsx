import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Design verification vs design linting vs visual regression',
  description:
    'Three adjacent practices, three different questions. Token drift, baseline diffing, and contract conformance — and where each one fails alone.',
  path: '/learn/design-verification-vs-linting-vs-visual-regression',
  type: 'article',
  ogTitle: 'Verification vs linting vs regression · Designesy',
  ogDescription:
    'Three adjacent practices, three different questions — and where each one fails alone. The case for layering them.',
  twitterDescription:
    'Design verification vs linting vs regression — designesy.org/learn',
});

const PRACTICES = [
  {
    num: '01',
    name: 'Design linting',
    question: 'Does the source use the tokens?',
    input: 'Source files — CSS, TS, JSX',
    output: 'Warnings, fixes, inline suggestions',
    scope: 'Token misuse, magic numbers, raw hex',
    fails: 'It cannot see what shipped. A linter that passes in CI does not protect the visitor who receives a different CSS bundle than the one linted.',
  },
  {
    num: '02',
    name: 'Visual regression',
    question: 'Did the pixels change?',
    input: 'Screenshots — before and after',
    output: 'Pixel diffs, masked regions, flake flags',
    scope: 'Layout drift, unexpected reflow, removed elements',
    fails: 'It needs a baseline to diff against. New work has no baseline, and a pixel-perfect diff can mask a contract violation that happens to look the same.',
  },
  {
    num: '03',
    name: 'Design verification',
    question: 'Does the live site keep the contract?',
    input: 'A live URL — fetched the way a visitor fetches it',
    output: 'A letter grade and per-check findings',
    scope: 'Tokens, rules, behavior, and verification — all four contract layers',
    fails: 'It cannot inspect what it cannot fetch. Pages behind auth, paywalls, or bot challenges are scored on what the verifier can receive.',
  },
];

export default function ComparisonPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Learn · Comparison</p>
          <h1 className="surface-title" data-scramble>
            Verification vs linting vs regression
          </h1>
          <p className="surface-lede">
            Three adjacent practices, three different questions.
          </p>
          <p className="surface-note">
            Design linting, visual regression, and design verification are
            often grouped together as &ldquo;design quality tooling.&rdquo;
            They answer different questions, take different inputs, and fail
            in different places. This article is the side-by-side.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The three questions</h2>
          <div className="principle-list">
            {PRACTICES.map((p) => (
              <div className="principle" key={p.num}>
                <span className="principle-num">{p.num}</span>
                <div className="principle-body">
                  <h3>{p.name}</h3>
                  <p>
                    <strong>Question:</strong> {p.question}
                    <br />
                    <strong>Input:</strong> {p.input}
                    <br />
                    <strong>Output:</strong> {p.output}
                    <br />
                    <strong>Scope:</strong> {p.scope}
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    <strong>Where it fails alone:</strong> {p.fails}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why they layer</h2>
          <div className="definition">
            <p className="definition-label">The argument</p>
            <p>
              Linting catches token drift at authoring time. Regression
              catches pixel drift at shipping time. Verification catches
              contract drift at visitor time. Each one fails where the
              others succeed, which is why mature teams run all three — and
              why verification is the only one that can score a site you do
              not control.
            </p>
          </div>
          <p className="surface-note">
            Linting and regression both require access to the source. A
            visitor, a reviewer, a procurement team, or a design system
            author evaluating someone else&rsquo;s site has neither.
            Verification is the only practice in this set that takes a URL
            and returns a grade.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Read next</h2>
          <div className="row-stack" role="list">
            <Link
              href="/learn/what-is-design-verification"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">What is design verification?</span>
                <span className="row-meta">The category definition article</span>
              </span>
            </Link>
            <Link
              href="/learn/why-we-built-a-public-design-score"
              className="row"
              role="listitem"
              data-cuelume-hover="bloom"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Why a public score</span>
                <span className="row-meta">The argument for publishing the grade</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Citations: the design system contract (v0.4.0) for verification
          scope, and the /score endpoint for the runnable artifact.
        </div>
      </main>

      <Footer />
    </>
  );
}