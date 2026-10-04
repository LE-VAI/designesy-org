import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import './contracts.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { DemoCell, DemoGrid } from '../lib/demo-cell';
import { EasingDemo } from './easing-demo';
import { ReadingProgress } from '../lib/reading-progress';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { CONTRACT_VERSION, designSystemContract } from '../lib/design-system-contract';
import { ENGINE_CHECK_COUNT } from '../hero-stats';
import { a11yContract } from '../lib/a11y-contract';
import { compareContract } from '../lib/compare-contract';
import { driftContract } from '../lib/drift-contract';
import { guardrailsContract } from '../lib/guardrails-contract';
import { monitorContract } from '../lib/monitor-contract';
import { motionContract } from '../lib/motion-contract';
import { readinessContract } from '../lib/readiness-contract';
import { reportContract } from '../lib/report-contract';
import { tokensContract } from '../lib/tokens-contract';

const ds = designSystemContract;

// The version copywriting arrived in: history, not the live version.
const COPYWRITING_SINCE = 'v' + ds.copywriting.adopted_in;

// A group label inside a section: the section heading's family (--sans) one
// step down, never the global Fraunces h3 at 14.4px, which set it smaller
// than the body under it and in another family from its h2.
const SUBHEAD: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: '1rem',
  fontWeight: 600,
  lineHeight: 1.3,
  letterSpacing: '-0.005em',
  color: 'var(--ink)',
  marginBottom: '0.75rem',
};

export const metadata: Metadata = pageMeta({
  title: 'Contracts',
  description:
    'Designesy Contracts: portable design agreements with exact values, roles, behavior, anti-patterns, and verification. Design system ' + CONTRACT_VERSION + ' is public (Poise + Takt + Cadence + Acoustics + Copywriting adopted).',
  path: '/contracts',
  ogDescription:
    'Portable design agreements for people and agents. Design system contract ' + CONTRACT_VERSION + ' is live: Poise, Takt, Cadence, Acoustics, and Copywriting rules adopted.',
  twitterDescription:
    'Portable design judgment · designesy.org/contracts/design-system',
});

// The fourteen parts of a contract, in the order the published contract below
// numbers them: each Contents cell links to its section (01 to 14).
// Copywriting keeps its older id so links already pointing at it still land.
const CONTRACT_CONTENTS = [
  { title: 'Source and provenance', id: 'source-and-provenance' },
  { title: 'Primitive tokens', id: 'primitive-tokens' },
  { title: 'Semantic tokens', id: 'semantic-tokens' },
  { title: 'Typography rules', id: 'typography-rules' },
  { title: 'Spacing and layout rules', id: 'spacing-and-layout' },
  { title: 'Shape and surface rules', id: 'shape-and-surface' },
  { title: 'Component behavior and states', id: 'component-states' },
  { title: 'Accessibility requirements', id: 'accessibility-requirements' },
  { title: 'Motion and reduced-motion guidance', id: 'motion-and-reduced-motion' },
  { title: 'Copywriting principles', id: '09e-copywriting' },
  { title: 'Anti-patterns', id: 'anti-patterns' },
  { title: 'Implementation notes', id: 'implementation-notes' },
  { title: 'Verification criteria', id: 'verification-criteria' },
  { title: 'Open tensions', id: 'open-tensions' },
] as const;

type ContentsId = (typeof CONTRACT_CONTENTS)[number]['id'];

const sectionId = (id: ContentsId) => id;

/** A sub-contract's side datum: its live version and verification count. */
function packageDatum(c: { version: string; verification: { checks: readonly unknown[] } }) {
  return `v${c.version} · ${c.verification.checks.length} checks`;
}

