// /methodology: how the engine turns checks into a score, and how that method
// is tested. A reference page, so it reads as one: an index beside the text,
// the depth (every check, every validation study) behind disclosures, and
// motion only where it carries meaning (the pipeline's rule drawing in order,
// weights growing to their size). The formula is plain text from the first
// paint.
//
// Sources: the check registry and weights (lib/check-definitions, which the
// engine route mirrors), the cohort (lib/data/cohort), and the four validation
// reports in scripts/, each shown with the date it was generated. The CHECKS
// prose below documents the registry's checks and is held to it: a check
// added, removed or moved to another category without the prose following
// stops the build.

import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import '../instrument.css';
import '../engine.css';
import '../data.css';
import { Topbar } from '../lib/topbar';
import { ReadAlong } from '../lib/read-along';
import { Footer } from '../lib/footer';
import { ReadingProgress } from '../lib/reading-progress';
import { pageMeta } from '../lib/site-meta';
import { AgentActions } from '../lib/agent-actions';
import { CONTRACT_VERSION } from '../lib/design-system-contract';
import {
  ENGINE_CHECK_COUNT,
  ENGINE_SCORED_CHECK_COUNT,
  ENGINE_MANUAL_CHECK_COUNT,
  ENGINE_VERSION,
  CATEGORY_WEIGHTS,
  CHECKS as REGISTRY,
} from '../lib/check-definitions';
import { EngineHead } from '../lib/engine/engine-page';
import { GradeScale } from '../lib/engine/instrument';
import { display } from '../lib/engine/types';
import {
  COHORT,
  COHORT_STATS,
  GRADE_COUNTS,
  GRADES,
  SCORES_DATE,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  WEIGHT_TOTAL,
  fmt,
  hostOf,
} from '../lib/data/cohort';
import { DataFigure, DataTable } from '../lib/data/figure';
import { unbroken } from '../lib/data/unbroken';
import { CohortStrip } from '../lib/data/strip';
import { BarList, RangeList } from '../lib/data/bars';
import { OnThisPage } from '../lib/data/on-this-page';
import SENSITIVITY from '../../scripts/sensitivity-report.json';
import RANK_BOUNDS from '../../scripts/rank-bounds-report.json';
import SCORE_DIFF from '../../scripts/score-diff-report.json';
import BLIND from '../../scripts/blind-comparison-report.json';

export const metadata: Metadata = pageMeta({
  title: 'Methodology',
  description:
    `How the Designesy ${ENGINE_CHECK_COUNT}-check engine scores a URL. The full methodology: checks, categories, weights, scoring math, grade bands, and the accessibility floor. Deterministic, no LLM.`,
  path: '/methodology',
  ogDescription:
    `The ${ENGINE_CHECK_COUNT}-check Designesy scoring methodology: weights, math, grade bands, and the a11y floor. Fully transparent, deterministic, no LLM.`,
  twitterDescription:
    `Designesy scoring methodology: ${ENGINE_CHECK_COUNT} checks, 14 categories, deterministic · designesy.org/methodology`,
});

// ── Check definitions (mirror apps/site/app/api/score/route.ts) ──
interface CheckDef {
  id: string;
  item: string;
  category: string;
  how: string;
  skipReason?: string;
  manualReason?: string;
}

