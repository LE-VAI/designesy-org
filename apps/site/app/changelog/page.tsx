// /changelog — contract changes organized by design dimension.
//
// Pattern from Artificial Analysis: "Designesy's changelog could be organized
// by dimension tabs: Tokens, Motion, Typography, Acoustic, Takt, Cadence,
// Verification, Components — mirroring how AA organizes by modality. Each
// contract version bump gets a changelog entry under the relevant dimension."
//
// Dimensions are filterable tabs. Each entry shows version, date, what changed,
// which checks were added/modified, and the rationale.

import type { Metadata } from 'next';
import Link from 'next/link';
import './changelog.css';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { CONTRACT_VERSION, ENGINE_CHECK_COUNT } from '../hero-stats';
import { CATEGORY_WEIGHTS } from '../lib/check-definitions';
import { AgentActions } from '../lib/agent-actions';

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: 'Contract Changelog',
  description:
    'Every contract change, organized by design dimension. Track what was added, modified, and removed across versions: Tokens, Motion, Cadence, Accessibility, Takt, Poise, Acoustics, Copywriting, Identity, Security.',
  path: '/changelog',
  ogTitle: 'Contract Changelog · Designesy',
  ogDescription:
    'Design contract changes by dimension. Every version bump, every new check, every rule adoption, filterable by design dimension.',
  twitterDescription: 'Contract changelog · designesy.org/changelog',
});

// ── Dimensions ──────────────────────────────────────────────────────────────

type Dimension =
  | 'tokens'
  | 'motion'
  | 'cadence'
  | 'accessibility'
  | 'takt'
  | 'poise'
  | 'acoustics'
  | 'copywriting'
  | 'identity'
  | 'security'
  | 'semantic'
  | 'verification'
  | 'all';

const DIMENSION_LABELS: Record<Dimension, string> = {
  all: 'All dimensions',
  tokens: 'Tokens',
  motion: 'Motion',
  cadence: 'Cadence',
  accessibility: 'Accessibility',
  takt: 'Takt',
  poise: 'Poise',
  acoustics: 'Acoustics',
  copywriting: 'Copywriting',
  identity: 'Identity',
  security: 'Security',
  semantic: 'Semantic',
  verification: 'Verification',
};

// Every dimension value renders in the one colour (.changelog-dimension in
// changelog.css). Accessibility used to take --ok and Security --error, so an
// entry that ADDED a security check read as a failure: a category never
// borrows a state colour; its label names it.

// ── Category weight, stated as the engine applies it ─────────────────────────
// Weights are relative and sum to 117 (methodology): a category's share of the
// score is its weight over the total. Entries used to call a weight of 18 "18%"
// and a weight of 15 "the highest single category" beside the 18. Derived from
// CATEGORY_WEIGHTS, so a reweighting cannot leave the prose behind.
const WEIGHT_TOTAL = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
const HEAVIEST = Math.max(...Object.values(CATEGORY_WEIGHTS));
function weightOf(category: string): string {
  const w = CATEGORY_WEIGHTS[category];
  const share = Math.round((w / WEIGHT_TOTAL) * 1000) / 10;
  return `Weight ${w} of ${WEIGHT_TOTAL} (${share}% of the score)${w === HEAVIEST ? ', the heaviest category' : ''}.`;
}

// ── Changelog entries ───────────────────────────────────────────────────────

interface ChangelogEntry {
  version: string;
  date: string;
  dimension: Dimension;
  change: 'added' | 'modified' | 'removed' | 'adopted' | 'deprecated';
  title: string;
  description: string;
  checks?: string[];
  rationale: string;
  source?: string;
}

