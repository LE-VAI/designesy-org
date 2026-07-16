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
    'Founder narrative article reviewed against the design system contract. The multi-post thread was deleted as overwhelming. Even the single-post version underperformed a one-word product demo.',
  path: '/work/continuity',
  ogTitle: 'Continuity · case study',
  ogDescription:
    'The same idea, finally built. Shipped, published, reviewed honestly — the narrative format underperformed the product demo.',
  twitterDescription: 'Continuity case study — designesy.org/work/continuity',
  type: 'article',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Continuity states its job: a founder narrative — the same idea, finally built. The article, the visual brief, and the publication form all serve that job.',
    judgment:
      'Purpose is clear. The narrative is honest and the motive is real. But purpose does not guarantee reach — the audience rewarded product, not story.',
    action: 'Keep the article as a reference artifact. Do not re-publish the narrative format on X.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'The article is well-written: clean structure, honest voice, clear sections. The visual surface uses yellow-field addressing with black rounded cards — a distinct mode from the dark default.',
    judgment:
      'Clarity is strong in the artifact. The publication format was the problem, not the writing. A long backstory in a link card does not communicate in a scroll feed.',
    action: 'Keep the article at its hosted URL. Use it as a reference, not a feed post.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Deployed on GitHub Pages, same pattern as Tile. The X audience (1,891 followers, building-in-public) showed a clear preference: shipped product demos outperform narrative content. The context is a feed, not a reading surface.',
    judgment:
      'Context mismatch was the core failure. The artifact is good; the distribution channel was wrong for this format.',
    action: 'Match the format to the channel. Use the hosted URL as a reference in bio or profile, not as a feed post.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Yellow-field mode is a deliberate VAI surface choice. Dark default with a toggle into yellow addressing. The article text is readable. No dark pattern in the publication.',
    judgment:
      'Inclusion is fine in the artifact. The toggle between dark and yellow is an accessibility-aware choice.',
    action: 'Keep the dark/yellow toggle. No changes needed for inclusion.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'Visual system uses VAI yellow #FFC400 as the field, black rounded cards, VAI wordmark only. Designesy activation yellow #FECC34 is deliberately suppressed. The deployment pattern matches Tile exactly.',
    judgment:
      'Coherent within the VAI surface. The yellow-field mode is a distinct address, not a violation of the dark-default doctrine — it is intentional VAI addressing.',
    action: 'Keep the yellow-field mode as a VAI-specific surface option. Do not import it into Designesy.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full documentation: ARTICLE_DRAFT, VISUAL_BRIEF, STATUS, build scripts, host, preview, renders. The article is locked. The hosting is live. The publication receipt is recorded.',
    judgment:
      'Durable as a reference artifact. The documentation is complete enough to maintain and understand the intent.',
    action: 'Keep the article live at its hosted URL. Update STATUS if the narrative is ever revised.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'The yellow-field mode is visually striking. The article voice is sincere. But delight in a feed context requires immediate payoff — a long backstory does not deliver that.',
    judgment:
      'Delight is present in the artifact but did not translate to engagement. The emotional quality of the writing works on a reading surface, not in a scroll feed.',
    action: 'Accept that delight is channel-dependent. Keep the artifact; change the distribution.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'The review process caught the problem honestly: the multi-post thread was deleted as overwhelming and overly AI. The single-post version was a correction. The underperformance is documented, not hidden.',
    judgment:
      'Responsibility is the strongest dimension here. The failure was caught, corrected, and reported — which is exactly what the review discipline is for.',
    action: 'Keep documenting failures honestly. This case study is the evidence that the review process works.',
  },
];

const HOLDS = [
  'Article is well-written and honest — the motive is real',
  'Visual surface is coherent: yellow-field addressing with black rounded cards',
  'Deployment pattern is solid: GitHub Pages, same as Tile',
  'Full documentation: ARTICLE_DRAFT, VISUAL_BRIEF, STATUS, build scripts',
  'Review process caught the problem: multi-post thread deleted, single-post corrected',
  'Failure is documented honestly, not hidden',
];

