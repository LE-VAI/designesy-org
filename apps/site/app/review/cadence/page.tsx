import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { pageMeta } from '../../lib/site-meta';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { AgentActions } from '../../lib/agent-actions';
import { designReviewKit } from '../../lib/kits/design-review';
import { labs } from '../../lib/labs';

export const metadata: Metadata = pageMeta({
  title: 'Cadence field check',
  description:
    'Public Design Review of Lab Three · Cadence in the Kit One output format: eight dimensions, holds, tensions, corrections, and verification.',
  path: '/review/cadence',
  ogTitle: 'Cadence · field check',
  ogDescription:
    'Lab Three reviewed with Use Kit One · Design Review. Pass with notes: typography rules adopted in contract v0.1.3.',
  twitterDescription: 'Design Review of Lab Three · designesy.org/review/cadence',
});

const DIMENSIONS = [
  {
    num: '01',
    title: 'Purpose',
    observation:
      'Cadence states a single job: make text feel composed rather than placed. The live artifact (this page), thesis, principles, portable rules, builder prompt, checklist, provenance, and anti-patterns all serve that job.',
    judgment:
      'Purpose is clear and earns the form. The lab is an inspectable set of rules with exact values verified on live CSS.',
    action: 'Keep. Do not add decorative typography demos that dilute the rules.',
  },
  {
    num: '02',
    title: 'Clarity',
    observation:
      'Primary path is immediate: Lab Three eyebrow, title Cadence, lede, then the live artifact note (this page is the demo). Every rule is expressed with an exact value.',
    judgment:
      'Primary value proposition is discoverable. Form suggests use. Each principle pairs explanation with concrete CSS values.',
    action: 'Keep. Preserve exact-value callouts next to every rule.',
  },
  {
    num: '03',
    title: 'Context',
    observation:
      'Built for the public designesy.org surface: dark foundation, system font stack, shared topbar. The lab assumes desktop and mobile browsers; long anatomy sections still ask for scroll patience on small screens.',
    judgment:
      'Context fits a public lab. Dense doctrine below the fold is acceptable; the live artifact is the page itself, so the demo is always visible.',
    action:
      'Document. Keep demo-first on narrow widths. No decorative font demos until contracted.',
  },
  {
    num: '04',
    title: 'Inclusion',
    observation:
      'Rem-based scale respects user font-size preferences. 16px input floor prevents iOS auto-zoom. text-wrap: pretty improves readability across viewports. font-synthesis: none is now set on :root, which prevents fake browser weights. text-underline-position: from-font and text-decoration-skip-ink: auto are set, so underlines align to font metrics and skip descenders.',
    judgment:
      'Structural inclusion is strong. The font-synthesis and underline-position gaps identified in the initial field check have been resolved in globals.css. Remaining inclusion work is block-axis logical property migration.',
    action:
      'Document the fixes. Keep font-synthesis: none and text-underline-position: from-font in :root. Migrate block-axis logical properties when safe.',
  },
  {
    num: '05',
    title: 'System coherence',
    observation:
      'Values cite contract tokens: --signal for ::selection, --maxw for measure, system stack for body. The typography block in the contract already documents the scale. Cadence extends the system without inventing a second font family.',
    judgment:
      'Strong coherence. Cadence refines the existing typography block without introducing new tokens or fonts. Adoption is explicit.',
    action:
      'Keep lab demo, contract.typography, and live CSS synchronized after adoption.',
  },
  {
    num: '06',
    title: 'Durability',
    observation:
      'Full lab anatomy is present. Builder prompt is remixable. Rules are system-agnostic: express them in any styling system. The system stack is the contract; no web font dependency to maintain.',
    judgment:
      'Durable as a lab package and as contract material. Risk is dual-source drift if contract.typography and live CSS diverge later.',
    action:
      'When any typography value changes, update live CSS, lab notes, and contract.typography together.',
  },
  {
    num: '07',
    title: 'Delight',
    observation:
      'text-wrap: balance on headings and pretty on body add quiet polish: the browser handles line breaking without JavaScript. ::selection styled with the accent blue makes every selection feel intentional. Tabular numbers make data feel precise.',
    judgment:
      'Delight is earned through composition. The cadence of text is the delight; it needs no glow, animation, or spectacle.',
    action: 'Keep restraint. Reject decorative typography proposals that fail the thesis.',
  },
  {
    num: '08',
    title: 'Responsibility',
    observation:
      'No dark pattern in typography. Rem-based scale respects user preferences. 16px input floor is a real accessibility protection. Open tensions are documented: block-axis logical properties remain physical. font-synthesis: none and text-underline-position: from-font have been resolved in globals.css and removed from open tensions.',
    judgment:
      'Status is explicit: live experiment whose rules are now contract material. Two of three original tensions are resolved; one remains (logical properties). Status accuracy is a standing hold.',
    action:
      'Keep status language accurate. Future rule changes require a new contract version.',
  },
];