const CHANGELOG: ChangelogEntry[] = [
  // ── v0.1.0 — Initial contract ──
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'tokens',
    change: 'added',
    title: 'Initial token architecture checks',
    description:
      'Two scored checks for token presence: --paper foundation variable at :root, and token layer depth (primitive → semantic → component).',
    checks: ['v01', 'v02'],
    rationale:
      `Token architecture is the substrate: without a root surface variable and layered tokens, every other dimension is ad-hoc. ${weightOf('tokens')}`,
    source: 'Designesy design system contract v0.1.0',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'motion',
    change: 'added',
    title: 'Initial motion hygiene checks',
    description:
      'Four checks: no transition:all, will-change restricted to transform/opacity, prefers-reduced-motion block present, duration tokens declared.',
    checks: ['v05', 'v06', 'v07', 'v08'],
    rationale:
      'Motion hygiene is the most violated dimension in the cohort. transition:all causes layout thrashing; missing reduced-motion is an accessibility failure.',
    source: 'Designesy design system contract v0.1.0',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'accessibility',
    change: 'added',
    title: 'WCAG 2.2 AA primitives',
    description:
      'Six checks: contrast ratios, touch targets (44px), heading hierarchy, input font floor (16px), button-text contrast, forced-colors readiness.',
    checks: ['v11', 'v12', 'v13', 'v14', 'v15', 'v16'],
    rationale:
      `Accessibility carries the a11y floor: if this category scores below 60%, the overall grade is capped at C. ${weightOf('accessibility')}`,
    source: 'WCAG 2.2 AA, APCA contrast model',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'identity',
    change: 'added',
    title: 'Document identity checks',
    description:
      'Two checks: semantic HTML landmarks (h1, title, meta description, main/header/nav) and AI-disclosure readiness per EU AI Act Art 50.',
    checks: ['v07', 'v34'],
    rationale:
      'Document identity is the machine-readable surface: without landmarks and meta, the page is opaque to both screen readers and AI agents.',
    source: 'EU AI Act Article 50, HTML landmark spec',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'security',
    change: 'added',
    title: 'Unicode security check (UTS #39)',
    description:
      'One check: UTS #39 confusable detection in token names and CSS identifiers. Prevents Cyrillic/Greek homoglyph shadowing attacks.',
    checks: ['v36'],
    rationale:
      'Homoglyph attacks in CSS identifiers can spoof brand colors and redirect trust, and a linter that reads values does not read names.',
    source: 'Unicode Technical Standard #39',
  },
  {
    version: 'v0.1.0',
    date: '2026-06-15',
    dimension: 'verification',
    change: 'added',
    title: 'Deterministic 40-check engine',
    description:
      'The scoring engine itself: CSS extraction, :root custom property parsing, 40 checks across 14 weighted categories, A-F grade bands.',
    rationale:
      'The engine is the moat: deterministic, open, and reproducible. No LLM, no human judgment, no survey. The same engine scores every site identically.',
    source: 'Designesy engine v1.0',
  },

  // ── v0.1.1 — Poise adopted ──
  {
    version: 'v0.1.1',
    date: '2026-06-28',
    dimension: 'poise',
    change: 'adopted',
    title: 'Poise interaction rules adopted',
    description:
      'Lab One interaction rules promoted to contract: hover lifts with @media (hover: hover) guards, press settle scales, keyboard-path documentation, sound-toggle aria-pressed.',
    checks: ['v09', 'v10'],
    rationale:
      'Poise is interaction poise: the difference between a site that feels considered and one that feels janky. Hover guards prevent touch-device flash; press scales provide tactile feedback.',
    source: 'Lab One · Poise interaction experiments',
  },

  // ── v0.1.2 — Takt adopted ──
  {
    version: 'v0.1.2',
    date: '2026-07-05',
    dimension: 'takt',
    change: 'adopted',
    title: 'Takt interface-feel rules adopted',
    description:
      'Lab Two interface-feel rules promoted to contract: stagger enter animation-delays, soften exit transforms with ease-out, concentric border-radius sets. Named after the German word for precise, musical timing.',
    checks: ['v19', 'v20'],
    rationale:
      'Takt is the musicality of interaction: the timing and scaling that makes a press feel intentional. Press scales above the 0.95 floor: 0.96 cells, 0.985 cards, 0.995 surfaces.',
    source: 'Lab Two · Takt interface-feel experiments',
  },

  // ── v0.1.3 — Cadence adopted ──
  {
    version: 'v0.1.3',
    date: '2026-07-12',
    dimension: 'cadence',
    change: 'adopted',
    title: 'Cadence typography rules adopted',
    description:
      'Lab Three typography rules promoted to contract: font-smoothing, rem-based sizes, line-height, text-wrap (balance/pretty), tabular-nums, selection styling, font-synthesis, underline-position, skip-ink. 12 checks, the largest category.',
    checks: ['v14', 'v15', 'v16', 'v17', 'v18', 'v19', 'v20', 'v26', 'v28', 'x01', 'x02', 'x03'],
    rationale:
      `Cadence is typography rendering discipline: the difference between type that looks crisp and type that looks fuzzy. ${weightOf('cadence')} Most sites fail here because font-synthesis and text-wrap are rarely declared.`,
    source: 'Lab Three · Cadence typography experiments, NY Times editorial reference',
  },

  // ── v0.3.0 — Acoustics adopted ──
  {
    version: 'v0.3.0',
    date: '2026-07-20',
    dimension: 'acoustics',
    change: 'adopted',
    title: 'Acoustic mapping rules adopted',
    description:
      'Lab Four acoustic mapping rules promoted to contract: interaction sound synthesis via Web Audio API, acoustic tokens for press/hover/settle sounds, sound-toggle aria-pressed, reduced-motion tiering for acoustic events.',
    rationale:
      'Acoustics is the frontier: most design systems have no acoustic layer at all. The contract defines acoustic tokens the same way it defines motion tokens: named, typed, and tiered for reduced-motion.',
    source: 'Lab Four · Acoustic mapping, Cuelume v0.2.2 engine',
  },

  // ── v0.4.0 — Copywriting adopted + engine upgrades ──
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'copywriting',
    change: 'adopted',
    title: 'UX copy principles adopted',
    description:
      'Four heuristic checks: button verb phrases (no "Click Here"), no trailing periods on interactive elements, descriptive link text (WCAG 2.4.4), no ALL CAPS in body copy. Grounded in NN/g, Microsoft Fluent, IBM Carbon, and WCAG.',
    checks: ['v38', 'v39', 'v40', 'v41'],
    rationale:
      `Copy is design: "Click Here" is an accessibility failure and a usability smell. ${weightOf('copywriting')} New in v0.4.0.`,
    source: 'NN/g, Microsoft Fluent, IBM Carbon, WCAG 2.4.4',
  },
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'verification',
    change: 'modified',
    title: 'Engine upgraded to 40 checks',
    description:
      'Engine expanded from 36 to 40 checks. Copywriting category added (4 checks). Accessibility floor enforced: if accessibility scores below 60%, overall grade capped at C. Twelve anti-slop rules now subtract up to 20 points. Seven originality signals add up to 8 points.',
    rationale:
      'The engine must evolve with the contract. Each version bump adds precision: the anti-slop rules catch generic AI-generated patterns that pass individual checks but fail as a composition.',
    source: 'Designesy engine v1.0, contract v0.4.0',
  },
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'verification',
    change: 'added',
    title: 'Spec-layer integration (DESIGN.md)',
    description:
      'New check: validates DESIGN.md spec file using Google\'s @google/design.md CLI linter. Integrates the spec layer beneath designesy\'s own contract verification.',
    checks: ['v37'],
    rationale:
      'DESIGN.md is the AI-agent-facing spec file. With it, AI coding tools build from your system instead of around it. The check validates its presence and structure.',
    source: 'Google @google/design.md CLI linter',
  },

  // ── v0.4.0 — Independence firewall ──
  {
    version: 'v0.4.0',
    date: '2026-07-28',
    dimension: 'verification',
    change: 'added',
    title: 'Independence firewall + compliance_index_version',
    description:
      'Public commitment: Designesy does not accept payment for scores, methodology changes, or leaderboard placement. API responses now include compliance_index_version field (currently "1.0") for machine-consumable CI pipeline integration.',
    rationale:
      'The trust asset must be structurally non-monetizable. Pattern from Artificial Analysis (independence firewall) and Arena (structural neutrality). The compliance_index_version field makes scores machine-consumable for CI pipelines.',
    source: 'Artificial Analysis independence firewall, Arena structural neutrality',
  },

  // ── v0.4.0 (engine 1.12.0) — Semantic category wired ──
  {
    version: 'v0.4.0',
    date: '2026-08-30',
    dimension: 'semantic',
    change: 'added',
    title: 'Semantic category wired: v42 + v43',
    description:
      'The semantic category carried a reserved weight (12) with zero checks since v0.3.0. Two deterministic checks now score it: v42 measures the role-named vs hue-named share of :root color tokens; v43 checks status-state coverage (ok/warn/error/info). Engine grows 40 → 42 checks.',
    checks: ['v42', 'v43'],
    rationale:
      'The contract\'s own palette is fully role-named (--ink, --paper, --surface, --signal, --ok/--warn/--error): color named by meaning rather than wavelength. Role-based naming is the documented best practice (zeroheight naming guide, Material 3), but nothing scored it. Both checks are WARN-only (style craft with no user harm) and self-SKIP when a site has no color tokens.',
    source: 'Designesy contract colors section, zeroheight naming guide 2026, Material 3 design tokens',
  },

  // ── v0.4.1: editorial revision ──
  {
    version: 'v0.4.1',
    date: '2026-09-28',
    dimension: 'all',
    change: 'modified',
    title: 'Editorial revision: the contract text follows the public-copy rules',
    description:
      'The contract modules and the /contracts pages were revised together. A colon or parentheses replaces the em dash, the positive claim replaces rhetorical negation pivots, and number ranges read "to". No rule, value, token or check changed. The sibling contracts took the same pass and keep their versions.',
    rationale:
      'The contract asks product copy to state its claim plainly and to write ranges a screen reader can read: an unspaced en dash is skipped, so a range written with one is heard as two bare numbers. A patch version marks text that changed while every rule stayed the same.',
    source: 'Designesy public-copy rules, GOV.UK style guide, plainlanguage.gov, NVDA symbol handling',
  },

  // ── v0.4.2: alignment pass ──
  {
    version: 'v0.4.2',
    date: '2026-10-04',
    dimension: 'tokens',
    change: 'added',
    title: 'One shell edge, a 12-column grid, and the accessibility tint tokens',
    description:
      'The header, the page wrappers and the footer now share the content edges at every width, so nothing sits on a different gutter than the thing above it. A 12-column grid with a named 7|5 seam replaces the per-page split rules. The material, elevation and floor recipes became tokens rather than values repeated per component. The WCAG 2.2 AA pass added the accessibility tint tokens, including --signal-text as the text-safe role for the brand blue. The reduced-motion tiering is stated as it now behaves: movement stops, opacity fades and transitions of 200ms or less stay.',
    rationale:
      'The site described one alignment system and implemented four, and the disagreement was invisible to every automated check because none of them compared one region\'s edge to another\'s. The accessibility tokens close a measured contrast failure: the brand blue as text read 2.0 to 2.3 to 1 in dark mode against a 4.5 to 1 minimum. Naming the motion tiering settles a documented conflict between two readings of the same clause.',
    source: 'Designesy a11y contract v0.1.1, WCAG 2.2 AA (2.4.11, 1.4.3, 2.5.8), edge-contract measurements',
  },

  // ── v0.4.2 (engine 1.1.0): baseline fixes ──
  {
    version: 'v0.4.2 · engine 1.1.0',
    date: '2026-10-08',
    dimension: 'verification',
    change: 'modified',
    title: 'Engine 1.1.0: four baseline fixes',
    description:
      'v05 passes a site that declares its motion only inside prefers-reduced-motion: no-preference, provided the block opts into motion; an empty block, or one that only switches motion off, still warns. v27 reads N/A on a page with no text input, textarea or select when its CSS sets no input font size. v14 and v18 join the optional tier, so an external site that does not adopt the Cadence rules is skipped on them. The MCP token validator checks against the 13 types DTCG 2025.10 defines. Scored on pages captured from the 30 leaderboard sites on 2026-10-08, 21 change at least one verdict.',
    checks: ['v05', 'v14', 'v18', 'v27'],
    rationale:
      'Each fix removes a verdict the engine could not defend. Gating motion behind no-preference is a recommended way to honour reduced motion; a page with no field gives iOS nothing to zoom into; and v14 and v18 judged external sites on Designesy taste under the scope meant to be fair to them. The engine version moves so a score from before the fix and one from after it can be told apart.',
    source: 'Media Queries Level 5 (prefers-reduced-motion), DTCG Format Module 2025.10, engine 1.1.0 entry in CHANGELOG.md',
  },

  // ── v0.4.3: text-contrast pass ──
  {
    version: 'v0.4.3',
    date: '2026-10-09',
    dimension: 'tokens',
    change: 'added',
    title: 'Text tokens for every status and grade colour',
    description:
      'Each status, grade and activation hue gains a text token, --<hue>-ink: the hue itself in the dark theme, and in the light theme the hue mixed toward ink until it reads at 4.5 to 1 or better on every surface. Light --muted-dim darkens from #70707a to #686872. Dots, bars, borders and tints keep the hue.',
    rationale:
      'A rendered sweep of every public page found 230 text elements under WCAG AA in the light theme and 11 in the dark. Nearly all were one mistake repeated: a colour chosen to mark a state (3 to 1 is enough for an icon) used to write the word for it (text needs 4.5 to 1). A text token per hue makes the right choice the default, and the site build now fails on a bare hue used as text.',
    source: 'WCAG 2.2 SC 1.4.3 and 1.4.11, rendered contrast sweep of designesy.org (2026-10-08), CSS Color 5 color-mix()',
  },

  // ── v0.4.3 (engine 1.2.0): two checks found on this site ──
  {
    version: 'v0.4.3 · engine 1.2.0',
    date: '2026-10-09',
    dimension: 'verification',
    change: 'added',
    title: 'Engine 1.2.0: status text contrast and paused entrances',
    description:
      'v44 measures every status color a stylesheet uses as text, in every theme it declares, and fails a status-named color with a hue that reads under 4.5 to 1 (3 to 1 for large text, an icon or a bar) on a surface the stylesheet attests; where it cannot attest the surface, or the text is white or grey, it warns. v45 fails an entrance that starts at opacity 0 and stays held invisible when a visitor pauses motion. Every score gains both, so the engine runs 44 checks. The S2 and S8 anti-slop rules stop deducting for components and prose, and the npm engine caps scores by the same accessibility floor as the site.',
    checks: ['v44', 'v45'],
    rationale:
      'Both defects shipped on this site and passed every check the engine had: the CSS was valid and the default view looked right. The light warning color wrote status words at 3.51 to 1, and the pause control emptied whole pages for the visitors who had asked for less motion. A check that catches its own author is the one worth publishing.',
    source: 'WCAG 2.2 SC 1.4.3 and 2.2.2, CSS Animations Level 1 (animation-play-state), engine 1.2.0 entry in CHANGELOG.md',
  },

  // ── v0.4.4 (engine 1.3.0): no A beside a failing check ──
  {
    version: 'v0.4.4 · engine 1.3.0',
    date: '2026-10-11',
    dimension: 'verification',
    change: 'modified',
    title: 'Engine 1.3.0: no A while any check fails',
    description:
      'A page with a failing check can no longer score an A: any FAIL caps the score at 89.9, a B, and every cap applies after the originality lift, which can carry a score up to a cap but never past it. v44, status colors used as text, caps at 65 as v06 does. v34 fails only a chat surface that names itself a chatbot or an AI assistant; a live-chat widget, an ad tag or page text about AI is at most a review item, and its text cites California SB 1001 and Colorado SB 26-189 and names Article 50(1) as a duty on the provider of the AI system. v06 and v22 read oklch(), space-syntax rgb() and hsl(), 8-digit hex, and tokens declared as :root, :host. v42 and v43 follow var() aliases, and hue-named primitives that role tokens alias form the palette layer, which sits outside the role share.',
    checks: ['v06', 'v22', 'v34', 'v42', 'v43', 'v44'],
    rationale:
      'The engine could report its own failing WCAG contrast check and an A for the same page, and its review printed Block and Grade A together. A grade beside its own failing verdict says two things at once, so the owner chose the stricter reading.',
    source: 'Owner decision (2026-10-11), WCAG 2.2 SC 1.4.3 and 1.4.11, EU AI Act Article 50, California Bus. & Prof. Code §17940-17943, Colorado SB 26-189, CSS Color 4, engine 1.3.0 entry in CHANGELOG.md',
  },

  // ── v0.4.4: identity v1 colour system ──
  {
    version: 'v0.4.4',
    date: '2026-10-11',
    dimension: 'tokens',
    change: 'modified',
    title: 'Identity v1 colour system',
    description:
      'Azure #0A94FF replaces the previous blue as --signal. In the light theme, text, links, focus and selected states take Deep Azure #016ABB (--signal-access, --signal-deep), and text on an Azure fill is ink #010102 (--paper-on-signal, 6.65 to 1). Activated Orange #F56B00 replaces the previous yellow (light text #B04D00), and grade D moves to rose. New tokens: --signal-deep, --signal-teal, --action, --on-action, --action-pressed and --paper-white.',
    rationale:
      'The contract states the identity v1 colour system that designesy.org serves. It changes token values only: no check, weight or verdict changed.',
    source: 'Designesy design system contract v0.4.4, adoption history',
  },

  // ── v0.4.5: the mono face and the type scale ──
  {
    version: 'v0.4.5',
    date: '2026-10-12',
    dimension: 'cadence',
    change: 'modified',
    title: 'Atkinson Hyperlegible Mono and the type scale',
    description:
      'Atkinson Hyperlegible Mono replaces Geist Mono for labels, URLs, timestamps, score units and code. The type scale becomes six tokens on a Major Third over a 16px root: --text-label 0.8rem, the floor for all text, --text-body 1rem, --text-lead 1.25rem, --text-h3 1.563rem, --text-h2 1.953rem and --text-h1 2.441rem, no two adjacent steps closer than 25%.',
    rationale:
      "The mono text on this site is the text a reader cannot guess from context: hosts, check IDs, scores and dates. Atkinson Hyperlegible Mono is the Braille Institute's face for low-vision readers, and it draws every confusable pair (0 and O, 1, l and I, 5 and S, 8 and B) distinct. Named sizes replace one-off values, so a page cannot drift off the scale. No check, weight or verdict changed.",
    source: 'Designesy design system contract v0.4.5, adoption history; Atkinson Hyperlegible Mono 2.001 (SIL Open Font License 1.1)',
  },

  // ── v0.4.5 (engine 1.3.1): accuracy fixes ──
  {
    version: 'v0.4.5 · engine 1.3.1',
    date: '2026-10-12',
    dimension: 'verification',
    change: 'modified',
    title: 'Engine 1.3.1: four checks read what the page renders',
    description:
      'v26 no longer counts a face named with the word fallback, such as a metric-matched stand-in drawn only until the real face loads, as a typeface choice. v27 reads font-size: var(--token) in a field rule through the :root tokens, so a field set to a 1rem token is the 16px floor it renders as, and one set to a 0.875rem token fails. v38 drops the keycaps a button marks up as kbd, and plain ctrl+s style hints in any case, from button labels, and accepts Get, Set, Try and a short list of call-to-action verbs (Flip, Learn, Sign, Join, Expand, Select, Read). v43 counts --destructive, the error role in shadcn/ui, as an error colour. The npm engine stops after three redirects instead of following a loop.',
    checks: ['v26', 'v27', 'v38', 'v43'],
    rationale:
      'Each defect was a warning on a page that was right, this site among them: four families counted where three render, a 16px input read as unset, and a keycap button read as the words ctrl and i. A warning on correct work teaches readers to ignore warnings. v42 is unchanged: Tailwind v4 writes only the theme variables a project uses, so a sheet full of hue-named tokens is using them.',
    source: 'engine 1.3.1 entry in CHANGELOG.md; Tailwind CSS v4 theme documentation (only used CSS variables are generated); shadcn/ui theming (--destructive)',
  },

  // ── v0.4.5: this site's own accessibility gate ──
  {
    version: 'v0.4.5',
    date: '2026-10-13',
    dimension: 'verification',
    change: 'modified',
    title: "This site's accessibility gate now runs its axe rules",
    description:
      'The accessibility sweep that runs on each change to designesy.org filtered axe-core by the tag wcag2a2a, which axe does not have. Given an unknown tag, axe runs no rules and reports no violations, so from its first run on 2026-10-04 to 2026-10-13 the axe half of the gate could not fail; its heading and landmark checks still ran. The sweep now runs the five tags the accessibility contract names (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) and fails any page where axe runs no rules. Re-run on 2026-10-13 on all 70 routes, light theme at 1440px: no violations at any impact level.',
    rationale:
      'A sweep that runs no rules reports the same result as one that passes, so a run with no rules is now a failure. Scores of other sites are untouched: the engine does not use this sweep. The 0 violations figure on /docs/mcp comes from a separate sweep on 2026-10-11 with the five tags, 140 page scans in the light and dark themes, so it stands.',
    source: 'designesy-org pull request 316; axe-core 4.12.1 (runOnly with an unknown tag evaluates no rules)',
  },
];

