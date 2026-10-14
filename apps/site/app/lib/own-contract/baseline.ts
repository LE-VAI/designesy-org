// The baseline layer (engine spec section 7 and 8.3; owner decisions D3, D7,
// D10; HANDOFF O2): the universal checks that read no contract, grouped and
// weighted for this mode. Eighteen checks: the sixteen of section 7 plus v44
// (accessibility) and v45 (motion), which every legacy score gained in engine
// 1.2.0. v46 (type sizes from the page's own scale) stays out: f03 measures
// the same thing against the team's scale, and v46 has no ruling for this mode.
//
// The checks themselves run in the hosted route unchanged; this module picks
// them, gives each its contractTitle, and states the grouping the scorer uses.
// Group weights are today's category weights (keyboard is interaction 6 plus
// poise 7), so the static maximum stays 57 with eighteen checks.

import { CHECKS } from '../check-definitions';

export const BASELINE_GROUPS: Record<string, { weight: number; checks: string[]; manual?: boolean }> = {
  accessibility: { weight: 15, checks: ['v25', 'v27', 'v35', 'v44'] },
  keyboard: { weight: 13, checks: ['v03', 'v09'] },
  motion: { weight: 10, checks: ['v05', 'v11', 'v12', 'v45'] },
  copywriting: { weight: 8, checks: ['v38', 'v39', 'v40'] },
  identity: { weight: 6, checks: ['v07', 'v34'] },
  security: { weight: 5, checks: ['v36'] },
  responsive: { weight: 3, checks: ['v02'], manual: true },
  performance: { weight: 6, checks: ['v21'], manual: true },
};

const IN_BASELINE = new Set(Object.values(BASELINE_GROUPS).flatMap((g) => g.checks));

/** The baseline checks in registry order (the order the result lists them). */
export const BASELINE_IDS: readonly string[] = CHECKS.filter((c) => IN_BASELINE.has(c.id)).map((c) => c.id);

/** The weight the static engine can score: every group with an automatic check. */
export const BASELINE_STATIC_MAX = Object.values(BASELINE_GROUPS).filter((g) => !g.manual).reduce((a, g) => a + g.weight, 0);

/** The accessibility floor, as the legacy engine applies it. */
export const BASELINE_FLOOR = { group: 'accessibility', below: 0.6, cap: 70 };

/**
 * No A while any baseline check fails: the URL engine's rule since engine
 * 1.3.0 (owner decision 2026-10-11), applied to this layer too (owner
 * decision 2026-10-14). After the floor; the lower registry ceilings win.
 */
export const BASELINE_ANY_FAIL_CAP = 89.9;

export const BASELINE_GROUP_OF: Record<string, string> = Object.fromEntries(
  Object.entries(BASELINE_GROUPS).flatMap(([g, v]) => v.checks.map((id) => [id, g])),
);

/** Registry ceilings of the automatic baseline checks (v25 at 75, v44 at 65). */
export function baselineCeilings(): Array<{ check: string; cap: number }> {
  return CHECKS.filter((c) => IN_BASELINE.has(c.id) && c.type === 'auto' && c.ceiling !== null).map((c) => ({ check: c.id, cap: c.ceiling as number }));
}

export function baselineTitle(id: string): string {
  const d = CHECKS.find((c) => c.id === id);
  return d?.contractTitle ?? d?.item ?? id;
}

export interface BaselineInput { id: string; item: string; category: string; status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL'; detail: string; [k: string]: unknown }

/**
 * The baseline layer of one run, from the legacy check results the route
 * computed: the eighteen in registry order, each titled by its contractTitle
 * and marked as the baseline layer. Registry categories stay (v09 keeps
 * `poise`); the scorer groups by BASELINE_GROUP_OF.
 */
export function baselineChecks<T extends BaselineInput>(legacy: T[]): Array<T & { layer: 'baseline' }> {
  const byId = new Map(legacy.map((c) => [c.id, c]));
  const out: Array<T & { layer: 'baseline' }> = [];
  for (const id of BASELINE_IDS) {
    const c = byId.get(id);
    if (!c) continue;
    out.push({ ...c, item: baselineTitle(id), layer: 'baseline' });
  }
  return out;
}
