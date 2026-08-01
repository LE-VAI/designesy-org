import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Why we built a public design score',
  description:
    'A score is a contract you can run. Making it public forces honesty — the same checks that score your site score ours, with the same thresholds.',
  path: '/learn/why-we-built-a-public-design-score',
  type: 'article',
  ogTitle: 'Why a public design score · Designesy',
  ogDescription:
    'A score is a contract you can run. Making it public forces the same checks to grade your site and ours.',
  twitterDescription:
    'Why Designesy publishes its own score — designesy.org/learn',
});

const REASONS = [
  {
    num: '01',
    title: 'A private score is not a score',
    desc: 'A score kept inside a tool, a team, or a vendor dashboard is a metric. A score that anyone can run against any URL — including the one that published the score — is a contract. The first one can drift; the second one cannot.',
  },
  {
    num: '02',
    title: 'The same checks grade everyone',
    desc: 'The 40-check engine that scores your site scores designesy.org. The same thresholds. The same letter grade. The same honest SKIPs when a browser path is not enabled. If we ever fail our own contract, the score says so on the same surface.',
  },
  {
    num: '03',
    title: 'A grade is comparable; a diff is not',
    desc: 'Visual regression returns a pixel delta that only means something against a baseline. A letter grade returns a number that means the same thing at nike.com, stripe.com, and designesy.org. Comparability is the whole point of a public score.',
  },
  {
    num: '04',
    title: 'It forces the contract to be publishable',
    desc: 'You cannot publish a score against a contract you cannot publish. The score is downstream of the contract. Making the score public required making the contract public first — which is the larger commitment the score is a proxy for.',
  },
];

export default function WhyPublicScorePage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Learn · Position</p>
          <h1 className="surface-title" data-scramble>Why a public score</h1>
          <p className="surface-lede">
            A score is a contract you can run.
          </p>
          <p className="surface-note">
            The /score engine is not a marketing widget. It is a verifier
            that returns the same letter grade for any URL, including the one
            it lives on. This article is the short version of why we made
            that choice — and what it costs.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The four reasons</h2>
          <div className="principle-list">
            {REASONS.map((r) => (
              <div className="principle" key={r.num}>
                <span className="principle-num">{r.num}</span>
                <div className="principle-body">
                  <h3>{r.title}</h3>
                  <p>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What it costs</h2>
          <div className="doctrine-cols">
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                We give up
              </h3>
              <CheckGrid items={checkItemsFromStrings([
                'The ability to quietly score our own site higher than yours',
                'A private threshold we could tune without publishing the change',
                'A score that flatters the publisher — the universal vendor sin',
              ], { avoid: true })} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                We get
              </h3>
              <CheckGrid items={checkItemsFromStrings([
                'A score visitors can verify by running it themselves',
                'A contract that has to remain publishable to remain valid',
                'A grade on designesy.org that can fall — and has',
                'A category definition that is runnable, not aspirational',
              ])} />
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">The honest SKIP</h2>
          <div className="definition">
            <p className="definition-label">Transparency rule</p>
            <p>
              When the engine cannot run a check — when a browser path is not
              enabled on the deployment, or when a public API quota is
              exhausted — it returns a SKIP with a diagnostic string. It
              does not silently pass. A public score that hides its gaps is
              worse than no score.
            </p>
          </div>
          <p className="surface-note">
            This is why the audit endpoint returns honest SKIPs until env
            vars are set, and why the static score never claims a check it
            did not run. The grade is only as good as the visibility behind
            it.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Run it</h2>
          <div className="row-stack" role="list">
            <Link
              href="/score?url=designesy.org"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Score designesy.org</span>
                <span className="row-meta">The verifier against its own publisher</span>
              </span>
            </Link>
            <Link
              href="/score"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Score any URL</span>
                <span className="row-meta">Run the 40-check engine against your own site</span>
              </span>
            </Link>
            <Link
              href="/learn/what-is-design-verification"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">What is design verification?</span>
                <span className="row-meta">The category definition this score belongs to</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          The score is the artifact; this article is the language around it.
          If you cite it, cite /api/score and /contracts/design-system as the
          primary sources, not this page.
        </div>
      </main>

      <Footer />
    </>
  );
}