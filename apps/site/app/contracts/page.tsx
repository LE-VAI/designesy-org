import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { CheckGrid } from '../lib/check-grid';
import { checkItemsFromStrings } from '../lib/check-items';
import { DemoCell, DemoGrid } from '../lib/demo-cell';
import { pageMeta } from '../lib/site-meta';

export const metadata: Metadata = pageMeta({
  title: 'Contracts',
  description:
    'Designesy Contracts — portable design agreements with exact values, roles, behavior, anti-patterns, and verification. Design system v0.4.0 is public (Poise + Takt + Cadence + Acoustics + Copywriting adopted).',
  path: '/contracts',
  ogDescription:
    'Portable design agreements for people and agents. Design system contract v0.4.0 is live — Poise, Takt, Cadence, and Copywriting rules adopted.',
  twitterDescription:
    'Portable design judgment — designesy.org/contracts/design-system',
});

const CONTRACT_CONTENTS = [
  'Source and provenance',
  'Primitive tokens',
  'Semantic tokens',
  'Typography rules',
  'Spacing and layout rules',
  'Shape and surface rules',
  'Component behavior and states',
  'Accessibility requirements',
  'Motion and reduced-motion guidance',
  'Copywriting principles',
  'Anti-patterns',
  'Implementation notes',
  'Verification criteria',
  'Open tensions',
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

const PRIMITIVE_SHAPE_MOTION = [
  { token: '--radius', value: '6px', role: 'Default corner radius' },
  { token: '--radius-sm', value: '4px', role: 'Compact controls / nav chips' },
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

const SPACING_RULES = [
  { name: 'Shell horizontal', value: '1.5rem (1rem ≤560px)', note: '.site-shell / .surface-page' },
  { name: 'Section vertical', value: '3.5rem / 3rem doctrine', note: '.section / .doctrine-section' },
  { name: 'Card padding', value: '1.25–1.5rem', note: 'pillars, surfaces, items' },
  { name: 'Grid gap', value: '0.75–1rem', note: 'pillar / surface grids' },
  { name: 'Control min height', value: '42px buttons, 32px sound toggle', note: 'touch-friendly targets' },
  { name: 'Breakpoints', value: '860px · 720px · 560px', note: 'grids · topbar · single-column' },
];

const TYPOGRAPHY_RULES = [
  'Body: 16px / 1.55, system stack (-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Arial, Helvetica, sans-serif)',
  'Headings: weight 700, line-height 1.08, letter-spacing -0.02em',
  'Hero wordmark: clamp(3.2rem, 9vw, 5.5rem), weight 800, tracking -0.04em',
  'Eyebrows: 0.72–0.75rem, weight 600, uppercase, letter-spacing 0.18em, muted-dim',
  'Lede: 1.1–1.5rem, weight 500, ink — one clear claim, not a paragraph stack',
  'Supporting note: 0.85–0.95rem, muted, max-width ~520–580px',
  'Never invent decorative display fonts for public UI; system stack is the contract',
];

const COMPONENT_STATES = [
  { name: 'Primary button', states: 'default signal fill · hover signal-light · active scale(0.97) · focus-visible 2px signal-light' },
  { name: 'Ghost button', states: 'transparent + line-strong · hover surface-hover · active scale(0.97)' },
  { name: 'Nav link', states: 'muted · hover ink + surface-hover · sticky topbar blur when scrolled' },
  { name: 'Card / pillar', states: 'surface + line · hover raised + line-strong · active scale(0.985); lift only on fine pointer hover' },
  { name: 'Sound toggle', states: 'aria-pressed sync · pressed shows signal-light · Cuelume setEnabled(true|false)' },
  { name: 'Definition block', states: 'bordered surface · hover line-strong · label uppercase muted-dim' },
];

const A11Y_REQUIREMENTS = [
  'html lang="en"; meaningful page titles via metadata template',
  'Focus-visible: 2px solid --signal-light, offset 2px',
  'Sound control exposes aria-label, aria-pressed, and title',
  'Decorative glyphs (sound icon, arrows) use aria-hidden where text is already labeled',
  'Prefer semantic landmarks: sticky header, main, footer',
  'Do not rely on color alone for state; pair with label, border, or weight change',
  'Respect prefers-reduced-motion: collapse animations/transitions to near-zero duration',
  'Scroll padding-top 4rem so in-page anchors clear the sticky topbar',
];

const MOTION_RULES = [
  'Entrance: fadeUp 0.6s --ease with staggered delays (0.08s steps)',
  'Interactive settle: 160ms --ease-out on press scale',
  'Hover lift only under (hover: hover) and (pointer: fine) — no fake hover on touch',
  'Wordmark signal pulse: opacity heartbeat only; no blur glow, no gradient blobs',
  'prefers-reduced-motion: reduce → disable non-essential motion; sound defaults off as acoustic proxy',
];

const TEN_MOTION_STANDARDS = [
  'Easing is deliberate — use contract cubicBezier tokens, not bare CSS keywords',
  'Properties are explicit — never transition:all; name the exact properties',
  'Entrances have opacity — animate from scale(0.9–0.97) + opacity, never scale(0)',
  'Keyboard is still — no motion on keyboard-initiated or 100+/day actions',
  'Layout is not animated — never animate width, height, margin, padding, top, left',
  'Touch is gated — :hover motion on touch-visible surfaces requires explicit gating',
  'Duration is bounded — UI animation stays ≤ 300ms unless justified',
  'Reduced-motion is handled — every movement has a prefers-reduced-motion path',
  'Press is asymmetric — press and release use asymmetric timing',
  'Easing is never ease-in — deceleration (ease-out) or custom curves only',
];

const MOTION_BLOCK_ON_SIGHT = [
  'Using ease-in on any UI interaction',
  'Using transition: all instead of explicit properties',
  'Animating from scale(0) instead of scale(0.9–0.97) + opacity',
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
  'Engine: Cuelume v0.1.0 (MIT) — interaction sound synthesis via Web Audio API',
  'Custom $type: sound via $extensions.designesy — net-new relative to W3C DTCG 2025.10',
  '10 cues mapped to 10 interaction roles — see /acoustic-tokens for the full table',
  'Preference key: designesy:sound in localStorage; engine follows Designesy',
  'Reduced-motion proxy: sound defaults off under prefers-reduced-motion',
  'No focus sounds — sounds fire on pointer/click, not on focus',
  'No ambient audio — Cuelume is interaction-only; no background music or mood beds',
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
  'Single live token source of truth — no secondary theme framework',
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
  'Button text is a verb phrase or recognized command — not a bare noun (copywriting v38)',
  'No trailing period on button text, labels, or tab text (copywriting v39)',
  'Link text is descriptive — not bare "click here", "learn more", "here" (copywriting v40)',
  'No ALL CAPS UI text except eyebrow labels (copywriting v41)',
];

const OPEN_TENSIONS = [
  'Light theme is not contracted — dark technical foundation is provisional',
  '--activation exists but has limited public surface usage',
  'Inter is named in the stack but not self-hosted; system fallback is intentional',
  'Shadow tokens exist; elevation language is still light-touch (borders lead)',
  'Human contract page and machine export remain dual sources until a single generator owns both',
  'Keyboard-path verification packets are published for Poise only — not every public route',
  'Inline-axis logical properties (margin-inline, padding-inline) applied — block-axis and border-inline remain physical',
  'Block-axis logical properties (margin-block-start/end) not yet migrated — direction-ready is partial',
  'border-inline-start not yet used — decorative borders still physical',
];

const COPYWRITING_PRINCIPLES = [
  'Button copy is a verb phrase (or a recognized single-word command), never a bare noun — "Save changes" not "Changes", "Delete file" not "File"',
  'Button text is ≤ 4 words; articles (a/an/the) removed for scannability',
  'Generic confirmation labels (OK, Submit, Continue, Yes/No) are rejected for confirmation dialogs — the label must state the action',
  'Commands that open a further-input dialog end with an ellipsis (…); immediate commands do not',
  'Error messages state what happened, what to do, and what to expect next — not just "An error occurred"',
  'Error messages use plain language — no jargon, no exposed error codes, no blame words (invalid, illegal, incorrect)',
  'Error messages don\'t overapologize and don\'t introduce "we/us" unless the system caused the error',
  'Empty states have a clear next action (button or link with a verb), not just a message',
  'Link text is descriptive of the destination, not bare "click here / learn more / read more / here"',
  'All UI text uses sentence case — not title case, not ALL CAPS (except eyebrows per typography contract)',
  'No trailing period on buttons, labels, radio/checkbox text, tab text; periods only on full sentences (tooltips, error bodies, dialog bodies)',
  'Active voice, not passive, except when the system is the subject of an error',
  'Second person (you/your) for user-facing copy; "I/me" never used for the app\'s voice; "we" only when the system is the actor',
  'No "please / thank you" in standard UI — only when the user is genuinely inconvenienced',
  'Voice is constant; tone adapts to the user\'s emotional state — error tone is economical and direct, not humorous',
  'Don\'t blame the user — error messages describe the problem and the fix, not the user\'s mistake',
];

const COPYWRITING_VERIFICATION = [
  'v38: Button text is a verb phrase or recognized command — not a bare noun',
  'v39: No trailing period on button text, labels, or tab text',
  'v40: Link text is descriptive — not bare "click here", "learn more", "here"',
  'v41: No ALL CAPS UI text (except eyebrow labels per typography contract)',
];

const COPYWRITING_GOVERNANCE = [
  'Error message completeness (what happened + what to do + what to expect) — human review using NN/g 12-guideline rubric',
  'Empty-state next-action presence — human review if no automated DOM check',
  'Voice and tone consistency — human review against Mailchimp-style voice-and-tone guide',
  'Consistency map: one canonical label per action across the product (no "Sign in" vs "Log in")',
];

const COPYWRITING_TOOLING = [
  'Vale (errata-ai/vale) — YAML-rule prose linter; ships Microsoft Writing Style Guide + Google Developer Docs Style Guide implementations',
  'textlint — pluggable rule engine for custom checks (button verb phrase, label ≤ 4 words, no trailing period)',
  'alex — inclusive/insensitive-language linter for the blame-words subset',
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
      <Topbar scrolled />

      <main id="main-content" className="surface-page">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Operating rules</p>
          <h1 className="surface-title" data-scramble>Contracts</h1>
          <p className="surface-lede">
            Design contracts turn principles into reusable operating rules for
            artifacts, interfaces, and review.
          </p>
          <p className="surface-note">
            Designesy Contracts are portable design agreements that let people
            and agents carry design judgment across tools, sessions, codebases,
            and artifacts. They make design judgment inspectable — not reliant
            on slogans or vibes.
          </p>
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
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Published now</h2>
          <div className="row-stack" role="list">
            <Link
              href="/contracts/design-system"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">01</span>
              <span className="row-body">
                <span className="row-title">Design system · v0.4.0</span>
                <span className="row-meta">
                  Human overview, full tables below, machine JSON export
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/tokens"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">02</span>
              <span className="row-body">
                <span className="row-title">Tokens · v0.1.0</span>
                <span className="row-meta">
                  W3C DTCG 2025.10 format conformance — color spaces, custom types, validation
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/a11y"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">03</span>
              <span className="row-body">
                <span className="row-title">Accessibility · v0.1.0</span>
                <span className="row-meta">
                  WCAG 2.2 AA via axe-core 4.12.1 — 11 verification checks
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/motion"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">04</span>
              <span className="row-body">
                <span className="row-title">Motion · v0.1.0</span>
                <span className="row-meta">
                  Lottie spec v1.0.1 + Ten Non-Negotiable Motion Standards — 10 verification checks
                </span>
              </span>
            </Link>
            <Link
              href="/labs/poise"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">05</span>
              <span className="row-body">
                <span className="row-title">Poise adopted</span>
                <span className="row-meta">
                  Lab One interaction rules adopted in contract v0.1.1
                </span>
              </span>
            </Link>
            <Link
              href="/labs/takt"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">06</span>
              <span className="row-body">
                <span className="row-title">Takt adopted</span>
                <span className="row-meta">
                  Lab Two interface-feel rules adopted in contract v0.1.2
                </span>
              </span>
            </Link>
            <Link
              href="/labs/cadence"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">07</span>
              <span className="row-body">
                <span className="row-title">Cadence adopted</span>
                <span className="row-meta">
                  Lab Three typography rules adopted in contract v0.1.3
                </span>
              </span>
            </Link>
            <Link
              href="/labs/acoustics"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">08</span>
              <span className="row-body">
                <span className="row-title">Acoustics adopted</span>
                <span className="row-meta">
                  Lab Four acoustic mapping rules adopted in contract v0.3.0
                </span>
              </span>
            </Link>
            <Link
              href="/contracts#09e-copywriting"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">09</span>
              <span className="row-body">
                <span className="row-title">Copywriting adopted</span>
                <span className="row-meta">
                  UX copy principles adopted in v0.4.0 — NN/g, Polaris, Carbon, Fluent, HIG
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/skill"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">10</span>
              <span className="row-body">
                <span className="row-title">Agent skill export</span>
                <span className="row-meta">
                  SKILL.md format for AI coding agents — same source as JSON
                </span>
              </span>
            </Link>
            <Link
              href="/review/designesy-org"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">11</span>
              <span className="row-body">
                <span className="row-title">Field check</span>
                <span className="row-meta">
                  Live site reviewed against this contract
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/drift"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">12</span>
              <span className="row-body">
                <span className="row-title">Drift · v0.1.0</span>
                <span className="row-meta">
                  AI-generated UI drift detection — 12 checks for token fabrication, value variance, off-contract patterns
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/readiness"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">13</span>
              <span className="row-body">
                <span className="row-title">AI Readiness · v0.1.0</span>
                <span className="row-meta">
                  The 6th maturity axis — 10 checks probe for machine-readable tokens, llms.txt, agent.json, MCP, DESIGN.md
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/guardrails"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">14</span>
              <span className="row-body">
                <span className="row-title">Guardrails · v0.1.0</span>
                <span className="row-meta">
                  The product layer — emit a frozen build contract (DTCG tokens, Stylelint, AGENTS.md) for AI coding agents
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/monitor"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">15</span>
              <span className="row-body">
                <span className="row-title">Monitor · v0.1.0</span>
                <span className="row-meta">
                  The continuous-governance layer — re-score on a cadence, store snapshots, compute drift deltas, surface regressions before they compound
                </span>
              </span>
            </Link>
            <Link
              href="/contracts/compare"
              className="row"
              role="listitem"
              data-cuelume-hover="whisper"
              data-cuelume-press
            >
              <span className="row-index">16</span>
              <span className="row-body">
                <span className="row-title">Compare · v0.1.0</span>
                <span className="row-meta">
                  The diff engine — fetch two URLs, extract their token systems, and surface what actually changed across 8 dimensions: added, removed, renamed, value-changed, scale drift, contrast drift, structure delta, score delta
                </span>
              </span>
            </Link>
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
          <p className="surface-note">
            A useful contract helps a future agent or team member answer all of
            these without relearning the design system from scratch. Contracts
            are the operational bridge between philosophy and execution.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract contents</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            A Designesy Contract should include all of the following —
            structured values for machines, rationale for humans, and
            verification criteria for both.
          </p>
          <CheckGrid dense items={checkItemsFromStrings(CONTRACT_CONTENTS)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Contract discipline</h2>
          <p className="surface-note" style={{ marginBottom: '1.5rem' }}>
            Keep upstream-compatible schema names visible when compatibility
            matters: <code style={{ color: 'var(--ink)' }}>colors</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>typography</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>rounded</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>spacing</code>,{' '}
            <code style={{ color: 'var(--ink)' }}>components</code>. Use local
            extensions for doctrine, review, provenance, agent instructions, and
            verification — but do not hide the standard contract from tools.
          </p>
          <h3
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: '0.75rem',
            }}
          >
            Anti-patterns
          </h3>
          <CheckGrid items={checkItemsFromStrings(CONTRACT_ANTI, { avoid: true })} />
        </section>

        {/* ========== Published contract ========== */}
        <section className="doctrine-section fade-up" id="design-system-contract">
          <h2 className="doctrine-heading">Published contract</h2>
          <div className="definition">
            <p className="definition-label">Designesy design system · v0.4.0</p>
            <p>
              Public design contract for designesy.org. Derived from the live
              site token foundation, with Lab One · Poise, Lab Two · Takt, and
              Lab Three · Cadence rules adopted. Provisional, doctrine-referenced, and
              meant to be verified against the running site — not a frozen brand
              bible.
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

        <section className="doctrine-section fade-up">
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
                meta: 'Designesy design doctrine — operational values only on the public surface',
              },
              {
                title: 'Motion references',
                meta: 'Short settle language adapted into --ease-out, --ease-in-out, --ease-drawer',
              },
              {
                title: 'Interaction audio',
                meta: 'Cuelume v0.1.0 — preference owned by Designesy',
              },
              {
                title: 'Contract status',
                meta: 'Public v0.4.0 — Poise, Takt, Cadence, and Copywriting rules adopted',
              },
            ]} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">02 · Primitive tokens</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Colors (exact values)
          </p>
          <TokenTable rows={PRIMITIVE_COLORS} />
          <p className="surface-note" style={{ margin: '1.5rem 0 1rem' }}>
            Surfaces and lines
          </p>
          <TokenTable rows={PRIMITIVE_SURFACES} />
          <p className="surface-note" style={{ margin: '1.5rem 0 1rem' }}>
            Shape, shell, motion primitives
          </p>
          <TokenTable rows={PRIMITIVE_SHAPE_MOTION} />
          <p className="surface-note" style={{ marginTop: '1.5rem' }}>
            Shadows (supporting elevation, borders lead):{' '}
            <code style={{ color: 'var(--ink)' }}>--shadow-sm</code> 0 1px 3px
            rgba(0,0,0,0.4) · <code style={{ color: 'var(--ink)' }}>--shadow-md</code>{' '}
            0 8px 30px rgba(0,0,0,0.35) ·{' '}
            <code style={{ color: 'var(--ink)' }}>--shadow-lg</code> 0 24px 80px
            rgba(0,0,0,0.5)
          </p>

          <DemoGrid>
            <DemoCell
              label="Color roles"
              note={<>Each chip renders the exact token value. Dark roles on dark surfaces — contrast is the product.</>}
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
              note={<>Near-black surfaces, not gray. Depth from opacity layers, not heavy shadows.</>}
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
              note={<>6px default · 4px compact — no pill inflation.</>}
            >
              <div className="demo-radius-pair">
                <div className="demo-radius-card">
                  <div className="demo-radius-box r-default" />
                  <span className="demo-radius-tag">6px</span>
                </div>
                <div className="demo-radius-card">
                  <div className="demo-radius-box r-sm" />
                  <span className="demo-radius-tag">4px</span>
                </div>
                <div className="demo-radius-card">
                  <div className="demo-radius-box r-none" />
                  <span className="demo-radius-tag">none</span>
                </div>
              </div>
            </DemoCell>
          </DemoGrid>
        </section>

        <section className="doctrine-section fade-up">
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
                focus lift · signal-dim = badge/wash · activation = reserved
                highlight, not general chrome
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

        <section className="doctrine-section fade-up">
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

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">05 · Spacing and layout rules</h2>
          <TokenTable
            rows={SPACING_RULES.map((r) => ({
              token: r.name,
              value: r.value,
              role: r.note,
            }))}
          />
          <p className="surface-note" style={{ marginTop: '1.5rem' }}>
            Layout doctrine: one max-width shell, editorial vertical rhythm,
            grids collapse before type becomes unreadable. Prefer fewer columns
            over cramped four-up layouts on mid widths.
          </p>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">06 · Shape and surface rules</h2>
          <CheckGrid items={checkItemsFromStrings([
              'Default radius 6px; compact controls 4px — no pill inflation',
              'Borders define structure first; shadows are secondary depth',
              'Dark technical foundation: paper black, surfaces near-black',
              'One signal accent family; do not invent secondary brand hues',
              'Cards stay flat until interaction — lift is earned on hover',
              'Status notes use soft surface + line, not loud callout chrome',
            ])} />
        </section>

        <section className="doctrine-section fade-up">
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
              note={<>Four timing functions. Watch the dot travel — same distance, different feel.</>}
            >
              <div className="demo-easing">
                <div className="demo-easing-row" data-ease="default">
                  <span>--ease</span>
                  <div className="demo-easing-track">
                    <div className="demo-easing-dot" />
                  </div>
                </div>
                <div className="demo-easing-row" data-ease="out">
                  <span>--ease-out</span>
                  <div className="demo-easing-track">
                    <div className="demo-easing-dot" />
                  </div>
                </div>
                <div className="demo-easing-row" data-ease="in-out">
                  <span>--ease-in-out</span>
                  <div className="demo-easing-track">
                    <div className="demo-easing-dot" />
                  </div>
                </div>
                <div className="demo-easing-row" data-ease="drawer">
                  <span>--ease-drawer</span>
                  <div className="demo-easing-track">
                    <div className="demo-easing-dot" />
                  </div>
                </div>
              </div>
            </DemoCell>
          </DemoGrid>
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">08 · Accessibility requirements</h2>
          <CheckGrid items={checkItemsFromStrings(A11Y_REQUIREMENTS)} />
        </section>

        <section className="doctrine-section fade-up">
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
          <h3
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: '0.75rem',
            }}
          >
            Block on sight
          </h3>
          <CheckGrid items={checkItemsFromStrings(MOTION_BLOCK_ON_SIGHT, { avoid: true })} />
          <h3
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--ink)',
              margin: '1.5rem 0 0.75rem',
            }}
          >
            Caution
          </h3>
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

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">09d · Acoustic tokens</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            Custom <code style={{ color: 'var(--ink)' }}>$type: sound</code> via{' '}
            <code style={{ color: 'var(--ink)' }}>$extensions.designesy</code>.
            Net-new relative to W3C DTCG 2025.10. Full cue table at{' '}
            <Link href="/acoustic-tokens">/acoustic-tokens</Link>.
          </p>
          <CheckGrid items={checkItemsFromStrings(ACOUSTIC_TOKENS_REF)} />
        </section>

        <section className="doctrine-section fade-up" id="09e-copywriting">
          <h2 className="doctrine-heading">09e · Copywriting (v0.4.0)</h2>
          <p className="surface-note" style={{ marginBottom: '1rem' }}>
            UX copy principles adopted in v0.4.0 from NN/g, Polaris, IBM
            Carbon, Microsoft Fluent, Apple HIG, and Atlassian. Gap signal:{' '}
            <a
              href="https://detail.design"
              style={{ color: 'var(--signal-light)' }}
            >
              detail.design
            </a>{' '}
            Copywriting discipline. 4 principles are codified as verification
            checks (v38–v41); 12 are governance.
          </p>
          <p className="surface-note" style={{ marginBottom: '0.5rem' }}>
            <strong style={{ color: 'var(--ink)' }}>Principles</strong>
          </p>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_PRINCIPLES)} />
          <p className="surface-note" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
            <strong style={{ color: 'var(--ink)' }}>Verification checks (automated)</strong>
          </p>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_VERIFICATION)} />
          <p className="surface-note" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
            <strong style={{ color: 'var(--ink)' }}>Governance (human review)</strong>
          </p>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_GOVERNANCE)} />
          <p className="surface-note" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
            <strong style={{ color: 'var(--ink)' }}>Tooling</strong>
          </p>
          <CheckGrid items={checkItemsFromStrings(COPYWRITING_TOOLING)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">10 · Anti-patterns</h2>
          <CheckGrid items={checkItemsFromStrings(ANTI_PATTERNS, { avoid: true })} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">11 · Implementation notes</h2>
          <CheckGrid items={checkItemsFromStrings(IMPLEMENTATION_NOTES)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">12 · Verification criteria</h2>
          <CheckGrid items={checkItemsFromStrings(VERIFICATION)} />
        </section>

        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">13 · Open tensions</h2>
          <CheckGrid items={checkItemsFromStrings(OPEN_TENSIONS, { avoid: true })} />
        </section>

        <div className="status-note">
          Designesy design system contract v0.4.0 — public artifact discipline,
          not legal advice or a client service agreement. Values are taken from
          the live site tokens. Poise, Takt, Cadence, and Copywriting rules are
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
