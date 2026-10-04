import type { Metadata } from 'next';
import Link from 'next/link';
import './takt.css';
import { Topbar } from '../../lib/topbar';
import { Footer } from '../../lib/footer';
import { CheckGrid } from '../../lib/check-grid';
import { checkItemsFromStrings } from '../../lib/check-items';
import { ToggleRow } from '../../lib/toggle-row';
import { CopyPrompt } from '../../lib/copy-prompt';
import { DemoCell, DemoGrid } from '../../lib/demo-cell';
import { pageMeta } from '../../lib/site-meta';
import { AgentActions } from '../../lib/agent-actions';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { designReviewKit } from '../../lib/kits/design-review';
import { labs } from '../../lib/labs';
import { AdoptedTally } from '../adopted-tally';

export const metadata: Metadata = pageMeta({
  title: 'Takt',
  description:
    'Lab Two covers interface feel: radius nesting, press scale, image outlines, hit areas, stagger rhythm. Rules compiled from external design intelligence and verified against designesy.org.',
  path: '/labs/takt',
  ogTitle: 'Takt · Lab Two · Designesy',
  ogDescription:
    'How an interface feels under your hands. Concentric radii, press feedback, image outlines, hit areas, stagger rhythm: portable rules with exact values.',
  twitterDescription:
    'Interface feel as portable rules: concentric radii, press scale, hit areas, stagger rhythm. designesy.org/labs/takt',
});

/**
 * Lab anatomy coverage — confirms every required lab section is present.
 */
const ANATOMY_DONE = [
  'Live artifact: takt grid demo',
  'Thesis: what takt means here',
  'Principle: five rules with exact values',
  'Portable contract: rules agents can cite',
  'Implementation notes: builder prompt',
  'Review checklist: what to inspect',
  'Provenance: external sources ingested',
  'Anti-patterns: what takt is not',
  'Remix notes: how to adapt',
  'Lab anatomy coverage',
  'Verification: evidence on designesy.org',
  'Field check: reviewed with Kit One',
];

const PRINCIPLES = [
  {
    num: '01',
    title: 'Concentric border radius',
    body: 'Outer radius = inner radius + padding. Mismatched nested radii are the most common "feels off" cause. If a card has 6px radius and 4px padding, the image inside needs exactly 2px.',
  },
  {
    num: '02',
    title: 'Scale on press',
    body: 'Always scale(0.96) on press, never below 0.95. The difference between "this feels alive" and "this feels broken" is 0.01. Provide a static escape hatch when the element is not a control.',
  },
  {
    num: '03',
    title: 'Image outlines instead of borders',
    body: '1px outline at 0.1 opacity: pure black in light mode, pure white in dark mode. Never tinted neutrals (slate, zinc) which read as dirt against a clean surface.',
  },
  {
    num: '04',
    title: 'Minimum hit area',
    body: '44×44px for touch, 40×40px for desktop. Extend with a pseudo-element when the visual target is smaller. Two elements\u2019 hit areas must never overlap.',
  },
  {
    num: '05',
    title: 'Stagger enter, soften exit',
    body: 'Break content into semantic chunks with ~100ms stagger delay. Exits are softer than enters: a small fixed translateY in place of a full-height collapse. Skip animation entirely on page load.',
  },
];

const CONTRACT_RULES = [
  { title: 'Concentric radii', meta: 'outerRadius = innerRadius + padding on every nested surface' },
  { title: 'Press scale', meta: 'scale(0.96) on active, never below 0.95, static escape hatch' },
  { title: 'Image outlines', meta: '1px at 0.1 opacity, pure black/white, never tinted neutrals' },
  { title: 'Hit area floor', meta: '44×44px touch, 40×40px desktop, pseudo-element extension' },
  { title: 'Stagger enters', meta: '~100ms delay per semantic chunk, skip on page load' },
  { title: 'Soften exits', meta: 'Small fixed translateY, softer than enter, no full collapse' },
  { title: 'No transition: all', meta: 'Specify exact properties: transform, opacity, filter only' },
  { title: 'Spare will-change', meta: 'Only transform/opacity/filter, only when stutter is observed' },
];

