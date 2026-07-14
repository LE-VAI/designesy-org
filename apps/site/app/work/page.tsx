import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Work — case studies',
  description:
    'Shipped artifacts reviewed against the design system contract. Outcome evidence: the Sources to Artifacts chain applied to real work, with engagement metrics, review findings, and corrections.',
  path: '/work',
  ogTitle: 'Work · Designesy',
  ogDescription:
    'Case studies — shipped artifacts reviewed against the design system contract. Sources into principles, principles into contracts, contracts into tools, tools into better designed work.',
  twitterDescription: 'Case studies — designesy.org/work',
});

const CASE_STUDIES = [
  {
    slug: 'tile',
    title: 'Tile',
    lede: 'Interactive series composer — one story, many tiles, shared spine.',
    status: 'Shipped · live',
    badge: 'Pass with notes',
    artifact: 'le-vai.github.io/tile',
    date: '2026-07-13',
    metrics: '617 views · 3 likes · 1 reply',
    summary:
      'A self-contained tool that lets you compose a series of visual tiles from one spine. Published on X with a one-word root post and screen recording. The only post in 24 hours to break out of the noise floor — by a wide margin.',
  },
  {
    slug: 'compile',
    title: 'Compile',
    lede: 'Principle compiler — turns plain language into verifiable design contracts.',
    status: 'Built · pending hosting',
    badge: 'Ready for review',
    artifact: 'Local build · pending deploy',
    date: '2026-07-13',
    metrics: '9 verification tests passed · 7 design domains',
    summary:
      'A tool that takes any plain-language design principle and compiles it into tokens, anti-patterns, a review checklist, and a portable verification script. Self-documents to the 10-cell Lab anatomy. Built and locally verified; pending hosting and publication.',
  },
  {
    slug: 'continuity',
    title: 'Continuity',
    lede: 'Founder narrative — the same idea, finally built.',
    status: 'Shipped · live',
    badge: 'Needs revision',
    artifact: 'le-vai.github.io/continuity',
    date: '2026-07-12',
    metrics: 'Underperformed relative to Tile',
    summary:
      'A founder-narrative article published as a single X post with preview URL. The multi-post thread was deleted as overwhelming and overly AI. Even the single-post version underperformed a one-word product demo. The review process caught the problem and corrected it.',
  },
];

export default function WorkPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">Work</p>
          <h1 className="surface-title">Case studies</h1>
          <p className="surface-lede">
            Shipped artifacts reviewed against the design system contract.
          </p>
          <p className="surface-note">
            The pipeline promises tools into better designed work. These are
            the artifacts — real tools, real publication, real engagement,
            reviewed with Use Kit One. The review format is the same
            eight-dimension method used on Labs and the public surface itself.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each case study follows the field-check anatomy: summary, inputs,
            eight dimension findings (observation, judgment, action),
            verification, corrections, and sources. Outcome is reported
            honestly — including what did not work.
          </p>
          <div className="row-stack" role="list">
            {CASE_STUDIES.map((cs, i) => (
              <Link
                key={cs.slug}
                href={`/work/${cs.slug}`}
                className="row"
                role="listitem"
                data-cuelume-hover="whisper"
                data-cuelume-press
                data-cuelume-release
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{cs.title}</span>
                  <span className="row-meta">
                    {cs.lede} · {cs.status}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="what-this-is">
          <h2 className="doctrine-heading">What this is</h2>
          <div className="definition">
            <p className="definition-label">Outcome evidence</p>
            <p>
              Sources become principles. Principles become contracts. Contracts
              become tools. Tools become better designed work. These case
              studies are the evidence for that last step — shipped artifacts,
              reviewed against the contract, with honest outcomes including
              engagement metrics and what the review process caught.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">What this is not</h2>
          <ul className="checkmark-list">
            <li>Not generic case studies or portfolio decoration.</li>
            <li>Not a claim that every artifact succeeded.</li>
            <li>Not a marketing surface — outcomes are reported honestly.</li>
            <li>Not a replacement for the Labs or Review surfaces.</li>
          </ul>
        </section>

        <div className="status-note">
          Case studies publish when an artifact is shipped and reviewed. Empty
          slots are not advertised as upcoming work.
        </div>
      </main>

      <Footer />
    </>
  );
}