const TENSIONS = [
  {
    title: 'Narrative format underperformed',
    meta: 'Continuity did not surface in top visible posts after 24 hours — underperformed a one-word product demo',
  },
  {
    title: 'Channel-format mismatch',
    meta: 'A long backstory in a link card does not communicate in a scroll feed — the artifact is good, the channel was wrong',
  },
  {
    title: 'Single engagement data point',
    meta: 'One post on one day is not a statistically robust sample — but the pattern matches the stored lesson',
  },
];

const CORRECTIONS = [
  {
    title: 'Use the hosted URL as a reference, not a feed post',
    meta: 'Put the Continuity URL in bio or profile, not in the feed',
  },
  {
    title: 'Match format to channel',
    meta: 'Feed = product demo. Reading surface = article. Do not mix them',
  },
  {
    title: 'Test the product-demo format for Continuity',
    meta: 'If Continuity is re-published, use a one-word + screen-recording format showing the yellow-field mode',
  },
];

const VERIFICATION = [
  'Live artifact inspected: le-vai.github.io/continuity — article renders, yellow-field toggle works',
  'Engagement checked via CDP 2026-07-13: did not surface in top visible posts after 24 hours',
  'Publication history verified: multi-post thread deleted, single-post corrected, receipt recorded',
  'Compared to design system contract tokens and VAI brand boundary rules',
  'Compared to Use Kit One Design Review output format',
  'Documentation verified: ARTICLE_DRAFT, VISUAL_BRIEF, STATUS all present',
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
    meta: 'Comparison: product demo that broke out',
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
            Founder narrative — the same idea, finally built.
          </p>
          <p className="surface-note">
            A founder-narrative article published as a single X post with
            preview URL. The multi-post thread was deleted as overwhelming
            and overly AI. Even the single-post version underperformed a
            one-word product demo. Reviewed honestly — including what the
            review process caught.
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
              Continuity is a well-built artifact with an honest motive. The
              article is clearly written, the visual surface is coherent, and
              the deployment is solid. But the publication format failed:
              a long backstory in a link card did not communicate in a scroll
              feed. The multi-post thread was deleted as overwhelming and
              overly AI. The single-post correction still underperformed.
              This is not a failure of the artifact — it is a channel-format
              mismatch. The review process caught the problem, corrected it,
              and documented it. That honesty is the value of this case
              study.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="engagement">
          <h2 className="doctrine-heading">Engagement evidence</h2>
          <div className="definition">
            <p className="definition-label">X post · 2026-07-12</p>
            <p>
              Continuity did not surface in the top visible posts on the
              profile after 24 hours — underperforming Tile&apos;s 617 views
              by a wide margin. The audience rewarded shipped, visible
              product, not voice or narrative. This matches the stored
              lesson: the multi-post thread was deleted as overwhelming and
              overly AI, and even the single-post version carried too much
              text weight for the audience.
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
                  Founder narrative — the same idea, finally built
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
                  <p style={{ marginTop: '0.45rem' }}>
                    <strong style={{ color: 'var(--muted)' }}>Judgment.</strong>{' '}
                    {d.judgment}
                  </p>
                  <p
                    style={{
                      marginTop: '0.45rem',
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

        <section className="doctrine-section fade-up" id="holds">
          <h2 className="doctrine-heading">Holds</h2>
          <CheckGrid items={checkItemsFromStrings(HOLDS)} />
        </section>

        <section className="doctrine-section fade-up" id="tensions">
          <h2 className="doctrine-heading">Tensions</h2>
          <CheckGrid items={TENSIONS} />
        </section>

        <section className="doctrine-section fade-up" id="corrections">
          <h2 className="doctrine-heading">Corrections</h2>
          <CheckGrid items={CORRECTIONS} />
        </section>

        <section className="doctrine-section fade-up" id="verification">
          <h2 className="doctrine-heading">Verification performed</h2>
          <CheckGrid items={checkItemsFromStrings(VERIFICATION)} />
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
          Case study of Continuity using Use Kit One · Design Review.
          Outcome: needs revision. The artifact is good; the publication
          format failed. The review process caught the problem, corrected
          it, and documented it. That honesty is the value — not every
          artifact succeeds, and the discipline is in reporting it.
        </div>
      </main>

      <Footer />
    </>
  );
}