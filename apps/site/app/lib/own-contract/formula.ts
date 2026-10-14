// The published own-contract formula (engine spec 10.5 rule 3; owner decisions
// D1 to D3, D6, D10): the fourteen fidelity checks with their categories,
// thresholds and evidence minimums, the weights and ceilings, the baseline
// groups, and the null rules. GET /api/score/checks/own-contract serves
// ownContractFormula(); the checks and the scorer read the same constants, so
// the page, the API and the engine cannot state different rules.
//
// Versioned and dated from its first release (brand D76): any later change to
// a threshold, weight, title or rule here bumps FORMULA_VERSION, dates it, and
// moves ENGINE_VERSION when a verdict can move.

import { ENGINE_VERSION } from '../check-definitions';
import { BASELINE_ANY_FAIL_CAP, BASELINE_FLOOR, BASELINE_GROUPS, BASELINE_IDS, BASELINE_STATIC_MAX, baselineCeilings, baselineTitle } from './baseline';

export const FORMULA_VERSION = '1.0.0';
export const FORMULA_DATE = '2026-10-14';

/** Share thresholds (engine spec 6.2; calibration defaults, lesser decision L6). */
export const SHARE_PASS_AT = 0.9;
export const SHARE_WARN_AT = 0.7;
/** f13 and f14 use their own bars (engine spec 6.3). */
export const ALIAS_PASS_AT = 0.8;
export const TOKEN_USE_PASS_AT = 0.8;
export const TOKEN_USE_WARN_AT = 0.5;
/** WCAG 2.x bands f09 and f10 use (the v06 thresholds). */
export const CONTRAST_PASS = 4.5;
export const CONTRAST_LARGE_PASS = 3;
export const CONTRAST_FAIL_BELOW = 3;
/** WCAG 2.5.8 AA target floor, raised by a larger declared interactive size (lesser decision L2). */
export const TARGET_FLOOR_PX = 24;
/** Fewer scored fidelity checks than this: fidelity has no score (owner decision D2). */
export const MIN_SCORED_CHECKS = 3;

/** Fidelity category weights (owner decision D1). */
export const FIDELITY_WEIGHTS: Record<string, number> = {
  contrast: 20, typography: 18, color: 16, tokens: 14, spacing: 12, shape: 8, motion: 6, targets: 6,
};

/** Fidelity ceilings, applied after scoring (owner decision D1). */
export const FIDELITY_CEILINGS: Array<{ check: string; cap: number }> = [
  { check: 'f09', cap: 65 },
  { check: 'f10', cap: 70 },
];

export interface FidelityDef {
  id: string;
  title: string;
  category: string;
  derivedFrom: string[];
  reads: { 'design.md': string[]; dtcg: string[] };
  /** Evidence the check needs before it can score (below it: SKIP not_located). */
  minimum: string;
  criterion: string;
  fix: string;
}

