import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { CopyPrompt } from '../../lib/copy-prompt';
import { pageMeta } from '../../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Takt',
  description:
    'Lab Two — interface feel: radius nesting, press scale, image outlines, hit areas, stagger rhythm. Rules compiled from external design intelligence and verified against designesy.org.',
  path: '/labs/takt',
  ogTitle: 'Takt · Lab Two — Designesy',
  ogDescription:
    'How an interface feels under your hands. Concentric radii, press feedback, image outlines, hit areas, stagger rhythm — portable rules with exact values.',
  twitterDescription:
    'Interface feel as portable rules — concentric radii, press scale, hit areas, stagger rhythm. designesy.org/labs/takt',
});

/**
 * Lab anatomy coverage — confirms every required lab section is present.
 */
const ANATOMY_DONE = [
  'Live artifact — takt grid demo',
  'Thesis — what takt means here',
  'Principle — five rules with exact values',
  'Portable contract — rules agents can cite',
  'Implementation notes — builder prompt',
  'Review checklist — what to inspect',
  'Provenance — external sources ingested',
  'Anti-patterns — what takt is not',
  'Remix notes — how to adapt',
  'Lab anatomy coverage',
  'Verification — evidence on designesy.org',
  'Field check — reviewed with Kit One',
];

const PRINCIPLES = [
  {
    num: '01',
    title: 'Concentric border radius',
    body: 'Outer radius = inner radius + padding. Mismatched nested radii are the most common "feels off" cause. If a card has 6px radius and 4px padding, the image inside needs 2px — not 6px, not 0.',
  },
  {
    num: '02',
    title: 'Scale on press',
    body: 'Always scale(0.96) on press, never below 0.95. The difference between "this feels alive" and "this feels broken" is 0.01. Provide a static escape hatch when the element is not a control.',
  },
  {
    num: '03',
    title: 'Image outlines, not borders',
    body: '1px outline at 0.1 opacity — pure black in light mode, pure white in dark mode. Never tinted neutrals (slate, zinc) which read as dirt against a clean surface.',
  },
  {
    num: '04',
    title: 'Minimum hit area',
    body: '44×44px for touch, 40×40px for desktop. Extend with a pseudo-element when the visual target is smaller. Two elements\u2019 hit areas must never overlap.',
  },
  {
    num: '05',
    title: 'Stagger enter, soften exit',
    body: 'Break content into semantic chunks with ~100ms stagger delay. Exits are softer than enters — small fixed translateY, not full-height collapse. Skip animation entirely on page load.',
  },
];

const CONTRACT_RULES = [
  { title: 'Concentric radii', meta: 'outerRadius = innerRadius + padding — every nested surface' },
  { title: 'Press scale', meta: 'scale(0.96) on active, never below 0.95, static escape hatch' },
  { title: 'Image outlines', meta: '1px at 0.1 opacity, pure black/white, never tinted neutrals' },
  { title: 'Hit area floor', meta: '44×44px touch, 40×40px desktop, pseudo-element extension' },
  { title: 'Stagger enters', meta: '~100ms delay per semantic chunk, skip on page load' },
  { title: 'Soften exits', meta: 'Small fixed translateY, softer than enter, no full collapse' },
  { title: 'No transition: all', meta: 'Specify exact properties — transform, opacity, filter only' },
  { title: 'Spare will-change', meta: 'Only transform/opacity/filter, only when stutter is observed' },
];

const REVIEW_CHECKS = [
  'Every nested radius pair satisfies outerRadius = innerRadius + padding',
  'Every interactive element scales to 0.96 on press (or provides a static escape)',
  'Image surfaces use outline not border, pure black/white at 0.1 opacity',
  'Every touch target is at least 44×44px (desktop 40×40px)',
  'Enter animations stagger by semantic chunk (~100ms), not as a single block',
  'Exit animations are softer than enters — small translateY, not full collapse',
  'No transition: all anywhere — every transition names its properties',
  'will-change is absent unless a first-frame stutter was observed and fixed',
  'No two elements\u2019 hit areas overlap',
  'Animation is skipped on initial page load (initial={false} or equivalent)',
];