const REVIEW_CHECKS = [
  'Every nested radius pair satisfies outerRadius = innerRadius + padding',
  'Every interactive element scales to 0.96 on press (or provides a static escape)',
  'Image surfaces use outline not border, pure black/white at 0.1 opacity',
  'Every touch target is at least 44×44px (desktop 40×40px)',
  'Enter animations stagger by semantic chunk (~100ms) instead of arriving as one block',
  'Exit animations are softer than enters: a small translateY instead of a full collapse',
  'No transition: all anywhere; every transition names its properties',
  'will-change is absent unless a first-frame stutter was observed and fixed',
  'No two elements\u2019 hit areas overlap',
  'Animation is skipped on initial page load (initial={false} or equivalent)',
];

const PROVENANCE = [
  'Kiyotaka (@SubhanHQ): Amicro micro-transitions library, open source',
  'Jakub Krehel (@jakubkrehel): /better-ui skill, 13 interface polish principles, MIT',
  'Emil Kowalski (@emilkowalski): /emil-design-eng skill, motion craft and press scale 0.97, MIT',
  'Emil Kowalski (@emilkowalski): /apple-design skill, Apple WWDC spring physics and interruptibility, MIT',
  'Emil Kowalski (@emilkowalski): /find-animation-opportunities, anti-over-animation Gate (Frequency, Purpose, Speed, Function), MIT',
  'Emil Kowalski (@emilkowalski): /animate skill, 7-step build sequence and Never Ship table (13 auto-blocks), MIT',
  'Concentric radius rule · Krehel better-ui principle 1',
  'Press scale 0.96 · Krehel better-ui principle 9; 0.97 · Kowalski emil-design-eng',
  'Image outline rule · Krehel better-ui principle 8',
  'Hit area 44×44 · Krehel better-ui principle 13',
  'Stagger ~100ms · Krehel better-ui principle 5',
  'No transition: all · Krehel better-ui principle 11',
  'Spare will-change · Krehel better-ui principle 12',
  'Frequency gate · Kowalski emil-design-eng (no motion on keyboard-initiated or high-frequency actions)',
  'Spring physics · Kowalski apple-design (damping 1.0, response 0.3 to 0.4; matches contract springs)',
  'Never Ship table · Kowalski animate (13 auto-blocks including scale(0), ease-in on UI, keyframes on toasts, Motion x/y/scale shorthands)',
  'Cross-referenced against Designesy design system contract v0.1.1; adopted into v0.1.2',
];