export const FIDELITY_DEFS: FidelityDef[] = [
  { id: 'f01', title: 'Mapped tokens ship their declared values', category: 'tokens', derivedFrom: ['v01'],
    reads: { 'design.md': ['tokens located by map or name'], dtcg: ['tokens located by map or name'] },
    minimum: '3 tokens located by map or name',
    criterion: 'Derived from v01 · passes when every token located by map or name ships its declared value, warns from 90% · needs 3 tokens located by map or name',
    fix: 'Set each CSS variable to the value your contract declares, or update the contract.' },
  { id: 'f02', title: 'Shipped colors are in your palette', category: 'color', derivedFrom: ['d03', 'd05'],
    reads: { 'design.md': ['colors.*'], dtcg: ['color tokens'] },
    minimum: '3 distinct shipped colors',
    criterion: 'Derived from d03 and d05 · passes at 90% of shipped colors in your palette, warns from 70% · needs 3 shipped colors',
    fix: 'Replace each shipped value with the declared token.' },
  { id: 'f03', title: 'Shipped font sizes are on your type scale', category: 'typography', derivedFrom: ['v16'],
    reads: { 'design.md': ['typography.*.fontSize'], dtcg: ['typography fontSize', 'dimension tokens with the fontSize role'] },
    minimum: '3 distinct shipped font sizes',
    criterion: 'Derived from v16 · passes at 90% of shipped sizes on your scale, warns from 70% · needs 3 shipped sizes',
    fix: 'Use a declared size, or add the size to your type scale.' },
  { id: 'f04', title: 'Shipped font families are in your contract', category: 'typography', derivedFrom: ['v26'],
    reads: { 'design.md': ['typography.*.fontFamily'], dtcg: ['fontFamily tokens', 'typography fontFamily'] },
    minimum: '1 shipped face',
    criterion: 'Derived from v26 · warns with 1 undeclared face, fails with 2 · needs 1 shipped face',
    fix: 'Remove the extra family, or declare it in your contract.' },
  { id: 'f05', title: 'Shipped line heights are in your contract', category: 'typography', derivedFrom: ['v17'],
    reads: { 'design.md': ['typography.*.lineHeight'], dtcg: ['typography lineHeight'] },
    minimum: '3 distinct shipped line heights',
    criterion: 'Derived from v17 · passes at 90% declared, warns from 70% · needs 3 shipped line heights',
    fix: 'Use a declared line height for each text style.' },
  { id: 'f06', title: 'Declared font features ship', category: 'typography', derivedFrom: ['v19'],
    reads: { 'design.md': ['typography.*.fontFeature'], dtcg: ['$extensions org.designesy features'] },
    minimum: 'none',
    criterion: 'Derived from v19 · warns when a declared feature is missing and never fails',
    fix: 'Add font-variant-numeric: tabular-nums (or the declared feature) where the style applies.' },
  { id: 'f07', title: 'Shipped corner radii are on your radius scale', category: 'shape', derivedFrom: ['d07'],
    reads: { 'design.md': ['rounded.*'], dtcg: ['dimension tokens with the radius role'] },
    minimum: '3 distinct shipped radii',
    criterion: 'Derived from d07 · passes at 90% on your radius scale, warns from 70% · needs 3 shipped radii',
    fix: 'Use a declared radius token.' },
  { id: 'f08', title: 'Shipped spacing is on your spacing scale', category: 'spacing', derivedFrom: ['d04'],
    reads: { 'design.md': ['spacing.*'], dtcg: ['dimension tokens with the spacing role'] },
    minimum: '5 distinct shipped spacing values',
    criterion: 'Derived from d04 · passes at 90% on your spacing scale, warns from 70% · needs 5 shipped spacing values',
    fix: 'Use a declared spacing token for padding, margin and gap.' },
  { id: 'f09', title: 'Declared text and background pairs meet contrast on shipped values', category: 'contrast', derivedFrom: ['v06'],
    reads: { 'design.md': ['components.*.textColor', 'components.*.backgroundColor'], dtcg: ['$extensions org.designesy pairs'] },
    minimum: 'both colors of a pair located',
    criterion: 'Derived from v06 · passes at 4.5 to 1, or 3 to 1 for large text; other text from 3 to 1 up to 4.5 to 1 is a warning, not a pass · fails below 3 to 1 and caps fidelity at 65',
    fix: 'Darken or lighten one color of the pair in your contract and in the shipped CSS until the pair reaches {need} to 1.' },
  { id: 'f10', title: 'Your primary action pair meets contrast on shipped values', category: 'contrast', derivedFrom: ['v22'],
    reads: { 'design.md': ['components.button-primary'], dtcg: ['$extensions org.designesy pairs (role primary-action)'] },
    minimum: 'both colors of the pair located',
    criterion: 'Derived from v22 · passes at 4.5 to 1, or 3 to 1 for large text; other text from 3 to 1 up to 4.5 to 1 is a warning, not a pass · fails below 3 to 1 and caps fidelity at 70',
    fix: 'Darken or lighten one color of the pair in your contract and in the shipped CSS until the pair reaches {need} to 1.' },
  { id: 'f11', title: 'Shipped durations and easings are in your contract', category: 'motion', derivedFrom: ['v23'],
    reads: { 'design.md': ['not in the DESIGN.md format'], dtcg: ['duration tokens', 'cubicBezier tokens', 'transition tokens'] },
    minimum: '2 distinct shipped durations',
    criterion: 'Derived from v23 · passes at 90% of shipped durations and curves declared, warns from 70%; the worse share decides · needs 2 shipped durations',
    fix: 'Use a declared duration and easing token.' },
  { id: 'f12', title: 'Interactive targets meet your declared minimum size', category: 'targets', derivedFrom: ['v24'],
    reads: { 'design.md': ['components.*.height', 'components.*.size'], dtcg: ['dimension tokens with the size role'] },
    minimum: '1 explicit min-height or min-width on an interactive selector',
    criterion: 'Derived from v24 · fails under 24px (WCAG 2.5.8), warns under your smallest declared interactive size when that is larger · explicit sizes only',
    fix: 'Raise min-height and min-width to at least 24px.' },
  { id: 'f13', title: 'Declared aliases ship as variable references', category: 'tokens', derivedFrom: ['v29'],
    reads: { 'design.md': ['aliases in your contract'], dtcg: ['aliases in your contract'] },
    minimum: '2 aliases with both ends located by map or name',
    criterion: 'Derived from v29 · passes when 80% of aliases ship as var() references, else warns; never fails · needs 2 evaluable aliases',
    fix: 'Write the alias as var(--{target}) so it follows the source token.' },
  { id: 'f14', title: "Styles use your contract's tokens", category: 'tokens', derivedFrom: ['token-vs-raw ratio'],
    reads: { 'design.md': ['all located tokens'], dtcg: ['all located tokens'] },
    minimum: '10 measurable declarations and 3 tokens located by map or name',
    criterion: 'Passes when 80% of color, type, radius and spacing declarations use a token, warns from 50% · needs 10 declarations and 3 tokens located by name',
    fix: 'Replace raw values with var() references to your tokens.' },
];

