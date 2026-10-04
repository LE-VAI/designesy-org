import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { pageMeta } from '../../lib/site-meta';
import { AgentActions } from '../../lib/agent-actions';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import '../../instrument.css';
import '../work.css';
import { InputList, SourceList, ViewsReadout, type Input, type Source } from '../case-instrument';

export const metadata: Metadata = pageMeta({
  title: 'Continuity: case study',
  description:
    'A founder-narrative article published as a single X post. Channel-format mismatch documented with eight-dimension review.',
  path: '/work/continuity',
  ogTitle: 'Continuity · case study',
  ogDescription:
    'A founder-narrative article reviewed against the design system contract. Outcome: channel-format mismatch.',
  twitterDescription: 'Continuity case study · designesy.org/work/continuity',
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
      'Clean structure, clear sections. Yellow-field addressing with black rounded cards, a distinct mode from the dark default.',
    judgment: 'Clarity is strong in the artifact. The publication format was the constraint; the writing held up.',
    action: 'Retain at the hosted URL as a reference.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Deployed on GitHub Pages. X audience (1,891 followers, building-in-public) rewards shipped product demos over narrative content. The context is a feed rather than a reading surface.',
    judgment: 'Channel-format mismatch. The artifact is sound; the distribution channel was wrong for this format.',
    action: 'Match format to channel. Keep the hosted URL as a profile reference.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Yellow-field mode is a deliberate VAI surface choice: dark default with a toggle into yellow addressing. Article text is readable. No dark pattern.',
    judgment: 'Inclusion is sound. The dark/yellow toggle is an accessibility-aware choice.',
    action: 'Retain the dark/yellow toggle.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'VAI yellow #FFC400 as the field, black rounded cards, VAI wordmark only. Designesy activation yellow #FECC34 is deliberately suppressed. Deployment pattern matches Tile.',
    judgment: 'Coherent within the VAI surface. The yellow-field mode is a distinct address within the doctrine.',
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
      'Yellow-field mode is visually striking. Article voice is sincere. Feed-context delight requires immediate payoff, and a long backstory delays it.',
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
  'Single engagement data point: the pattern is consistent, but the sample is too small to be statistically robust',
];

/* Each input's datum sits in its row's side pane: the host, the post and
   its date, the account it went out on, the contract version. */
const INPUTS: Input[] = [
  {
    title: 'Artifact',
    meta: 'Long-form article on GitHub Pages: dark default with a yellow-field mode',
    side: ['le-vai.github.io/continuity'],
  },
  {
    title: 'Purpose claim',
    meta: 'Founder narrative article',
    side: ['1 X post · 2026-07-12'],
  },
  {
    title: 'Audience and context',
    meta: 'Public builders on X, in a feed context',
    side: ['@levainbey · 1,891 followers'],
  },
  {
    title: 'Governing rules',
    meta: 'Kit One Design Review · VAI brand boundary',
    side: [`Contract ${CONTRACT_VERSION}`],
  },
];

const SOURCES: Source[] = [
  {
    href: 'https://le-vai.github.io/continuity/',
    title: 'Continuity · live artifact',
    meta: 'Founder narrative article',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract ' + CONTRACT_VERSION,
    meta: 'Governing tokens',
  },
  {
    href: '/work/tile',
    title: 'Tile · case study',
    meta: 'Comparison: product demo format',
  },
  {
    href: '/work',
    title: 'Work · case studies',
    meta: 'Index',
  },
];

export default function ContinuityCaseStudyPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page continuity-page">
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
          <AgentActions mdPath="/work/continuity.md" label="the continuity case study" />
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
          {/* No view count was captured for Continuity, so none is drawn: its
              track is an empty well beside Tile's measured bar, and its value
              column says so in the readout's words. */}
          <ViewsReadout
            label="Engagement for Continuity on X, 2026-07-12: not in the top visible posts after 24 hours, beside Tile in the same period"
            date="2026-07-12"
            lamp="warn"
            posts={[
              { label: 'Continuity', views: null, absent: 'Not surfaced' },
              { label: 'Tile', views: 617 },
            ]}
            max={700}
            readout={{ label: 'After 24 hours', text: 'Not surfaced', sub: 'Tile, same period: 617 views' }}
            note="The feed format rewards shipped, visible product over narrative content."
            caption={
              <>
                Continuity did not surface in the top visible posts on the
                profile after 24 hours. Tile&apos;s product-demo format earned
                617 views in the same period.
              </>
            }
          />
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Inputs used</h2>
          <InputList items={INPUTS} />
        </section>

        <section className="doctrine-section fade-up" id="dimensions">
          <h2 className="doctrine-heading">Dimension findings</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Each dimension in Kit One format: observation, judgment, action.
          </p>
          <div className="principle-list">
            {DIMENSIONS.map((d) => (
              <div className="principle" key={d.num}>
                <span className="principle-num">{d.num}</span>
                <div className="principle-body">
                  <h3 className="cs-card-title">{d.title}</h3>
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
          <SourceList items={SOURCES} />
        </section>

        <div className="status-note">
          Case study · Continuity. Outcome: needs revision. Channel-format
          mismatch: the artifact is retained as a reference, and the feed
          format is retired.
        </div>
      </main>

      <Footer />
    </>
  );
}