// Published now: each row's side pane carries its data (version, count) and
// its route, read from the module that serves it, so a bump moves the row.
const PUBLISHED: { href: string; title: string; meta: string; datum: string }[] = [
  {
    href: '/contracts/design-system',
    title: 'Design system',
    meta: 'Human overview, full tables below, machine JSON export',
    datum: `${CONTRACT_VERSION} · ${ENGINE_CHECK_COUNT} checks`,
  },
  {
    href: '/contracts/tokens',
    title: 'Tokens',
    meta: 'W3C DTCG 2025.10 format conformance: color spaces, custom types, validation',
    datum: packageDatum(tokensContract),
  },
  {
    href: '/contracts/a11y',
    title: 'Accessibility',
    meta: 'WCAG 2.2 AA via axe-core 4.13.0',
    datum: packageDatum(a11yContract),
  },
  {
    href: '/contracts/motion',
    title: 'Motion',
    meta: 'Lottie spec v1.0.1 and the Ten Non-Negotiable Motion Standards',
    datum: packageDatum(motionContract),
  },
  {
    href: '/labs/poise',
    title: 'Poise adopted',
    meta: 'Lab One interaction rules',
    datum: `adopted v${ds.interaction.adopted_in} · ${ds.interaction.rules.length} rules`,
  },
  {
    href: '/labs/takt',
    title: 'Takt adopted',
    meta: 'Lab Two interface-feel rules',
    datum: `adopted v${ds.takt.adopted_in} · ${ds.takt.rules.length} rules`,
  },
  {
    href: '/labs/cadence',
    title: 'Cadence adopted',
    meta: 'Lab Three typography rules',
    datum: `adopted v${ds.cadence.adopted_in} · ${ds.cadence.rules.length} rules`,
  },
  {
    href: '/labs/acoustics',
    title: 'Acoustics adopted',
    meta: 'Lab Four acoustic mapping rules',
    datum: `adopted v${ds.acoustic.adopted_in} · ${ds.acoustic.cues.length} cues`,
  },
  {
    href: '/contracts#09e-copywriting',
    title: 'Copywriting adopted',
    meta: 'UX copy principles from NN/g, Polaris, Carbon, Fluent, and HIG',
    datum: `adopted ${COPYWRITING_SINCE} · ${ds.copywriting.principles.length} principles`,
  },
  {
    href: '/contracts/skill',
    title: 'Agent skill export',
    meta: 'SKILL.md format for AI coding agents, built from the same source as the JSON',
    datum: `SKILL.md · ${CONTRACT_VERSION}`,
  },
  {
    href: '/review/designesy-org',
    title: 'Field check',
    meta: 'Live site reviewed against this contract',
    datum: `against ${CONTRACT_VERSION}`,
  },
  {
    href: '/contracts/drift',
    title: 'Drift',
    meta: 'AI-generated UI drift detection: token fabrication, value variance, and off-contract patterns',
    datum: packageDatum(driftContract),
  },
  {
    href: '/contracts/readiness',
    title: 'AI Readiness',
    meta: 'The 6th maturity axis: probes for machine-readable tokens, llms.txt, agent.json, MCP, and DESIGN.md',
    datum: packageDatum(readinessContract),
  },
  {
    href: '/contracts/guardrails',
    title: 'Guardrails',
    meta: 'The product layer: emit a frozen build contract (DTCG tokens, Stylelint, AGENTS.md) for AI coding agents',
    datum: packageDatum(guardrailsContract),
  },
  {
    href: '/contracts/monitor',
    title: 'Monitor',
    meta: 'The continuous-governance layer: re-score on a cadence, store snapshots, compute drift deltas, surface regressions before they compound',
    datum: packageDatum(monitorContract),
  },
  {
    href: '/contracts/compare',
    title: 'Compare',
    meta: 'The diff engine: fetch two URLs, extract their token systems, and surface what actually changed across 8 dimensions (added, removed, renamed, value-changed, scale drift, contrast drift, structure delta, score delta)',
    datum: packageDatum(compareContract),
  },
  {
    href: '/contracts/report',
    title: 'Report',
    meta: 'The synthesis capstone: fetch one URL, fire score + drift + readiness in parallel, and produce a unified design-intelligence report with a single composite grade. One input, one output, one grade',
    datum: packageDatum(reportContract),
  },
];

const CONTRACT_ANTI = [
  'Prose-only style guides with no exact values',
  'Token dumps with no rationale',
  'Component values that duplicate raw colors instead of referencing roles',
  'Rules that do not change implementation behavior',
  'Public copy pretending the contract is more mature than it is',
  'Treating screenshots as final proof without visual and accessibility checks',
];

const PRIMITIVE_COLORS = [
  { token: '--ink', value: '#f5f5f7', role: 'Primary text / foreground' },
  { token: '--muted', value: '#a0a0a0', role: 'Secondary text' },
  { token: '--muted-dim', value: '#7d7d7d', role: 'Tertiary / meta text' },
  { token: '--paper', value: '#010102', role: 'Page background' },
  { token: '--surface', value: '#0a0a0c', role: 'Card / panel base' },
  { token: '--surface-raised', value: '#121216', role: 'Elevated surface' },
  { token: '--surface-lifted', value: '#16161b', role: 'Lifted / hover panel' },
  { token: '--signal', value: '#0133cb', role: 'Brand signal accent' },
  { token: '--signal-light', value: '#3358e8', role: 'Signal hover / focus lift' },
  { token: '--signal-access', value: '#5d7bff', role: 'Accessible signal (AA on dark)' },
  { token: '--paper-on-signal', value: '#ffffff', role: 'Text on signal fill' },
  { token: '--activation', value: '#fecc34', role: 'Activation highlight (reserved)' },
];

const PRIMITIVE_SURFACES = [
  { token: '--surface-soft', value: 'rgba(255, 255, 255, 0.03)', role: 'Soft fill / note background' },
  { token: '--surface-hover', value: 'rgba(255, 255, 255, 0.06)', role: 'Hover wash' },
  { token: '--line', value: 'rgba(255, 255, 255, 0.12)', role: 'Default border' },
  { token: '--line-strong', value: 'rgba(255, 255, 255, 0.22)', role: 'Emphasized border' },
  { token: '--line-faint', value: 'rgba(255, 255, 255, 0.06)', role: 'Subtle divider' },
  { token: '--signal-dim', value: 'rgba(1, 51, 203, 0.14)', role: 'Signal wash / badge fill' },
];

// The radius rows are the contract module's: the four published steps and the
// 8px tier between them, smallest first, so this table, section 06 and the
// rack below name the same values.
const RADIUS_ROWS = (['sm', 'default', 'md', 'lg', 'xl'] as const).map((k) => ({
  token: ds.rounded[k].token,
  value: ds.rounded[k].value,
  role: ds.rounded[k].role,
}));

// The rack draws the published scale only; the 8px tier is named in its note.
const RADIUS_RACK = RADIUS_ROWS.filter((r) => r.token !== ds.rounded.md.token);

