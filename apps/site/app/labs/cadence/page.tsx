import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { CopyPrompt } from '../../lib/copy-prompt';
import { DemoCell, DemoGrid } from '../../lib/demo-cell';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Cadence',
  description:
    'Lab Three — text rhythm: font declaration, scale, leading, tracking, measure, wrapping, numbers, and selection. Rules compiled from external typography intelligence and verified against designesy.org.',
  path: '/labs/cadence',
  ogTitle: 'Cadence · Lab Three — Designesy',
  ogDescription:
    'The rhythm of text on a page. Font declaration, scale, leading, tracking, measure, wrapping, tabular numbers, and selection styling — portable rules with exact values.',
  twitterDescription:
    'Text rhythm as portable rules — scale, leading, tracking, measure, wrapping, numbers. designesy.org/labs/cadence',
});

/**
 * Lab anatomy coverage — confirms every required lab section is present.
 */
const ANATOMY_DONE = [
  'Live artifact — this page is the demo',
  'Thesis — what cadence means here',
  'Principle — five rules with exact values',
  'Portable contract — rules agents can cite',
  'Implementation notes — builder prompt',
  'Review checklist — what to inspect',
  'Provenance — external sources ingested',
  'Anti-patterns — what cadence is not',
  'Remix notes — how to adapt',
  'Lab anatomy coverage',
  'Verification — evidence on designesy.org',
  'Field check — reviewed with Kit One',
];

const PRINCIPLES = [
  {
    num: '01',
    title: 'Font declaration on root',
    body: 'Set font-smoothing on the root element: -webkit-font-smoothing: antialiased and -moz-osx-font-smoothing: grayscale. Set font-synthesis: none to prevent the browser from synthesizing fake weights. Name a system stack with Inter as the first named face — no decorative display fonts for public UI.',
  },
  {
    num: '02',
    title: 'Scale, measure, and leading',
    body: 'Every size is a rem multiple of the 16px root — never px for text. Line-height by role: 1.05–1.1 for headings, 1.5–1.6 for body, 1 for display. Cap the measure: 520–580px for body text, 1080px for the layout shell. Text wider than 75 characters loses the reader.',
  },
  {
    num: '03',
    title: 'Tracking by size',
    body: 'Letter-spacing is negative for large text (-0.02em to -0.04em) and positive for small caps and labels (0.03em–0.18em). Body text at 16px gets zero tracking. The pattern is mechanical: bigger type tightens, smaller type loosens.',
  },
  {
    num: '04',
    title: 'Wrap, numbers, and selection',
    body: 'text-wrap: balance on headings, text-wrap: pretty on body — the browser handles line breaking without JavaScript. Tabular numbers (font-variant-numeric: tabular-nums) for all data, stats, and numerical tables. Style ::selection with a token color — never default browser blue.',
  },
  {
    num: '05',
    title: 'Direction and underlines',
    body: 'Use logical properties (margin-inline, padding-inline, inset-inline) instead of physical ones so the layout is direction-ready. Set text-underline-position: from-font and text-decoration-skip-ink: auto so underlines align to font metrics and skip descenders. Inputs never below 16px on mobile to avoid iOS auto-zoom.',
  },
];

const CONTRACT_RULES = [
  { title: 'Font smoothing on root', meta: 'antialiased + grayscale on :root — no subpixel rendering noise' },
  { title: 'Rem-based scale', meta: 'Every text size is a rem multiple of the 16px root — never px' },
  { title: 'Line-height by role', meta: 'Headings 1.05–1.1, body 1.5–1.6, display 1 — never a single global line-height' },
  { title: 'Tracking by size', meta: 'Negative for headings (-0.02 to -0.04em), positive for labels (0.03–0.18em), zero for body' },
  { title: 'Cap the measure', meta: 'Body text 520–580px max, layout shell 1080px — text wider than 75ch loses readers' },
  { title: 'Wrap deliberately', meta: 'text-wrap: balance on headings, text-wrap: pretty on body' },
  { title: 'Tabular numbers', meta: 'font-variant-numeric: tabular-nums for data, stats, and numerical tables' },
  { title: 'Selection and user-select', meta: '::selection styled with a token color, user-select: none on UI chrome' },
  { title: '16px input floor', meta: 'Inputs never below 16px on mobile — avoids iOS auto-zoom' },
  { title: 'No decorative display fonts', meta: 'System stack is the contract — no invented display faces for public UI' },
];

