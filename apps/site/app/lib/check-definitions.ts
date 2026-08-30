/**
 * Single source of truth for the verification engine's check registry.
 *
 * Extracted from app/api/score/checks/route.ts (the read-only metadata
 * endpoint) via lib/check-definitions.ts — both import from here, so the
 * hero "checks" stat, the /api/score/checks endpoint, and any copy that
 * says "N checks" can never drift from the engine again.
 *
 * Reordering rule: checksWithWeight derives per-category weights from the
 * auto/manual split, and the engine's t-checks (api/mcp route tokens tool)
 * index the tokens-contract checks positionally — keep IDs as the contract.
 */

export interface CheckDefinition {
  id: string;
  item: string;
  category: string;
  type: 'auto' | 'manual';
  threshold: string;
  pass: string;
  fail: string;
  warn: string;
  ceiling: number | null;
  weight: number;
}

// ── Category weights (mirrors api/score route.ts CATEGORY_WEIGHTS) ───────────
// Relative weights — they sum to 117, not 100. The scoring loop normalizes:
// weightedScore = Σ(weightedPoints) / Σ(weightedTotal) × 100.
export const CATEGORY_WEIGHTS: Record<string, number> = {
  cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9,
  takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3,
  security: 5, spec: 4, copywriting: 8,
};