const HOLDS = [
  'Thesis is sharp: text rhythm is composed rather than placed',
  'Live artifact is the page itself: every rule is visible as you read',
  '10 verified rules, each with an exact value',
  'Full lab anatomy shipped (thesis through verification)',
  'Public name is human and premium: Cadence',
  'Typography rules adopted into design system contract v0.1.3',
  'Open tensions named: logical properties remain; font-synthesis and underline-from-font resolved',
];

// Open and resolved tensions are one list: each cell carries its state, so
// the two resolved on 2026-07-15 sit beside the two still open instead of
// in a second section of their own.
const TENSIONS = [
  {
    title: 'Block-axis logical properties not migrated',
    meta: 'margin-block-start/end and border-inline-start still physical; direction-ready is partial (inline-axis only)',
    status: 'Open',
  },
  {
    title: 'Inter not self-hosted',
    meta: 'Named in the system stack but not bundled. The system fallback is intentional; self-hosting remains a future option',
    status: 'Open',
  },
  {
    title: 'font-synthesis: none',
    meta: 'Added to :root in globals.css; prevents the browser from synthesizing fake weights (fixed 2026-07-15)',
    status: 'Resolved',
  },
  {
    title: 'text-underline-position and skip-ink',
    meta: 'text-underline-position: from-font and text-decoration-skip-ink: auto added to :root, so underlines align to font metrics and skip descenders (fixed 2026-07-15)',
    status: 'Resolved',
  },
];

const CORRECTIONS = [
  {
    title: 'font-synthesis: none added to :root · APPLIED',
    meta: 'Prevents the browser from synthesizing fake weights with one line in globals.css (fixed 2026-07-15)',
  },
  {
    title: 'text-underline-position: from-font and text-decoration-skip-ink: auto added to :root · APPLIED',
    meta: 'Aligns underlines to font metrics and skips descenders, which improves link readability (fixed 2026-07-15)',
  },
  {
    title: 'Migrate block-axis physical properties to logical ones',
    meta: 'Replace margin-block-start/end and border-inline-start with logical equivalents for direction-ready layouts',
  },
  {
    title: 'Version future typography changes',
    meta: 'New type rules require a contract bump after ' + CONTRACT_VERSION + ', never silent edits',
  },
  {
    title: 'Keep machine export and human tables aligned',
    meta: 'design-system.json and /contracts must show the same adopted cadence rules',
  },
];

const VERIFICATION = [
  'Live route inspected: /labs/cadence structure, demo blocks, status language',
  'Live CSS audit (48,755 bytes): font smoothing, line-heights, letter-spacing, text-wrap, tabular-nums, ::selection, user-select all parsed',
  'Compared to design system contract ' + CONTRACT_VERSION + ' typography block',
  'Compared to Use Kit One · Design Review output format',
  'Checked anti-patterns: no px font sizes, no decorative display fonts, no default ::selection',
  'Checked naming: Cadence remains human product language',
  '10 rules verified pass, 3 rules verified fail (open tensions documented)',
  'Mobile: 16px root, rem-based scale, text-wrap: pretty confirmed',
];

const REVIEWED = '2026-07-13';

const SUMMARY =
  'Cadence is a considered lab. The live CSS audit confirms 12 of 13 verifiable typography rules: font smoothing on root, rem-based scale, line-height by role, tracking by size, measure cap, text-wrap balance and pretty, tabular numbers, ::selection with the accent blue, user-select on UI chrome, 16px input floor, font-synthesis: none, and text-underline-position: from-font. Two rules identified in the initial field check have been resolved in globals.css. One rule remains open: block-axis logical properties are not yet migrated (inline-axis is done). Typography rules are adopted into design system contract v0.1.3. Remaining work is block-axis migration and synchronization; adoption is settled.';

const SOURCES = [
  {
    href: '/labs/cadence',
    title: 'Lab Three · Cadence',
    meta: 'Artifact under review',
    role: `Artifact · lab v${labs.cadence.version}`,
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Method and output format',
    role: `Method · kit v${designReviewKit.version}`,
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract ' + CONTRACT_VERSION,
    meta: 'Governing tokens · typography block (Cadence adopted in v0.1.3)',
    role: `Rules · ${CONTRACT_VERSION}`,
  },
  {
    href: 'https://github.com/jakubkrehel/skills',
    title: 'Krehel /better-typography',
    meta: '18 typography principles (MIT): source material',
    role: 'Source · MIT',
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Prior field check pattern (Lab One)',
    role: 'Prior review',
  },
  {
    href: '/review',
    title: 'Review surface',
    meta: 'Eight dimensions doctrine',
    role: 'Doctrine',
  },
];

