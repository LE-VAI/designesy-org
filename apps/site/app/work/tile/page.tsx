import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../../lib/topbar';
import { Footer } from '../../../lib/footer';
import { CheckGrid } from '../../../lib/check-grid';
import { checkItemsFromStrings } from '../../../lib/check-items';
import { ToggleRow } from '../../../lib/toggle-row';
import { pageMeta } from '../../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Tile — case study',
  description:
    'Interactive series composer reviewed against the design system contract. 617 views, 3 likes, 1 reply — the only post in 24 hours to break out of the noise floor.',
  path: '/work/tile',
  ogTitle: 'Tile · case study',
  ogDescription:
    'One story, many tiles, shared spine. Shipped, published, reviewed — 617 views on X, the breakout format.',
  twitterDescription: 'Tile case study — designesy.org/work/tile',
  type: 'article',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Tile states a single job: compose a series grid that stays related without Canva-clone energy or multi-post AI copy. The tool, the spine, the roles, and the export all serve that job.',
    judgment:
      'Purpose is sharp and earns the form. The tool is not a template gallery — it is a composition instrument with a shared spine.',
    action: 'Keep. Do not add template presets that dilute the spine model.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'Primary path is immediate: pick a look, pick an accent, compose tiles, download set. Human language leads — Opening, Main point, Proof, Detail, Ending — not role jargon.',
    judgment:
      'Primary action is discoverable. The tool does not explain itself before it works. One screen, one job.',
    action: 'Keep the human-language labels. Do not expose grammar terminology in the public UI.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Self-contained single index.html, no framework, no CDN, no backend. Deployed on GitHub Pages. Screen-records cleanly in 10 to 20 seconds. Works on desktop and mobile.',
    judgment:
      'Context fit is strong — the deployment pattern is minimal and portable. No dependency risk.',
    action: 'Keep the zero-dependency deployment pattern. Document it as the reference for future tools.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Dark default with four look options (Dark, Paper, Slate, Night). Six accent options including Muted. No required audio, no required motion. Keyboard-navigable controls.',
    judgment:
      'Inclusion is structural — look options and accent variety are first-class, not afterthoughts. No dark-pattern defaults.',
    action: 'Keep the look variety. Add a reduced-motion audit when motion is introduced.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'Visual system aligns with VAI brand: dark default, VAI yellow signal #FFC400. Designesy activation yellow #FECC34 is deliberately suppressed in the VAI surface. The tool follows the same deployment pattern as Continuity.',
    judgment:
      'Coherent within the VAI surface. The Designesy graduation path is documented: Lab feel on LE-VAI, then contract, then series production for Designesy public surfaces.',
    action: 'Keep the VAI/Designesy separation explicit. When Tile graduates to Designesy /labs, use Designesy tokens, not VAI yellow.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full BRIEF documents intent, feel, parts, ratios, spine, export, and graduation path. STATUS.md tracks publication state. HOST.md records the live URL, repo, and OG image. The tool is self-contained and will not break from dependency drift.',
    judgment:
      'Durable as a shipped artifact. Documentation is complete enough for another builder to remix or maintain.',
    action: 'Keep BRIEF and STATUS synchronized. When the tool changes, update both.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'Re-harmonizing the whole set from one spine change is the delight moment. No glow, no bounce, no particle trail. The emotional quality is precision, not spectacle.',
    judgment:
      'Delight is earned. The tool feels good to use because the composition model is strong, not because of decorative effects.',
    action: 'Keep restraint. Reject proposals to add animations or effects that do not serve composition.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'No dark pattern in the tool. Export is honest — ordered PNGs, set.json, README.txt, no watermark or lock-in. Publication on X used a one-word root post with a screen recording, not engagement-bait copy.',
    judgment:
      'Honest about what it is and what it produces. The publication format was chosen to show the tool, not to manipulate reach.',
    action: 'Keep the honest publication format. Do not add engagement hooks to the tool or the post copy.',
  },
];

const HOLDS = [
  'Purpose is sharp: compose a series grid that stays related without template energy',
  'Zero-dependency deployment — single index.html, no framework, no CDN',
  'Human-language labels lead, not grammar jargon',
  'Full documentation: BRIEF, STATUS, HOST — intent through hosting',
  'Publication format proven: one word + screen recording = 617 views (breakout)',
  'Designesy graduation path documented and gated',
];