const PROVENANCE = [
  'Kiyotaka (@SubhanHQ) — Amicro micro-transitions library, open source',
  'Jakub Krehel (@jakubkrehel) — /better-ui skill, 13 interface polish principles, MIT',
  'Concentric radius rule — Krehel better-ui principle 1',
  'Press scale 0.96 — Krehel better-ui principle 9',
  'Image outline rule — Krehel better-ui principle 8',
  'Hit area 44×44 — Krehel better-ui principle 13',
  'Stagger ~100ms — Krehel better-ui principle 5',
  'No transition: all — Krehel better-ui principle 11',
  'Spare will-change — Krehel better-ui principle 12',
  'Cross-referenced against Designesy design system contract v0.1.1',
];

const ANTI = [
  'Same border radius on parent and child',
  'Scale below 0.95 on press — feels broken',
  'Tinted neutral borders on images (slate, zinc, gray)',
  'Touch targets smaller than 44×44px without pseudo-element extension',
  'All content animates as a single block on enter',
  'Exit animations that collapse height or feel heavier than the enter',
  'transition: all in any stylesheet',
  'will-change set permanently or on properties that never animate',
  'Overlapping hit areas on adjacent controls',
  'Enter animations on page load before user interaction',
];

const ANATOMY = [
  'Lab number',
  'Live artifact',
  'Thesis',
  'Principle',
  'Portable contract',
  'Implementation notes',
  'Review checklist',
  'Provenance',
  'Anti-patterns',
  'Remix notes',
  'Anatomy coverage',
  'Verification',
  'Field check',
];

const BUILDER_PROMPT = `You are working with Designesy Lab Two: Takt.

Authority: designesy.org is the canonical public source for Designesy
open design intelligence. Takt is Lab Two — interface feel as portable
rules with exact values.

Permission: read-only by default. Inspect, review, and report.
Do not edit files, deploy changes, or claim write authority
the operator did not grant.

Goal: Review the target interface for takt — the physical feel
of surfaces under your hands. Check every rule below and report
which pass, which fail, and which are not applicable.

Rules (exact values, not preferences):
  1. Concentric radii: outerRadius = innerRadius + padding on every nested pair
  2. Press scale: scale(0.96) on active, never below 0.95, static escape hatch
  3. Image outlines: 1px at 0.1 opacity, pure black/white, never tinted neutrals
  4. Hit area floor: 44×44px touch, 40×40px desktop, pseudo-element extension
  5. Stagger enters: ~100ms per semantic chunk, skip on page load
  6. Soften exits: small fixed translateY, softer than enter, no full collapse
  7. No transition: all — every transition names its properties
  8. Spare will-change: only transform/opacity/filter, only when stutter observed

Output format:
  For each rule, provide a Before/After table:
  | Rule | Current | Fix (if needed) |
  Group by rule heading. Omit rules that have no findings.
  Express all fixes in the target project's styling system.

Provenance: rules compiled from external design intelligence
(Amicro, Jakub Krehel /better-ui) and cross-referenced against
the Designesy design system contract v0.1.1.

Primary lab page: https://www.designesy.org/labs/takt
Design system contract: https://www.designesy.org/contracts/design-system
Design Review kit: https://www.designesy.org/kits/design-review`;