const ANTI = [
  'Same border radius on parent and child',
  'Scale below 0.95 on press, which feels broken',
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

/**
 * The field check's facts for the card's side pane, read from /review/takt
 * (its Holds and Tensions lists and its Date line). Dimensions and the kit
 * version come from the kit record, so they cannot drift from the kit.
 */
const FIELD_CHECK = { holds: 8, openTensions: 4, reviewed: '2026-07-13' };

/** A field-check outcome as a state: a clean pass, a pass with notes (warn),
 *  or anything else (fail). Never the brand blue. */
function verdictState(outcome: string): 'pass' | 'warn' | 'fail' {
  if (outcome === 'pass') return 'pass';
  return outcome.startsWith('pass') ? 'warn' : 'fail';
}

/**
 * Related surfaces. Each row's datum (a version, or the field check's
 * verdict as a state chip) and its route stand in the side pane behind the
 * 7-line; the face keeps the title and one line.
 */
const RELATED: { href: string; title: string; meta: string; datum: string; state?: 'pass' | 'warn' | 'fail' }[] = [
  {
    href: '/labs/poise',
    title: 'Lab One · Poise',
    meta: 'Restrained interaction: motion, sound, reduced motion',
    datum: `contract v${labs.poise.adopted_in_contract}`,
  },
  {
    href: '/contracts/design-system',
    title: 'Design system contract',
    meta: 'Tokens, interaction, takt, cadence, acoustics, verification',
    datum: CONTRACT_VERSION,
  },
  {
    href: '/kits/design-review',
    title: 'Use Kit One · Design Review',
    meta: 'Eight dimensions, portable agent prompt',
    datum: `v${designReviewKit.version}`,
  },
  {
    href: '/review/poise',
    title: 'Field check · Poise',
    meta: 'Lab One reviewed with Kit One',
    datum: labs.poise.field_check.outcome,
    state: verdictState(labs.poise.field_check.outcome),
  },
  {
    href: '/labs/cadence',
    title: 'Lab Three · Cadence',
    meta: 'Text rhythm: scale, leading, tracking, measure',
    datum: `contract v${labs.cadence.adopted_in_contract}`,
  },
  {
    href: '/labs/acoustics',
    title: 'Lab Four · Acoustics',
    meta: 'Interaction sound: nineteen cues, nineteen roles, Cuelume v0.2.2',
    datum: `contract v${labs.acoustics.adopted_in_contract}`,
  },
];

const BUILDER_PROMPT = `You are working with Designesy Lab Two: Takt.

Authority: designesy.org is the canonical public source for Designesy open design intelligence. Takt is Lab Two: interface feel as portable rules with exact values.

Permission: read-only by default. Inspect, review, and report. Do not edit files, deploy changes, or claim write authority the operator did not grant.

Goal: Review the target interface for takt (the physical feel of surfaces under your hands). Check every rule below and report which pass, which fail, and which are not applicable.

Rules (each with an exact value):
  1. Concentric radii: outerRadius = innerRadius + padding on every nested pair
  2. Press scale: scale(0.96) on active, never below 0.95, static escape hatch
  3. Image outlines: 1px at 0.1 opacity, pure black/white, never tinted neutrals
  4. Hit area floor: 44×44px touch, 40×40px desktop, pseudo-element extension
  5. Stagger enters: ~100ms per semantic chunk, skip on page load
  6. Soften exits: small fixed translateY, softer than enter, no full collapse
  7. No transition: all; every transition names its properties
  8. Spare will-change: only transform/opacity/filter, only when stutter observed

Output format:
  For each rule, provide a Before/After table:
  | Rule | Current | Fix (if needed) |
  Group by rule heading. Omit rules that have no findings.
  Express all fixes in the target project's styling system.

Provenance: rules compiled from external design intelligence (Amicro, Jakub Krehel /better-ui, Emil Kowalski /emil-design-eng, /apple-design, /find-animation-opportunities, /animate), cross-referenced against contract v0.1.1, and adopted into design system contract v0.1.2.

Primary lab page: https://www.designesy.org/labs/takt
Design system contract: https://www.designesy.org/contracts/design-system
Design Review kit: https://www.designesy.org/kits/design-review`;

export default function TaktLabPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow">
            <Link href="/labs" data-cuelume-hover="tick" data-cuelume-press="tick">
              Labs
            </Link>
            {' · Lab Two'}
          </p>
          <h1 className="surface-title" data-scramble>Takt</h1>
          <p className="surface-lede">
            Interface feel: the physical sense of surfaces under your hands.
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
              <Link href="/contracts/design-system" data-cuelume-hover="tick" data-cuelume-press="tick">
                {CONTRACT_VERSION}
              </Link>
            </span>
            <span className="lab-meta-item">
              Field check ·{' '}
              <Link href="/review/takt" data-cuelume-hover="tick" data-cuelume-press="tick">
                pass with notes
              </Link>
            </span>
          </div>
          <AgentActions mdPath="/labs/takt.md" label="the Takt lab" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Live artifact</h2>
          <div className="definition">
            <p className="definition-label">Takt grid: see it on this page</p>
            <p>
              Every interactive surface on designesy.org carries these rules:
              check-grid cells scale on press, rows have concentric left
              borders, card hover lifts with a shadow (not a border), and
              staggered fade-up sections enter ~100ms apart. Scroll this page
              and watch the section rhythm: that is takt.
            </p>
          </div>

          <DemoGrid>
            <DemoCell label="Concentric radii" note="outerRadius = innerRadius + padding">
              <div className="demo-radius-outer">
                <div className="demo-radius-inner">
                  <span>2px radius</span>
                </div>
              </div>
            </DemoCell>

            <DemoCell label="Press scale" note="scale(0.96) · 160ms --ease-out">
              <button type="button" className="demo-press-btn" data-cuelume-press>
                Press me
              </button>
            </DemoCell>

            <DemoCell label="Image outline" note="1px · 0.1 opacity · pure white">
              <div className="demo-img-pair">
                <div>
                  <div className="demo-img-outline">
                    <span>outline</span>
                  </div>
                  <p className="demo-img-label">Correct</p>
                </div>
                <div>
                  <div className="demo-img-bad">
                    <span>border</span>
                  </div>
                  <p className="demo-img-label">Tinted</p>
                </div>
              </div>
            </DemoCell>

            <DemoCell label="Hit area floor" note="44×44px touch · pseudo-element extension">
              <div className="demo-hit-area" aria-hidden="true">
                <div className="demo-hit-target">↗</div>
              </div>
            </DemoCell>

            <DemoCell label="Stagger rhythm" note="~100ms per chunk · skip on page load">
              <div className="demo-stagger" data-reveal aria-hidden="true">
                <div className="demo-stagger-bar" />
                <div className="demo-stagger-bar" />
                <div className="demo-stagger-bar" />
                <div className="demo-stagger-bar" />
              </div>
            </DemoCell>
          </DemoGrid>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Thesis</h2>
          <div className="definition">
            <p className="definition-label">What takt means here</p>
            <p>
              Takt is the beat: the rhythm an interface keeps when you touch it.
              Where Poise covers motion design, takt covers the physical feel of
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
          <AdoptedTally
            total={CONTRACT_RULES.length}
            lede={
              <>
                Rules agents can cite when proposing or reviewing interface
                changes. Each rule has an exact value. Check a rule off as your
                surface adopts it.
              </>
            }
          >
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
          </AdoptedTally>
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
            These rules are system-agnostic: express them in Tailwind, plain
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
              { title: 'Concentric radii: card padding 4px + image radius 2px = card 6px', status: 'pass' },
              { title: 'Press scale 0.96 on check-grid cells', status: 'pass' },
              { title: 'Press scale 0.985 on pillar cards (softer, for a longer surface)', status: 'pass' },
              { title: 'Hit area: all nav links ≥ 40×40px', status: 'pass' },
              { title: 'Stagger: fade-up sections enter ~100ms apart', status: 'pass' },
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
            className="lab-card is-split"
            href="/review/takt"
            data-cuelume-hover="bloom"
            data-cuelume-press
          >
            <div className="lab-card-panes">
              <div className="lab-card-face">
                <div className="lab-card-top">
                  <span className="row-side-chip" data-state={verdictState(labs.takt.field_check.outcome)}>
                    {labs.takt.field_check.outcome}
                  </span>
                </div>
                <h3 className="lab-card-title">Field check · Takt</h3>
                <p className="lab-card-lede">
                  Lab Two reviewed with Use Kit One · Design Review
                </p>
                <p className="lab-card-desc">
                  Eight-dimension inspection of takt rules on designesy.org.
                  Evidence for contract adoption.
                </p>
                <span className="lab-card-arrow">
                  Open field check <span aria-hidden="true">→</span>
                </span>
              </div>
              <dl className="lab-card-side">
                <div>
                  <dt>Dimensions</dt>
                  <dd>{designReviewKit.dimensions.length}</dd>
                </div>
                <div>
                  <dt>Holds</dt>
                  <dd>{FIELD_CHECK.holds}</dd>
                </div>
                <div>
                  <dt>Open tensions</dt>
                  <dd>{FIELD_CHECK.openTensions}</dd>
                </div>
                <div>
                  <dt>Reviewed</dt>
                  <dd>{FIELD_CHECK.reviewed}</dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>Kit One v{designReviewKit.version}</dd>
                </div>
              </dl>
            </div>
          </Link>
          <div className="row-stack" role="list" style={{ marginTop: '1.5rem' }}>
            {RELATED.map((row, i) => (
              <div role="listitem" key={row.href}>
                <Link
                  className="row"
                  href={row.href}
                  data-cuelume-hover="bloom"
                  data-cuelume-press
                >
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row-body">
                    <span className="row-title">{row.title}</span>
                    <span className="row-meta">{row.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">
                      {row.state ? (
                        <span className="row-side-chip" data-state={row.state}>
                          {row.datum}
                        </span>
                      ) : (
                        row.datum
                      )}
                    </span>
                    <span className="row-side-line">{row.href}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div className="status-note">
          Lab Two · Takt studies interface feel as portable rules. Rules compiled
          from external design intelligence (Amicro, Jakub Krehel /better-ui,
          Emil Kowalski /emil-design-eng, /apple-design, /find-animation-opportunities,
          /animate) and adopted into design system contract v0.1.2. Field check
          lives at /review/takt.
        </div>
      </main>

      <Footer />
    </>
  );
}