const CHECKS: CheckDef[] = [
  // ── Tokens (9%) ──
  {
    id: 'v01',
    item: 'Token values match live site :root foundation',
    category: 'tokens',
    how: 'Parses :root custom properties from the fetched CSS. Looks for --paper specifically: the contract names --paper, --ink, --muted, --surface, --surface-raised, --line, --signal, --signal-light, --signal-dim as the required foundation. PASS if --paper resolves to a value.',
  },
  {
    id: 'v29',
    item: 'Token architecture: primitive → semantic → component layers',
    category: 'tokens',
    how: 'Counts how many tokens are referenced via var() (aliasing) vs. raw values. A 2-tier or 3-tier aliasing structure (primitive → semantic → component) indicates a mature token system. PASS if at least 2 layers are detected.',
  },

  // ── Semantic (12%) ──
  {
    id: 'v42',
    item: 'Semantic color vocabulary: role-named tokens rather than hue-named',
    category: 'semantic',
    how: 'Classifies every color-valued token in :root by name: role words (ink, paper, surface, muted, danger, success, accent, border…) vs hue words (blue, slate, amber…) and numeric scale suffixes (-500). Brand coinages matching neither list are excluded from the share. PASS if ≥60% role-named with ≥3 distinct roles; WARN otherwise (WARN-only, because it is style craft with no user harm). SKIP if fewer than 4 color tokens. Mirrors the contract\'s own role-named palette.',
  },
  {
    id: 'v43',
    item: 'Semantic status colors: ok/warn/error/info state roles present',
    category: 'semantic',
    how: 'Scans color token names for the four status families: ok/success, warn/warning/caution, error/danger/fail, info/notice. PASS if ≥3 of 4 families are present; WARN otherwise (WARN-only). SKIP if the site declares no color tokens. The contract ships --ok, --warn, and --error for exactly this purpose.',
  },

  // ── Responsive (3%) ──
  {
    id: 'v02',
    item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
    category: 'responsive',
    how: 'Requires rendering the page at four viewport widths and measuring scrollWidth > clientWidth. The static engine cannot do this.',
    manualReason: 'Requires a browser viewport trace: the engine fetches CSS, and overflow only exists in a rendered layout.',
  },

  // ── Interaction (6%) ──
  {
    id: 'v03',
    item: 'Primary interactive elements show focus-visible rings',
    category: 'interaction',
    how: 'Regex-searches the CSS for :focus-visible declarations. PASS if any :focus-visible rule is found. This is the keyboard-navigation visibility primitive: without it, Tab users cannot see where they are.',
  },

  // ── Poise (7%) ──
  {
    id: 'v04',
    item: 'Sound toggle flips aria-pressed and applies the audio preference',
    category: 'poise',
    how: 'Requires clicking a sound toggle and verifying aria-pressed flips and a [data-audio] attribute is applied. The static engine cannot interact with the DOM.',
    manualReason: 'Requires live DOM interaction; the engine does not execute JavaScript or click elements.',
  },
  {
    id: 'v08',
    item: 'Poise interaction rules match live /labs/poise and contract.interaction',
    category: 'poise',
    how: 'Verifies the static half: fine-pointer hover guard (@media hover: hover), press-settle scale ~0.97, opacity-only mark breath. The interaction-feel half requires a browser.',
  },
  {
    id: 'v09',
    item: 'Poise keyboard-path verification remains published and current',
    category: 'poise',
    how: 'Verifies the static half: 4 keyboard-affordance signals in the HTML/CSS (tabindex, accesskey, key bindings, focus management). Tab-order traversal requires a browser.',
  },

  // ── Motion (10%) ──
  {
    id: 'v05',
    item: 'prefers-reduced-motion disables entrance and wordmark breath',
    category: 'motion',
    how: 'Reads each @media (prefers-reduced-motion) block by its value. PASS if a reduce block declares rules, or if a no-preference block opts into motion (an animation, a transition, smooth scrolling or a view transition), which keeps that motion from anyone who asked for less. WARN if neither: an empty block, or a no-preference block that only switches motion off, honours nothing. This is the vestibular-safety primitive: without it, motion-sensitive users cannot use the site.',
  },
  {
    id: 'v11',
    item: 'No transition:all in the live stylesheet',
    category: 'motion',
    how: 'Regex-searches for transition: all (case-insensitive). FAIL if found. transition: all causes layout-thrash and surprises; the contract requires named properties only.',
  },
  {
    id: 'v12',
    item: 'will-change restricted to transform and opacity only',
    category: 'motion',
    how: 'Parses every will-change declaration. If any value contains anything other than transform or opacity (including auto), it WARNs. will-change on non-transform/opacity properties forces unnecessary layer promotion.',
  },
  {
    id: 'v23',
    item: 'Duration tokens --duration-quick through --duration-slow present in :root',
    category: 'motion',
    how: 'Checks :root for the 5 duration tokens: --duration, --duration-quick, --duration-fast, --duration-medium, --duration-slow. PASS if all 5 are declared. Hardcoded ms values in component CSS are the anti-pattern.',
  },
  {
    id: 'v45',
    item: 'Pausing motion keeps content visible',
    category: 'motion',
    how: 'Finds a pause that holds every element: animation-play-state: paused on * under an attribute or class on the document (html[data-motion="paused"]), or inside prefers-reduced-motion: reduce. Then finds each one-shot entrance whose first keyframe sets opacity 0 or visibility hidden, which the pause would hold invisible. PASS if every such entrance has an override under the pause (animation: none, animation-name: none, animation-play-state: running, or a negative animation-delay at least as long as the animation) for its selector or a compound it contains. FAIL if an entrance has none. WARN if the override exists but its selector or scope does not clearly match. N/A if no rule pauses every element. Found on this site: paused visitors got empty pages.',
  },

  // ── Accessibility (15%) — carries the a11y floor ──
  {
    id: 'v06',
    item: 'Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)',
    category: 'accessibility',
    how: 'Resolves --paper, --ink, --muted, --muted-dim to RGB and computes WCAG 2.1 contrast ratios. PASS if all clear 4.5:1 (AA body text). WARN if any clear 3:1 but not 4.5:1. FAIL if any below 3:1. APCA Lc values are reported alongside.',
  },
  {
    id: 'v22',
    item: 'Primary button text passes WCAG AA contrast against --signal fill',
    category: 'accessibility',
    how: 'Resolves --signal to RGB, then tests --ink and --paper against it. PASS if the best ratio ≥ 4.5:1. WARN if ≥ 3:1 (large-text pass). FAIL if below 3:1. N/A if --signal is not declared or unresolvable.',
  },
  {
    id: 'v24',
    item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.5 Enhanced)',
    category: 'accessibility',
    how: 'Searches CSS for min-height or min-width ≥ 44px on button/a/input/select selectors. PASS if found. This is the WCAG 2.2 Target Size Minimum (AA). Full verification needs a browser to measure rendered dimensions.',
  },
  {
    id: 'v25',
    item: 'Heading hierarchy: single h1, no skipped levels',
    category: 'accessibility',
    how: 'Parses the HTML for h1-h6 elements. PASS if exactly one h1 and no skipped levels (no h1→h3 jumps). Screen readers and SEO both rely on a logical heading outline.',
  },
  {
    id: 'v27',
    item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)',
    category: 'accessibility',
    how: 'Searches CSS for input/textarea/select font-size declarations. FAIL if one is below 16px, PASS if the 16px (1rem) floor is declared. With neither, WARN if the page has a text input, textarea or select; N/A if it has none, since nothing can zoom. Inputs below 16px trigger a layout-shift zoom on iPhone that breaks mobile UX.',
  },
  {
    id: 'v35',
    item: 'Forced-colors readiness: @media (forced-colors: active) block present',
    category: 'accessibility',
    how: 'Searches CSS for @media (forced-colors: active) and forced-color-adjust. PASS if both are present. Windows High Contrast Mode and Chrome forced-colors recolor the page; without this media query, critical UI becomes illegible.',
  },
  {
    id: 'v44',
    item: 'Status colors used as text meet contrast in every declared theme',
    category: 'accessibility',
    how: 'Finds the status colors (custom properties named ok, success, warn, warning, error, danger, info, grade-a to grade-f and the like, or a hue the stylesheet also paints as a mark) that a rule uses as text color, directly, through one alias or at reduced alpha. Resolves each in every declared theme (:root, [data-theme] or .dark/.light blocks, prefers-color-scheme blocks; a theme named by part of a compound theme selector also reads that compound’s tokens), including var() chains and color-mix() rounded to the 8-bit color a browser paints. Measures it on a surface the stylesheet attests: the background the rule or another rule for the same element sets, else the nearest ancestor’s in the same selector (a hovered button’s own fill, else its fill at rest), translucent fills composited, else the page background of that theme. PASS if every use clears 4.5:1 (3:1 for 24px, or 18.66px bold; 3:1 for a graphic: an svg, an icon or glyph, a progress bar, a color named for an icon, a currentColor fill) in every theme. FAIL if a color named as a status falls short. WARN if a hue that counts only because the sheet also paints it as a mark falls short (its real surface may be a fill the static engine cannot see), if an ancestor in a hover, active, focus, expanded or open state paints no fill the sheet declares (the engine never FAILs a pairing it cannot attest), if a background cannot be resolved, or if alpha-reduced text clears only at full alpha. Disabled states are exempt, as WCAG 1.4.3 exempts inactive controls. N/A if no status color is used as text. Found on this site: light --warn as text measured 3.51:1.',
  },

  // ── Identity (6%) — engine returns these as category: 'identity' ──
  {
    id: 'v07',
    item: 'Semantic HTML foundation: single h1, title, meta description, landmark',
    category: 'identity',
    how: 'Parses HTML for: exactly one h1, a descriptive <title>, <meta name="description">, and at least one <main>/<header>/<nav> landmark. PASS if all 4 are present. WARN if 1-2 missing. FAIL if 3+ missing.',
  },
  {
    id: 'v34',
    item: 'AI-Disclosure Readiness (EU AI Act Art 50, effective 2026-08-02)',
    category: 'identity',
    how: 'Detects AI-interactive surfaces (chatbots, AI assistants) in the HTML. If detected, checks for disclosure signals (visible "AI" text, aria-label, meta generator, C2PA). PASS if no AI surface is detected (disclosure not required) or if disclosure is present. FAIL if an AI surface is detected without disclosure.',
  },

  // ── Takt (8%) ──
  {
    id: 'v10',
    item: 'Takt interface-feel rules match live CSS and contract.takt',
    category: 'takt',
    how: 'Verifies the static half: stagger enter animation-delay, soften exit transform ease-out, concentric border-radius set. Press-behavior and hit-area require a browser.',
  },
  {
    id: 'v13',
    item: 'Press scale 0.96 on cells, 0.985 on cards/rows (both above the 0.95 floor)',
    category: 'takt',
    how: 'Extracts every transform: scale() value in :active contexts. FAIL if any scale is 0 (a glitch rather than a press) or below 0.95. PASS if real press scales are found above 0.95. The 0.95 floor is the contract minimum; lower reads as a glitch.',
  },

  // ── Cadence (18%) — highest weight, most checks ──
  {
    id: 'v14',
    item: 'Cadence typography rules match live CSS and contract.cadence',
    category: 'cadence',
    how: 'Checks for the Cadence rule set: font-synthesis: none, text-underline-position: from-font, text-decoration-skip-ink: auto, -webkit-font-smoothing: antialiased, -moz-osx-font-smoothing: grayscale, root font-size: 16px, all sizes in rem. PASS if all present. These are Designesy Cadence rules, so on an external site (scope=universal) their absence is N/A.',
  },
  {
    id: 'v15',
    item: 'Font smoothing: antialiased + grayscale on :root confirmed',
    category: 'cadence',
    how: 'Searches :root or html for -webkit-font-smoothing: antialiased and -moz-osx-font-smoothing: grayscale. PASS if both are present. Prevents subpixel rendering artifacts on dark backgrounds.',
  },
  {
    id: 'v16',
    item: 'Rem-based scale: all text sizes in rem, root at 16px confirmed',
    category: 'cadence',
    how: 'Counts rem-based vs px-based font-size declarations. PASS if the majority are rem and root is 16px. The 16px root is the Cadence floor: iOS Safari auto-zooms inputs below 16px.',
  },
  {
    id: 'v17',
    item: 'Line-height by role: headings 1.08, body 1.55 confirmed',
    category: 'cadence',
    how: 'Extracts line-height values from heading and body selectors. PASS if heading line-heights cluster near 1.08 and body line-heights near 1.55. Tight headings read as deliberate; relaxed body copy reads as confident.',
  },
  {
    id: 'v18',
    item: 'text-wrap: balance + pretty both present in live CSS',
    category: 'cadence',
    how: 'Searches for text-wrap: balance (headings) and text-wrap: pretty (paragraphs). PASS if both are present. Progressive enhancement: unsupported browsers ignore them. A Designesy Cadence rule, so on an external site (scope=universal) its absence is N/A.',
  },
  {
    id: 'v19',
    item: 'tabular-nums: 8 instances across the live CSS',
    category: 'cadence',
    how: 'Counts font-feature-settings: "tnum" or font-variant-numeric: tabular-nums declarations. PASS if ≥ 8 instances (threshold for a site that takes numeric display seriously). Prevents digits from shifting width as values change.',
  },
  {
    id: 'v20',
    item: '::selection styled with var(--signal) instead of the browser default',
    category: 'cadence',
    how: 'Searches for ::selection rules using var(--signal). PASS if the selection color is the signal token instead of the browser default. The selection color is a small but loud brand surface.',
  },
  {
    id: 'v26',
    item: 'Font family count ≤3 (body + heading + mono)',
    category: 'cadence',
    how: 'Parses all font-family declarations and counts distinct families. PASS if ≤ 3. WARN if 4 or 5. FAIL if 6+. More than 3 families suggests inconsistency and hurts performance.',
  },
  {
    id: 'v28',
    item: 'Reading width 45-75ch on prose containers',
    category: 'cadence',
    how: 'Parses each CSS rule and keeps its selector alongside its ch value, then asks whether that selector actually targets prose: paragraph-like elements (p, article, li, blockquote) or prose-named classes (.prose, .lede, .measure, .note). Rules on structural selectors (grid, table, row, flex, pre, code) are excluded, because a measure on a grid narrows one track rather than fixing line length. PASS requires a prose-targeting rule in 45 to 75ch (66ch ideal). WARN covers three distinct states, reported separately: ch rules exist but none reach prose; prose rules exist but all are outside the band; or no ch rule at all. Lines longer than 75ch are hard to track; shorter than 45ch feels choppy. Method change 2026-09-17: v28 previously scanned the stylesheet for any max-width in ch units and passed if one value was in range, without checking which selector carried it, which let this site measure 108.6ch on three pages while scoring zero v28 warnings. The check now requires the measure to reach prose. Two leaderboard sites (X, GitHub Primer) moved PASS to WARN under the corrected method, about 0.6 points each; recorded because a method change that moves published grades should be disclosed rather than applied silently.',
  },
  {
    id: 'x01',
    item: 'font-synthesis: none set (Cadence resolved tension)',
    category: 'cadence',
    how: 'Searches for font-synthesis: none. PASS if declared. WARN if font-synthesis is declared but not set to none, or if no rule is found. Prevents the browser from synthesizing bold/italic faces when the real weights are not loaded, a common cause of blurry headlines on Windows.',
  },
  {
    id: 'x02',
    item: 'text-underline-position: from-font set (Cadence resolved tension)',
    category: 'cadence',
    how: 'Searches for text-underline-position: from-font or under. PASS if declared. Uses the font designer\u2019s built-in underline position rather than the browser default, which is usually too low and clips descenders.',
  },
  {
    id: 'x03',
    item: 'text-decoration-skip-ink: auto set',
    category: 'cadence',
    how: 'Searches for text-decoration-skip-ink: auto or none. PASS if declared. Makes underlines skip the rounded parts of letters (g, j, p, q, y), a small typographic refinement that shows attention to craft.',
  },

  // ── Security (5%) — v0.4.0 ──
  {
    id: 'v36',
    item: 'Unicode Security: no UTS #39 confusable characters in token names or CSS identifiers',
    category: 'security',
    how: 'Scans token names, CSS class/id selectors, and url() refs for non-ASCII confusable characters (Cyrillic, Greek, fullwidth) using a Unicode confusable detector. PASS when 0 confusables. FAIL when token-name confusables found (shadowing risk, e.g. --соlor-bg with Cyrillic с vs --color-bg). WARN for class/id/url confusables. Provenance: Unicode Technical Standard #39, Unicode 16.0.0. Designesy is the only design verification engine that checks this surface.',
  },

  // ── Spec (4%) — v0.4.0 ──
  {
    id: 'v37',
    item: 'DESIGN.md spec-layer validation (Google @google/design.md lint)',
    category: 'spec',
    how: 'Fetches /DESIGN.md from the target origin and runs Google\'s @google/design.md CLI linter (11 lint rules: broken token refs, missing primary colors, WCAG contrast, orphaned tokens, section order). PASS on clean lint. WARN on lint warnings. FAIL on lint errors. N/A if /DESIGN.md is not served; this is expected, as no public convention requires it yet.',
    skipReason: 'N/A if /DESIGN.md is not served at the target origin; no public convention requires it yet.',
  },

  // ── Copywriting (8%) — v0.4.0 ──
  {
    id: 'v38',
    item: 'Button text is a verb phrase or recognized command (not a bare noun)',
    category: 'copywriting',
    how: 'Parses button elements and checks if text starts with a verb or recognized command (Save, Cancel, Delete, Edit, Share, Close, Back, Next). WARN if buttons don\'t lead with a verb. N/A if no buttons found. Heuristic: review flagged buttons manually. Grounded in NN/g: "Lead with verbs or verb phrases that clearly outline what will happen after the command is selected."',
  },
  {
    id: 'v39',
    item: 'No trailing period on button text, labels, or tab text',
    category: 'copywriting',
    how: 'Searches button/label/tab elements for trailing periods (excludes ellipsis ...). WARN if found. N/A if no relevant elements. Microsoft Fluent: "Don\'t end text for buttons, radio buttons, labels, or checkboxes with a period." Periods are for full sentences in tooltips, error messages, and dialog bodies only.',
  },
  {
    id: 'v40',
    item: 'Link text is descriptive (not bare "click here", "learn more", "here")',
    category: 'copywriting',
    how: 'Parses anchor elements and checks link text against a blocklist of non-descriptive patterns (click here, here, learn more, read more, more, link, this, that, continue, see more, view details). WARN if matched. N/A if no anchors. WCAG 2.4.4 Link Purpose: link text should describe the destination.',
  },
  {
    id: 'v41',
    item: 'No ALL CAPS UI text except eyebrow labels',
    category: 'copywriting',
    how: 'Searches button/a/label/td/th/p/li/h1-h6 for ALL CAPS text (>3 letters), excluding elements with class containing "eyebrow"/"meta-label" or inline text-transform: uppercase. WARN if found. IBM Carbon: "All caps has been shown to be slower to read." Only eyebrow labels and acronyms should be uppercase.',
  },

  // ── Performance (6%) ──
  {
    id: 'v21',
    item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1',
    category: 'performance',
    how: 'Requires a CDP/Playwright trace to measure LCP, INP, and CLS against the Google thresholds. The static engine cannot do this.',
    manualReason: 'Requires a CDP trace: the engine fetches HTML and CSS, and vitals need a rendered page with timing data.',
  },
];

