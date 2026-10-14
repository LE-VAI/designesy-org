// f11 Shipped durations and easings are in your contract (engine spec 6.3;
// derived from v23). DTCG only: the DESIGN.md format has no motion group, so a
// DESIGN.md contract SKIPs not_applicable. Durations must equal a declared
// duration (0s left out); curves within 0.001 per point of a declared curve,
// keywords mapped to their curves. The worse of the two shares decides.
// Needs 2 distinct shipped durations.

import { shippedMotion } from '../extract';
import { result, shareStatus, skip, type Ctx, type CheckResultV2, type Status } from './common';

const RANK: Record<string, number> = { FAIL: 0, WARN: 1, PASS: 2 };

export function f11(ctx: Ctx): CheckResultV2 {
  if (ctx.contract.format === 'design.md') {
    return skip('f11', ctx, 'not_applicable', 'Does not apply: the DESIGN.md format has no motion group, so f11 did not run. Use DTCG tokens to declare durations.');
  }
  const durs = ctx.contract.durations.map((d) => d.ms);
  const curves = ctx.contract.easings.map((e) => e.points);
  if (!durs.length && !curves.length) return skip('f11', ctx, 'not_declared', 'Not declared: your contract has no duration or easing tokens, so f11 did not run.');
  const m = shippedMotion(ctx.page);
  ctx.compared.durations = m.durations.size;
  ctx.compared.easings = m.curves.size;
  const shippedDur = [...m.durations.keys()];
  if (durs.length ? shippedDur.length < 2 : m.curves.size < 2) {
    return skip('f11', ctx, 'not_located', `Not located: this page shows ${shippedDur.length} distinct ${shippedDur.length === 1 ? 'duration' : 'durations'}, and the check needs at least 2.`);
  }
  const parts: string[] = [];
  let status: Status = 'PASS';
  const offDur = shippedDur.filter((ms) => !durs.includes(ms));
  if (durs.length && shippedDur.length) {
    const s = shareStatus(shippedDur.length - offDur.length, shippedDur.length);
    if (RANK[s] < RANK[status]) status = s;
    parts.push(`${shippedDur.length - offDur.length} of ${shippedDur.length} shipped durations are declared${offDur.length ? ` (not declared: ${offDur.slice(0, 5).map((x) => `${x}ms`).join(', ')})` : ''}`);
  }
  const shippedCurves = [...m.curves.values()];
  const offCurves = shippedCurves.filter((c) => !curves.some((d) => d.every((x, i) => Math.abs(x - c.points[i]) <= 0.001)));
  if (curves.length && shippedCurves.length) {
    const s = shareStatus(shippedCurves.length - offCurves.length, shippedCurves.length);
    if (RANK[s] < RANK[status]) status = s;
    parts.push(`${shippedCurves.length - offCurves.length} of ${shippedCurves.length} shipped curves are declared`);
  }
  return result('f11', ctx, status, parts.join('; '), {
    declared: [...durs.map((d) => ({ value: `${d}ms` })), ...curves.map((c) => ({ value: `cubic-bezier(${c.join(', ')})` }))],
    shipped: [...offDur.map((d) => ({ value: `${d}ms` })), ...offCurves.map((c) => ({ value: `cubic-bezier(${c.points.join(', ')})`, uses: c.uses }))],
  });
}
