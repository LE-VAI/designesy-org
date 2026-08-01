// /methodology — Designesy scoring methodology page.
// The credibility prerequisite: every credible 2026 leaderboard (DesignSystems.one,
// sealambda shadcn index, MCP Toplist) publishes methodology + score distribution.
// Without it, cross-listings send traffic to a leaderboard that looks arbitrary.
//
// This page documents: the 40 checks, their categories and weights, the scoring
// math (weighted PASS/WARN/FAIL with SKIP exclusion), grade bands, the a11y floor,
// and what the engine measures vs. what it cannot measure (SKIP reasons).
//
// The CHECKS array below is the human-facing description of the same checks in
// apps/site/app/api/score/route.ts. The score engine is the source of truth;
// this page is documentation of it. The REMEDIATION text is pulled from the
// same route.ts REMEDIATION table. If a check is added to the engine, add it
// here too — the page header shows a count that must match.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../lib/topbar';
import { Footer } from '../lib/footer';
import { pageMeta } from '../lib/site-meta';
import { SEED } from '../leaderboard/seed';

export const metadata: Metadata = pageMeta({
  title: 'Methodology',
  description:
    'How the Designesy 40-check engine scores a URL — the full methodology: checks, categories, weights, scoring math, grade bands, and the accessibility floor. Deterministic, no LLM.',
  path: '/methodology',
  ogDescription:
    'The 40-check Designesy scoring methodology — weights, math, grade bands, and the a11y floor. Fully transparent, deterministic, no LLM.',
  twitterDescription:
    'Designesy scoring methodology — 40 checks, 14 categories, deterministic · designesy.org/methodology',
});

// ── Category weights (mirror apps/site/app/api/score/route.ts CATEGORY_WEIGHTS) ──
const CATEGORY_WEIGHTS: Record<string, number> = {
  cadence: 18,
  accessibility: 15,
  semantic: 12,
  copywriting: 8,
  motion: 10,
  tokens: 9,
  takt: 8,
  security: 5,
  poise: 7,
  identity: 6,
  interaction: 6,
  performance: 6,
  spec: 4,
  responsive: 3,
};

const CATEGORY_LABELS: Record<string, string> = {
  cadence: 'Cadence',
  accessibility: 'Accessibility',
  semantic: 'Semantic',
  copywriting: 'Copywriting',
  motion: 'Motion',
  tokens: 'Tokens',
  takt: 'Takt',
  security: 'Security',
  poise: 'Poise',
  identity: 'Identity',
  interaction: 'Interaction',
  performance: 'Performance',
  spec: 'Spec',
  responsive: 'Responsive',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  cadence: 'Typography rendering discipline — font smoothing, rem scales, line-height, text-wrap, tabular nums, selection styling, font-synthesis, underline-position, skip-ink. The contract section with the most checks (12), weighted highest at 18%.',
  accessibility: 'WCAG 2.2 AA primitives — contrast, touch targets, heading hierarchy, input font floor, button-text contrast, forced-colors readiness. Carries the a11y floor: if this category scores below 60%, the overall grade is capped at C.',
  semantic: 'Reserved weight (12%) — declared in the engine CATEGORY_WEIGHTS table but no check currently returns category: "semantic". The semantic-HTML and AI-disclosure checks (v07, v34) are categorized as "identity" in the engine. This weight is held in reserve for future semantic-structure checks (RDFa, microdata, Open Graph). Documented for transparency; does not affect any site\'s score today.',
  copywriting: 'UX copy discipline — button verb phrases, no trailing periods, descriptive link text, no ALL CAPS. 4 heuristic checks grounded in NN/g, Microsoft Fluent, IBM Carbon, and WCAG 2.4.4. New in v0.4.0. 8% weight.',
  motion: 'Motion hygiene — no transition:all, will-change restricted to transform/opacity, prefers-reduced-motion block, duration tokens present. 4 checks, 10% weight.',
  tokens: 'Token architecture — --paper foundation present, token layer depth (primitive → semantic → component). 2 scored checks, 9% weight.',
  takt: 'Interaction feel — press scales above the 0.95 floor (0.96 cells, 0.985 cards, 0.995 surfaces). Named after the German word for precise, musical timing.',
  security: 'Unicode Security — UTS #39 confusable detection in token names and CSS identifiers. Prevents Cyrillic/Greek homoglyph shadowing attacks. designesy is the only design verification engine that checks this surface. 5% weight, 1 scored check.',
  poise: 'Interaction poise — hover lifts, press-settle, keyboard-path documentation, sound-toggle aria-pressed. Static half verified from CSS; interaction half requires a browser (SKIP).',
  identity: 'Document identity — semantic HTML landmarks (h1, title, meta description, main/header/nav) and AI-disclosure readiness (EU AI Act Art 50). 6% weight, 2 scored checks (v07, v34).',
  interaction: 'Focus visibility — :focus-visible rings declared. 1 scored check, 6% weight.',
  performance: 'Core Web Vitals — LCP, INP, CLS. Requires a CDP/Playwright trace (SKIP in the static engine). 6% weight, 0 scored checks in the current engine.',
  spec: 'DESIGN.md spec-layer validation — integrates Google\'s @google/design.md CLI linter as the spec layer beneath designesy\'s own 40-check contract verification. 4% weight, 1 check (SKIP if /DESIGN.md is not served).',
  responsive: 'Viewport overflow — horizontal overflow at 375/720/860/1080px+. Requires a browser viewport trace (SKIP in the static engine). 3% weight, 0 scored checks.',
};

// ── Check definitions (mirror apps/site/app/api/score/route.ts) ──
interface CheckDef {
  id: string;
  item: string;
  category: string;
  how: string;
  skipReason?: string;
}

