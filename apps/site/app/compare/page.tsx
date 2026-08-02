import type { Metadata } from 'next';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { CompareForm } from './compare-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMeta({
  title: 'Token diff',
  description:
    'Compare two design systems from live URLs — diff tokens added, removed, renamed, value-changed, scale drift, contrast drift, and structure delta. The only URL-scoped design-token diff engine. 8 emission checks plus score delta on both sites.',
  path: '/compare',
  ogTitle: 'Token diff · Designesy',
  ogDescription:
    'Diff two design systems from live URLs — tokens added, removed, renamed, value-changed, scale drift.',
  twitterDescription: 'Designesy compare — designesy.org/compare',
});

export default async function ComparePage({ searchParams }: { searchParams?: Promise<{ a?: string; b?: string }> }) {
  const params = await searchParams;
  const initialA = typeof params?.a === 'string' ? params.a : '';
  const initialB = typeof params?.b === 'string' ? params.b : '';

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Verification</p>
          <h1 className="surface-title" data-scramble>Token diff</h1>
          <p className="surface-lede">
            Compare two design systems from live URLs — diff tokens added,
            removed, renamed, value-changed, scale drift, contrast drift, and
            structure delta. The only URL-scoped design-token diff engine.
          </p>
          <p className="surface-note">
            Also serves as the diff engine inside /monitor (m08 token-set
            mutation detection). 8 emission checks plus score delta on both sites.
          </p>
        </section>

        <section className="doctrine-section fade-up fade-up-delay-1">
          <CompareForm initialA={initialA} initialB={initialB} />
        </section>

        <section className="doctrine-section fade-up fade-up-delay-2">
          <h2 className="doctrine-heading">What it does</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            The compare engine fetches both URLs in parallel, extracts all CSS
            and :root custom properties from each, and computes a structured diff
            across 8 dimensions: token-added, token-removed, token-renamed
            (heuristic Levenshtein), token-value-changed, scale-stop-changed,
            contrast-drift-per-pair, structure-delta, and score-delta (runs
            /score on both URLs and diffs).
          </p>
          <p className="surface-note">
            Scoring: 8 checks. PASS=1, WARN=0.5, FAIL=0. Score = (points/8) ×
            100. The compare score reflects diff completeness (did the engine
            produce a full diff), not design quality — design quality is the
            /score surface. The diff result itself is the product.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}