// ── Sorted by date descending ───────────────────────────────────────────────

const SORTED_CHANGELOG = [...CHANGELOG].sort((a, b) => b.date.localeCompare(a.date));

// Index of each dimension's newest entry: the one its link above jumps to.
const FIRST_OF_DIMENSION = new Set(
  SORTED_CHANGELOG.map((e, i) => SORTED_CHANGELOG.findIndex((f) => f.dimension === e.dimension) === i ? i : -1).filter((i) => i >= 0),
);

// ── Change badges ───────────────────────────────────────────────────────────

// The version summary: one row per contract version, laid out as the log
// above it is (a title and its one-line description in the face; version,
// date and check count in the side pane's key).
const VERSIONS: { version: string; date: string; checks: number; title: string; summary: string }[] = [
  { version: 'v0.1.0', date: '2026-06-15', checks: 22, title: 'Initial contract', summary: 'Tokens, motion, accessibility, identity, security. Deterministic engine.' },
  { version: 'v0.1.1', date: '2026-06-28', checks: 24, title: 'Poise adopted', summary: 'Interaction rules adopted from Lab One.' },
  { version: 'v0.1.2', date: '2026-07-05', checks: 26, title: 'Takt adopted', summary: 'Interface-feel rules adopted from Lab Two.' },
  { version: 'v0.1.3', date: '2026-07-12', checks: 38, title: 'Cadence adopted', summary: `Typography rules adopted from Lab Three. 12 checks, the largest category. ${weightOf('cadence')}` },
  { version: 'v0.3.0', date: '2026-07-20', checks: 38, title: 'Acoustics adopted', summary: 'Mapping rules adopted from Lab Four. Cuelume v0.2.2 sound engine.' },
  { version: 'v0.4.0', date: '2026-07-28', checks: 40, title: 'Copywriting adopted', summary: '4 copywriting checks. Spec-layer integration (DESIGN.md). Independence firewall + compliance_index_version.' },
  { version: 'v0.4.0 · engine 1.12.0', date: '2026-08-30', checks: 42, title: 'Semantic category wired', summary: 'v42 color vocabulary + v43 status colors. Reserved weight 12 now scored.' },
  { version: 'v0.4.1', date: '2026-09-28', checks: 42, title: 'Editorial revision', summary: 'The contract text follows the public-copy rules. No rule, value, token or check changed.' },
  { version: 'v0.4.2', date: '2026-10-04', checks: 42, title: 'Alignment pass', summary: 'One shell edge at every width, a 12-column grid with its 7|5 seam, material and elevation recipes as tokens, the accessibility tint tokens, and the reduced-motion tiering stated as it now behaves. Adds public tokens.' },
  { version: 'v0.4.3', date: '2026-10-09', checks: 42, title: 'Text-contrast pass', summary: 'Every status, grade and activation colour gains a text token that reads at 4.5 to 1 or better in both themes; light --muted-dim darkens. No check or verdict changed.' },
  { version: 'v0.4.2 · engine 1.1.0', date: '2026-10-08', checks: 42, title: 'Engine baseline fixes', summary: 'v05 accepts opt-in motion, v27 skips pages with no field, v14 and v18 become optional for external sites, and the token validator uses the 13 DTCG types. The contract is unchanged.' },
  { version: 'v0.4.3 · engine 1.2.0', date: '2026-10-09', checks: 44, title: 'Status text and paused entrances', summary: 'v44 status colors used as text meet contrast in every theme; v45 pausing motion keeps content visible. S2 and S8 stop firing on components and prose. The contract is unchanged.' },
  { version: 'v0.4.4 · engine 1.3.0', date: '2026-10-11', checks: 44, title: 'No A beside a failing check', summary: 'Any FAIL caps the score at 89.9 and a v44 FAIL at 65; v34 fails only a named AI chat surface; v06 and v22 read CSS Color 4; v42 and v43 follow aliases. The contract is unchanged.' },
  { version: 'v0.4.4', date: '2026-10-11', checks: 44, title: 'Identity v1 colour system', summary: 'Azure replaces the old blue as --signal, with Deep Azure for light-theme text and new action tokens. Token values only: no check, weight or verdict changed.' },
  { version: 'v0.4.5', date: '2026-10-12', checks: 44, title: 'Mono face and type scale', summary: 'Atkinson Hyperlegible Mono replaces Geist Mono, and the six --text-* steps of the Major Third join the contract. No check, weight or verdict changed.' },
  { version: 'v0.4.5 · engine 1.3.1', date: '2026-10-12', checks: 44, title: 'Four checks read what renders', summary: 'v26 skips fallback faces, v27 reads var() font sizes, v38 reads kbd keycaps as hints and knows Get, Set and Try, v43 counts --destructive. The contract is unchanged.' },
];

