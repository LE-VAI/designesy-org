// Scoring both layers (engine spec 8; owner decisions D1, D3, D6).
//
// One rule for both, the engine's existing one: each category's weight is
// shared by its scored checks; PASS earns the share, WARN half, FAIL nothing;
// SKIP and MANUAL leave numerator and denominator. Score = points over the
// weight in play, times 100, to one decimal (Math.round(x * 1000) / 10, as the
// legacy engine rounds). No slop deduction, no originality lift.
//
// Fidelity: weights 20/18/16/14/12/8/6/6, then the ceilings (f09 FAIL caps at
// 65, f10 FAIL at 70), no accessibility floor; fewer than 3 scored checks is
// "no score" (too_few_checks). Baseline: groups of baseline.ts, the
// accessibility floor (a group under 60% caps at 70), the any-FAIL cap
// (89.9: no A while a baseline check fails), then the registry
// ceilings of its checks (v25 at 75, v44 at 65). When a ceiling or the floor
// lowers a score, uncappedScore carries the score before it (D6).

import { BASELINE_ANY_FAIL_CAP, BASELINE_FLOOR, BASELINE_GROUPS, BASELINE_GROUP_OF, baselineCeilings } from './baseline';
import { fmtRatio } from './checks/pairs';
import { FIDELITY_CATEGORY, FIDELITY_CEILINGS, FIDELITY_WEIGHTS, MIN_SCORED_CHECKS } from './formula';

export type NullCode = 'site_unreachable' | 'empty_shell' | 'no_css' | 'too_few_checks';

export interface LayerResult {
  score: number | null;
  grade: string | null;
  scored: number;
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  manual: number;
  categoryScores: Record<string, { score: number | null; weight: number; pass: number; warn: number; fail: number; skip: number; manual: number }>;
  ceilingApplied: boolean;
  ceilingReason: string | null;
  uncappedScore: number | null;
  nullReason: { code: NullCode; detail: string } | null;
}

export interface ScorableCheck {
  id: string;
  status: string;
  category?: string;
  evidence?: { findings: Array<Record<string, string | number | null>> };
}

