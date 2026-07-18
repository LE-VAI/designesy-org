import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Continuity — case study',
  description:
    'A founder-narrative article published as a single X post. Channel-format mismatch documented with eight-dimension review.',
  path: '/work/continuity',
  ogTitle: 'Continuity · case study',
  ogDescription:
    'A founder-narrative article reviewed against the design system contract. Outcome: channel-format mismatch.',
  twitterDescription: 'Continuity case study — designesy.org/work/continuity',
  type: 'article',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'A founder-narrative article with a clear motive and coherent form.',
    judgment: 'Purpose is clear. Purpose does not guarantee reach.',
    action: 'Retain as a reference artifact. Do not re-publish the narrative format on X.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'Clean structure, clear sections. Yellow-field addressing with black rounded cards — a distinct mode from the dark default.',
    judgment: 'Clarity is strong in the artifact. The publication format was the constraint, not the writing.',
    action: 'Retain at the hosted URL. Reference, not feed post.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Deployed on GitHub Pages. X audience (1,891 followers, building-in-public) rewards shipped product demos over narrative content. The context is a feed, not a reading surface.',
    judgment: 'Channel-format mismatch. The artifact is sound; the distribution channel was wrong for this format.',
    action: 'Match format to channel. Hosted URL as a profile reference, not a feed post.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Yellow-field mode is a deliberate VAI surface choice — dark default with a toggle into yellow addressing. Article text is readable. No dark pattern.',
    judgment: 'Inclusion is sound. The dark/yellow toggle is an accessibility-aware choice.',
    action: 'Retain the dark/yellow toggle.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'VAI yellow #FFC400 as the field, black rounded cards, VAI wordmark only. Designesy activation yellow #FECC34 is deliberately suppressed. Deployment pattern matches Tile.',
    judgment: 'Coherent within the VAI surface. The yellow-field mode is a distinct address, not a doctrine violation.',
    action: 'Retain as a VAI-specific surface option. Do not import into Designesy.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full documentation: ARTICLE_DRAFT, VISUAL_BRIEF, STATUS, build scripts, host, preview, renders. Article locked. Hosting live. Publication receipt recorded.',
    judgment: 'Durable as a reference artifact.',
    action: 'Retain at the hosted URL. Update STATUS if the narrative is revised.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'Yellow-field mode is visually striking. Article voice is sincere. Feed-context delight requires immediate payoff — a long backstory does not deliver that.',
    judgment: 'Delight is present in the artifact but is channel-dependent.',
    action: 'Retain the artifact; change the distribution.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'Initial thread format withdrawn; single-post revision published 2026-07-12. Underperformance documented.',
    judgment: 'Outcome reported with the same rigor as a pass.',
    action: 'Retain the case study. Mismatches are as documented as successes.',
  },
];

const FINDINGS = [
  'Initial thread format withdrawn; single-post revision published 2026-07-12',
  'Channel-format mismatch: long-form narrative does not communicate in a scroll feed',
  'Artifact is durable as a reference; distribution channel was the constraint',
  'Yellow-field VAI surface mode is coherent and retained',
  'Full documentation preserved: ARTICLE_DRAFT, VISUAL_BRIEF, STATUS, build scripts',
  'Single engagement data point — pattern is consistent, sample is not statistically robust',
];

const SOURCES = [
  {
    href: 'https://le-vai.github.io/continuity/',
    title: 'Continuity — live artifact',
    meta: 'Founder narrative article',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.3.0',
    meta: 'Governing tokens',
  },
  {
    href: '/work/tile',
    title: 'Tile — case study',
    meta: 'Comparison: product demo format',
  },
  {
    href: '/work',
    title: 'Work — case studies',
    meta: 'Index',
  },
];

export default function ContinuityCaseStudyPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/work" className="lab-crumb">
              Work
            </Link>
            <span aria-hidden="true"> · </span>
            Case study
          </p>
          <h1 className="surface-title">Continuity</h1>
          <p className="surface-lede">
            A founder-narrative article published as a single X post.
          </p>
          <p className="surface-note">
            A long-form narrative article deployed on GitHub Pages and
            published to X. Initial thread format withdrawn; single-post
            revision published 2026-07-12. Outcome: channel-format mismatch.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Needs revision</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · le-vai.github.io/continuity</span>
            <span className="lab-meta-item">Date · 2026-07-12</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · needs revision</p>
            <p>
              A well-built artifact with a clear motive. The article is
              clearly written, the visual surface is coherent, and the
              deployment is solid. The publication format did not match the
              channel: a long backstory in a link card does not communicate
              in a scroll feed. Initial thread format withdrawn; single-post
              revision published 2026-07-12. The artifact is retained as a
              reference; the feed format is not reused.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="engagement">
          <h2 className="doctrine-heading">Engagement</h2>
          <div className="definition">
            <p className="definition-label">X post · 2026-07-12</p>
            <p>
              Continuity did not surface in the top visible posts on the
              profile after 24 hours. Tile&apos;s product-demo format earned
              617 views in the same period. The feed format rewards shipped,
              visible product over narrative content.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Inputs used</h2>
          <div className="row-stack" role="list">
            <ToggleRow index="01">
              <span className="row-body">
                <span className="row-title">Artifact</span>
                <span className="row-meta">https://le-vai.github.io/continuity/</span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Founder narrative article
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="03">
              <span className="row-body">
                <span className="row-title">Audience and context</span>
                <span className="row-meta">
                  Public builders on X via @levainbey — feed context, not reading
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="04">
              <span className="row-body">
                <span className="row-title">Governing rules</span>
                <span className="row-meta">
                  Contract v0.3.0 · Kit One Design Review · VAI brand boundary
                </span>
              </span>
            </ToggleRow>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="dimensions">
          <h2 className="doctrine-heading">Dimension findings</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each dimension: observation, judgment, action — Kit One format.
          </p>
          <div className="principle-list">
            {DIMENSIONS.map((d) => (
              <div className="principle" key={d.num}>
                <span className="principle-num">{d.num}</span>
                <div className="principle-body">
                  <h3>{d.title}</h3>
                  <p>
                    <strong style={{ color: 'var(--muted)' }}>Observation.</strong>{' '}
                    {d.observation}
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    <strong style={{ color: 'var(--muted)' }}>Judgment.</strong>{' '}
                    {d.judgment}
                  </p>
                  <p
                    style={{
                      marginTop: '0.5rem',
                      color: 'var(--muted-dim)',
                    }}
                  >
                    Action · {d.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up" id="findings">
          <h2 className="doctrine-heading">Findings</h2>
          <CheckGrid items={checkItemsFromStrings(FINDINGS)} />
        </section>

        <section className="doctrine-section fade-up" id="sources">
          <h2 className="doctrine-heading">Sources used</h2>
          <div className="row-stack" role="list">
            {SOURCES.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="row"
                role="listitem"
                data-cuelume-hover="whisper"
                data-cuelume-press
              >
                <span className="row-index">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="row-body">
                  <span className="row-title">{item.title}</span>
                  <span className="row-meta">{item.meta}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="status-note">
          Case study · Continuity. Outcome: needs revision. Channel-format
          mismatch — the artifact is retained as a reference; the feed
          format is not reused.
        </div>
      </main>

      <Footer />
    </>
  );
}