const TENSIONS = [
  {
    title: 'VAI surface, not Designesy surface',
    meta: 'Tile uses VAI yellow #FFC400, not Designesy signal #0133CB. Graduation to /labs requires token reconciliation',
  },
  {
    title: 'No machine export yet',
    meta: 'Tile has no JSON export — the tool itself is not yet a machine-readable package',
  },
  {
    title: 'Single engagement data point',
    meta: '617 views is one post on one day — not a statistically robust sample',
  },
];

const CORRECTIONS = [
  {
    title: 'Plan the Designesy graduation path',
    meta: 'When Tile moves to /labs, swap VAI tokens for Designesy contract tokens',
  },
  {
    title: 'Add a machine export',
    meta: 'A tile.json package export would make the tool machine-consumable',
  },
  {
    title: 'Test the format again',
    meta: 'Republish with the one-word + screen-recording format to confirm the breakout was not a fluke',
  },
];

const VERIFICATION = [
  'Live artifact inspected: le-vai.github.io/tile — tool builds, composes, downloads',
  'Engagement metrics verified via CDP 2026-07-13: 617 views, 3 likes, 1 reply',
  'Compared to design system contract tokens and VAI brand boundary rules',
  'Compared to Use Kit One Design Review output format',
  'Checked anti-patterns: no glow, no template chrome, no engagement bait',
  'Deployment verified: single index.html on GitHub Pages, repo LE-VAI/tile',
  'Documentation verified: BRIEF.md, STATUS.md, HOST.md all present and current',
];

const SOURCES = [
  {
    href: 'https://le-vai.github.io/tile/',
    title: 'Tile — live artifact',
    meta: 'Interactive series composer',
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract v0.1.4',
    meta: 'Governing tokens',
  },
  {
    href: '/review',
    title: 'Review surface',
    meta: 'Eight dimensions doctrine',
  },
  {
    href: '/work',
    title: 'Work — case studies',
    meta: 'Index',
  },
];

export default function TileCaseStudyPage() {
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
          <h1 className="surface-title">Tile</h1>
          <p className="surface-lede">
            Interactive series composer — one story, many tiles, shared spine.
          </p>
          <p className="surface-note">
            A self-contained tool for composing visual tile series from one
            spine. Published on X with a one-word root post and screen
            recording. Reviewed against the design system contract using Use
            Kit One.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Pass with notes</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · le-vai.github.io/tile</span>
            <span className="lab-meta-item">Date · 2026-07-13</span>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition">
            <p className="definition-label">Outcome · pass with notes</p>
            <p>
              Tile is a considered tool. The live artifact proves a composition
              model — one spine, many tiles, human-language roles, zero
              dependencies. Published with a one-word root post and screen
              recording, it earned 617 views on X — the only post in 24 hours
              to break out of the 20 to 60 view noise floor. The format is
              proven: shipped, visible product reaches beyond the immediate
              circle. Remaining work is Designesy graduation, machine export,
              and format re-testing — not re-arguing the tool.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="engagement">
          <h2 className="doctrine-heading">Engagement evidence</h2>
          <div className="definition">
            <p className="definition-label">X post · 2026-07-13</p>
            <p>
              Root post: <strong>617 views, 3 likes, 1 reply</strong>. Try-it
              reply: 61 views, 1 like. The root post outperformed every other
              post type (quote-post, brand repost, founder narrative, text
              build note) by a wide margin. The audience rewarded shipped,
              visible product — not voice, narrative, or adjacency.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Inputs used</h2>
          <div className="row-stack" role="list">
            <ToggleRow index="01">
              <span className="row-body">
                <span className="row-title">Artifact</span>
                <span className="row-meta">https://le-vai.github.io/tile/</span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Compose a series grid that stays related without template energy
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="03">
              <span className="row-body">
                <span className="row-title">Audience and context</span>
                <span className="row-meta">
                  Public builders and creators on X via @levainbey
                </span>
              </span>
            </ToggleRow>
            <ToggleRow index="04">
              <span className="row-body">
                <span className="row-title">Governing rules</span>
                <span className="row-meta">
                  Contract v0.1.4 · Kit One Design Review · VAI brand boundary
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
                data-cuelume-release
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
          Case study of Tile using Use Kit One · Design Review. Outcome: pass
          with notes. Shipped tool with proven engagement — 617 views on a
          one-word product demo. Remaining notes are Designesy graduation,
          machine export, and format re-testing.
        </div>
      </main>

      <Footer />
    </>
  );
}