// The prose above must document exactly the registry's checks, each in its
// registry category. Drift stops the build here, before it reaches a reader.
{
  const drift = [
    ...REGISTRY.filter((r) => !CHECKS.some((c) => c.id === r.id && c.category === r.category)).map((r) => `${r.id} (${r.category}) lacks prose`),
    ...CHECKS.filter((c) => !REGISTRY.some((r) => r.id === c.id)).map((c) => `${c.id} is not in the registry`),
  ];
  if (drift.length) throw new Error(`methodology: check prose has drifted from lib/check-definitions: ${drift.join('; ')}`);
}

const itemOf = (id: string) => REGISTRY.find((r) => r.id === id)?.item ?? id;
const label = (k: string) => CATEGORY_LABELS[k] ?? k;
const share = (w: number) => `${((w / WEIGHT_TOTAL) * 100).toFixed(1)}%`;

const MANUAL_CHECKS = ENGINE_MANUAL_CHECK_COUNT;
const SKIP_CHECKS = CHECKS.filter((c) => c.skipReason).length;
const scoredIn = (k: string) => REGISTRY.filter((r) => r.category === k && r.type === 'auto').length;
const checksIn = (k: string) => CHECKS.filter((c) => c.category === k);

const CATEGORY_NOTES: Record<string, string> = {
  cadence:
    'Typography rendering discipline: font smoothing, rem scales, line-height, text-wrap, tabular figures, selection styling, font synthesis, underline position and skip-ink.',
  accessibility:
    'WCAG 2.2 AA primitives: contrast, touch targets, heading hierarchy, the input font floor, button text contrast, forced-colors readiness and status colors used as text in every theme. It carries the accessibility floor.',
  semantic:
    'Whether the color system speaks in roles (ink, surface, danger) or in hues (blue-500), and covers the status states. Wired on 2026-08-30, so batch runs before that date score it empty.',
  copywriting:
    'UX copy discipline: verb-led buttons, no trailing periods, descriptive link text, no all-caps. Heuristics grounded in NN/g, Microsoft Fluent, IBM Carbon and WCAG 2.4.4.',
  motion: 'Motion hygiene: no transition: all, will-change kept to transform and opacity, a reduced-motion block, duration tokens, and content that stays visible when motion is paused.',
  tokens: 'Token architecture: the --paper foundation, and whether tokens are layered from primitive to semantic to component.',
  takt: 'Interaction feel: press scales above the 0.95 floor (0.96 for cells, 0.985 for cards, 0.995 for surfaces). Named for the German word for precise, musical timing.',
  security: 'Unicode security: UTS #39 confusable detection in token names and CSS identifiers, against Cyrillic and Greek homoglyphs shadowing Latin names.',
  poise:
    'Interaction poise: hover lifts, press-settle, keyboard-path documentation and the sound toggle. The static half is read from CSS; the interaction half needs a browser.',
  identity: 'Document identity: semantic landmarks (h1, title, meta description, main, header, nav) and AI-disclosure readiness (EU AI Act, Article 50).',
  interaction: 'Focus visibility: :focus-visible rings declared.',
  performance: 'Core Web Vitals (LCP, INP, CLS). They need a CDP or Playwright trace, so the static engine marks them manual; the weight is held in reserve.',
  spec: 'The DESIGN.md spec layer: Google’s @google/design.md linter, run when a site serves /DESIGN.md and not applicable otherwise.',
  responsive: 'Horizontal overflow at 375, 720, 860 and 1080 px and up. It needs a browser viewport, so the static engine marks it manual; the weight is held in reserve.',
};