const CHECKS: CheckDef[] = [
  // ── Tokens (9%) ──
  {
    id: 'v01',
    item: 'Token values match live site :root foundation',
    category: 'tokens',
    how: 'Parses :root custom properties from the fetched CSS. Looks for --paper specifically — the contract names --paper, --ink, --muted, --surface, --surface-raised, --line, --signal, --signal-light, --signal-dim as the required foundation. PASS if --paper resolves to a value.',
  },
  {
    id: 'v29',
    item: 'Token architecture: primitive → semantic → component layers',
    category: 'tokens',
    how: 'Counts how many tokens are referenced via var() (aliasing) vs. raw values. A 2-tier or 3-tier aliasing structure (primitive → semantic → component) signals a mature token system. PASS if at least 2 layers are detected.',
  },

  // ── Responsive (3%) ──
  {
    id: 'v02',
    item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+',
    category: 'responsive',
    how: 'Requires rendering the page at four viewport widths and measuring scrollWidth > clientWidth. The static engine cannot do this.',
    skipReason: 'Requires a browser viewport trace — the engine fetches CSS, not a rendered DOM.',
  },

  // ── Interaction (6%) ──
  {
    id: 'v03',
    item: 'Primary interactive elements show focus-visible rings',
    category: 'interaction',
    how: 'Regex-searches the CSS for :focus-visible declarations. PASS if any :focus-visible rule is found. This is the keyboard-navigation visibility primitive — without it, Tab users cannot see where they are.',
  },

  // ── Poise (7%) ──
  {
    id: 'v04',
    item: 'Sound toggle flips aria-pressed and applies the audio preference',
    category: 'poise',
    how: 'Requires clicking a sound toggle and verifying aria-pressed flips and a [data-audio] attribute is applied. The static engine cannot interact with the DOM.',
    skipReason: 'Requires live DOM interaction — the engine does not execute JavaScript or click elements.',
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
    how: 'Regex-searches for @media (prefers-reduced-motion: reduce). PASS if the media query is declared. This is the vestibular-safety primitive — without it, motion-sensitive users cannot use the site.',
  },
  {
    id: 'v11',
    item: 'No transition:all in the live stylesheet',
    category: 'motion',
    how: 'Regex-searches for transition: all (case-insensitive). FAIL if found. transition: all causes layout-thrash and surprises — the contract requires named properties only.',
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
    how: 'Resolves --signal to RGB, then tests --ink and --paper against it. PASS if the best ratio ≥ 4.5:1. WARN if ≥ 3:1 (large-text pass). FAIL if below 3:1. SKIP if --signal is not declared or unresolvable.',
  },
  {
    id: 'v24',
    item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.8)',
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
    how: 'Searches CSS for input/textarea/select font-size declarations ≥ 16px (or 1rem). PASS if the floor is detected. Inputs below 16px trigger a layout-shift zoom on iPhone that breaks mobile UX.',
  },
  {
    id: 'v35',
    item: 'Forced-colors readiness: @media (forced-colors: active) block present',
    category: 'accessibility',
    how: 'Searches CSS for @media (forced-colors: active) and forced-color-adjust. PASS if both are present. Windows High Contrast Mode and Chrome forced-colors recolor the page — without this media query, critical UI becomes illegible.',
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
    item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor',
    category: 'takt',
    how: 'Extracts every transform: scale() value in :active contexts. FAIL if any scale is 0 (glitch, not a press) or below 0.95. PASS if real press scales are found above 0.95. The 0.95 floor is the contract minimum — lower reads as a glitch.',
  },

  // ── Cadence (18%) — highest weight, most checks ──
  {
    id: 'v14',
    item: 'Cadence typography rules match live CSS and contract.cadence',
    category: 'cadence',
    how: 'Checks for the Cadence rule set: font-synthesis: none, text-underline-position: from-font, text-decoration-skip-ink: auto, -webkit-font-smoothing: antialiased, -moz-osx-font-smoothing: grayscale, root font-size: 16px, all sizes in rem. PASS if all present.',
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
    how: 'Counts rem-based vs px-based font-size declarations. PASS if the majority are rem and root is 16px. The 16px root is the Cadence floor — iOS Safari auto-zooms inputs below 16px.',
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
    how: 'Searches for text-wrap: balance (headings) and text-wrap: pretty (paragraphs). PASS if both are present. Progressive enhancement — unsupported browsers ignore them.',
  },
  {
    id: 'v19',
    item: 'tabular-nums: 8 instances across the live CSS',
    category: 'cadence',
    how: 'Counts font-feature-settings: "tnum" or font-variant-numeric: tabular-nums declarations. PASS if ≥ 8 instances (threshold for a site that takes numeric display seriously). Prevents digits from shifting width as values change.',
  },
  {
    id: 'v20',
    item: '::selection styled with var(--signal) — not browser default',
    category: 'cadence',
    how: 'Searches for ::selection rules using var(--signal). PASS if the selection color is the signal token, not the browser default. The selection color is a small but loud brand surface.',
  },
  {
    id: 'v26',
    item: 'Font family count ≤3 (body + heading + mono)',
    category: 'cadence',
    how: 'Parses all font-family declarations and counts distinct families. PASS if ≤ 3. WARN if 4-5. FAIL if 6+. More than 3 families signals inconsistency and hurts performance.',
  },
  {
    id: 'v28',
    item: 'Reading width 45-75ch on prose containers',
    category: 'cadence',
    how: 'Searches for max-width declarations in the 45-75ch range (66ch ideal). PASS if at least one measure is in range. Lines longer than 75ch are hard to track; shorter than 45ch feels choppy.',
  },
  {
    id: 'x01',
    item: 'font-synthesis: none set (Cadence resolved tension)',
    category: 'cadence',
    how: 'Searches for font-synthesis: none. PASS if declared. WARN if font-synthesis is declared but not set to none, or if no rule is found. Prevents the browser from synthesizing bold/italic faces when the real weights are not loaded — a common cause of blurry headlines on Windows.',
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
    how: 'Searches for text-decoration-skip-ink: auto or none. PASS if declared. Makes underlines skip the rounded parts of letters (g, j, p, q, y) — a small typographic refinement that signals attention to craft.',
  },

  // ── Security (5%) — v0.4.0 ──
  {
    id: 'v36',
    item: 'Unicode Security: no UTS #39 confusable characters in token names or CSS identifiers',
    category: 'security',
    how: 'Scans token names, CSS class/id selectors, and url() refs for non-ASCII confusable characters (Cyrillic, Greek, fullwidth) using a Unicode confusable detector. PASS when 0 confusables. FAIL when token-name confusables found (shadowing risk — e.g. --соlor-bg with Cyrillic с vs --color-bg). WARN for class/id/url confusables. Provenance: Unicode Technical Standard #39, Unicode 16.0.0. designesy is the only design verification engine that checks this surface.',
  },

  // ── Spec (4%) — v0.4.0 ──
  {
    id: 'v37',
    item: 'DESIGN.md spec-layer validation (Google @google/design.md lint)',
    category: 'spec',
    how: 'Fetches /DESIGN.md from the target origin and runs Google\'s @google/design.md CLI linter (11 lint rules: broken token refs, missing primary colors, WCAG contrast, orphaned tokens, section order). PASS on clean lint. WARN on lint warnings. FAIL on lint errors. SKIP if /DESIGN.md is not served — this is expected, as no public convention requires it yet.',
    skipReason: 'SKIP if /DESIGN.md is not served at the target origin — no public convention requires it yet.',
  },

  // ── Copywriting (8%) — v0.4.0 ──
  {
    id: 'v38',
    item: 'Button text is a verb phrase or recognized command — not a bare noun',
    category: 'copywriting',
    how: 'Parses button elements and checks if text starts with a verb or recognized command (Save, Cancel, Delete, Edit, Share, Close, Back, Next). WARN if buttons don\'t lead with a verb. SKIP if no buttons found. Heuristic — review flagged buttons manually. Grounded in NN/g: "Lead with verbs or verb phrases that clearly outline what will happen after the command is selected."',
  },
  {
    id: 'v39',
    item: 'No trailing period on button text, labels, or tab text',
    category: 'copywriting',
    how: 'Searches button/label/tab elements for trailing periods (excludes ellipsis ...). WARN if found. SKIP if no relevant elements. Microsoft Fluent: "Don\'t end text for buttons, radio buttons, labels, or checkboxes with a period." Periods are for full sentences in tooltips, error messages, and dialog bodies only.',
  },
  {
    id: 'v40',
    item: 'Link text is descriptive — not bare "click here", "learn more", "here"',
    category: 'copywriting',
    how: 'Parses anchor elements and checks link text against a blocklist of non-descriptive patterns (click here, here, learn more, read more, more, link, this, that, continue, see more, view details). WARN if matched. SKIP if no anchors. WCAG 2.4.4 Link Purpose: link text should describe the destination.',
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
    skipReason: 'Requires a CDP trace — the engine fetches HTML/CSS, not a rendered page with timing data.',
  },
];