const PRIMITIVE_SHAPE_MOTION = [
  ...RADIUS_ROWS,
  { token: '--maxw', value: '1080px', role: 'Content shell max width' },
  { token: '--duration', value: '0.6s', role: 'Primary entrance duration' },
  { token: '--duration-quick', value: '150ms', role: 'Close, swap, tooltip' },
  { token: '--duration-fast', value: '250ms', role: 'Open, hover transition, icon swap' },
  { token: '--duration-medium', value: '350ms', role: 'Panel close, toast' },
  { token: '--duration-slow', value: '400ms', role: 'Panel open, skeleton reveal' },
  { token: '--ease', value: 'cubic-bezier(0.22, 0.61, 0.36, 1)', role: 'Default ease' },
  { token: '--ease-out', value: 'cubic-bezier(0.23, 1, 0.32, 1)', role: 'Exit / settle' },
  { token: '--ease-in-out', value: 'cubic-bezier(0.77, 0, 0.175, 1)', role: 'Symmetric motion' },
  { token: '--ease-drawer', value: 'cubic-bezier(0.32, 0.72, 0, 1)', role: 'Drawer / panel slide' },
];

// The material system, read from the contract module (dark values; the
// light theme's live beside them in the machine export).
const DEPTH_TOKENS = (
  [
    ds.materials.mat_reading,
    ds.materials.mat_instrument,
    ds.materials.mat_float,
    ds.materials.rim,
    ds.materials.rim_hot,
    ds.materials.elev_1,
    ds.materials.elev_2,
    ds.materials.elev_3,
    ds.materials.elev_4,
  ] as const
).map((t) => ({ token: t.token, value: t.value.split(' · light:')[0], role: t.role }));

// Section 05 reads the layout strings the machine export and the agent skill
// serve, so the three cannot disagree.
const LAYOUT = ds.layout;

const SPACING_RULES = [
  { name: 'Shell horizontal', value: 'clamp(1rem, 4vw, 1.5rem)', note: '--shell-gutter, outside the content box' },
  { name: 'Layout grid', value: '12 columns, 1rem gutter, 7|5 split', note: '.g12; bars end on the instrument divider' },
  { name: 'Section vertical', value: LAYOUT.section_vertical, note: '.doctrine-section / .section' },
  { name: 'Card padding', value: LAYOUT.card_padding, note: 'status notes 1rem, definitions and cards 1.25 to 1.5rem' },
  { name: 'Grid gap', value: LAYOUT.grid_gap, note: 'the 12-column grid and the card grids it holds' },
  { name: 'Control min height', value: LAYOUT.control_min_height, note: 'touch and pointer targets' },
  { name: 'Layout switch', value: LAYOUT.breakpoints.grids, note: 'grids, row lists and panels query their own width' },
  { name: 'Viewport queries', value: `${LAYOUT.breakpoints.topbar} chrome · 860px and 560px older blocks`, note: 'header and drawer; demo racks, pricing, home hero' },
];

const TYPOGRAPHY_RULES = [
  'Body: Schibsted Grotesk (--sans), 16 to 17px fluid, line-height 1.55; the system sans covers other scripts',
  'Headings h1 to h4: Fraunces (--display), weight 700, line-height 1.08, letter-spacing -0.02em; section headings and subheads set in --sans at weight 600',
  'Hero wordmark: clamp(3.2rem, 9vw, 5.5rem), weight 800, tracking -0.04em',
  'Eyebrows: 0.72 to 0.75rem, weight 600, uppercase, letter-spacing 0.18em, muted-dim',
  'Lede: 1.1 to 1.5rem, weight 500, ink (one clear claim in a single paragraph)',
  'Supporting note: 0.85 to 0.95rem, muted, max-width ~520 to 580px',
  'Three faces and no more: Fraunces for headlines, Schibsted Grotesk for interface and reading, Geist Mono for data and token names',
];

// Section 06, as the stylesheet ships it: the material system (design spec
// 3.1 to 3.3), measured against globals.css, not remembered.
const SHAPE_RULES = [
  'Radius scale 4 · 6 · 12 · 16px, with a documented 8px tier (--radius-md) between: 6px default, 4px compact controls, 12px large panels, 16px flagship surfaces; cards and primary or ghost buttons never round to pills',
  'Depth is surface lightness: paper, reading material, instrument, float. One top-lit rim on every raised surface, and --elev-1 to --elev-4 cast straight down',
  'No hover lift: a card you can press heats its rim (--rim-hot) and takes contact light at the pointer, and a panel you only read holds still. The Four ways tilt and the 1px rise on two score controls are the exceptions, kept open in section 14',
  'Status notes and definitions are reading material: opaque --mat-reading with the rim and --elev-1, never a tinted callout box',
  'Glass only on surfaces you command over moving content: the header capsule, command slab, palette, drawer, popovers, dock pills and verdict HUD',
  'One signal accent family and no secondary brand hues; --ok, --warn and --error appear only as state',
];

// Section 07 is the contract module's component list: the same states the
// machine export and /contracts/components serve.
const COMPONENT_STATES = ds.components;

const A11Y_REQUIREMENTS = [
  'html lang="en"; meaningful page titles via metadata template',
  'Focus-visible: a 2px solid outline on every control, --signal-light at a 3px offset over a --signal-dim halo by default; cards and dense lists tune the offset, and reading cards draw it in --signal-access',
  'Sound control is named by its visible Sound label and exposes aria-pressed',
  'Decorative glyphs (sound icon, arrows) use aria-hidden where text is already labeled',
  'Prefer semantic landmarks: sticky header, main, footer',
  'Do not rely on color alone for state; pair with label, border, or weight change',
  'Respect prefers-reduced-motion, tiered: travel stops, opacity fades and transitions of 200ms or less stay, and a motion demo plays on request',
  'Scroll padding-top 4.5rem (72px) so in-page anchors clear the sticky topbar',
];