const CHANGE_COLORS: Record<string, string> = {
  added: 'var(--ok-ink)',
  modified: 'var(--signal-text)',
  removed: 'var(--error-ink)',
  adopted: 'var(--signal-text)',
  deprecated: 'var(--warn-ink)',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  // Group entries by dimension for the dimension tabs
  const dimensions: Dimension[] = ['all', 'tokens', 'motion', 'cadence', 'accessibility', 'takt', 'poise', 'acoustics', 'copywriting', 'identity', 'security', 'verification'];

  // Count entries per dimension
  const dimensionCounts: Record<string, number> = {};
  CHANGELOG.forEach((e) => {
    dimensionCounts[e.dimension] = (dimensionCounts[e.dimension] || 0) + 1;
  });
  dimensionCounts.all = CHANGELOG.length;

  return (
    <>
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="surface-page" data-pagefind-meta="priority:high">
        <section className="surface-header fade-up">
          <p className="surface-eyebrow" data-scramble>Contract history</p>
          <h1 className="surface-title" data-scramble>Contract Changelog</h1>
          <p className="surface-lede">
            Every contract change, organized by design dimension. Track what
            was added, modified, adopted, and deprecated across versions, from
            the initial v0.1.0 contract through the current{' '}
            {CONTRACT_VERSION} contract and its {ENGINE_CHECK_COUNT}-check engine.
          </p>
          <p className="surface-note">
            Pattern from Artificial Analysis: changelog organized by modality
            (dimension) instead of by version. Each entry shows the version,
            date,
            what changed, which checks were affected, and the rationale.
          </p>
          <AgentActions mdPath="/changelog.md" label="the changelog" />
        </section>

        {/* Dimension tabs and the log, newest entry first. #changelog-log
            rises without fading (globals.css, "Page header first-paint"):
            the newest entry can be the largest text on the page, and an
            entrance from opacity 0 would hold LCP back by the fade. */}
        <section id="changelog-log" className="doctrine-section fade-up fade-up-delay-1">
          {/* Dimension jump links (changelog.css): they wrap into balanced
              rows, never one orphan tab, and each count is its own quiet
              badge. */}
          <div id="changelog-tabs" className="changelog-tabs">
            {dimensions.map((dim) => {
              const count = dimensionCounts[dim] || 0;
              if (count === 0 && dim !== 'all') return null;
              return (
                <a key={dim} href={`#dim-${dim}`} className="changelog-tab" data-dimension={dim}>
                  {DIMENSION_LABELS[dim]}{' '}
                  <span className="changelog-tab-count">{count}</span>
                </a>
              );
            })}
          </div>

          {/* Entries: each row is a log entry with a face (what changed and
              why) and, from a 64rem list, a side pane behind the 7-line
              holding the metadata a reader scans by: version, date,
              dimension, the kind of change and the checks it touched. */}
          <div className="row-stack" role="list">
            {SORTED_CHANGELOG.map((entry, i) => (
              <div
                key={`${entry.version}-${entry.dimension}-${i}`}
                className="row changelog-entry"
                role="listitem"
                // The dimension links above jump to a dimension's first entry;
                // an id on every entry repeated it (ids must be unique).
                id={FIRST_OF_DIMENSION.has(i) ? `dim-${entry.dimension}` : undefined}
              >
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <div className="row-body">
                  <span className="row-title">{entry.title}</span>
                  <p className="changelog-entry-desc">{entry.description}</p>
                  <p className="changelog-entry-why">{entry.rationale}</p>
                  {entry.source && (
                    <p className="changelog-entry-source">Source: {entry.source}</p>
                  )}
                </div>

                {/* The shared row grid puts anything after the body in the
                    side pane on the 7-line. */}
                <div className="changelog-entry-side">
                  <dl className="changelog-entry-meta">
                    <div>
                      <dt>Version</dt>
                      <dd className="changelog-version">{entry.version}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>
                        <time dateTime={entry.date}>{entry.date}</time>
                      </dd>
                    </div>
                    <div>
                      <dt>Dimension</dt>
                      <dd className="changelog-dimension">
                        {DIMENSION_LABELS[entry.dimension]}
                      </dd>
                    </div>
                    <div>
                      <dt>Change</dt>
                      <dd>
                        <span className="changelog-change" style={{ color: CHANGE_COLORS[entry.change] || 'var(--muted)' }}>
                          {entry.change}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  {/* Checks. 44px target in BOTH dimensions: min-height alone
                      left these 31-35px wide ("v42" is three characters), and
                      WCAG 2.5.8 is about the target's area. */}
                  {entry.checks && entry.checks.length > 0 && (
                    <div className="changelog-entry-checks">
                      {entry.checks.map((check) => (
                        <Link key={check} href={`/methodology#check-${check}`} className="changelog-check">
                          {check}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Version summary */}
        <section className="doctrine-section fade-up">
          <h2 className="doctrine-heading">Version summary</h2>
          {/* The same row as the log: the shared grid and gap (no inline
              override, so the body starts on the log's x) and the same key
              in the side pane, here version, date and checks. */}
          <div className="row-stack" role="list">
            {VERSIONS.map((v, i) => (
              <div key={v.version} className="row changelog-entry" role="listitem">
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <div className="row-body">
                  <span className="row-title">{v.title}</span>
                  <p className="changelog-entry-desc">{v.summary}</p>
                </div>
                <div className="changelog-entry-side">
                  <dl className="changelog-entry-meta">
                    <div>
                      <dt>Version</dt>
                      <dd className="changelog-version">{v.version}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>
                        <time dateTime={v.date}>{v.date}</time>
                      </dd>
                    </div>
                    <div>
                      <dt>Checks</dt>
                      <dd className="changelog-check-count">{v.checks}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}