export function gradeOf(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

const round1 = (x: number) => Math.round(x * 1000) / 10;
const one = (x: number) => Math.round(x * 10) / 10;

function arithmetic(checks: ScorableCheck[], groupOf: (c: ScorableCheck) => string, weights: Record<string, number>) {
  const counts: Record<string, number> = {};
  for (const c of checks) {
    if (c.status === 'SKIP' || c.status === 'MANUAL') continue;
    const g = groupOf(c);
    counts[g] = (counts[g] || 0) + 1;
  }
  const agg: Record<string, { wp: number; wt: number; pass: number; warn: number; fail: number; skip: number; manual: number }> = {};
  let points = 0;
  let weight = 0;
  for (const c of checks) {
    const g = groupOf(c);
    const a = agg[g] || (agg[g] = { wp: 0, wt: 0, pass: 0, warn: 0, fail: 0, skip: 0, manual: 0 });
    if (c.status === 'SKIP') { a.skip++; continue; }
    if (c.status === 'MANUAL') { a.manual++; continue; }
    const share = (weights[g] ?? 0) / counts[g];
    a.wt += share;
    weight += share;
    if (c.status === 'PASS') { a.wp += share; points += share; a.pass++; }
    else if (c.status === 'WARN') { a.wp += share * 0.5; points += share * 0.5; a.warn++; }
    else a.fail++;
  }
  const categoryScores: LayerResult['categoryScores'] = {};
  for (const [g, a] of Object.entries(agg)) {
    categoryScores[g] = { score: a.wt === 0 ? null : round1(a.wp / a.wt), weight: weights[g] ?? 0, pass: a.pass, warn: a.warn, fail: a.fail, skip: a.skip, manual: a.manual };
  }
  const n = (s: string) => checks.filter((c) => c.status === s).length;
  return {
    raw: weight === 0 ? null : round1(points / weight),
    categoryScores,
    pass: n('PASS'), warn: n('WARN'), fail: n('FAIL'), skip: n('SKIP'), manual: n('MANUAL'),
    scored: n('PASS') + n('WARN') + n('FAIL'),
    total: checks.length,
  };
}

/** The ceiling reason for a capping contrast check, from its measured ratio when it has one. */
function contrastReason(c: ScorableCheck | undefined, id: 'f09' | 'f10'): string {
  const r = c?.evidence?.findings?.[0]?.ratio;
  const ratio = typeof r === 'number' ? `${fmtRatio(r)} to 1` : 'under 3 to 1';
  if (id === 'f10') return typeof r === 'number' ? `Your primary action pair is ${ratio} on shipped values, under 3 to 1.` : 'Your primary action pair fails contrast on shipped values, under 3 to 1.';
  const src = c?.evidence?.findings?.[0]?.source;
  const which = typeof src === 'string' ? ` (${src})` : '';
  return typeof r === 'number' ? `A declared text and background pair${which} is ${ratio} on shipped values, under 3 to 1.` : 'A declared text and background pair fails contrast on shipped values, under 3 to 1.';
}

export function scoreFidelity(checks: ScorableCheck[]): LayerResult {
  const a = arithmetic(checks, (c) => FIDELITY_CATEGORY[c.id] ?? c.category ?? 'other', FIDELITY_WEIGHTS);
  const base = { scored: a.scored, total: a.total, pass: a.pass, warn: a.warn, fail: a.fail, skip: a.skip, manual: a.manual, categoryScores: a.categoryScores };
  if (a.scored < MIN_SCORED_CHECKS || a.raw === null) {
    return {
      ...base, score: null, grade: null, ceilingApplied: false, ceilingReason: null, uncappedScore: null,
      nullReason: { code: 'too_few_checks', detail: `${a.scored} of ${a.total} checks scored; at least ${MIN_SCORED_CHECKS} are needed.` },
    };
  }
  let score = a.raw;
  let reason: string | null = null;
  for (const { check, cap } of FIDELITY_CEILINGS) {
    const c = checks.find((x) => x.id === check);
    if (c?.status === 'FAIL' && score > cap) {
      score = cap;
      reason = contrastReason(c, check as 'f09' | 'f10');
    }
  }
  const capped = score !== a.raw;
  return { ...base, score: one(score), grade: gradeOf(score), ceilingApplied: capped, ceilingReason: capped ? reason : null, uncappedScore: capped ? a.raw : null, nullReason: null };
}

export function scoreBaseline(checks: ScorableCheck[]): LayerResult & { a11yFloorApplied: boolean } {
  const weights = Object.fromEntries(Object.entries(BASELINE_GROUPS).map(([g, v]) => [g, v.weight]));
  const a = arithmetic(checks, (c) => BASELINE_GROUP_OF[c.id] ?? 'other', weights);
  const base = { scored: a.scored, total: a.total, pass: a.pass, warn: a.warn, fail: a.fail, skip: a.skip, manual: a.manual, categoryScores: a.categoryScores };
  if (a.raw === null) {
    return { ...base, score: null, grade: null, ceilingApplied: false, ceilingReason: null, uncappedScore: null, nullReason: null, a11yFloorApplied: false };
  }
  let score = a.raw;
  // Accessibility floor, as the legacy engine applies it.
  const acc = checks.filter((c) => BASELINE_GROUP_OF[c.id] === BASELINE_FLOOR.group && (c.status === 'PASS' || c.status === 'WARN' || c.status === 'FAIL'));
  const accShare = acc.length ? acc.reduce((s, c) => s + (c.status === 'PASS' ? 1 : c.status === 'WARN' ? 0.5 : 0), 0) / acc.length : 1;
  let a11yFloorApplied = false;
  if (acc.length && accShare < BASELINE_FLOOR.below && score > BASELINE_FLOOR.cap) {
    score = BASELINE_FLOOR.cap;
    a11yFloorApplied = true;
  }
  let reason: string | null = a11yFloorApplied ? 'Accessibility checks average under 60%, which caps the baseline at 70.' : null;
  let ceilingApplied = false;
  // No A while any baseline check fails (89.9), as the URL engine caps.
  const failing = checks.filter((c) => c.status === 'FAIL').map((c) => c.id);
  if (failing.length && score > BASELINE_ANY_FAIL_CAP) {
    score = BASELINE_ANY_FAIL_CAP;
    ceilingApplied = true;
    const named = failing.length === 1 ? `${failing[0]} fails` : `${failing.slice(0, -1).join(', ')} and ${failing[failing.length - 1]} fail`;
    reason = `A FAIL caps the grade at B: ${named}, and the baseline cannot exceed 89.9 while any check fails.`;
  }
  for (const { check, cap } of baselineCeilings()) {
    const c = checks.find((x) => x.id === check);
    if (c?.status === 'FAIL' && score > cap) {
      score = cap;
      ceilingApplied = true;
      reason = check === 'v44'
        ? 'Status text is under WCAG contrast, which caps the baseline at 65.'
        : check === 'v25'
          ? 'The heading outline is broken (several h1 or a skipped level), which caps the baseline at 75.'
          : `${check} fails, which caps the baseline at ${cap}.`;
    }
  }
  const lowered = score !== a.raw;
  return { ...base, score: one(score), grade: gradeOf(score), ceilingApplied, ceilingReason: lowered ? reason : null, uncappedScore: lowered ? a.raw : null, nullReason: null, a11yFloorApplied };
}

/** A layer that has no score for a page-level reason (empty shell, no CSS, unreachable). */
export function nullLayer(layer: LayerResult, code: NullCode, detail: string): LayerResult {
  return { ...layer, score: null, grade: null, ceilingApplied: false, ceilingReason: null, uncappedScore: null, nullReason: { code, detail } };
}
