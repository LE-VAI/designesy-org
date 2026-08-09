import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Learn — design verification',
  description:
    'Reference articles on design verification: what it is, how it differs from design linting and visual regression, and why a public design score matters.',
  path: '/learn',
  ogTitle: 'Learn · Designesy',
  ogDescription:
    'Reference articles on design verification — the category Designesy operates in. What it is, how it differs from adjacent practices, and why a public score matters.',
  twitterDescription: 'Reference articles on design verification — designesy.org/learn',
});

const ARTICLES = [
  {
    slug: 'what-is-design-verification',
    title: 'What is design verification?',
    lede:
      'The automated evaluation of a live site against a published design system contract — distinct from linting, regression, and heuristic review.',
    meta: 'Category definition · 6 min',
  },
  {
    slug: 'design-verification-vs-linting-vs-visual-regression',
    title: 'Design verification vs design linting vs visual regression',
    lede:
      'Three adjacent practices, three different questions. Token drift, baseline diffing, and contract conformance — and where each one fails alone.',
    meta: 'Comparison · 5 min',
  },
  {
    slug: 'why-we-built-a-public-design-score',
    title: 'Why we built a public design score',
    lede:
      'A score is a contract you can run. Making it public forces honesty — the same checks that score your site score ours, with the same thresholds.',
    meta: 'Position · 4 min',
  },
];

export default function LearnPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Learn</p>
          <h1 className="surface-title" data-scramble>Design verification</h1>
          <p className="surface-lede">
            Reference articles on the category Designesy operates in.
          </p>
          <p className="surface-note">
            Design verification is the practice of evaluating a live site
            against a published design system contract. These articles define
            the practice, distinguish it from adjacent disciplines, and
            explain why Designesy publishes its own score on the same terms as
            everyone else&rsquo;s.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each article is single-purpose, citation-friendly, and written to
            be read once and referenced often.
          </p>
          <div className="row-stack" role="list">
            {ARTICLES.map((article, i) => (
              <Link
                key={article.slug}
                href={`/learn/${article.slug}`}
                className="row"
                role="listitem"
                data-cuelume-hover="whisper"
                data-cuelume-press
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{article.title}</span>
                  <span className="row-meta">
                    {article.lede} · {article.meta}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What this is</h2>
          <div className="definition">
            <p className="definition-label">Editorial scope</p>
            <p>
              A small, slow, reference library — not a blog. Articles are
              added when the category needs a new anchor, not on a content
              cadence. Each one cites the contract, the verification kit, or
              the public score as its primary source.
            </p>
          </div>
        </section>

        <div className="status-note">
          The /learn collection is intentionally narrow. The live engines
          live at /score, /contracts, /labs, /kits, and /review — these
          articles are the language layer around them.
        </div>
      </main>

      <Footer />
    </>
  );
}