export default function CadenceFieldCheckPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/review" className="lab-crumb">
              Review
            </Link>
            <span aria-hidden="true"> · </span>
            Field check
          </p>
          <h1 className="surface-title" data-scramble>Cadence</h1>
          <p className="surface-lede">
            Lab Three reviewed with Use Kit One · Design Review.
          </p>
          <p className="surface-note">
            This packet applies the public Design Review kit to a single live
            experiment. Outcome leads with consequences:
            what holds, what stays open, and what to do next.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Pass with notes</span>
            <span className="lab-meta-item">Kit · Design Review</span>
            <span className="lab-meta-item">Artifact · /labs/cadence</span>
            <span className="lab-meta-item">Date · {REVIEWED}</span>
          </div>
          <AgentActions mdPath="/review/cadence.md" label="the cadence review" />
        </section>

        <section className="doctrine-section fade-up" id="summary">
          <h2 className="doctrine-heading">Summary</h2>
          <div className="definition definition-split" data-copy={SUMMARY} data-copy-label="summary">
            <div className="definition-face">
              <p className="definition-label">Outcome · pass with notes</p>
              <p>{SUMMARY}</p>
            </div>
            <div className="definition-side">
              <span className="row-side-chip" data-state="warn">
                Pass with notes
              </span>
              <dl>
                <div>
                  <dt>Kit</dt>
                  <dd>Design Review v{designReviewKit.version}</dd>
                </div>
                <div>
                  <dt>Artifact</dt>
                  <dd>/labs/cadence</dd>
                </div>
                <div>
                  <dt>Adopted</dt>
                  <dd>Contract v0.1.3</dd>
                </div>
                <div>
                  <dt>Reviewed</dt>
                  <dd>{REVIEWED}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up" id="inputs">
          <h2 className="doctrine-heading">Inputs used</h2>
          <div className="row-stack" role="list">
            <ToggleRow index="01">
              <span className="row-body">
                <span className="row-title">Artifact</span>
                <span className="row-meta">
                  https://www.designesy.org/labs/cadence
                </span>
              </span>
              <span className="row-side">
                <span className="row-side-line">{'{{ARTIFACT}}'}</span>
              </span>
            </ToggleRow>
            <ToggleRow index="02">
              <span className="row-body">
                <span className="row-title">Purpose claim</span>
                <span className="row-meta">
                  Make text feel composed rather than placed
                </span>
              </span>
              <span className="row-side">
                <span className="row-side-line">{'{{PURPOSE}}'}</span>
              </span>
            </ToggleRow>
            <ToggleRow index="03">
              <span className="row-body">
                <span className="row-title">Audience and context</span>
                <span className="row-meta">
                  Public builders, agents, and reviewers on designesy.org
                </span>
              </span>
              <span className="row-side">
                <span className="row-side-line">{'{{CONTEXT}}'}</span>
              </span>
            </ToggleRow>
            <ToggleRow index="04">
              <span className="row-body">
                <span className="row-title">Governing rules</span>
                <span className="row-meta">
                  Contract {CONTRACT_VERSION} · Kit One Design Review · Krehel /better-typography
                </span>
              </span>
              <span className="row-side">
                <span className="row-side-line">{'{{RULES}}'}</span>
              </span>
            </ToggleRow>
          </div>
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
              <div role="listitem" key={item.href}>
                <Link
                  href={item.href}
                  className="row"
                  data-cuelume-hover="bloom"
                  data-cuelume-press
                >
                  <span className="row-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="row-body">
                    <span className="row-title">{item.title}</span>
                    <span className="row-meta">{item.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{item.role}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Related</h2>
          <div className="row-stack" role="list">
            <div role="listitem">
              <Link
                href="/labs/cadence"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">01</span>
                <span className="row-body">
                  <span className="row-title">Open Lab Three · Cadence</span>
                  <span className="row-meta">Live artifact</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/labs/cadence</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
            <div role="listitem">
              <Link
                href="/labs/takt"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">02</span>
                <span className="row-body">
                  <span className="row-title">Lab Two · Takt</span>
                  <span className="row-meta">Prior field check pattern</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/labs/takt</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
            <div role="listitem">
              <Link
                href="/kits/design-review"
                className="row"
                data-cuelume-hover="bloom"
                data-cuelume-press
              >
                <span className="row-index">03</span>
                <span className="row-body">
                  <span className="row-title">Use Kit One · Design Review</span>
                  <span className="row-meta">Run the same method on your work</span>
                </span>
                <span className="row-side">
                  <span className="row-side-line">/kits/design-review</span>
                  <span className="row-side-arrow" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
        </section>

        <div className="status-note">
          Field check of Lab Three · Cadence using Use Kit One · Design Review.
          Outcome: pass with notes. Institutional quality discipline. It is not
          a client report. Typography rules are adopted into contract v0.1.3;
          remaining notes are the block-axis migration and synchronization.
        </div>
      </main>

      <Footer />
    </>
  );
}