const MOTION_RULES = [
  'Entrance: fadeUp 0.6s --ease-out, rising 12px from scale(0.98), with staggered delays (0.08s steps)',
  'Interactive settle: 160ms --ease-out on press scale',
  'Hover is gated: reading-card contact (rim heat, contact light) runs only under (hover: hover) and (pointer: fine), other hover motion under (hover: hover), so touch gets no fake hover',
  'Wordmark dot pulse: opacity heartbeat only; no blur glow, no gradient blobs',
  'prefers-reduced-motion: reduce is tiered: travel stops, fades and transitions of 200ms or less stay, motion demos play on request; sound defaults off as the acoustic proxy',
];

const TEN_MOTION_STANDARDS = [
  'Easing is deliberate: use contract cubicBezier tokens instead of bare CSS keywords',
  'Properties are explicit: never transition:all; name the exact properties',
  'Entrances have opacity: animate from scale(0.9 to 0.97) + opacity, never scale(0)',
  'Keyboard is still: no motion on keyboard-initiated or 100+/day actions',
  'Layout is not animated: never animate width, height, margin, padding, top, left',
  'Touch is gated: :hover motion on touch-visible surfaces requires explicit gating',
  'Duration is bounded: UI animation stays ≤ 300ms unless justified',
  'Reduced-motion is handled: every movement has a prefers-reduced-motion path',
  'Press is asymmetric: press and release use asymmetric timing',
  'Easing is never ease-in: deceleration (ease-out) or custom curves only',
];

const MOTION_BLOCK_ON_SIGHT = [
  'Using ease-in on any UI interaction',
  'Using transition: all instead of explicit properties',
  'Animating from scale(0) instead of scale(0.9 to 0.97) + opacity',
  'Animating on keyboard-initiated or 100+/day actions',
  'Animating layout properties: width, height, margin, padding, top, left',
  'Ungated :hover motion on touch-visible surfaces',
];

const MOTION_CAUTION = [
  'UI animation duration exceeding 300ms without stated justification',
  'Using bare CSS easing keywords (ease, ease-in, linear) on deliberate animation',
  'Missing prefers-reduced-motion handling on movement animations',
  'Symmetric enter/exit timing on press-and-release or hold interactions',
];

const ACOUSTIC_TOKENS_REF = [
  'Engine: Cuelume v0.2.2 (MIT), interaction sound synthesis via the Web Audio API',
  'Custom $type: sound via $extensions.designesy; net-new relative to W3C DTCG 2025.10',
  '19 cues in the acoustic token document: the 10 adopted cue tokens and 9 extended feedback cues; see /acoustic-tokens for the full table',
  'Preference key: designesy:sound in localStorage; engine follows Designesy',
  'Reduced-motion proxy: sound defaults off under prefers-reduced-motion',
  'No focus sounds: sounds fire on pointer/click, never on focus',
  'No ambient audio: Cuelume is interaction-only; no background music or mood beds',
];

const SPRING_TOKENS = [
  { token: 'spring.default', value: 'damping 1.0 · response 0.4', role: 'Default spring physics for natural motion' },
  { token: 'spring.momentum', value: 'damping 0.8 · response 0.3', role: 'Momentum spring for continued motion' },
];

const ANTI_PATTERNS = [
  'Glowing blobs, random gradients, or AI sparkles as decoration',
  'Hard-coded hex in components when a role token exists',
  'Using --activation as general decoration instead of reserved activation',
  'Publishing "modern/clean/premium" language without operational rules',
  'Multiple simultaneous accent colors competing with --signal',
  'Touch targets under ~32px or full-width buttons that skip on mobile',
  'Animation that cannot be reduced',
  'Button text that is a bare noun without a verb ("Settings" alone for a destructive action)',
  'Generic error messages ("An error occurred", "Something went wrong") with no remediation',
  'Link text that is "click here", "learn more", "read more", or "here" without destination context',
  'ALL CAPS body text or button text (except eyebrow labels per typography contract)',
];

const IMPLEMENTATION_NOTES = [
  'Single live token source of truth: no secondary theme framework',
  'Server-rendered by default; client only for sound, bind, and preference controls',
  'metadataBase is https://www.designesy.org (apex redirects); public label is Designesy',
  'Interaction audio via Cuelume; middle-click guard is required',
  'Sitemap and robots follow standard site conventions',
  'Production deploys from the main branch',
];

const VERIFICATION = [
  'Token values in this contract match the live site foundation',
  'All five routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
  'Primary interactive elements show focus-visible rings',
  'Sound toggle flips aria-pressed and applies the audio preference',
  'prefers-reduced-motion disables entrance and wordmark breath',
  'Contrast: ink on paper, muted on paper, accent on paper remain readable',
  'No public surface displays internal control-plane naming',
  'Button text is a verb phrase or recognized command, never a bare noun (copywriting v38)',
  'No trailing period on button text, labels, or tab text (copywriting v39)',
  'Link text is descriptive, never bare "click here", "learn more", "here" (copywriting v40)',
  'No ALL CAPS UI text except eyebrow labels (copywriting v41)',
];

const OPEN_TENSIONS = [
  'Light theme is partly contracted: materials, field and instrument tokens carry light values, the color roles do not; the dark technical foundation is provisional',
  '--activation exists but has limited public surface usage',
  'Four ways cards keep their flat line borders, no elevation and their hover tilt; whether they take the rim, --elev-3 and a floor pool is still open',
  'Two score controls (the action button and the engine tile) still rise 1px on hover, outside the no-lift rule',
  'The row and check-cell arrows nudge under (hover: hover) alone, without the fine-pointer gate Poise asks for',
  'Human contract page and machine export remain dual sources until a single generator owns both',
  'Keyboard-path verification packets cover Poise only; other public routes have none yet',
  'Inline-axis logical properties (margin-inline, padding-inline) applied; block-axis and border-inline remain physical',
  'Block-axis logical properties (margin-block-start/end) not yet migrated; direction-ready is partial',
  'border-inline-start not yet used; decorative borders are still physical',
];