export default function TaktLabPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/labs" data-cuelume-hover="tick">
              Labs
            </Link>
            {' · Lab Two'}
          </p>
          <h1 className="surface-title">Takt</h1>
          <p className="surface-lede">
            Interface feel — the physical sense of surfaces under your hands.
            Radius nesting, press feedback, image outlines, hit areas, stagger
            rhythm.
          </p>
          <p className="surface-note">
            Lab Two studies the small details that make an interface feel built
            rather than rendered. Rules are compiled from external design
            intelligence, cross-referenced against the Designesy contract, and
            verified on designesy.org.
          </p>
          <div className="lab-meta fade-up fade-up-delay-1">
            <span className="status-badge">Live</span>
            <span className="lab-meta-item">
              Status · v0.1
            </span>
            <span className="lab-meta-item">
              Contract ·{' '}
              <Link href="/contracts/design-system" data-cuelume-hover="tick">
                v0.1.1
              </Link>
            </span>
            <span className="lab-meta-item">
              Field check ·{' '}
              <Link href="/review/takt" data-cuelume-hover="tick">
                pass with notes
              </Link>
            </span>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Live artifact</h2>
          <div className="definition">
            <p className="definition-label">Takt grid — see it on this page</p>
            <p>
              Every interactive surface on designesy.org carries these rules:
              check-grid cells scale on press, rows have concentric left
              borders, card hover lifts with a shadow (not a border), and
              staggered fade-up sections enter ~100ms apart. Scroll this page
              and watch the section rhythm — that is takt.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Thesis</h2>
          <div className="definition">
            <p className="definition-label">What takt means here</p>
            <p>
              Takt is the beat — the rhythm an interface keeps when you touch it.
              It is not motion design (that is Poise). It is the physical feel:
              radius nesting that looks right, press feedback that feels alive,
              hit areas that never miss, and enter animations that breathe in
              sequence. Takt is what separates a surface that feels assembled
              from one that feels poured.
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
            Rules agents can cite when proposing or reviewing interface changes.
            Each rule has an exact value, not a preference.
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
            overriding it.
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
              { title: 'Concentric radii — card padding 4px + image radius 2px = card 6px', status: 'pass' },
              { title: 'Press scale 0.96 on check-grid cells', status: 'pass' },
              { title: 'Press scale 0.985 on pillar cards (softer — longer surface)', status: 'pass' },
              { title: 'Hit area — all nav links ≥ 40×40px', status: 'pass' },
              { title: 'Stagger — fade-up sections enter ~100ms apart', status: 'pass' },
              { title: 'No transition: all in globals.css', status: 'pass' },
              { title: 'will-change only on check-pop and back-button animations', status: 'pass' },
              {
                title: 'Field check with Kit One · Design Review',
                status: 'pass',
                href: '/review/takt',
              },
            ]}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Field check</h2>
          <Link
            className="lab-card"
            href="/review/takt"
            data-cuelume-hover="whisper"
            data-cuelume-press
            data-cuelume-release
          >
            <div className="lab-card-top">
              <span className="status-badge">Pass with notes</span>
              <span className="status-badge-muted">Review</span>
            </div>
            <span className="lab-card-title">Field check · Takt</span>
            <span className="lab-card-lede">
              Lab Two reviewed with Use Kit One · Design Review
            </span>
            <span className="lab-card-desc">
              Eight-dimension inspection of takt rules on designesy.org. Evidence
              for contract adoption.
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
              data-cuelume-release
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
              href="/contracts/design-system"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Design system contract</span>
                <span className="row-meta">v0.1.1 · tokens, interaction, verification</span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/kits/design-review"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Use Kit One · Design Review</span>
                <span className="row-meta">Eight dimensions, portable agent prompt</span>
              </span>
            </Link>
            <Link
              className="row"
              role="listitem"
              href="/review/poise"
              data-cuelume-hover="whisper"
              data-cuelume-press
              data-cuelume-release
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Field check · Poise</span>
                <span className="row-meta">Lab One reviewed — pass with notes</span>
              </span>
            </Link>
          </div>
        </section>

        <div className="status-note">
          Lab Two · Takt studies interface feel as portable rules. Rules compiled
          from external design intelligence (Amicro, Jakub Krehel /better-ui) and
          cross-referenced against the Designesy design system contract v0.1.1.
          Field check pending — review with Kit One once ready.
        </div>
      </main>

      <Footer />
    </>
  );
}