const BAND_NOTES: Record<string, string> = {
  A: 'Ships the contract’s primitives and passes nearly every check the engine can run.',
  B: 'A solid foundation, with a few checks missing or warned.',
  C: 'Clear gaps in cadence, motion or accessibility. The accessibility floor caps a site here.',
  D: 'Gaps across several categories.',
  F: 'Missing the primitives the contract reads: token systems, reduced-motion blocks, font-synthesis rules.',
};
const BAND_RANGE: Record<string, string> = { A: '90 and up', B: '80 to 89.9', C: '70 to 79.9', D: '60 to 69.9', F: 'under 60' };

// The scoring formula, line by line: a comment line starts with '#'.
const FORMULA: string[] = [
  '# Per-check weight: the category weight, split across its scored checks',
  'checkWeight = CATEGORY_WEIGHTS[category] / count(scored checks in category)',
  '',
  '# Status scoring',
  'PASS    → 1.0 × checkWeight',
  'WARN    → 0.5 × checkWeight',
  'FAIL    → 0',
  'MANUAL  → excluded (not counted in the total)',
  'N/A     → excluded (not counted in the total)',
  '',
  '# Step 1: weighted compliance',
  'weightedScore = round( Σ(weightedPoints) / Σ(weightedTotal) × 1000 ) / 10',
  '',
  '# Step 2: anti-slop deduction, 12 rules, up to 20 points',
  'slopTotal = min( Σ(per-rule deductions), 20 )',
  'score = max( 0, weightedScore − slopTotal )',
  '',
  '# Step 3: originality lift, up to 8 points (halved when slop ≥ 12)',
  'originalityPoints = min( rawOriginality, 8 )',
  'score = min( 100, score + originalityPoints )',
  '',
  '# Step 4: accessibility floor',
  'if (a11yPct < 60) score = min( score, 70 )',
  '',
  '# Step 5: hard-fail ceilings',
  'if (v06 FAIL) score = min( score, 65 )              # contrast',
  'if (v22 | v02 | v16 FAIL) score = min( score, 70 )  # CTA contrast, overflow, rem',
  'if (v24 | v25 FAIL) score = min( score, 75 )        # touch targets, headings',
  '',
  '# Per-category sub-score: step 1, scoped to one category',
  'categoryScore = round( Σ(catPoints) / Σ(catWeight) × 1000 ) / 10',
];

const STEPS = [
  { title: 'Weigh the checks', text: 'Each scored check carries its category’s weight, split across that category’s scored checks. Pass counts 1, warn 0.5, fail 0.' },
  { title: 'Subtract slop', text: 'Twelve anti-slop rules take up to 20 points off for recognisable template patterns.' },
  { title: 'Add originality', text: 'Seven kinds of craft add up to 8 points, halved when the slop is heavy.' },
  { title: 'Apply the floor', text: 'Accessibility under 60 caps the score at 70, a C.' },
  { title: 'Apply the ceilings', text: 'Six severe failures cap the score at 65, 70 or 75.' },
];

// Validation reports (scripts/*.json), with their own dates.
const day = (iso: string) => iso.slice(0, 10);
type Knob = { label: string; gradeChanges: number; rankPositionsMoved: number; maxScoreDelta: number };
const KNOBS = Object.entries(SENSITIVITY.leaderboard as Record<string, Knob>).map(([key, k]) => ({ key, ...k }));
const MOVING = KNOBS.filter((k) => k.gradeChanges > 0).sort((a, b) => b.gradeChanges - a.gradeChanges || b.rankPositionsMoved - a.rankPositionsMoved);
const STILL = KNOBS.length - MOVING.length;
const knob = (key: string) => KNOBS.find((k) => k.key === key);
const UNIFORM = KNOBS.filter((k) => /^w[+-]/.test(k.key));
const OAT = KNOBS.filter((k) => k.key.startsWith('oat-'));
const OAT_MAX_FLIPS = Math.max(...OAT.map((k) => k.gradeChanges));
const OAT_MAX_DELTA = Math.max(...OAT.map((k) => k.maxScoreDelta));

type RankRow = { url: string; baselineRank: number; bestRank: number; worstRank: number; bandWidth: number };
const RANKS = [...(RANK_BOUNDS.perSite as RankRow[])].sort((a, b) => a.baselineRank - b.baselineRank);
const WIDEST = [...RANKS].sort((a, b) => b.bandWidth - a.bandWidth)[0];

type DiffRow = { url: string; v030: { score: number; grade: string }; v040: { score: number; grade: string }; delta: number };
// A site the engine could not read on a run is an error row in that report:
// named under the table, never scored (scripts/live-score.mjs).
const DIFF_ALL = SCORE_DIFF.rows as unknown as (DiffRow | { url: string; error: string })[];
const DIFF_ROWS = DIFF_ALL.filter((r): r is DiffRow => !('error' in r));
const DIFF_UNREAD = DIFF_ALL.filter((r) => 'error' in r);
/** " Left out, the engine could not read them on that run: a, b." or "". */
const unread = (list: readonly { url: string }[] | undefined) =>
  list && list.length ? ` Left out, the engine could not read them on that run: ${list.map((x) => hostOf(x.url)).join(', ')}.` : '';
const ORDER = 'FDCBA';
const DIFF_UP = DIFF_ROWS.filter((r) => ORDER.indexOf(r.v040.grade) > ORDER.indexOf(r.v030.grade)).length;
const DIFF_DOWN = DIFF_ROWS.filter((r) => ORDER.indexOf(r.v040.grade) < ORDER.indexOf(r.v030.grade)).length;
const DIFF_MAX_UP = [...DIFF_ROWS].sort((a, b) => b.delta - a.delta)[0];
const DIFF_MAX_DOWN = [...DIFF_ROWS].sort((a, b) => a.delta - b.delta)[0];

const K = BLIND.kappa;
const AXE = (BLIND.method.match(/axe-core [\d.]+/) ?? ['axe-core'])[0];