const REVIEW_CHECKS = [
  'Font-smoothing is set on :root (antialiased + grayscale)',
  'Every text size uses rem — no px font sizes',
  'Line-height differs by role: headings ~1.08, body ~1.55, display 1',
  'Letter-spacing is negative on headings, positive on labels, zero on body',
  'Body text is capped at 520–580px or 75ch maximum',
  'text-wrap: balance on headings, text-wrap: pretty on body',
  'Tabular numbers on every numerical table, stat, or data column',
  '::selection is styled with a token color — not browser default blue',
  'user-select: none on UI chrome (buttons, labels, meta) — text is selectable',
  'Inputs are at least 16px on mobile to prevent iOS auto-zoom',
];

const PROVENANCE = [
  'Jakub Krehel (@jakubkrehel) — /better-typography skill, 18 typography principles, MIT',
  'Font smoothing on root — Krehel /better-typography principle 15',
  'Line-height by role — Krehel /better-typography principle 5',
  'Letter-spacing by size — Krehel /better-typography principle 6',
  'Cap the measure — Krehel /better-typography principle 7',
  'text-wrap: balance + pretty — Krehel /better-typography principle 8',
  'Tabular numbers — Krehel /better-typography principle 9',
  '::selection styling — Krehel /better-typography principle 17',
  'user-select: none on UI — Krehel /better-typography principle 18',
  'Cross-referenced against Designesy design system contract v0.1.2; adopted into v0.1.3',
];

const ANTI = [
  'Pixel-based font sizes — breaks user zoom and accessibility',
  'Single global line-height for all text',
  'Positive letter-spacing on headings or negative on labels',
  'Full-width body text with no max-width cap',
  'Default browser ::selection blue',
  'Proportional numbers in data tables and stats',
  'Inputs below 16px on mobile (triggers iOS auto-zoom)',
  'Invented decorative display fonts for public UI',
  'font-synthesis left at default (browser synthesizes fake weights)',
  'Physical properties (margin-left, padding-right) instead of logical ones',
];

const BUILDER_PROMPT = `You are working with Designesy Lab Three: Cadence.

Authority: designesy.org is the canonical public source for Designesy
open design intelligence. Cadence is Lab Three — text rhythm as portable
rules with exact values.

Permission: read-only by default. Inspect, review, and report.
Do not edit files, deploy changes, or claim write authority
the operator did not grant.

Goal: Review the target interface for cadence — the rhythm and
readability of text on the page. Check every rule below and report
which pass, which fail, and which are not applicable.

Rules (exact values, not preferences):
  1. Font smoothing: antialiased + grayscale on :root
  2. Rem-based scale: every text size is a rem multiple of 16px root
  3. Line-height by role: headings 1.05–1.1, body 1.5–1.6, display 1
  4. Tracking by size: negative headings, positive labels, zero body
  5. Cap the measure: body 520–580px, shell 1080px, never >75ch
  6. Wrap deliberately: balance on headings, pretty on body
  7. Tabular numbers: tabular-nums on all data, stats, and tables
  8. Selection: ::selection styled with a token color
  9. user-select: none on UI chrome, text stays selectable
  10. 16px input floor on mobile

Open tensions (not yet fully verified on designesy.org):
  - Block-axis logical properties not yet migrated (margin-block-start/end)
  - border-inline-start not yet used — decorative borders still physical
  - inset-inline not yet used — absolute positioning still left/right

Resolved tensions (v0.1.3 CSS fixes applied):
  - font-synthesis: none now set on :root
  - text-underline-position: from-font now set on :root
  - text-decoration-skip-ink: auto now set on :root
  - Inline-axis logical properties (margin-inline, padding-inline) applied

Output format:
  For each rule, provide a Before/After table:
  | Rule | Current | Fix (if needed) |
  Group by rule heading. Omit rules that have no findings.
  Express all fixes in the target project's styling system.

Provenance: rules compiled from external design intelligence
(Jakub Krehel /better-typography, MIT), cross-referenced against
contract v0.1.2, and adopted into design system contract v0.1.3.

Primary lab page: https://www.designesy.org/labs/cadence
Design system contract: https://www.designesy.org/contracts/design-system
Design Review kit: https://www.designesy.org/kits/design-review`;