export const FIDELITY_IDS = FIDELITY_DEFS.map((d) => d.id);
export const FIDELITY_CATEGORY: Record<string, string> = Object.fromEntries(FIDELITY_DEFS.map((d) => [d.id, d.category]));
export const FIDELITY_TITLE: Record<string, string> = Object.fromEntries(FIDELITY_DEFS.map((d) => [d.id, d.title]));

export const NULL_RULES = [
  { code: 'site_unreachable', when: 'the page could not be fetched', fidelity: 'no score', baseline: 'no score' },
  { code: 'empty_shell', when: 'under 280 characters of visible text, an empty mount node (#root, #app, #__next, #__nuxt, #svelte or app-root) and a script with src or type="module"', fidelity: 'no score', baseline: 'no score' },
  { code: 'no_css', when: 'inline plus fetched CSS under 500 bytes after trimming', fidelity: 'no score', baseline: 'no score' },
  { code: 'too_few_checks', when: `fewer than ${MIN_SCORED_CHECKS} fidelity checks reached pass, warn or fail`, fidelity: 'no score', baseline: 'scored' },
];

export function ownContractFormula() {
  return {
    mode: 'own-contract',
    version: FORMULA_VERSION,
    date: FORMULA_DATE,
    engineVersion: ENGINE_VERSION,
    rule: 'Each check scores 1 for a pass, 0.5 for a warning and 0 for a failure. Checks that did not run are left out. Each category weight is shared by its scored checks; the score is the points over the weight in play, times 100, to one decimal. Grades: A from 90, B from 80, C from 70, D from 60, else F. The two layers are never blended.',
    thresholds: {
      share: { pass: SHARE_PASS_AT, warn: SHARE_WARN_AT },
      aliases: { pass: ALIAS_PASS_AT },
      tokenUse: { pass: TOKEN_USE_PASS_AT, warn: TOKEN_USE_WARN_AT },
      contrast: { pass: CONTRAST_PASS, largeTextPass: CONTRAST_LARGE_PASS, failBelow: CONTRAST_FAIL_BELOW },
      targetFloorPx: TARGET_FLOOR_PX,
    },
    fidelity: {
      checks: FIDELITY_DEFS,
      weights: FIDELITY_WEIGHTS,
      ceilings: FIDELITY_CEILINGS,
      minScoredChecks: MIN_SCORED_CHECKS,
      uncappedScore: 'When a ceiling lowers the score, uncappedScore carries the score before it.',
    },
    baseline: {
      checks: BASELINE_IDS.map((id) => ({ id, title: baselineTitle(id), group: Object.keys(BASELINE_GROUPS).find((g) => BASELINE_GROUPS[g].checks.includes(id)) })),
      groups: BASELINE_GROUPS,
      staticMaximum: BASELINE_STATIC_MAX,
      floor: BASELINE_FLOOR,
      anyFailCap: BASELINE_ANY_FAIL_CAP,
      ceilings: baselineCeilings(),
      note: 'The baseline reads no contract. It differs from the leaderboard number, which runs every check plus the slop deduction and the originality lift.',
    },
    nullRules: NULL_RULES,
  };
}