// The rule tables, as data: what the engine route implements for slop,
// originality and the hard-fail ceilings.
const SLOP_RULES = [
  { id: 'S1', name: 'Overused fonts', pattern: <>Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Space Grotesk, Instrument Serif or Geist in <code>font-family</code></>, sev: 5, trigger: <>1+ match in any <code>font-family</code></> },
  { id: 'S2', name: 'Full-page gradient', pattern: <>A multi-color <code>linear-gradient</code> on body or html, or a fixed or <code>inset: 0</code> overlay (1px hairlines excluded)</>, sev: 5, trigger: <>A gradient with <code>position: fixed</code>, <code>inset: 0</code> or <code>100vw</code>/<code>100vh</code> in the same block</> },
  { id: 'S3', name: 'Purple or violet gradient', pattern: <><code>linear-gradient</code> with any of #615fff, #8e51ff, #4f39f6, #7f22fe, #a855f7, #9333ea, #7c3aed, #6d28d9, #5b21b6, #4c1d95</>, sev: 4, trigger: <>1+ match in a <code>background</code> with a gradient</> },
  { id: 'S4', name: 'Gradient text', pattern: <><code>background-clip: text</code> over a gradient spanning two or more hue families (45° buckets; <code>var()</code> stops and neutrals ignored)</>, sev: 4, trigger: <>2+ distinct non-neutral hue families in the stops</> },
  { id: 'S5', name: 'Default palette hexes', pattern: <>3+ of #0f172a, #1e293b, #334155, #615fff, #8e51ff, #4f39f6, #7f22fe, #6366f1, #8b5cf6, #a78bfa, #0d6efd, #007bff</>, sev: 5, trigger: <>3+ hex matches in CSS</> },
  { id: 'S6', name: 'Repeated card grid', pattern: <>3+ classes matching <code>.(card|panel|tile|feature|item|box|cell|block)</code> on a repeating grid</>, sev: 5, trigger: <>3+ card-like classes and <code>grid-template-columns: repeat(auto-fit|auto-fill|N)</code></> },
  { id: 'S7', name: 'Emoji as icons', pattern: <>Emoji (U+1F300 to 1FAFF, 2600 to 27BF, 1F1E6 to 1F1FF) inside <code>&lt;button&gt;</code> or a CTA link</>, sev: 4, trigger: <>2+ emoji in buttons or CTAs</> },
  { id: 'S8', name: 'AI-pill badges', pattern: <>“AI-powered”, “Generate”, “Chat with AI”, “Powered by AI”, “Built with AI”, “AI-driven”</>, sev: 3, trigger: <>1+ match in the HTML text</> },
  { id: 'S9', name: 'Lorem ipsum', pattern: <>“lorem ipsum”, “dolor sit amet”, “consectetur adipiscing”, “sed do eiusmod”, “tempor incididunt”</>, sev: 5, trigger: <>1+ match in the HTML text</> },
  { id: 'S10', name: 'Single font family', pattern: <>One non-generic <code>font-family</code> on the whole page (serif, sans-serif, monospace and system-ui excluded)</>, sev: 4, trigger: <>Exactly one family name</> },
  { id: 'S11', name: 'Marketing buzzwords', pattern: <>2+ of the rule&apos;s word list (streamline, empower, world-class, enterprise-grade, next-generation, disrupt and similar)</>, sev: 3, trigger: <>2+ in the body text, tags stripped</> },
  { id: 'S12', name: 'Placeholder images', pattern: <>URLs from via.placeholder, placehold.co, placeholder.com, dummyimage, picsum.photos, loremflickr or unsplash.com/random</>, sev: 4, trigger: <>1+ match in the HTML</> },
];

const ORIGINALITY = [
  { id: 'O1', name: 'Bespoke easing', detection: <>Distinct <code>cubic-bezier()</code> curves outside the preset set (ease and its variants, Material, Tailwind v4, Bootstrap). A <code>linear()</code> spring with a body of 20+ characters counts as overshoot.</>, points: '1 for 1 to 2 curves · 3 for 3+ · +2 with overshoot · at most 5' },
  { id: 'O2', name: 'Modern layout', detection: <>How many of <code>clamp()</code>, <code>container-type</code> or <code>@container</code>, and <code>subgrid</code> are present</>, points: '1 for one · 2 for two or more' },
  { id: 'O3', name: 'Typographic detail', detection: <><code>font-feature-settings</code>, <code>font-variant-numeric</code>, <code>hanging-punctuation</code>, <code>text-underline-offset</code>, <code>font-optical-sizing</code></>, points: '1 for one · 2 for two or more' },
  { id: 'O4', name: 'Tiered reduced motion', detection: <>A <code>prefers-reduced-motion</code> query that is targeted, where a blanket <code>{'* { animation: none }'}</code> earns nothing</>, points: '1, when targeted' },
  { id: 'O5', name: 'Motion choreography', detection: <>Scroll-driven animation (<code>animation-timeline</code>, <code>view-timeline</code>, <code>animation-range</code>), view transitions, or named <code>@keyframes</code></>, points: '1 for 3+ named keyframes · 2 for scroll-driven or view transitions' },
  { id: 'O6', name: 'Bespoke iconography', detection: <>Inline <code>&lt;svg viewBox&gt;</code> or <code>&lt;symbol&gt;</code> elements, placed by hand rather than from an icon font</>, points: '1 for 3+ inline SVGs or 2+ symbols' },
  { id: 'O7', name: 'Semantic tokens', detection: <>Role-named custom properties such as <code className="dx-nowrap">--surface</code>, <code className="dx-nowrap">--ink</code>, <code className="dx-nowrap">--paper</code>, over hue names like <code className="dx-nowrap">--color-blue-500</code>. The shadcn fingerprint (6+ of its default names) scores zero.</>, points: '2 for 4+ · 4 for 8+ · +2 layering · +2 theming · at most 6' },
];

const CEILINGS = [
  { id: 'v06', name: 'Contrast readable', cap: 65, why: 'Text many readers cannot read: a failure of basic legibility.' },
  { id: 'v22', name: 'CTA contrast', cap: 70, why: 'The primary call to action is hard to read.' },
  { id: 'v02', name: 'Horizontal overflow', cap: 70, why: 'Content is cut off or scrolls sideways on small viewports.' },
  { id: 'v16', name: 'Rem scale', cap: 70, why: 'A root font size under 16px sets off iOS Safari’s auto-zoom.' },
  { id: 'v24', name: 'Touch targets', cap: 75, why: 'Controls under 44px are hard to use on touch screens.' },
  { id: 'v25', name: 'Heading hierarchy', cap: 75, why: 'More than one h1, or skipped levels: the outline is broken.' },
];

const TOC = [
  { id: 'scoring-math', label: 'How a score is made' },
  { id: 'category-weights', label: 'Category weights' },
  { id: 'grade-bands', label: 'Grade bands' },
  { id: 'score-distribution', label: 'The cohort today' },
  { id: 'a11y-floor', label: 'Accessibility floor' },
  { id: 'anti-slop', label: 'Anti-slop deduction' },
  { id: 'originality-lift', label: 'Originality lift' },
  { id: 'hard-fail-ceilings', label: 'Hard-fail ceilings' },
  { id: 'what-engine-measures', label: 'What it measures' },
  { id: 'what-engine-skips', label: 'What it skips' },
  { id: 'validation', label: 'How the method is tested' },
  { id: 'checks', label: 'Every check' },
  { id: 'exports', label: 'Data exports' },
];

export default function MethodologyPage() {
  return (
    <>
      <ReadingProgress />
      <Topbar scrolled />
      <main id="main-content" data-pagefind-body className="eg dx" data-pagefind-meta="priority:high">
        <EngineHead
          route="/methodology"
          name="Methodology"
          thesis={`How the ${ENGINE_CHECK_COUNT}-check engine turns a URL into a score, and how that method is tested. Deterministic: no language model and no human judgment, only regex, token-resolution and spec tests against the HTML and CSS a site serves.`}
          facts={[`${ENGINE_CHECK_COUNT} checks`, `${Object.keys(CATEGORY_WEIGHTS).length} categories`, `engine ${ENGINE_VERSION}`, `contract ${CONTRACT_VERSION}`]}
          contract={{ href: '/contracts/design-system.json', label: 'contract JSON' }}
        >
          <div className="dx-actions">
            <Link className="button primary" href="/score" data-cuelume-press>
              Score a site
            </Link>
            <Link className="button ghost" href="/leaderboard" data-cuelume-press>
              View the leaderboard
            </Link>
          </div>
          <AgentActions mdPath="/methodology.md" label="the methodology page" />
        </EngineHead>

        <dl className="dx-stats dx-stats-rail">
          <div>
            <dt>Checks</dt>
            <dd>{ENGINE_CHECK_COUNT}</dd>
          </div>
          <div>
            <dt>Scored</dt>
            <dd>{ENGINE_SCORED_CHECK_COUNT}</dd>
          </div>
          <div>
            <dt>Manual</dt>
            <dd>{MANUAL_CHECKS}</dd>
          </div>
          <div>
            <dt>Conditional</dt>
            <dd>{SKIP_CHECKS}</dd>
          </div>
          <div>
            <dt>Categories</dt>
            <dd>{Object.keys(CATEGORY_WEIGHTS).length}</dd>
          </div>
        </dl>

        <div className="dx-page">
          <div className="dx-with-toc">
            <OnThisPage items={TOC} />
            <div className="dx-flow">
              <section className="dx-sec" id="scoring-math" aria-labelledby="m-math-h">
                <h2 className="eg-h2" id="m-math-h">
                  How a score is made
                </h2>
                <ReadAlong lang="en">
                  <div className="dx-prose">
                    <p>
                      The engine fetches the page&apos;s HTML and every stylesheet it links, parses the <code>:root</code> custom
                      properties, and runs <strong>{ENGINE_CHECK_COUNT} deterministic checks</strong> across{' '}
                      <strong>{Object.keys(CATEGORY_WEIGHTS).length} weighted categories</strong>. Each check returns{' '}
                      <code>PASS</code>, <code>WARN</code>, <code>FAIL</code>, <code>MANUAL</code> or <code>N/A</code>. The score is a
                      weighted average, then adjusted by an anti-slop deduction, an originality lift and two caps.
                    </p>
                    <p>
                      <strong>It reads the delivered response.</strong> The engine reads the HTML the server sends and the
                      stylesheets it links. It runs no JavaScript and waits for no hydration, so on a site that renders in the
                      browser every check reads the markup that arrives over the wire: a heading injected by script is absent to it,
                      and a token set at runtime is not in the CSS it fetched.
                    </p>
                    <p>
                      That is a deliberate trade. The score stays deterministic, reproducible and cheap, free of headless
                      rendering&apos;s timing flakiness: the same input yields the same output, which is what makes a score comparable
                      week to week. It also bounds the claim: a low score on a client-rendered site describes its delivered HTML.
                      Every result carries a <code>receipt</code> with <code>retrieved_at</code>, <code>engine_version</code> and a{' '}
                      <code>digest</code> of the verdicts, so anyone can re-run the URL and confirm the answer.
                    </p>
                    <p>
                      <strong>MANUAL</strong> and <strong>N/A</strong> checks are left out of both numerator and denominator, as
                      Lighthouse does with manual audits, so no site is penalised for what the static engine cannot run or what does
                      not apply. The {MANUAL_CHECKS} manual checks need a browser viewport, a performance trace or live interaction;
                      the {SKIP_CHECKS === 1 ? 'conditional check applies' : `${SKIP_CHECKS} conditional checks apply`} only when a
                      site serves what it reads.
                    </p>
                  </div>
                </ReadAlong>

                <div className="eg-method dx-pipeline">
                  <h3 className="dx-h3">The pipeline, in order</h3>
                  <div className="eg-steps-box" style={{ '--steps': STEPS.length } as CSSProperties}>
                    <i className="eg-rule" aria-hidden="true" />
                    <ol className="eg-steps">
                      {STEPS.map((s) => (
                        <li className="eg-step" key={s.title}>
                          <h4 className="eg-step-title">{s.title}</h4>
                          <p>{s.text}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                <figure className="dx-formula-fig">
                  <figcaption className="dx-h3">The formula</figcaption>
                  <div className="dx-formula-box">
                    <pre className="dx-formula">
                      {FORMULA.map((line, i) =>
                        line.startsWith('#') ? (
                          <span className="dx-f-c" key={i}>
                            {line}
                            {'\n'}
                          </span>
                        ) : line.includes('  # ') ? (
                          <span className="dx-f-l" key={i}>
                            {line.slice(0, line.indexOf('  # '))}
                            <span className="dx-f-c">{line.slice(line.indexOf('  # '))}</span>
                            {'\n'}
                          </span>
                        ) : (
                          <span className="dx-f-l" key={i}>
                            {line}
                            {'\n'}
                          </span>
                        ),
                      )}
                    </pre>
                  </div>
                  <p className="dx-src">
                    round(… × 1000) / 10 keeps one decimal place: 95.2, never 95.2347. The per-category sub-scores use step 1
                    only; they are the category profiles on the leaderboard.
                  </p>
                </figure>
              </section>

              <section className="dx-sec" id="category-weights" aria-labelledby="m-weights-h">
                <h2 className="eg-h2" id="m-weights-h">
                  Category weights
                </h2>
                <p className="dx-lead">
                  Weights follow the contract&apos;s own emphasis. They are relative and sum to <b>{WEIGHT_TOTAL}</b>; the formula
                  normalises them, so a category&apos;s real share of the score is its weight over {WEIGHT_TOTAL}, and only over the
                  categories a site can be scored in. Performance and responsive have no scored checks in the static engine, so
                  their weight is held in reserve.
                </p>
                <DataFigure
                  id="m-weights"
                  title="The weight each category carries"
                  note={`Heaviest first. Bars are to scale; the figure under each name is its share of the ${WEIGHT_TOTAL} total.`}
                  source="Weights from lib/check-definitions, which mirrors the engine route."
                  table={
                    <DataTable
                      caption={`Category weights, their share of ${WEIGHT_TOTAL}, and check counts.`}
                      head={['Category', 'Weight', 'Share', 'Checks', 'Scored']}
                      numeric={[1, 2, 3, 4]}
                      opt={[3]}
                      rows={[
                        ...CATEGORY_ORDER.map((k) => [label(k), CATEGORY_WEIGHTS[k], share(CATEGORY_WEIGHTS[k]), checksIn(k).length, scoredIn(k)]),
                        ['Total', WEIGHT_TOTAL, '100%', ENGINE_CHECK_COUNT, ENGINE_SCORED_CHECK_COUNT],
                      ]}
                    />
                  }
                >
                  <BarList
                    max={Math.max(...Object.values(CATEGORY_WEIGHTS))}
                    label={`Category weights, heaviest first: ${CATEGORY_ORDER.map((k) => `${label(k)} ${CATEGORY_WEIGHTS[k]}`).join(', ')}; ${WEIGHT_TOTAL} in all.`}
                    bars={CATEGORY_ORDER.map((k) => ({
                      key: k,
                      label: label(k),
                      meta: `${share(CATEGORY_WEIGHTS[k])} · ${scoredIn(k)} scored`,
                      value: CATEGORY_WEIGHTS[k],
                      display: String(CATEGORY_WEIGHTS[k]),
                      tone: 'plain' as const,
                    }))}
                  />
                </DataFigure>
              </section>

              <section className="dx-sec" id="grade-bands" aria-labelledby="m-bands-h">
                <h2 className="eg-h2" id="m-bands-h">
                  Grade bands
                </h2>
                <p className="dx-lead">
                  The letter is a threshold on the number: F under 60, then a grade every ten points. An A needs 90.
                </p>
                <div className="dx-scale" aria-hidden="true">
                  <GradeScale />
                </div>
                <dl className="dx-bands">
                  {[...GRADES].map((g) => (
                    <div key={g}>
                      <dt>
                        <span className="dx-grade" data-tone={g === 'A' || g === 'B' ? 'pass' : g === 'F' ? 'fail' : 'warn'}>
                          {g}
                        </span>
                        <span className="dx-band-range">{BAND_RANGE[g]}</span>
                      </dt>
                      <dd>
                        {BAND_NOTES[g]}{' '}
                        <span className="dx-band-n">
                          {GRADE_COUNTS[g]} of {COHORT_STATS.count} sites today.
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="dx-sec" id="score-distribution" aria-labelledby="m-dist-h">
                <h2 className="eg-h2" id="m-dist-h">
                  The cohort today
                </h2>
                <DataFigure
                  id="m-dist"
                  title={`All ${COHORT_STATS.count} leaderboard sites on the grade scale`}
                  note={`Median ${fmt(COHORT_STATS.median)}, mean ${fmt(COHORT_STATS.mean)}, from ${fmt(COHORT_STATS.min)} to ${fmt(COHORT_STATS.max)}. ${GRADE_COUNTS.D + GRADE_COUNTS.F} of ${COHORT_STATS.count} land in D or F.`}
                  source={`Weekly run of ${SCORES_DATE}.`}
                  tableLabel="Every site's score"
                  table={
                    <DataTable
                      caption={`Composite score of every leaderboard site, weekly run of ${SCORES_DATE}.`}
                      head={['Site', 'Rank', 'Grade', 'Score']}
                      numeric={[1, 3]}
                      rows={COHORT.map((s) => [s.name, s.rank, s.grade, fmt(s.score)])}
                    />
                  }
                >
                  <CohortStrip
                    sites={COHORT.map((s) => ({ slug: s.slug, name: s.name, score: s.score, grade: s.grade, rank: s.rank, self: s.self, held: s.unreachable }))}
                    median={COHORT_STATS.median}
                    label={`Composite scores of ${COHORT_STATS.count} sites from 40 to 100: ${GRADES.map((g) => `${g} ${GRADE_COUNTS[g]}`).join(', ')}; median ${fmt(COHORT_STATS.median)}.`}
                    idle={<span className="dx-readout-meta">point at a dot, or tap it, to read the site</span>}
                  />
                </DataFigure>
              </section>

              <section className="dx-sec" id="a11y-floor" aria-labelledby="m-floor-h">
                <h2 className="eg-h2" id="m-floor-h">
                  Accessibility floor
                </h2>
                <div className="dx-callout">
                  <p>
                    If the accessibility category scores under 60, the score is capped at 70, a C, however high the weighted score.
                    Perfect tokens and no accessibility cannot make an A.
                  </p>
                </div>
                <div className="dx-prose">
                  <p>
                    The floor is a softer form of the DSAF enterprise-grade rule, which requires 75 in accessibility. Sixty is strict
                    enough to stop the all-tokens, no-access failure and lenient enough that a site passing three of six accessibility
                    checks is not capped. The cap binds only above 70: a score already under 70 is left as it is.
                  </p>
                </div>
              </section>

              <section className="dx-sec" id="anti-slop" aria-labelledby="m-slop-h">
                <h2 className="eg-h2" id="m-slop-h">
                  Anti-slop deduction
                </h2>
                <div className="dx-prose">
                  <p>
                    A site can meet every contract rule and still look generic. A second pass runs <strong>12 anti-slop rules</strong>{' '}
                    (S1 to S12) against the most recognisable template patterns, and each one found takes points off the weighted
                    score directly. The deduction is flat, so a sparser site cannot game it.
                  </p>
                  <p>
                    <strong>Per rule, at most 5 points; in all, at most 20.</strong> A rule deducts{' '}
                    <code>min(severity × min(instances, 3), 5)</code>: the fourth sighting of the same pattern adds nothing, three is
                    enough to flag it.
                  </p>
                </div>
                <div className="dx-table-box">
                  <DataTable
                    caption="The twelve anti-slop rules: pattern, severity and trigger."
                    head={['Rule', 'Pattern', 'Severity', 'Trigger']}
                    numeric={[2]}
                    stack="rows"
                    rows={SLOP_RULES.map((r) => [
                      <span key="r">
                        <code>{r.id}</code> {r.name}
                      </span>,
                      r.pattern,
                      r.sev,
                      r.trigger,
                    ])}
                  />
                </div>
              </section>

              <section className="dx-sec" id="originality-lift" aria-labelledby="m-orig-h">
                <h2 className="eg-h2" id="m-orig-h">
                  Originality lift
                </h2>
                <div className="dx-prose">
                  <p>
                    The counterweight to slop: <strong>seven kinds of craft</strong> (O1 to O7), each detectable from CSS and HTML
                    alone, add points. A compliant but generic site earns none; a bespoke one is credited. The lift is capped at{' '}
                    <strong>8 points</strong>, so it nudges the score rather than steering it, and the score is clamped to 100.
                  </p>
                  <p>
                    <strong>The slop gate.</strong> With heavy slop (12 points or more), the lift is halved: craft on a heavily
                    templated site is usually the framework&apos;s, and the lift is meant for the author&apos;s.
                  </p>
                </div>
                <div className="dx-table-box">
                  <DataTable
                    caption="The seven originality credits: what is detected and the points it earns."
                    head={['Credit', 'Detection', 'Points']}
                    rows={ORIGINALITY.map((o) => [
                      <span key="o">
                        <code>{o.id}</code> {o.name}
                      </span>,
                      o.detection,
                      o.points,
                    ])}
                  />
                </div>
              </section>

              <section className="dx-sec" id="hard-fail-ceilings" aria-labelledby="m-ceil-h">
                <h2 className="eg-h2" id="m-ceil-h">
                  Hard-fail ceilings
                </h2>
                <p className="dx-lead">
                  Some failures cap the score whatever else is strong: a site that fails on contrast or overflows its viewport cannot
                  be an A. These are failures of integrity, and they apply after the accessibility floor.
                </p>
                <div className="dx-table-box">
                  <DataTable
                    caption="The six hard-fail ceilings: the failing check, the cap, and why."
                    head={['Check', 'Cap', 'Why']}
                    numeric={[1]}
                    rows={CEILINGS.map((c) => [
                      <span key="c">
                        <code>{c.id}</code> {c.name}
                      </span>,
                      c.cap,
                      c.why,
                    ])}
                  />
                </div>
              </section>

              <section className="dx-sec" id="what-engine-measures" aria-labelledby="m-meas-h">
                <h2 className="eg-h2" id="m-meas-h">
                  What it measures
                </h2>
                <dl className="dx-defs">
                  <div>
                    <dt>What a site ships</dt>
                    <dd>
                      Inline style blocks and linked stylesheets, the <code>:root</code> custom properties, and the served HTML. A
                      design system can document a rich token taxonomy in Storybook and still score low if its public surface
                      exposes none of it at <code>:root</code>; that gap is what the leaderboard shows.
                    </dd>
                  </div>
                  <div>
                    <dt>Deterministically</dt>
                    <dd>
                      The same URL gives the same score within the 24-hour cache window. When a site changes its CSS, the score
                      changes on the next run.
                    </dd>
                  </div>
                  <div>
                    <dt>Conformance, which is narrower than quality</dt>
                    <dd>
                      A high score means the site ships the primitives the engine can detect. A site can pass every check and still be
                      ordinary, or fail many and still be excellent. Read the category profile before the letter: it says where a
                      score comes from.
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="dx-sec" id="what-engine-skips" aria-labelledby="m-skip-h">
                <h2 className="eg-h2" id="m-skip-h">
                  What it skips
                </h2>
                <p className="dx-lead">
                  {MANUAL_CHECKS + SKIP_CHECKS} checks sit outside the score. {MANUAL_CHECKS} need a capability the static engine
                  lacks (a rendered browser, a performance trace, live interaction) and are resolved by the full audit;{' '}
                  {SKIP_CHECKS === 1 ? 'one applies' : `${SKIP_CHECKS} apply`} only when a site serves what it reads.
                </p>
                <ul className="dx-checks">
                  {CHECKS.filter((c) => c.manualReason || c.skipReason).map((c) => (
                    <li key={c.id}>
                      <span className="dx-check-head">
                        <code>{c.id}</code>
                        <span className="dx-tag">{c.manualReason ? 'manual' : 'conditional'}</span>
                        <span className="dx-check-item">{unbroken(itemOf(c.id))}</span>
                      </span>
                      <span className="dx-check-how">{unbroken(display(c.manualReason ?? c.skipReason ?? ''))}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="dx-sec" id="validation" aria-labelledby="m-val-h">
                <h2 className="eg-h2" id="m-val-h">
                  How the method is tested
                </h2>
                <p className="dx-lead">
                  Four studies test the method against itself and against an outside instrument. Each figure below is read from the
                  study&apos;s own report file, dated, and each report regenerates with one command.
                </p>

                <details className="dx-study" id="sensitivity">
                  <summary>
                    <span className="dx-study-title">Sensitivity</span>
                    <span className="dx-study-line">
                      {KNOBS.length} perturbations; the WARN credit moves the most grades ({knob('warn-0.75')?.gradeChanges} of{' '}
                      {SENSITIVITY.sites})
                    </span>
                  </summary>
                  <div className="dx-study-body">
                    <div className="dx-prose">
                      <p>
                        Every leaderboard site&apos;s real check statuses are recomputed under {KNOBS.length} changes to the method:
                        weight scaling, the WARN credit, the slop and originality layers, the bands, the floor and ceilings, and each
                        category favoured one at a time.
                      </p>
                      <p>
                        <strong>Uniform weight changes do nothing.</strong> Scaling every weight by 10 or 20 per cent in either
                        direction moves no score by more than {fmt(Math.max(...UNIFORM.map((k) => k.maxScoreDelta)))} and no rank:
                        the ratio cancels uniform scaling. <strong>The judgment calls carry the sensitivity:</strong> the WARN credit,
                        then slop and originality. Favouring any single category by half again moves at most {OAT_MAX_FLIPS} grades
                        and {fmt(OAT_MAX_DELTA)} points.
                      </p>
                    </div>
                    <DataFigure
                      id="m-sens"
                      title="Grades that change under each perturbation"
                      note={`The ${MOVING.length} perturbations that change any grade, most first; the other ${STILL} change none.`}
                      source={`sensitivity-report.json, generated ${day(SENSITIVITY.generatedAt)} for contract ${SENSITIVITY.contractVersion}.${unread(SENSITIVITY.excluded)} Regenerate: node scripts/sensitivity-analysis.mjs.`}
                      table={
                        <DataTable
                          caption={`All ${KNOBS.length} perturbations: grades changed, rank positions moved, largest score change.`}
                          head={['Perturbation', 'Grades changed', 'Rank moves', 'Largest change']}
                          numeric={[1, 2, 3]}
                          opt={[3]}
                          rows={KNOBS.map((k) => [k.label, k.gradeChanges, k.rankPositionsMoved, fmt(k.maxScoreDelta)])}
                        />
                      }
                    >
                      <BarList
                        max={SENSITIVITY.sites}
                        label={`Grades changed per perturbation, of ${SENSITIVITY.sites} sites: ${MOVING.map((k) => `${k.label} ${k.gradeChanges}`).join(', ')}.`}
                        bars={MOVING.map((k) => ({
                          key: k.key,
                          label: k.label,
                          meta: `${k.rankPositionsMoved} rank moves`,
                          value: k.gradeChanges,
                          display: `${k.gradeChanges} of ${SENSITIVITY.sites}`,
                          tone: 'plain' as const,
                        }))}
                      />
                    </DataFigure>
                  </div>
                </details>

                <details className="dx-study" id="score-diff">
                  <summary>
                    <span className="dx-study-title">Version diff</span>
                    <span className="dx-study-line">
                      v0.3.0 to v0.4.0: {SCORE_DIFF.summary.gradeFlips} of {SCORE_DIFF.summary.sites} grades moved, mean change{' '}
                      {fmt(SCORE_DIFF.summary.meanDelta)}
                    </span>
                  </summary>
                  <div className="dx-study-body">
                    <div className="dx-prose">
                      <p>
                        A method release should never be a silent regression. Each contract version is diffed: the same check
                        statuses scored under the previous version&apos;s profile, rebuilt from the changelog, and the change
                        reported per site. From v0.3.0 to v0.4.0, {SCORE_DIFF.summary.gradeFlips} grades moved ({DIFF_UP} up,{' '}
                        {DIFF_DOWN} down); the largest rise was {hostOf(DIFF_MAX_UP.url)} at +{fmt(DIFF_MAX_UP.delta)}, the largest
                        fall {hostOf(DIFF_MAX_DOWN.url)} at {fmt(DIFF_MAX_DOWN.delta)}.
                      </p>
                      <p>
                        Every score response pins its <code>contractVersion</code>. Before adopting a new version in CI, run the diff:
                        if a grade moves, it says why.
                      </p>
                    </div>
                    <div className="dx-table-box">
                      <DataTable
                        caption={`Score under v0.3.0 and v0.4.0 for each site, generated ${day(SCORE_DIFF.generatedAt)}.`}
                        head={['Site', 'v0.3.0', 'v0.4.0', 'Change']}
                        numeric={[1, 2, 3]}
                        rows={DIFF_ROWS.map((r) => [
                          hostOf(r.url),
                          `${fmt(r.v030.score)} ${r.v030.grade}`,
                          `${fmt(r.v040.score)} ${r.v040.grade}`,
                          `${r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}${fmt(Math.abs(r.delta))}`,
                        ])}
                      />
                    </div>
                    <p className="dx-src">
                      score-diff-report.json, generated {day(SCORE_DIFF.generatedAt)}.{unread(DIFF_UNREAD)} Regenerate: node scripts/score-diff.mjs --all.
                    </p>
                  </div>
                </details>

                <details className="dx-study" id="blind-comparison">
                  <summary>
                    <span className="dx-study-title">Blind comparison</span>
                    <span className="dx-study-line">
                      against {AXE}: κ = {K.kappa.toFixed(3)}, {K.label}
                    </span>
                  </summary>
                  <div className="dx-study-body">
                    <div className="dx-prose">
                      <p>
                        Each site is rated by two instruments that never see each other&apos;s results: the engine (accessibility
                        category at {BLIND.a11yPassThreshold} or more passes) and {AXE}, the WCAG engine, run in a real browser (no
                        serious or critical violation passes). Across {K.n} sites, κ = {K.kappa.toFixed(3)} (95% interval{' '}
                        {K.kappaCI95[0].toFixed(2)} to {K.kappaCI95[1].toFixed(2)}): {K.label}.
                      </p>
                      <p>
                        The two measure different layers. The engine reads what shipped CSS declares (tokens, focus-visible, reduced
                        motion); axe reads what renders (computed contrast, ARIA, button names, alt text). Neither contains the other,
                        which is why the full audit at <code>/api/score/audit</code> runs a real browser.
                      </p>
                    </div>
                    <div className="dx-table-box">
                      <DataTable
                        caption={`Engine verdict against ${AXE} verdict, ${K.n} sites.`}
                        head={[<span key="h" className="sr-only">Engine verdict</span>, `${AXE} passes`, `${AXE} fails`]}
                        numeric={[1, 2]}
                        rows={[
                          ['Engine passes', K.bothPass, K.aPassBFail],
                          ['Engine fails', K.aFailBPass, K.bothFail],
                        ]}
                      />
                    </div>
                    <p className="dx-src">
                      blind-comparison-report.json, generated {day(BLIND.generatedAt)}.
                      {BLIND.excluded.length
                        ? ` Left out, with no verdict from one of the two raters: ${BLIND.excluded.map((x) => hostOf(x.url)).join(', ')}.`
                        : ''}
                    </p>
                  </div>
                </details>

                <details className="dx-study" id="rank-bounds">
                  <summary>
                    <span className="dx-study-title">Rank bounds</span>
                    <span className="dx-study-line">
                      {RANK_BOUNDS.scenarios} weight scenarios; the widest band is {WIDEST.bandWidth} places
                    </span>
                  </summary>
                  <div className="dx-study-body">
                    <div className="dx-prose">
                      <p>
                        After sensitivity comes the adversarial test: can a chosen weighting put a site on top? (An analysis of the
                        OECD Better Life Index found 19 of 36 countries could be ranked first.) Every site is recomputed under{' '}
                        {RANK_BOUNDS.scenarios} weightings (the published one, uniform, and each category doubled or halved) and its
                        best and worst rank reported.
                      </p>
                      <p>
                        On {day(RANK_BOUNDS.generatedAt)},{' '}
                        {RANK_BOUNDS.top5Fragile.length === 0
                          ? 'the top five held under every scenario'
                          : `${RANK_BOUNDS.top5Fragile.length} of the top five could be pushed out by some weighting`}. The widest band
                        was {hostOf(WIDEST.url)}, ranks {WIDEST.bestRank} to {WIDEST.worstRank}. Ranks here are that run&apos;s, which
                        can differ from today&apos;s leaderboard.
                      </p>
                    </div>
                    <DataFigure
                      id="m-ranks"
                      title="Each site's rank band across the weight scenarios"
                      note="The segment runs from the best rank to the worst any scenario gave; the dot is the published rank. Rank 1 is at the left."
                      source={`rank-bounds-report.json, generated ${day(RANK_BOUNDS.generatedAt)}.${unread(RANK_BOUNDS.excluded)} Regenerate: node scripts/rank-bounds.mjs.`}
                      table={
                        <DataTable
                          caption={`Best, published and worst rank per site across ${RANK_BOUNDS.scenarios} weight scenarios.`}
                          head={['Site', 'Best', 'Published', 'Worst', 'Band']}
                          numeric={[1, 2, 3, 4]}
                          opt={[4]}
                          rows={RANKS.map((r) => [hostOf(r.url), r.bestRank, r.baselineRank, r.worstRank, r.bandWidth])}
                        />
                      }
                    >
                      <RangeList
                        min={1}
                        max={RANK_BOUNDS.sites}
                        label={`Rank bands across ${RANK_BOUNDS.scenarios} weight scenarios for ${RANK_BOUNDS.sites} sites; the widest is ${hostOf(WIDEST.url)} from ${WIDEST.bestRank} to ${WIDEST.worstRank}.`}
                        ranges={RANKS.map((r) => ({
                          key: r.url,
                          label: hostOf(r.url),
                          lo: r.bestRank,
                          hi: r.worstRank,
                          at: r.baselineRank,
                          display: r.bestRank === r.worstRank ? `${r.bestRank}` : `${r.bestRank} to ${r.worstRank}`,
                        }))}
                      />
                    </DataFigure>
                  </div>
                </details>
              </section>

              <section className="dx-sec" id="checks" aria-labelledby="m-checks-h">
                <h2 className="eg-h2" id="m-checks-h">
                  Every check
                </h2>
                <p className="dx-lead">
                  All {ENGINE_CHECK_COUNT}, by category, heaviest first. Open a category to read how each of its checks is decided.
                </p>
                {CATEGORY_ORDER.map((k) => (
                  <details className="dx-group" id={k} key={k}>
                    <summary>
                      <span className="dx-group-name">{label(k)}</span>
                      <span className="dx-group-meta">
                        weight {CATEGORY_WEIGHTS[k]} · {checksIn(k).length} {checksIn(k).length === 1 ? 'check' : 'checks'} ·{' '}
                        {scoredIn(k)} scored
                      </span>
                    </summary>
                    <div className="dx-group-body">
                      <p className="dx-group-note">{CATEGORY_NOTES[k]}</p>
                      {checksIn(k).length === 0 ? (
                        <p className="dx-group-note">No checks in this category in the current engine.</p>
                      ) : (
                        <ul className="dx-checks">
                          {checksIn(k).map((c) => (
                            <li key={c.id}>
                              <span className="dx-check-head">
                                <code>{c.id}</code>
                                {c.manualReason && <span className="dx-tag">manual</span>}
                                {c.skipReason && <span className="dx-tag">conditional</span>}
                                <span className="dx-check-item">{unbroken(itemOf(c.id))}</span>
                              </span>
                              <span className="dx-check-how">{unbroken(display(c.how))}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                ))}
              </section>

              <section className="dx-sec" id="exports" aria-labelledby="m-exp-h">
                <h2 className="eg-h2" id="m-exp-h">
                  Data exports
                </h2>
                <dl className="dx-defs">
                  <div>
                    <dt>
                      <Link href="/api/leaderboard">/api/leaderboard</Link>
                    </dt>
                    <dd>JSON with each site&apos;s category scores. CORS-enabled.</dd>
                  </div>
                  <div>
                    <dt>
                      <Link href="/api/leaderboard.csv">/api/leaderboard.csv</Link>
                    </dt>
                    <dd>RFC 4180 CSV with a header row, for spreadsheets.</dd>
                  </div>
                </dl>
                <p className="dx-src">
                  Contract {CONTRACT_VERSION} · engine {ENGINE_VERSION} · {ENGINE_CHECK_COUNT} checks in{' '}
                  {Object.keys(CATEGORY_WEIGHTS).length} categories · 12 slop rules, up to −20 · originality, up to +8 · 6 hard-fail
                  ceilings · engine at <Link href="/api/score">/api/score</Link> · contract at{' '}
                  <Link href="/contracts/design-system.json">/contracts/design-system.json</Link>
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