const COPYWRITING_PRINCIPLES = [
  'Button copy is a verb phrase (or a recognized single-word command), never a bare noun: "Save changes" not "Changes", "Delete file" not "File"',
  'Button text is ≤ 4 words; articles (a/an/the) removed for scannability',
  'Generic confirmation labels (OK, Submit, Continue, Yes/No) are rejected for confirmation dialogs: the label must state the action',
  'Commands that open a further-input dialog end with an ellipsis (…); immediate commands do not',
  'Error messages state what happened, what to do, and what to expect next, beyond a bare "An error occurred"',
  'Error messages use plain language: no jargon, no exposed error codes, no blame words (invalid, illegal, incorrect)',
  'Error messages don\'t overapologize and don\'t introduce "we/us" unless the system caused the error',
  'Empty states offer a clear next action (a button or link with a verb) alongside the message',
  'Link text describes the destination; never bare "click here / learn more / read more / here"',
  'All UI text uses sentence case, never title case or ALL CAPS (except eyebrows, per the typography contract)',
  'No trailing period on buttons, labels, radio/checkbox text, tab text; periods only on full sentences (tooltips, error bodies, dialog bodies)',
  'Active voice, except when the system is the subject of an error',
  'Second person (you/your) for user-facing copy; "I/me" never used for the app\'s voice; "we" only when the system is the actor',
  'No "please / thank you" in standard UI, except when the user is genuinely inconvenienced',
  'Voice is constant; tone adapts to the user\'s emotional state: error tone is economical and direct, never humorous',
  'Don\'t blame the user: error messages describe the problem and the fix, never the user\'s mistake',
];

const COPYWRITING_VERIFICATION = [
  'v38: Button text is a verb phrase or recognized command (not a bare noun)',
  'v39: No trailing period on button text, labels, or tab text',
  'v40: Link text is descriptive (not bare "click here", "learn more", "here")',
  'v41: No ALL CAPS UI text (except eyebrow labels per typography contract)',
];

const COPYWRITING_GOVERNANCE = [
  'Error message completeness (what happened + what to do + what to expect): human review using NN/g 12-guideline rubric',
  'Empty-state next-action presence: human review if no automated DOM check',
  'Voice and tone consistency: human review against Mailchimp-style voice-and-tone guide',
  'Consistency map: one canonical label per action across the product (no "Sign in" vs "Log in")',
];

const COPYWRITING_TOOLING = [
  'Vale (errata-ai/vale): YAML-rule prose linter; ships Microsoft Writing Style Guide + Google Developer Docs Style Guide implementations',
  'textlint: pluggable rule engine for custom checks (button verb phrase, label ≤ 4 words, no trailing period)',
  'alex: inclusive/insensitive-language linter for the blame-words subset',
];