const CHECK_DEFINITIONS: Omit<CheckDefinition, 'weight'>[] = [
  // ── Tokens (weight 9) ──
  { id: 'v01', item: 'Token values match live site :root foundation', category: 'tokens', type: 'auto', threshold: '--paper token declared in :root', pass: '--paper resolves to a value', fail: '--paper not declared in :root', warn: 'n/a', ceiling: null },
  { id: 'v29', item: 'Token architecture: primitive → semantic → component layers', category: 'tokens', type: 'auto', threshold: '3-layer token stack (primitive → semantic → component)', pass: 'token values reference var(--...) in a layered architecture', fail: 'flat token set — no primitive→semantic layering', warn: 'partial layering detected', ceiling: null },

  // ── Responsive (weight 3) ──
  { id: 'v02', item: 'Routes render without horizontal overflow at 375px, 720px, 860px, 1080px+', category: 'responsive', type: 'manual', threshold: 'no overflow-x at 375px, 720px, 860px, 1080px+', pass: 'no horizontal overflow at any breakpoint', fail: 'content overflows horizontally', warn: 'n/a', ceiling: 70 },

  // ── Interaction (weight 6) ──
  { id: 'v03', item: 'Primary interactive elements show focus-visible rings', category: 'interaction', type: 'auto', threshold: ':focus-visible declared in CSS', pass: ':focus-visible rules present', fail: 'no :focus-visible rules', warn: 'n/a', ceiling: null },

  // ── Poise (weight 7) ──
  { id: 'v04', item: 'Sound toggle flips aria-pressed and applies the audio preference', category: 'poise', type: 'manual', threshold: 'aria-pressed toggles + data-audio attribute applied', pass: 'toggle flips aria-pressed and applies audio state', fail: 'no sound toggle or toggle not wired', warn: 'n/a', ceiling: null },
  { id: 'v08', item: 'Poise interaction rules match live /labs/poise and contract.interaction', category: 'poise', type: 'auto', threshold: 'poise interaction CSS rules present (no hover-only reveals, no disabled nav buttons)', pass: 'static poise rules verified (interaction-feel half requires browser)', fail: 'n/a (WARN only)', warn: 'missing poise interaction rules', ceiling: null },
  { id: 'v09', item: 'Poise keyboard-path verification remains published and current', category: 'poise', type: 'auto', threshold: ':focus-visible with visible style, focus ring, tabindex, aria attributes', pass: 'keyboard affordances present in CSS+HTML', fail: 'focus stripped without replacement', warn: 'partial keyboard affordances', ceiling: null },
  { id: 'v10', item: 'Takt interface-feel rules match live CSS and contract.takt', category: 'takt', type: 'auto', threshold: 'takt feel rules present in CSS', pass: 'takt rules verified in CSS', fail: 'n/a (WARN only)', warn: 'missing takt feel rules', ceiling: null },

  // ── Motion (weight 10) ──
  { id: 'v05', item: 'prefers-reduced-motion disables entrance and wordmark breath', category: 'motion', type: 'auto', threshold: '@media (prefers-reduced-motion) declared', pass: 'prefers-reduced-motion media query present', fail: 'n/a (WARN only)', warn: 'missing prefers-reduced-motion media query', ceiling: null },
  { id: 'v11', item: 'No transition:all in the live stylesheet', category: 'motion', type: 'auto', threshold: 'no transition:all in CSS', pass: 'no transition:all found', fail: 'transition:all found', warn: 'n/a', ceiling: null },
  { id: 'v12', item: 'will-change restricted to transform and opacity only', category: 'motion', type: 'auto', threshold: 'will-change only on transform/opacity', pass: 'will-change restricted cleanly', fail: 'n/a (WARN only)', warn: 'will-change on non-transform/opacity property', ceiling: null },
  { id: 'v23', item: 'Duration tokens --duration-quick through --duration-slow present in :root', category: 'motion', type: 'auto', threshold: '5 duration tokens (--duration-quick through --duration-slow)', pass: 'all 5 duration tokens present', fail: 'fewer than 3/5 duration tokens', warn: '3-4/5 present', ceiling: null },

  // ── Takt (weight 8) ──
  { id: 'v13', item: 'Press scale 0.96 on cells, 0.985 on cards/rows — both above 0.95 floor', category: 'takt', type: 'auto', threshold: 'scale() < 1 in :active context, value ≥ 0.95', pass: 'press-scale(s) found at 0.95+', fail: 'scale below 0.95 in :active context', warn: 'no press-scale found or only scale(0) initial states', ceiling: null },

  // ── Cadence (weight 18) ──
  { id: 'v14', item: 'Cadence typography rules match live CSS and contract.cadence', category: 'cadence', type: 'auto', threshold: 'contract cadence rules present in CSS', pass: 'all Cadence rules present', fail: 'n/a (WARN only)', warn: 'missing cadence rules', ceiling: null },
  { id: 'v15', item: 'Font smoothing: antialiased + grayscale on :root confirmed', category: 'cadence', type: 'auto', threshold: '-webkit-font-smoothing: antialiased + -moz-osx-font-smoothing: grayscale', pass: 'both smoothing properties present on :root', fail: 'n/a (WARN only)', warn: 'missing one or both smoothing properties', ceiling: null },
  { id: 'v16', item: 'Rem-based scale: all text sizes in rem, root at 16px confirmed', category: 'cadence', type: 'auto', threshold: 'root font-size ≥ 16px, text in rem', pass: 'root ≥ 16px and rem-based sizing', fail: 'root < 16px', warn: 'root ≥ 16px but some px sizing', ceiling: 70 },
  { id: 'v17', item: 'Line-height by role: headings 1.08, body 1.55 confirmed', category: 'cadence', type: 'auto', threshold: 'headings ~1.08, body ~1.55', pass: 'both heading and body line-heights match', fail: 'n/a (WARN only)', warn: 'missing or mismatched line-heights', ceiling: null },
  { id: 'v18', item: 'text-wrap: balance + pretty both present in live CSS', category: 'cadence', type: 'auto', threshold: 'text-wrap: balance AND text-wrap: pretty', pass: 'both text-wrap values present', fail: 'n/a (WARN only)', warn: 'missing one text-wrap value', ceiling: null },
  { id: 'v19', item: 'tabular-nums: 8 instances across the live CSS', category: 'cadence', type: 'auto', threshold: '8+ font-variant-numeric: tabular-nums instances', pass: '8+ instances found', fail: 'n/a (WARN only)', warn: 'fewer than 8 instances', ceiling: null },
  { id: 'v20', item: '::selection styled with var(--signal) — not browser default', category: 'cadence', type: 'auto', threshold: '::selection with custom color or var(--signal)', pass: '::selection uses --signal or custom color', fail: 'n/a (WARN only)', warn: 'no ::selection or no color set', ceiling: null },
  { id: 'v26', item: 'Font family count ≤3 (body + heading + mono)', category: 'cadence', type: 'auto', threshold: '≤3 unique non-generic font families', pass: '≤3 font families', fail: '>3 font families', warn: 'n/a', ceiling: null },
  { id: 'v28', item: 'Reading width 45-75ch on prose containers', category: 'cadence', type: 'auto', threshold: 'max-width 45-75ch on prose elements', pass: 'reading width within 45-75ch', fail: 'n/a (WARN only)', warn: 'reading width outside 45-75ch', ceiling: null },
  { id: 'x01', item: 'font-synthesis: none set (Cadence resolved tension)', category: 'cadence', type: 'auto', threshold: 'font-synthesis: none', pass: 'font-synthesis: none declared', fail: 'n/a (WARN only)', warn: 'font-synthesis missing or not none', ceiling: null },
  { id: 'x02', item: 'text-underline-position: from-font set (Cadence resolved tension)', category: 'cadence', type: 'auto', threshold: 'text-underline-position: from-font', pass: 'from-font set', fail: 'n/a (WARN only)', warn: 'not set', ceiling: null },
  { id: 'x03', item: 'text-decoration-skip-ink: auto set', category: 'cadence', type: 'auto', threshold: 'text-decoration-skip-ink: auto', pass: 'auto set', fail: 'n/a (WARN only)', warn: 'not set', ceiling: null },

  // ── Performance (weight 6) ──
  { id: 'v21', item: 'Core Web Vitals plausible: LCP < 2.5s, INP < 200ms, CLS < 0.1', category: 'performance', type: 'manual', threshold: 'LCP < 2.5s, INP < 200ms, CLS < 0.1', pass: 'all three Core Web Vitals in range', fail: 'any CWV outside threshold', warn: 'n/a', ceiling: null },

  // ── Accessibility (weight 15) ──
  { id: 'v06', item: 'Contrast remains readable for ink, muted, and accent on paper (WCAG 2.1 + APCA)', category: 'accessibility', type: 'auto', threshold: 'WCAG AA 4.5:1 (body), 3:1 (large text); APCA Lc 60/75/90', pass: 'all tokens ≥ 4.5:1 against --paper', fail: 'any token below 3:1', warn: 'token below 4.5:1 but above 3:1', ceiling: 65 },
  { id: 'v22', item: 'Primary button text passes WCAG AA contrast against --signal fill', category: 'accessibility', type: 'auto', threshold: 'WCAG AA 4.5:1 for button text on --signal', pass: '≥ 4.5:1 against --signal', fail: 'below 3:1', warn: '3:1-4.5:1 (large-text pass, body fail)', ceiling: 70 },
  { id: 'v24', item: 'Touch targets ≥44px on interactive elements (WCAG 2.5.8)', category: 'accessibility', type: 'auto', threshold: '44px minimum on interactive elements', pass: 'touch targets ≥ 44px', fail: 'touch targets below 44px', warn: 'n/a', ceiling: 75 },
  { id: 'v25', item: 'Heading hierarchy: single h1, no skipped levels', category: 'accessibility', type: 'auto', threshold: '1 h1, no skipped heading levels', pass: 'single h1, no gaps', fail: 'multiple h1s or skipped levels', warn: 'n/a', ceiling: 75 },
  { id: 'v27', item: 'Input font-size ≥16px (prevents iOS Safari auto-zoom)', category: 'accessibility', type: 'auto', threshold: 'input font-size ≥ 16px', pass: 'inputs ≥ 16px', fail: 'inputs < 16px', warn: 'n/a', ceiling: null },
  { id: 'v35', item: 'Forced-colors readiness: @media (forced-colors: active) block present', category: 'accessibility', type: 'auto', threshold: '@media (forced-colors: active) + forced-color-adjust', pass: 'forced-colors media query present', fail: 'n/a (WARN only)', warn: 'no forced-colors media query', ceiling: null },

  // ── Identity (weight 6) ──
  { id: 'v07', item: 'Semantic HTML foundation: single h1, title, meta description, landmark', category: 'identity', type: 'auto', threshold: 'h1, title, meta description, landmark element', pass: 'all semantic signals present', fail: '3+ missing signals', warn: '1-2 missing', ceiling: null },
  { id: 'v34', item: 'AI-Disclosure Readiness (EU AI Act Art 50, effective 2026-08-02)', category: 'identity', type: 'auto', threshold: 'disclosure at first AI interaction if AI surface present', pass: 'no AI surface or disclosure present', fail: 'AI surface detected but no disclosure', warn: 'ambiguous AI surface — manual review', ceiling: null },

  // ── Security (weight 5) ──
  { id: 'v36', item: 'Unicode Security: no UTS #39 confusable characters in token names or CSS identifiers', category: 'security', type: 'auto', threshold: 'no confusable Unicode in CSS identifiers', pass: 'no confusables detected', fail: 'confusable characters found', warn: 'n/a', ceiling: null },

  // ── Copywriting (weight 8) ──
  { id: 'v38', item: 'Button text is a verb phrase or recognized command — not a bare noun', category: 'copywriting', type: 'auto', threshold: 'buttons start with a verb or recognized command', pass: 'all buttons start with verb/command', fail: 'n/a (WARN only)', warn: 'bare noun button text', ceiling: null },
  { id: 'v39', item: 'No trailing period on button text, labels, or tab text', category: 'copywriting', type: 'auto', threshold: 'no trailing "." on buttons, labels, tabs', pass: 'no trailing periods', fail: 'n/a (WARN only)', warn: 'trailing period found', ceiling: null },
  { id: 'v40', item: 'Link text is descriptive — not bare "click here", "learn more", "here"', category: 'copywriting', type: 'auto', threshold: 'descriptive link text', pass: 'all links descriptive', fail: 'n/a (WARN only)', warn: 'generic link text found', ceiling: null },
  { id: 'v41', item: 'No ALL CAPS UI text except eyebrow labels', category: 'copywriting', type: 'auto', threshold: 'no ALL CAPS outside eyebrow labels', pass: 'no ALL CAPS outside eyebrows', fail: 'n/a (WARN only)', warn: 'ALL CAPS in UI text', ceiling: null },

  // ── Spec (weight 4) ──
  { id: 'v37', item: 'DESIGN.md spec-layer validation (Google @google/design.md lint)', category: 'spec', type: 'auto', threshold: 'DESIGN.md present and valid per @google/design.md linter', pass: 'DESIGN.md present and valid', fail: 'DESIGN.md missing or invalid', warn: 'DESIGN.md present but lint warnings', ceiling: null },
];

// ── Compute per-check weights ───────────────────────────────────────────────
// Weight = CATEGORY_WEIGHTS[category] / (scored checks in that category).
// Manual checks have weight 0.
const categoryCounts: Record<string, number> = {};
for (const c of CHECK_DEFINITIONS) {
  if (c.type === 'auto') {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  }
}

export const CHECKS: CheckDefinition[] = CHECK_DEFINITIONS.map((c) => {
  const catWeight = CATEGORY_WEIGHTS[c.category] || 5;
  const weight = c.type === 'auto' ? catWeight / (categoryCounts[c.category] || 1) : 0;
  return { ...c, weight: Math.round(weight * 1000) / 1000 };
});

export const ENGINE_CHECK_COUNT = CHECKS.length;