export default function CadenceLabPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/labs" data-cuelume-hover="tick" data-cuelume-press="tick">
              Labs
            </Link>
            {' · Lab Three'}
          </p>
          <h1 className="surface-title" data-scramble>Cadence</h1>
          <p className="surface-lede">
            Text rhythm — the flow of words across a surface. Font
            declaration, scale, leading, tracking, measure, wrapping,
            numbers, and selection.
          </p>
          <p className="surface-note">
            Lab Three studies the typographic decisions that make text feel
            composed rather than placed. Rules are compiled from external
            typography intelligence, cross-referenced against the Designesy
            contract, and verified on designesy.org. You are reading the
            live artifact right now.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Live</span>
            <span className="lab-meta-item">
              Status · v0.1
            </span>
            <span className="lab-meta-item">
              Contract ·{' '}
              <Link href="/contracts/design-system" data-cuelume-hover="tick" data-cuelume-press="tick">
                v0.1.4
              </Link>
            </span>
            <span className="lab-meta-item">
              Field check ·{' '}
              <Link href="/review/cadence" data-cuelume-hover="tick" data-cuelume-press="tick">
                pass with notes
              </Link>
            </span>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Live artifact</h2>
          <div className="definition">
            <p className="definition-label">This page is the demo</p>
            <p>
              Every line you are reading demonstrates cadence: the system
              stack with font-smoothing on root, the rem-based scale (body at
              16px, headings climbing in rem multiples), line-height 1.55 on
              body and 1.08 on headings, negative tracking on titles and
              positive tracking on the eyebrow labels above them, text-wrap:
              balance on headings, text-wrap: pretty on body, tabular-nums on
              every number on this page, and ::selection styled with signal
              blue. Select any text on this page to see it.
            </p>
          </div>

          <DemoGrid>
            <DemoCell label="Rem scale" note="Every size is a rem multiple of 16px">
              <div className="demo-scale">
                <div className="demo-scale-row">
                  <span>0.75rem</span>
                  <span className="demo-scale-spec s1">Aa</span>
                </div>
                <div className="demo-scale-row">
                  <span>1rem</span>
                  <span className="demo-scale-spec s2">Aa</span>
                </div>
                <div className="demo-scale-row">
                  <span>1.5rem</span>
                  <span className="demo-scale-spec s3">Aa</span>
                </div>
                <div className="demo-scale-row">
                  <span>2rem</span>
                  <span className="demo-scale-spec s4">Aa</span>
                </div>
              </div>
            </DemoCell>

            <DemoCell label="Tracking by size" note="Negative headings · zero body · positive labels">
              <div className="demo-tracking">
                <div className="demo-tracking-row">
                  <span>-0.03em</span>
                  <span className="demo-tracking-heading">Heading</span>
                </div>
                <div className="demo-tracking-row">
                  <span>0</span>
                  <span className="demo-tracking-body">Body text at rest</span>
                </div>
                <div className="demo-tracking-row">
                  <span>+0.12em</span>
                  <span className="demo-tracking-label">Label</span>
                </div>
              </div>
            </DemoCell>

            <DemoCell label="Line-height by role" note="Headings 1.05–1.1 · body 1.5–1.6">
              <div className="demo-leading">
                <div className="demo-leading-block">
                  <span className="demo-leading-tag">1.08 · heading</span>
                  <p className="demo-heading-lh">The rhythm of text composed with intent</p>
                </div>
                <div className="demo-leading-block">
                  <span className="demo-leading-tag">1.55 · body</span>
                  <p className="demo-body-lh">Cadence is what separates a page that reads from one that merely contains words. Every line-height is chosen by role.</p>
                </div>
              </div>
            </DemoCell>

            <DemoCell label="Tabular numbers" note="font-variant-numeric: tabular-nums">
              <div className="demo-numbers">
                <div className="demo-num-table demo-num-tabular">
                  <span className="demo-num-table-title">Tabular</span>
                  <div className="demo-num-row"><span className="label">Jan</span><span>1,240</span></div>
                  <div className="demo-num-row"><span className="label">Feb</span><span>83</span></div>
                  <div className="demo-num-row"><span className="label">Mar</span><span>10,902</span></div>
                </div>
                <div className="demo-num-table demo-num-proportional">
                  <span className="demo-num-table-title">Proportional</span>
                  <div className="demo-num-row"><span className="label">Jan</span><span>1,240</span></div>
                  <div className="demo-num-row"><span className="label">Feb</span><span>83</span></div>
                  <div className="demo-num-row"><span className="label">Mar</span><span>10,902</span></div>
                </div>
              </div>
            </DemoCell>

            <DemoCell label="Selection" note="::selection styled with --signal">
              <p className="demo-select-hint">Select the text below</p>
              <p className="demo-select">
                Designesy turns design knowledge into living systems.
              </p>
            </DemoCell>
          </DemoGrid>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Thesis</h2>
          <div className="definition">
            <p className="definition-label">What cadence means here</p>
            <p>
              Cadence is the rhythm of text on a page — the accumulated result
              of font choice, scale, leading, tracking, measure, and wrapping
              working together. It is not legibility (that is a floor, not a
              goal). It is the sense that text was composed: that someone
              chose every size, spacing, and line break with intent. Cadence
              is what separates a page that reads from one that merely
              contains words.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Principle</h2>
          <div className="principle-list">
            {PRINCIPLES.map((p) => (
              <div className="principle" key={p.num}>
                <span className="principle-num">{p.num}</span>
                <div className="principle-body">
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Portable contract</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Rules agents can cite when proposing or reviewing typographic
            changes. Each rule has an exact value, not a preference.
          </p>
          <div className="row-stack" role="list">
            {CONTRACT_RULES.map((rule, i) => (
              <ToggleRow key={rule.title} index={String(i + 1).padStart(2, '0')}>
                <span className="row-body">
                  <span className="row-title">{rule.title}</span>
                  <span className="row-meta">{rule.meta}</span>
                </span>
              </ToggleRow>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Implementation notes</h2>
          <CopyPrompt>{BUILDER_PROMPT}</CopyPrompt>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Review checklist</h2>
          <CheckGrid items={checkItemsFromStrings(REVIEW_CHECKS)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Provenance</h2>
          <CheckGrid items={checkItemsFromStrings(PROVENANCE)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Anti-patterns</h2>
          <CheckGrid
            items={checkItemsFromStrings(ANTI, { avoid: true })}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Remix notes</h2>
          <p className="surface-note">
            These rules are system-agnostic — express them in Tailwind, plain
            CSS, CSS-in-JS, or any other styling system. The values are exact;
            the syntax is yours to adapt. When a rule conflicts with an existing
            design system, name the tension explicitly rather than silently
            overriding it. If your project self-hosts web fonts, add
            font-display: swap and preload the woff2 — the system stack is the
            fallback, not the default forever.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Lab anatomy coverage</h2>
          <CheckGrid dense items={checkItemsFromStrings(ANATOMY_DONE)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Verification</h2>
          <CheckGrid
            items={[
              { title: 'Font smoothing — antialiased + grayscale on :root', status: 'pass' },
              { title: 'Rem-based scale — all sizes in rem, root at 16px', status: 'pass' },
              { title: 'Line-height — headings 1.08, body 1.55, hero 1', status: 'pass' },
              { title: 'Letter-spacing — negative headings (-0.02 to -0.04em), positive labels (0.03–0.18em)', status: 'pass' },
              { title: 'Measure — --maxw 1080px shell, surface-note 520–580px body', status: 'pass' },
              { title: 'text-wrap: balance + pretty — both present', status: 'pass' },
              { title: 'tabular-nums — 8 instances across the live CSS', status: 'pass' },
              { title: '::selection — styled with var(--signal), not browser default', status: 'pass' },
              { title: 'user-select: none — present on UI chrome', status: 'pass' },
              { title: 'font-synthesis: none — set on :root', status: 'pass' },
              { title: 'text-underline-position: from-font — set on :root', status: 'pass' },
              { title: 'text-decoration-skip-ink: auto — set on :root', status: 'pass' },
              { title: 'Logical inline properties — margin-inline and padding-inline applied', status: 'pass' },
              { title: 'Block-axis logical properties — not yet migrated (open tension)', status: 'fail' },
              { title: 'border-inline-start — decorative borders still physical (open tension)', status: 'fail' },
              {
                title: 'Field check with Kit One · Design Review',
                status: 'pass',
                href: '/review/cadence',
              },
            ]}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Field check</h2>
          <Link
            className="lab-card"
            href="/review/cadence"
            data-cuelume-hover="whisper"
            data-cuelume-press
          >
            <div className="lab-card-top">
              <span className="status-badge">Pass with notes</span>
              <span className="status-badge-muted">Review</span>
            </div>
            <span className="lab-card-title">Field check · Cadence</span>
            <span className="lab-card-lede">
              Lab Three reviewed with Use Kit One · Design Review
            </span>
            <span className="lab-card-desc">
              Eight-dimension inspection of typography rules on designesy.org.
              Evidence for contract adoption.
            </span>
            <span className="lab-card-arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <div className="row-stack" role="list" style={{ marginTop: '1.5rem' }}>
            <Link
              className="row"
              role="listitem"
              href="/labs/poise"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Lab One · Poise</span>
                <span className="row-meta">Restrained interaction — motion, sound, reduced motion</span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/labs/takt"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Lab Two · Takt</span>
                <span className="row-meta">Interface feel — radii, press scale, hit areas, stagger</span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/contracts/design-system"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">v0.1.4 · tokens, interaction, takt, cadence, verification</span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/kits/design-review"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">Eight dimensions, portable agent prompt</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Lab Three · Cadence studies text rhythm as portable rules. Rules
          compiled from external typography intelligence (Jakub Krehel
          /better-typography) and adopted into design system contract v0.1.3.
          Field check lives at /review/cadence.
        </div>
      </main>

      <Footer />
    </>
  );
}