function TokenTable({
  rows,
}: {
  rows: { token: string; value: string; role: string }[];
}) {
  return (
    <div className="token-table" role="table" aria-label="Design tokens">
      <div className="token-table-head" role="row">
        <span role="columnheader">Token</span>
        <span role="columnheader">Value</span>
        <span role="columnheader">Role</span>
      </div>
      {rows.map((row) => (
        <div className="token-table-row" role="row" key={row.token}>
          <code role="cell">{row.token}</code>
          <code role="cell" className="token-value">
            {row.value}
          </code>
          <span role="cell">{row.role}</span>
        </div>
      ))}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <>
      <ReadingProgress />
      <Topbar scrolled />

      <main id="main-content" data-pagefind-body className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Operating rules</p>
          <h1 className="surface-title" data-scramble>Contracts</h1>
          <p className="surface-lede">
            Design contracts turn principles into reusable operating rules for
            artifacts, interfaces, and review.
          </p>
          <div className="text-cell">
            <p className="surface-note">
              Designesy Contracts are portable design agreements that let people
              and agents carry design judgment across tools, sessions, codebases,
              and artifacts. They make design judgment inspectable, with
              evidence in place of slogans or vibes.
            </p>
          </div>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <Link
              className="button primary"
              href="/contracts/design-system"
              data-cuelume-press
            >
              Contract home
            </Link>
            <Link
              className="button ghost"
              href="/contracts/design-system.json"
              data-cuelume-press
            >
              Machine export
            </Link>
          </div>
          <AgentActions mdPath="/contracts.md" label="the contracts index" />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Published now</h2>
          <div className="row-stack" role="list">
            {PUBLISHED.map((row, i) => (
              <div role="listitem" key={row.href}>
                <Link
                  href={row.href}
                  className="row"
                  data-cuelume-hover="whisper"
                  data-cuelume-press
                >
                  <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="row-body">
                    <span className="row-title">{row.title}</span>
                    <span className="row-meta">{row.meta}</span>
                  </span>
                  <span className="row-side">
                    <span className="row-side-line">{row.datum}</span>
                    <span className="row-side-line">{row.href}</span>
                    <span className="row-side-arrow" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Why contracts matter</h2>
          <div className="definition">
            <p className="definition-label">The question a contract answers</p>
            <p>
              What exact value should I use? Why does this value exist? Where may
              this value be applied? What behavior does this component need?
              What should I avoid? How do I know if I broke the system?
            </p>
          </div>
          <div className="text-cell">
            <p className="surface-note">
              A useful contract helps a future agent or team member answer all of
              these without relearning the design system from scratch. Contracts
              are the operational bridge between philosophy and execution.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract contents</h2>
          <div className="text-cell" style={{ marginBottom: '1.5rem' }}>
            <p className="surface-note">
              A Designesy Contract should include all of the following:
              structured values for machines, rationale for humans, and
              verification criteria for both. Each part opens its section of
              the published contract below.
            </p>
          </div>
          <CheckGrid
            dense
            items={CONTRACT_CONTENTS.map((part) => ({ title: part.title, href: `#${part.id}` }))}
          />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract discipline</h2>
          <div className="text-cell" style={{ marginBottom: '1.5rem' }}>
            <p className="surface-note">
              Keep upstream-compatible schema names visible when compatibility
              matters: <code style={{ color: 'var(--ink)' }}>colors</code>,{' '}
              <code style={{ color: 'var(--ink)' }}>typography</code>,{' '}
              <code style={{ color: 'var(--ink)' }}>rounded</code>,{' '}
              <code style={{ color: 'var(--ink)' }}>spacing</code>,{' '}
              <code style={{ color: 'var(--ink)' }}>components</code>. Use local
              extensions for doctrine, review, provenance, agent instructions,
              and verification, and keep the standard contract visible to tools.
            </p>
          </div>
          <h3 style={SUBHEAD}>Anti-patterns</h3>
          <CheckGrid items={checkItemsFromStrings(CONTRACT_ANTI, { avoid: true })} />
        </section>

        {/* ========== Published contract ========== */}
        <section className="doctrine-section fade-up" id="design-system-contract">
          <h2 className="doctrine-heading">Published contract</h2>
          <div className="definition">
            <p className="definition-label">Designesy design system · {CONTRACT_VERSION}</p>
            <p>
              Public design contract for designesy.org. Derived from the live
              site token foundation, with Lab One · Poise, Lab Two · Takt, Lab
              Three · Cadence, and Lab Four · Acoustics rules adopted. Provisional, doctrine-referenced, and
              meant to be verified against the running site and revised as the site changes.
            </p>
          </div>
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            Contract home ·{' '}
            <Link href="/contracts/design-system">
              /contracts/design-system
            </Link>
            {' · '}
            Machine export ·{' '}
            <Link href="/contracts/design-system.json">
              /contracts/design-system.json
            </Link>
            {' · '}
            Public review ·{' '}
            <Link href="/review/designesy-org">/review/designesy-org</Link>
          </p>
        </section>

        <section className="doctrine-section fade-up" id={sectionId('source-and-provenance')}>
          <h2 className="doctrine-heading">01 · Source and provenance</h2>
          <CheckGrid items={[
              {
                title: 'Public implementation',
                meta: 'designesy.org (Next.js App Router)',
              },
              {
                title: 'Token source',
                meta: 'Live site design tokens',
              },
              {
                title: 'Doctrine lineage',
                meta: 'Designesy design doctrine, with only operational values on the public surface',
              },
              {
                title: 'Motion references',
                meta: 'Short settle language adapted into --ease-out, --ease-in-out, --ease-drawer',
              },
              {
                title: 'Interaction audio',
                meta: 'Cuelume v0.2.2, with the sound preference owned by Designesy',
              },
              {
                title: 'Contract status',
                meta: 'Public ' + CONTRACT_VERSION + ', with Poise, Takt, Cadence, Acoustics, and Copywriting rules adopted',
              },
            ]} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('primitive-tokens')}>
          <h2 className="doctrine-heading">02 · Primitive tokens</h2>
          {/* Group labels are headings, in the section's one subhead style. */}
          <h3 style={SUBHEAD}>Colors (exact values)</h3>
          <TokenTable rows={PRIMITIVE_COLORS} />
          <h3 style={{ ...SUBHEAD, marginTop: '1.5rem' }}>Surfaces and lines</h3>
          <TokenTable rows={PRIMITIVE_SURFACES} />
          <h3 style={{ ...SUBHEAD, marginTop: '1.5rem' }}>Shape, shell, motion primitives</h3>
          <TokenTable rows={PRIMITIVE_SHAPE_MOTION} />
          <h3 style={{ ...SUBHEAD, marginTop: '1.5rem', marginBottom: '0.25rem' }}>Material and depth</h3>
          <p className="surface-note" style={{ marginBottom: '0.75rem' }}>
            Depth comes from surface lightness first, then one top-lit rim and
            one light straight down.
          </p>
          <TokenTable rows={DEPTH_TOKENS} />
          <p className="surface-note" style={{ marginTop: '1rem' }}>
            <code style={{ color: 'var(--ink)' }}>--shadow-sm</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>--shadow-md</code> and{' '}
            <code style={{ color: 'var(--ink)' }}>--shadow-lg</code> keep their
            published values in the token export; no surface on this site
            paints with them.
          </p>

          <DemoGrid>
            <DemoCell
              label="Color roles"
              note={<>Each chip renders the exact token value. Dark roles on dark surfaces: contrast is the product.</>}
            >
              <div className="demo-swatch-grid">
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#f5f5f7' }} />
                  <span className="demo-swatch-name">--ink</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#a0a0a0' }} />
                  <span className="demo-swatch-name">--muted</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#7d7d7d' }} />
                  <span className="demo-swatch-name">--muted-dim</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#0133cb' }} />
                  <span className="demo-swatch-name">--signal</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#3358e8' }} />
                  <span className="demo-swatch-name">--signal-light</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#5d7bff' }} />
                  <span className="demo-swatch-name">--signal-access</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#fecc34' }} />
                  <span className="demo-swatch-name">--activation</span>
                </div>
              </div>
            </DemoCell>

            <DemoCell
              label="Surface depth"
              note={<>Depth is surface lightness: paper, surface, raised, lifted. The last three are washes: soft fill, hover, badge.</>}
            >
              <div className="demo-swatch-grid">
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#010102', borderColor: 'var(--line)' }} />
                  <span className="demo-swatch-name">--paper</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#0a0a0c' }} />
                  <span className="demo-swatch-name">--surface</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#121216' }} />
                  <span className="demo-swatch-name">--raised</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: '#16161b' }} />
                  <span className="demo-swatch-name">--lifted</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: 'rgba(255,255,255,0.03)' }} />
                  <span className="demo-swatch-name">--soft</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <span className="demo-swatch-name">--hover</span>
                </div>
                <div className="demo-swatch">
                  <div className="demo-swatch-chip" style={{ background: 'rgba(1,51,203,0.14)' }} />
                  <span className="demo-swatch-name">--signal-dim</span>
                </div>
              </div>
            </DemoCell>

            <DemoCell
              label="Radius scale"
              note={<>The published scale, smallest first: 4px compact, 6px default, 12px large panels, 16px flagship. The 8px tier sits between, off the scale.</>}
            >
              {/* Four 48px squares: four of the rack's 72px boxes overflowed the
                  271px stage at 1024. Each corner is its token, not a number. */}
              <div className="demo-radius-pair">
                {RADIUS_RACK.map((step) => (
                  <div className="demo-radius-card" key={step.token}>
                    <div
                      className="demo-radius-box"
                      style={{ width: '3rem', height: '3rem', borderRadius: `var(${step.token})` }}
                    />
                    <span className="demo-radius-tag">{step.value}</span>
                  </div>
                ))}
              </div>
            </DemoCell>
          </DemoGrid>
        </section>

        <section className="doctrine-section fade-up" id={sectionId('semantic-tokens')}>
          <h2 className="doctrine-heading">03 · Semantic tokens</h2>
          <div className="doctrine-cols">
            <div className="definition">
              <p className="definition-label">Surface roles</p>
              <p>
                paper = page void · surface = default panel · surface-raised =
                hover/emphasis panel · surface-soft = quiet note fill ·
                surface-hover = interactive wash
              </p>
            </div>
            <div className="definition">
              <p className="definition-label">Line roles</p>
              <p>
                line = default structure · line-strong = active/emphasis edge ·
                line-faint = quiet subdivision
              </p>
            </div>
            <div className="definition">
              <p className="definition-label">Signal roles</p>
              <p>
                signal = brand action and wordmark dot · signal-light = hover and
                focus lift · signal-dim = badge/wash · activation = highlights only
              </p>
            </div>
            <div className="definition">
              <p className="definition-label">Type roles</p>
              <p>
                ink = primary claim · muted = supporting body · muted-dim =
                eyebrows, meta, footers
              </p>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up" id={sectionId('typography-rules')}>
          <h2 className="doctrine-heading">04 · Typography rules</h2>
          <ul className="principle-list">
            {TYPOGRAPHY_RULES.map((rule, i) => (
              <li className="principle" key={rule}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <p>{rule}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="doctrine-section fade-up" id={sectionId('spacing-and-layout')}>
          <h2 className="doctrine-heading">05 · Spacing and layout rules</h2>
          <TokenTable
            rows={SPACING_RULES.map((r) => ({
              token: r.name,
              value: r.value,
              role: r.note,
            }))}
          />
          <p className="surface-note" style={{ marginTop: '1.5rem' }}>
            Layout doctrine: one shell, one 16px gutter, and the 7|5 seam that
            notes, definitions and row lists hang on. Grids switch on their own
            width before type becomes unreadable; fewer columns beat cramped
            four-up layouts at mid widths.
          </p>
        </section>

        <section className="doctrine-section fade-up" id={sectionId('shape-and-surface')}>
          <h2 className="doctrine-heading">06 · Shape and surface rules</h2>
          <CheckGrid items={checkItemsFromStrings(SHAPE_RULES)} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('component-states')}>
          <h2 className="doctrine-heading">07 · Component behavior and states</h2>
          <div className="principle-list">
            {COMPONENT_STATES.map((item, i) => (
              <div className="principle" key={item.name}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <h3>{item.name}</h3>
                  <p>{item.states}</p>
                </div>
              </div>
            ))}
          </div>

          <DemoGrid>
            <DemoCell
              label="Primary button states"
              note={<>default → hover (signal-light) → active (scale 0.97) → focus-visible (2px ring)</>}
            >
              <div className="demo-state-grid">
                <div className="demo-state-row">
                  <span className="demo-state-tag">Default</span>
                  <span className="demo-state-btn s-default">Primary</span>
                </div>
                <div className="demo-state-row">
                  <span className="demo-state-tag">Hover</span>
                  <span className="demo-state-btn s-hover">Primary</span>
                </div>
                <div className="demo-state-row">
                  <span className="demo-state-tag">Active</span>
                  <span className="demo-state-btn s-active">Primary</span>
                </div>
                <div className="demo-state-row">
                  <span className="demo-state-tag">Focus</span>
                  <span className="demo-state-btn s-focus">Primary</span>
                </div>
              </div>
            </DemoCell>

            <DemoCell
              label="Ghost button"
              note={<>transparent + line-strong · hover surface-hover · active scale(0.97)</>}
            >
              <div className="demo-state-grid">
                <div className="demo-state-row">
                  <span className="demo-state-tag">Default</span>
                  <span className="demo-state-btn s-ghost">Ghost</span>
                </div>
                <div className="demo-state-row">
                  <span className="demo-state-tag">Active</span>
                  <span className="demo-state-btn s-ghost" style={{ transform: 'scale(0.97)', background: 'var(--surface-hover)' }}>Ghost</span>
                </div>
              </div>
            </DemoCell>

            <DemoCell
              label="Easing curves"
              note={<>Four timing functions. Watch the dot travel: same distance, different feel.</>}
            >
              <EasingDemo />
            </DemoCell>
          </DemoGrid>
        </section>

        <section className="doctrine-section fade-up" id={sectionId('accessibility-requirements')}>
          <h2 className="doctrine-heading">08 · Accessibility requirements</h2>
          <CheckGrid items={checkItemsFromStrings(A11Y_REQUIREMENTS)} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('motion-and-reduced-motion')}>
          <h2 className="doctrine-heading">09 · Motion and reduced-motion</h2>
          <CheckGrid items={checkItemsFromStrings(MOTION_RULES)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">09a · Ten non-negotiable motion standards</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            The positive form of the motion anti-patterns below. Every
            motion-bearing artifact must pass all ten.
          </p>
          <div className="principle-list">
            {TEN_MOTION_STANDARDS.map((standard, i) => (
              <div className="principle" key={standard}>
                <span className="principle-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="principle-body">
                  <p>{standard}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">09b · Motion anti-patterns</h2>
          <h3 style={SUBHEAD}>Block on sight</h3>
          <CheckGrid items={checkItemsFromStrings(MOTION_BLOCK_ON_SIGHT, { avoid: true })} />
          <h3 style={{ ...SUBHEAD, marginTop: '1.5rem' }}>Caution</h3>
          <CheckGrid items={checkItemsFromStrings(MOTION_CAUTION, { avoid: true })} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">09c · Spring physics</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Custom <code style={{ color: 'var(--ink)' }}>$type: spring</code> via{' '}
            <code style={{ color: 'var(--ink)' }}>$extensions.designesy</code>.
            Net-new relative to W3C DTCG 2025.10.
          </p>
          <TokenTable rows={SPRING_TOKENS} />
        </section>

        {/* Linked from the design system contract's Contents (Acoustics). */}
        <section className="doctrine-section fade-up" id="acoustic-tokens">
          <h2 className="doctrine-heading">09d · Acoustic tokens</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Custom <code style={{ color: 'var(--ink)' }}>$type: sound</code> via{' '}
            <code style={{ color: 'var(--ink)' }}>$extensions.designesy</code>.
            Net-new relative to W3C DTCG 2025.10. Full cue table at{' '}
            <Link href="/acoustic-tokens">/acoustic-tokens</Link>.
          </p>
          <CheckGrid items={checkItemsFromStrings(ACOUSTIC_TOKENS_REF)} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('09e-copywriting')}>
          <h2 className="doctrine-heading">10 · Copywriting ({COPYWRITING_SINCE})</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            UX copy principles adopted in {COPYWRITING_SINCE} from NN/g, Polaris, IBM
            Carbon, Microsoft Fluent, Apple HIG, and Atlassian. Gap source:{' '}
            <a
              href="https://detail.design"
              // Underlined: inside a sentence, color alone does not mark a link
              // (WCAG 1.4.1; axe link-in-text-block).
              style={{ color: 'var(--signal-text)', textDecoration: 'underline', textUnderlineOffset: '0.15em' }}
            >
              detail.design
            </a>{' '}
            Copywriting discipline. 4 principles are codified as verification
            checks (v38 to v41); 12 are governance.
          </p>
          <h3 style={SUBHEAD}>Principles</h3>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_PRINCIPLES)} />
          <h3 style={{ ...SUBHEAD, marginTop: '1.5rem' }}>Verification checks (automated)</h3>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_VERIFICATION)} />
          <h3 style={{ ...SUBHEAD, marginTop: '1.5rem' }}>Governance (human review)</h3>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_GOVERNANCE)} />
          <h3 style={{ ...SUBHEAD, marginTop: '1.5rem' }}>Tooling</h3>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_TOOLING)} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('anti-patterns')}>
          <h2 className="doctrine-heading">11 · Anti-patterns</h2>
          <CheckGrid items={checkItemsFromStrings(ANTI_PATTERNS, { avoid: true })} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('implementation-notes')}>
          <h2 className="doctrine-heading">12 · Implementation notes</h2>
          <CheckGrid items={checkItemsFromStrings(IMPLEMENTATION_NOTES)} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('verification-criteria')}>
          <h2 className="doctrine-heading">13 · Verification criteria</h2>
          <CheckGrid items={checkItemsFromStrings(VERIFICATION)} />
        </section>

        <section className="doctrine-section fade-up" id={sectionId('open-tensions')}>
          <h2 className="doctrine-heading">14 · Open tensions</h2>
          <CheckGrid items={checkItemsFromStrings(OPEN_TENSIONS, { avoid: true })} />
        </section>

        <div className="status-note">
          Designesy design system contract {CONTRACT_VERSION}: public artifact
          discipline. It is not legal advice or a client service agreement.
          Values are taken from
          the live site tokens. Poise, Takt, Cadence, Acoustics, and Copywriting rules are
          adopted. Contract home:{' '}
          <Link href="/contracts/design-system">/contracts/design-system</Link>
          {' · '}
          Machine export:{' '}
          <Link href="/contracts/design-system.json">
            /contracts/design-system.json
          </Link>
          . When the human page and the live styles disagree, the live styles are
          authoritative until the contract is revised. Human and machine surfaces
          stay synchronized.
        </div>
      </main>

      <Footer />
    </>
  );
}