// ── Grade bands (mirror computeGrade in route.ts) ──
const GRADE_BANDS = [
  { grade: 'A', min: 90, color: 'var(--signal-light)', description: 'Reference-tier craft. The site ships the contract primitives at :root and passes the majority of checks across all categories.' },
  { grade: 'B', min: 80, color: 'var(--activation)', description: 'Strong. A few checks are missing or WARN, but the foundation is solid.' },
  { grade: 'C', min: 70, color: 'var(--line-strong)', description: 'Acceptable. Notable gaps in cadence, motion, or accessibility. The a11y floor caps here if accessibility < 60%.' },
  { grade: 'D', min: 60, color: 'var(--line)', description: 'Below standard. Significant gaps across multiple categories. Most sites land here — the contract is demanding.' },
  { grade: 'F', min: 0, color: 'var(--line-faint)', description: 'Needs work. The site does not ship the contract primitives. Common for sites with no :root token system, no reduced-motion block, no font-synthesis rule.' },
];

// Group checks by category for display — keep ALL declared categories
// (including reserved weights like `semantic` that have 0 checks today)
// so the category table documents the full weight table transparently.
const CATEGORIES = Object.keys(CATEGORY_WEIGHTS);
const CHECKS_BY_CATEGORY = CATEGORIES.map((cat) => ({
  category: cat,
  weight: CATEGORY_WEIGHTS[cat],
  checks: CHECKS.filter((c) => c.category === cat),
}));

const TOTAL_WEIGHT = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
const SCORED_CHECKS = CHECKS.filter((c) => !c.skipReason).length;
const SKIP_CHECKS = CHECKS.filter((c) => c.skipReason).length;

// ── Score distribution from the leaderboard SEED ──
const SCORED_SITES = SEED.filter((s) => s.score !== null && s.score !== undefined);
const GRADE_COUNTS: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
for (const s of SCORED_SITES) {
  if (s.grade && s.grade in GRADE_COUNTS) GRADE_COUNTS[s.grade]++;
}
const SCORED_TOTAL = SCORED_SITES.length;
const MAX_GRADE_COUNT = Math.max(1, ...Object.values(GRADE_COUNTS));
const SCORE_VALUES = SCORED_SITES.map((s) => s.score as number);
const MEAN_SCORE = SCORE_VALUES.length > 0 ? Math.round((SCORE_VALUES.reduce((a, b) => a + b, 0) / SCORE_VALUES.length) * 10) / 10 : 0;
const MIN_SCORE = SCORE_VALUES.length > 0 ? Math.min(...SCORE_VALUES) : 0;
const MAX_SCORE = SCORE_VALUES.length > 0 ? Math.max(...SCORE_VALUES) : 0;

// Per-grade histogram bar config (colors mirror the leaderboard histogram)
const HIST_BARS = GRADE_BANDS.map((band) => {
  const bgMap: Record<string, string> = {
    A: 'var(--signal-dim)',
    B: 'rgba(254, 204, 52, 0.14)',
    C: 'var(--surface-hover)',
    D: 'var(--surface-soft)',
    F: 'transparent',
  };
  return {
    grade: band.grade,
    min: band.min,
    color: band.color,
    bg: bgMap[band.grade] || 'var(--surface-soft)',
    count: GRADE_COUNTS[band.grade] || 0,
  };
});

export default function MethodologyPage() {
  return (
    <>
      <Topbar scrolled />

      <main id="main-content" className="surface-page methodology-page" data-pagefind-meta="priority:high">
        <style>{`
          .methodology-page .methodology-section { max-width: var(--maxw, 1080px); margin: 0 auto; padding: clamp(2.5rem, 5vw, 4rem) 1.5rem; }
          .methodology-page .methodology-prose { max-width: 66ch; }
          .methodology-page .methodology-prose p { color: var(--muted); font-size: 1rem; line-height: 1.6; margin: 0 0 1rem; }
          .methodology-page .methodology-prose strong { color: var(--ink); font-weight: 600; }
          .methodology-page .methodology-prose code { font-family: var(--mono, ui-monospace, monospace); font-size: 0.88rem; background: var(--surface); padding: 0.1rem 0.35rem; border-radius: 3px; border: 1px solid var(--line-faint); color: var(--ink); }
          .methodology-page .methodology-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.875rem; margin: 1.5rem 0; }
          .methodology-page .methodology-stat { padding: 1rem 1.25rem; background: var(--surface); background-image: var(--surface-card-gradient); border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--inner-light); }
          .methodology-page .methodology-stat-num { display: block; font-family: var(--mono, ui-monospace, monospace); font-size: 1.6rem; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1; }
          .methodology-page .methodology-stat-label { display: block; margin-top: 0.4rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted-dim); }
          .methodology-page .weight-table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 1.25rem 0; }
          .methodology-page .weight-table th { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-dim); font-weight: 600; text-align: left; padding: 0.5rem 0.625rem; border-bottom: 1px solid var(--line); }
      .methodology-page .weight-table th.wt-num { text-align: right; }
          .methodology-page .weight-table td { padding: 0.625rem; border-bottom: 1px solid var(--line-faint); font-size: 0.88rem; color: var(--muted); vertical-align: top; }
          .methodology-page .weight-table td.wt-num { font-family: var(--mono, ui-monospace, monospace); font-variant-numeric: tabular-nums; color: var(--ink); text-align: right; }
          .methodology-page .weight-table td.wt-name { color: var(--ink); font-weight: 600; }
          .methodology-page .weight-bar { display: inline-block; height: 0.5rem; border-radius: 2px; background: var(--signal-dim); vertical-align: middle; margin-right: 0.5rem; min-width: 2px; }
          .methodology-page .grade-bands { display: flex; flex-direction: column; gap: 0.5rem; margin: 1.25rem 0; }
          .methodology-page .grade-band { display: grid; grid-template-columns: 2.5rem 4rem 1fr; gap: 0.75rem; align-items: start; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
          .methodology-page .grade-band-letter { font-family: var(--mono, ui-monospace, monospace); font-weight: 700; font-size: 1.1rem; text-align: center; padding: 0.25rem 0; border-radius: 4px; border: 1px solid var(--line); }
          .methodology-page .grade-band-range { font-family: var(--mono, ui-monospace, monospace); font-size: 0.82rem; color: var(--muted-dim); font-variant-numeric: tabular-nums; padding-top: 0.35rem; }
          .methodology-page .grade-band-desc { font-size: 0.85rem; color: var(--muted); line-height: 1.5; }
          .methodology-page .score-distribution { max-width: var(--maxw, 1080px); margin: 0 auto; padding: clamp(2.5rem, 5vw, 4rem) 1.5rem; }
          .methodology-page .score-dist-histogram { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.625rem; align-items: end; min-height: 140px; margin: 1.5rem 0; }
          .methodology-page .score-dist-col { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
          .methodology-page .score-dist-bar-count { font-family: var(--mono, ui-monospace, monospace); font-size: 0.82rem; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1; }
          .methodology-page .score-dist-bar-wrap { width: 100%; height: 100px; display: flex; align-items: flex-end; justify-content: center; }
          .methodology-page .score-dist-bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; border: 1px solid var(--line-faint); border-bottom: none; transition: height 200ms var(--ease, ease-out); }
          .methodology-page .score-dist-label { width: 100%; text-align: center; padding-top: 0.4rem; border-top: 1px solid var(--line); display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
          .methodology-page .score-dist-grade { font-family: var(--mono, ui-monospace, monospace); font-weight: 700; font-size: 0.9rem; }
          .methodology-page .score-dist-range { font-family: var(--mono, ui-monospace, monospace); font-size: 0.68rem; color: var(--muted-dim); font-variant-numeric: tabular-nums; }
          .methodology-page .score-dist-headline { font-size: 0.92rem; color: var(--muted); line-height: 1.6; margin: 1rem 0 0; max-width: 66ch; }
          .methodology-page .score-dist-headline strong { color: var(--ink); font-weight: 600; }
          .methodology-page .check-group { margin: 2.5rem 0; }
          .methodology-page .check-group-header { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--line); }
          .methodology-page .check-group-name { font-size: 1.1rem; font-weight: 600; color: var(--ink); }
          .methodology-page .check-group-weight { font-family: var(--mono, ui-monospace, monospace); font-size: 0.78rem; color: var(--muted-dim); font-variant-numeric: tabular-nums; }
          .methodology-page .check-group-desc { font-size: 0.85rem; color: var(--muted); line-height: 1.5; margin-bottom: 1rem; }
          .methodology-page .check-row { padding: 0.875rem 0; border-bottom: 1px solid var(--line-faint); }
          .methodology-page .check-row:last-child { border-bottom: none; }
          .methodology-page .check-row-head { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.35rem; }
          .methodology-page .check-id { font-family: var(--mono, ui-monospace, monospace); font-size: 0.72rem; font-weight: 600; color: var(--signal-light); background: var(--signal-dim); padding: 0.1rem 0.4rem; border-radius: 3px; letter-spacing: 0.02em; }
          .methodology-page .check-item { font-size: 0.92rem; color: var(--ink); font-weight: 500; line-height: 1.4; }
          .methodology-page .check-how { font-size: 0.82rem; color: var(--muted); line-height: 1.55; margin: 0 0 0 0; }
          .methodology-page .check-skip { display: inline-block; margin-top: 0.3rem; padding: 0.15rem 0.5rem; font-size: 0.7rem; font-family: var(--mono, ui-monospace, monospace); color: var(--muted-dim); background: var(--surface-soft); border: 1px solid var(--line-faint); border-radius: 3px; letter-spacing: 0.02em; }
          .methodology-page .methodology-formula { padding: 1rem 1.25rem; background: var(--surface); background-image: var(--surface-card-gradient); border: 1px solid var(--line); border-radius: 6px; margin: 1.25rem 0; font-family: var(--mono, ui-monospace, monospace); font-size: 0.82rem; line-height: 1.7; color: var(--ink); overflow-x: auto; box-shadow: var(--inner-light); }
          .methodology-page .methodology-formula .formula-comment { color: var(--muted-dim); }
          .methodology-page .methodology-callout { padding: 1rem 1.25rem; background: var(--signal-dim); border: 1px solid var(--signal-light); border-radius: 6px; margin: 1.25rem 0; font-size: 0.88rem; color: var(--ink); line-height: 1.55; }
          .methodology-page .methodology-callout strong { font-weight: 700; }
          .methodology-page .methodology-toc { padding: 1rem 1.25rem; background: var(--surface-soft); border: 1px solid var(--line); border-radius: 6px; margin: 1.5rem 0; font-size: 0.85rem; }
          .methodology-page .methodology-toc a { color: var(--muted); text-decoration: none; border-bottom: 1px solid var(--line-faint); }
          .methodology-page .methodology-toc a:hover { color: var(--ink); border-bottom-color: var(--line-strong); }
          .methodology-page .methodology-toc ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.3rem 1rem; }
          @media (max-width: 560px) {
            .methodology-page .grade-band { grid-template-columns: 2rem 3.5rem 1fr; gap: 0.5rem; }
            .methodology-page .methodology-grid { grid-template-columns: 1fr 1fr; }
            .methodology-page .score-dist-bar-wrap { height: 70px; }
            .methodology-page .score-dist-range { display: none; }
          }
        `}</style>

        <section className="surface-header fade-up methodology-section">
          <p className="surface-eyebrow" data-scramble>Verification transparency</p>
          <h1 className="surface-title" data-scramble>Methodology</h1>
          <p className="surface-lede">
            The full scoring methodology behind the Designesy 40-check engine.
            Deterministic, no LLM, no human judgment. Every check is a regex,
            token-resolution, or spec-linter test against the live fetched CSS
            and HTML. This page documents exactly what the engine measures, how
            the score is computed, and what it cannot measure.
          </p>
          <div className="hero-actions" style={{ marginTop: '1.75rem' }}>
            <Link className="button primary" href="/score" data-cuelume-press>
              Score a site
            </Link>
            <Link className="button ghost" href="/leaderboard" data-cuelume-press style={{ marginLeft: '0.5rem' }}>
              View leaderboard
            </Link>
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section">
          <h2 className="doctrine-heading">At a glance</h2>
          <div className="methodology-grid">
            <div className="methodology-stat">
              <span className="methodology-stat-num">{CHECKS.length}</span>
              <span className="methodology-stat-label">Total checks</span>
            </div>
            <div className="methodology-stat">
              <span className="methodology-stat-num">{SCORED_CHECKS}</span>
              <span className="methodology-stat-label">Scored (PASS/WARN/FAIL)</span>
            </div>
            <div className="methodology-stat">
              <span className="methodology-stat-num">{SKIP_CHECKS}</span>
              <span className="methodology-stat-label">SKIP (needs browser)</span>
            </div>
            <div className="methodology-stat">
              <span className="methodology-stat-num">{CATEGORIES.length}</span>
              <span className="methodology-stat-label">Categories</span>
            </div>
            <div className="methodology-stat">
              <span className="methodology-stat-num">{TOTAL_WEIGHT}%</span>
              <span className="methodology-stat-label">Weight total</span>
            </div>
          </div>

          <div className="methodology-toc">
            <strong style={{ color: 'var(--ink)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Contents</strong>
            <ul style={{ marginTop: '0.6rem' }}>
              <li><a href="#scoring-math">Scoring math</a></li>
              <li><a href="#category-weights">Category weights</a></li>
              <li><a href="#grade-bands">Grade bands</a></li>
              <li><a href="#score-distribution">Score distribution</a></li>
              <li><a href="#a11y-floor">Accessibility floor</a></li>
              <li><a href="#anti-slop">Anti-slop deduction</a></li>
              <li><a href="#originality-lift">Originality lift</a></li>
              <li><a href="#hard-fail-ceilings">Hard-fail ceilings</a></li>
              <li><a href="#what-engine-measures">What the engine measures</a></li>
              <li><a href="#what-engine-skips">What the engine skips</a></li>
              {CHECKS_BY_CATEGORY.map((g) => (
                <li key={g.category}><a href={`#${g.category}`}>{CATEGORY_LABELS[g.category]} ({g.weight}%)</a></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="scoring-math">
          <h2 className="doctrine-heading">Scoring math</h2>
          <div className="methodology-prose">
            <p>
              The engine fetches the target URL&rsquo;s HTML and all linked CSS,
              parses <code>:root</code> custom properties, and runs{' '}
              <strong>{CHECKS.length} deterministic checks</strong> across{' '}
              <strong>{CATEGORIES.length} weighted categories</strong>.
              Each check returns <code>PASS</code>, <code>WARN</code>,{' '}
              <code>FAIL</code>, or <code>SKIP</code>. The score is a weighted
              average — not a simple count — then adjusted by three further
              layers: anti-slop deduction, originality lift, and hard-fail
              ceilings.
            </p>
            <p>
              <strong>SKIP</strong> checks are excluded from both numerator and
              denominator (Lighthouse precedent: manual/N/A audits excluded).
              This means a site is not penalized for checks the static engine
              cannot run. The {SKIP_CHECKS} SKIP checks require a browser
              viewport trace, CDP performance trace, or live DOM interaction.
            </p>
          </div>
          <div className="methodology-formula">
            <span className="formula-comment"># Per-check weight = category weight / checks in that category</span><br />
            checkWeight = CATEGORY_WEIGHTS[category] / count(scored checks in category)<br /><br />
            <span className="formula-comment"># Status scoring</span><br />
            PASS  &rarr; 1.0 &times; checkWeight<br />
            WARN  &rarr; 0.5 &times; checkWeight<br />
            FAIL  &rarr; 0<br />
            SKIP  &rarr; excluded (weight &times; 0, not counted in total)<br /><br />
            <span className="formula-comment"># Step 1 — Weighted compliance score</span><br />
            weightedScore = round( &sum;(weightedPoints) / &sum;(weightedTotal) &times; 1000 ) / 10<br /><br />
            <span className="formula-comment"># Step 2 — Anti-slop deduction (12 S-rules, up to -20pts)</span><br />
            score = max(0, weightedScore - slopTotal)<br />
            slopTotal = min(&sum;(per-rule deductions), 20)<br /><br />
            <span className="formula-comment"># Step 3 — Originality lift (7 O-signals, up to +8pts)</span><br />
            score = min(100, score + originalityPoints)<br />
            originalityPoints = min(rawOriginality, 8) &nbsp;<span className="formula-comment"># halved if slop &ge; 12</span><br /><br />
            <span className="formula-comment"># Step 4 — Accessibility floor (a11y &lt; 60% &rarr; cap at 70)</span><br />
            if (a11yPct &lt; 60) score = min(score, 70)<br /><br />
            <span className="formula-comment"># Step 5 — Hard-fail ceilings (6 checks cap at 65/70/75)</span><br />
            if (v06 FAIL) score = min(score, 65) &nbsp;<span className="formula-comment"># contrast</span><br />
            if (v22/v02/v16 FAIL) score = min(score, 70) &nbsp;<span className="formula-comment"># CTA contrast, overflow, rem</span><br />
            if (v24/v25 FAIL) score = min(score, 75) &nbsp;<span className="formula-comment"># touch targets, headings</span><br /><br />
            <span className="formula-comment"># Per-category sub-score (same math, scoped to one category)</span><br />
            categoryScore = round( &sum;(catPoints) / &sum;(catWeight) &times; 1000 ) / 10
          </div>
          <p className="surface-note" style={{ marginTop: '1rem', maxWidth: '66ch' }}>
            The <code>round(&hellip; &times; 1000) / 10</code> pattern produces a
            one-decimal-place score (e.g. 95.2, not 95.2347). The full pipeline
            is five steps: weighted compliance &rarr; anti-slop deduction &rarr;
            originality lift &rarr; accessibility floor &rarr; hard-fail ceilings.
            Steps 2-3 are score modifiers (slop/originality); steps 4-5 are
            protective caps. The per-category sub-scores use only step 1 and are
            shown as the constellation breakdown on the leaderboard and score pages.
          </p>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="category-weights">
          <h2 className="doctrine-heading">Category weights</h2>
          <div className="methodology-prose">
            <p>
              Weights follow the contract&rsquo;s section emphasis — the contract
              <em>is</em> the scoring basis. Cadence (typography) carries the
              highest weight at 18% because it has the most checks (11) and
              typography discipline is the loudest craft signal. Accessibility
              carries 15% and the a11y floor. Semantic/identity, motion, and
              tokens follow. Performance and responsive are lowest-weighted
              because their checks are SKIP in the static engine.
            </p>
          </div>
          <table className="weight-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="wt-num">Weight</th>
                <th>Checks</th>
                <th>Scored</th>
              </tr>
            </thead>
            <tbody>
              {CHECKS_BY_CATEGORY.map((g) => (
                <tr key={g.category}>
                  <td className="wt-name">
                    <span className="weight-bar" style={{ width: `${g.weight * 3}px` }} />
                    {CATEGORY_LABELS[g.category]}
                  </td>
                  <td className="wt-num">{g.weight}%</td>
                  <td style={{ color: 'var(--muted-dim)' }}>{g.checks.length}</td>
                  <td className="wt-num" style={{ color: g.checks.filter(c => !c.skipReason).length > 0 ? 'var(--ink)' : 'var(--muted-dim)' }}>
                    {g.checks.filter(c => !c.skipReason).length}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                <td className="wt-name">Total</td>
                <td className="wt-num">{TOTAL_WEIGHT}%</td>
                <td style={{ color: 'var(--muted-dim)' }}>{CHECKS.length}</td>
                <td className="wt-num">{SCORED_CHECKS}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="grade-bands">
          <h2 className="doctrine-heading">Grade bands</h2>
          <div className="methodology-prose">
            <p>
              The letter grade is a simple threshold on the numeric score. The
              bands are deliberately demanding — a site must score 90+ to earn
              an A. Most sites land in D or F because the contract requires
              primitives (token systems, reduced-motion blocks, font-synthesis
              rules) that most sites do not ship.
            </p>
          </div>
          <div className="grade-bands">
            {GRADE_BANDS.map((band) => (
              <div key={band.grade} className="grade-band">
                <span className="grade-band-letter" style={{ color: band.color, borderColor: band.color }}>{band.grade}</span>
                <span className="grade-band-range">&ge; {band.min}</span>
                <span className="grade-band-desc">{band.description}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="score-distribution">
          <h2 className="doctrine-heading">Score distribution</h2>
          <div className="methodology-prose">
            <p>
              The histogram below shows the grade distribution across all{' '}
              <strong>{SCORED_TOTAL} sites</strong> on the{' '}
              <Link href="/leaderboard" style={{ color: 'var(--signal-light)', borderBottom: '1px solid var(--signal-dim)' }}>leaderboard</Link>.
              The contract is deliberately demanding — most sites land in D or F because
              they do not ship the contract primitives (token systems, reduced-motion
              blocks, font-synthesis rules) that the engine checks for at <code>:root</code>.
            </p>
          </div>
          <div className="score-dist-histogram">
            {HIST_BARS.map((bar) => (
              <div key={bar.grade} className="score-dist-col">
                <span className="score-dist-bar-count">{bar.count}</span>
                <div className="score-dist-bar-wrap">
                  <div
                    className="score-dist-bar"
                    style={{
                      height: `${(bar.count / MAX_GRADE_COUNT) * 100}%`,
                      background: bar.bg,
                      borderColor: bar.color,
                    }}
                  />
                </div>
                <div className="score-dist-label">
                  <span className="score-dist-grade" style={{ color: bar.color }}>{bar.grade}</span>
                  <span className="score-dist-range">&ge; {bar.min}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="score-dist-headline">
            Of {SCORED_TOTAL} sites scored,{' '}
            <strong>{GRADE_COUNTS.A} earned an A</strong>,{' '}
            {GRADE_COUNTS.B} earned a B, {GRADE_COUNTS.C} earned a C,{' '}
            {GRADE_COUNTS.D} earned a D, and {GRADE_COUNTS.F} earned an F.
            The mean score is <strong>{MEAN_SCORE}%</strong> with a range of{' '}
            {MIN_SCORE}%&ndash;{MAX_SCORE}%. The median site lands in D — the
            contract requires primitives that most sites do not ship.
          </p>
          <div className="methodology-grid" style={{ marginTop: '1.5rem' }}>
            <div className="methodology-stat">
              <span className="methodology-stat-num">{MEAN_SCORE}%</span>
              <span className="methodology-stat-label">Mean score</span>
            </div>
            <div className="methodology-stat">
              <span className="methodology-stat-num">{MIN_SCORE}&ndash;{MAX_SCORE}</span>
              <span className="methodology-stat-label">Score range</span>
            </div>
            <div className="methodology-stat">
              <span className="methodology-stat-num">{SCORED_TOTAL}</span>
              <span className="methodology-stat-label">Sites scored</span>
            </div>
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="a11y-floor">
          <h2 className="doctrine-heading">Accessibility floor</h2>
          <div className="methodology-callout">
            <strong>The a11y floor:</strong> if the accessibility category scores
            below 60%, the overall grade is capped at C (70) — no matter how high
            the weighted score is. This prevents &ldquo;perfect tokens, zero a11y
            = A&rdquo; dishonesty. A site with beautiful typography and no contrast
            or touch targets cannot earn above C.
          </div>
          <div className="methodology-prose">
            <p>
              The floor is a softer version of the DSAF enterprise-grade precedent
              (DSAF enforces A8 Accessibility &ge;75%). Designesy applies 60% as
              the floor — strict enough to prevent the &ldquo;all tokens, no
              a11y&rdquo; failure mode, lenient enough that a site with 3 of 6
              accessibility checks passing is not auto-capped. The cap only
              triggers if the weighted score <em>is above 70</em> — if the score
              is already below 70, the floor does not change it.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="anti-slop">
          <h2 className="doctrine-heading">Anti-slop deduction</h2>
          <div className="methodology-prose">
            <p>
              The compliance checks above verify that a site ships the contract
              primitives. But a site can meet every contract rule and still be
              generic — the &ldquo;compliant but slop&rdquo; failure. The engine
              runs a second pass: <strong>12 anti-slop rules (S1&ndash;S12)</strong>{' '}
              that detect the most recognizable AI-template design patterns.
              Each detected pattern subtracts points directly from the weighted
              score — not from the check scores. This makes taste part of the
              number, not just a human judgment.
            </p>
            <p>
              <strong>Per-rule cap: 5 points.</strong> Total slop deduction
              capped at <strong>20 points</strong>. The deduction is flat (not
              percentage-scaled) so it cannot be gamed by making the site more
              minimal. Provenance: Impeccable, solodesign, Web AI Slop, and
              independent research &mdash; wave 1 covers the 12 highest-signal
              patterns.
            </p>
          </div>
          <div className="methodology-callout" style={{ background: 'var(--surface-soft)', borderColor: 'var(--line)' }}>
            <strong>S1&ndash;S12 patterns:</strong> overused fonts (Inter/Roboto/etc),
            full-page gradients, purple/violet gradient overlays, gradient text,
            Tailwind default palette hexes, repeated identical cards, emoji as
            icons, &ldquo;AI-powered&rdquo; pill badges, Lorem ipsum, single
            font family, marketing buzzwords, placeholder/stock image URLs.
            The full remediation text for each rule lives in the engine source.
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="originality-lift">
          <h2 className="doctrine-heading">Originality lift</h2>
          <div className="methodology-prose">
            <p>
              Symmetric to the slop deduction: <strong>7 originality signals
              (O1&ndash;O7)</strong> add points for positive craft detectable
              from CSS/HTML text alone. A compliant-but-generic site earns no
              lift; a bespoke site is rewarded. Cap: <strong>+8 points</strong>{' '}
              so originality nudges rather than dominates the weighted compliance
              base. Score is clamped to 100.
            </p>
            <p>
              <strong>Slop gate:</strong> if a site has heavy slop (&ge;12
              deduction points), the originality lift is halved. Heavily-sloppy
              sites that also show originality signals are usually
              heavily-customized templates &mdash; the &ldquo;originality&rdquo;
              is framework-driven, not authorial.
            </p>
          </div>
          <div className="methodology-callout" style={{ background: 'var(--surface-soft)', borderColor: 'var(--line)' }}>
            <strong>O1&ndash;O7 signals:</strong> bespoke easing curves (incl.
            spring/overshoot), modern layout primitives (clamp/container
            queries/subgrid), typographic scale discipline, distinctive color
            system, custom font stack, motion-system depth, semantic design
            tokens. Each signal contributes 1&ndash;5 points based on depth.
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="hard-fail-ceilings">
          <h2 className="doctrine-heading">Hard-fail ceilings</h2>
          <div className="methodology-prose">
            <p>
              Certain check failures are severe enough to cap the score
              regardless of other strengths &mdash; a site that FAILs on contrast
              or horizontal overflow cannot be A-grade no matter how good its
              tokens are. These are design-integrity failures, not style
              preferences. Caps are applied <em>after</em> the a11y floor (the
              floor wins over ceilings).
            </p>
          </div>
          <table className="weight-table">
            <thead>
              <tr>
                <th>Check</th>
                <th className="wt-num">Cap</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="wt-name"><code>v06</code> Contrast readable</td>
                <td className="wt-num">65</td>
                <td style={{ color: 'var(--muted)' }}>Text is unreadable for many users &mdash; fundamental legibility failure</td>
              </tr>
              <tr>
                <td className="wt-name"><code>v22</code> CTA contrast</td>
                <td className="wt-num">70</td>
                <td style={{ color: 'var(--muted)' }}>Primary CTA text is hard to read &mdash; the most important interaction</td>
              </tr>
              <tr>
                <td className="wt-name"><code>v02</code> Horizontal overflow</td>
                <td className="wt-num">70</td>
                <td style={{ color: 'var(--muted)' }}>Content is cut off or scrolls sideways on smaller viewports</td>
              </tr>
              <tr>
                <td className="wt-name"><code>v16</code> Rem scale</td>
                <td className="wt-num">70</td>
                <td style={{ color: 'var(--muted)' }}>Root font-size below 16px triggers iOS Safari auto-zoom</td>
              </tr>
              <tr>
                <td className="wt-name"><code>v24</code> Touch targets</td>
                <td className="wt-num">75</td>
                <td style={{ color: 'var(--muted)' }}>Interactive elements below 44px &mdash; inaccessible on touch devices</td>
              </tr>
              <tr>
                <td className="wt-name"><code>v25</code> Heading hierarchy</td>
                <td className="wt-num">75</td>
                <td style={{ color: 'var(--muted)' }}>Multiple h1 or skipped levels &mdash; document outline is broken</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="what-engine-measures">
          <h2 className="doctrine-heading">What the engine measures</h2>
          <div className="methodology-prose">
            <p>
              The engine fetches the target URL, extracts all CSS (inline{' '}
              <code>&lt;style&gt;</code> blocks + linked{' '}
              <code>&lt;link rel=&quot;stylesheet&quot;&gt;</code> files), parses{' '}
              <code>:root</code> custom properties, and runs each check as a regex,
              token-resolution, or spec-linter test. It does <strong>not</strong> render the
              page, execute JavaScript, or interact with the DOM. This means:
            </p>
            <p>
              <strong>It measures what is shipped, not what is documented.</strong>{' '}
              A design-system site can publish a rich token taxonomy in Storybook
              and still score low if the marketing surface doesn&rsquo;t expose
              those tokens at <code>:root</code>. That gap — between documented
              and shipped — is exactly what the leaderboard surfaces.
            </p>
            <p>
              <strong>It is deterministic.</strong> No LLM, no human judgment, no
              roast. The same URL always produces the same score (within the
              24-hour cache window). If a site changes its CSS, the score changes
              on the next run.
            </p>
          </div>
        </section>

        <section className="doctrine-section fade-up methodology-section" id="what-engine-skips">
          <h2 className="doctrine-heading">What the engine skips</h2>
          <div className="methodology-prose">
            <p>
              {SKIP_CHECKS} checks are marked <code>SKIP</code> because they
              require a capability the static engine does not have:
            </p>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem', maxWidth: '66ch' }}>
            {CHECKS.filter((c) => c.skipReason).map((c) => (
              <li key={c.id} style={{ padding: '0.625rem 0', borderBottom: '1px solid var(--line-faint)' }}>
                <span className="check-id">{c.id}</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--ink)', marginLeft: '0.5rem' }}>{c.item}</span>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.3rem', lineHeight: 1.5 }}>
                  {c.skipReason}
                </div>
              </li>
            ))}
          </ul>
          <p className="surface-note" style={{ maxWidth: '66ch' }}>
            SKIP checks are excluded from both numerator and denominator — a site
            is not penalized for them. Future versions of the engine may run
            these via a Playwright/CDP trace integration.
          </p>
        </section>

        {CHECKS_BY_CATEGORY.map((group) => (
          <section
            key={group.category}
            className="doctrine-section fade-up methodology-section"
            id={group.category}
          >
            <div className="check-group-header">
              <h2 className="check-group-name">{CATEGORY_LABELS[group.category]}</h2>
              <span className="check-group-weight">
                {group.weight}% weight · {group.checks.length} check{group.checks.length !== 1 ? 's' : ''} ·{' '}
                {group.checks.filter((c) => !c.skipReason).length} scored
              </span>
            </div>
            <p className="check-group-desc">{CATEGORY_DESCRIPTIONS[group.category]}</p>
            <div className="check-group">
              {group.checks.length === 0 && (
                <div className="check-row">
                  <div className="check-row-head">
                    <span className="check-item" style={{ color: 'var(--muted-dim)' }}>
                      No checks assigned to this category in the current engine.
                    </span>
                  </div>
                </div>
              )}
              {group.checks.map((check) => (
                <div key={check.id} className="check-row">
                  <div className="check-row-head">
                    <span className="check-id">{check.id}</span>
                    <span className="check-item">{check.item}</span>
                  </div>
                  <p className="check-how">{check.how}</p>
                  {check.skipReason && (
                    <span className="check-skip">SKIP — {check.skipReason}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="doctrine-section fade-up methodology-section">
          <h2 className="doctrine-heading">Data exports</h2>
          <div className="methodology-prose">
            <p>
              The leaderboard data is available in two machine-readable formats
              for agents and researchers:
            </p>
            <p>
              <Link href="/api/leaderboard" style={{ color: 'var(--signal-light)', borderBottom: '1px solid var(--signal-dim)' }}>
                <code style={{ background: 'var(--surface)', padding: '0.1rem 0.35rem', borderRadius: '3px', border: '1px solid var(--line-faint)' }}>/api/leaderboard</code>
              </Link>
              {' '}&mdash; JSON with full per-site categoryScores. CORS-enabled.<br />
              <Link href="/api/leaderboard.csv" style={{ color: 'var(--signal-light)', borderBottom: '1px solid var(--signal-dim)' }}>
                <code style={{ background: 'var(--surface)', padding: '0.1rem 0.35rem', borderRadius: '3px', border: '1px solid var(--line-faint)' }}>/api/leaderboard.csv</code>
              </Link>
              {' '}&mdash; RFC 4180 CSV with a header row. Spreadsheet-friendly.
            </p>
          </div>
        </section>

        <div className="status-note methodology-section" style={{ maxWidth: 'var(--maxw, 1080px)', margin: '0 auto', padding: '0 1.5rem 2rem' }}>
          Methodology v2 · {CHECKS.length} checks · {CATEGORIES.length} categories ·{' '}
          12 slop rules (S1&ndash;S12, up to -20pts) · 7 originality signals
          (O1&ndash;O7, up to +8pts) · 6 hard-fail ceilings · deterministic, no
          LLM · engine source at{' '}
          <Link href="/api/score" style={{ color: 'var(--muted)' }}>/api/score</Link> ·{' '}
          contract at{' '}
          <Link href="/contracts/design-system.json" style={{ color: 'var(--muted)' }}>/contracts/design-system.json</Link>
        </div>
      </main>

      <Footer />
    </>
  );
}