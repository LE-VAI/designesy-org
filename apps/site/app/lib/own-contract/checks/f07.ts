// f07 Shipped corner radii are on your radius scale (engine spec 6.3; derived from d07).
// border-radius and its longhands, each component. Left out: 0, percentages
// (circles are geometry), values under 2px (hairlines) and em. Unlike d07 there
// is no 40px pill cutoff: when the contract declares a full radius (999px or
// more), a shipped radius above the largest finite declared radius counts as
// full; without one it is off the scale. Share: PASS 0.90, WARN 0.70. Needs 3.

import { RADIUS_PROPS, shippedLengths } from '../extract';
import { capList, notDeclared, px, result, shareStatus, skip, type Ctx, type CheckResultV2 } from './common';

export function f07(ctx: Ctx): CheckResultV2 {
  const scale = ctx.contract.radii.map((r) => r.dim.px).filter((x): x is number => typeof x === 'number');
  if (!scale.length) return notDeclared('f07', ctx, 'radii', 'radius scale');
  const shipped = [...shippedLengths(ctx.page, (p) => RADIUS_PROPS.has(p), { minPx: 2 }).entries()];
  ctx.compared.radii = shipped.length;
  if (shipped.length < 3) return skip('f07', ctx, 'not_located', `Not located: this page shows ${shipped.length} distinct corner ${shipped.length === 1 ? 'radius' : 'radii'}, and the check needs at least 3.`);
  const full = scale.some((s) => s >= 999);
  const finite = scale.filter((s) => s < 999);
  const maxFinite = finite.length ? Math.max(...finite) : 0;
  const onScale = (v: number) => scale.some((s) => Math.abs(s - v) <= 0.01) || (full && v > maxFinite);
  const off = shipped.filter(([v]) => !onScale(v));
  const status = shareStatus(shipped.length - off.length, shipped.length);
  const inScale = shipped.length - off.length;
  const capped = capList(off);
  const detail = `${inScale} of ${shipped.length} shipped radii ${inScale === 1 ? 'is' : 'are'} on your radius scale` + (off.length ? `. Off it: ${capped.items.slice(0, 5).map(([v, e]) => `${px(v)} in ${e.where[0]}`).join(', ')}` : '');
  return result('f07', ctx, status, detail, {
    declared: scale.map((v) => ({ value: px(v) })),
    shipped: off.map(([v, e]) => ({ value: px(v), where: e.where, uses: e.uses })),
    evidence: { findings: capped.items.map(([v, e]) => ({ value: px(v), uses: e.uses, where: e.where.join(', ') })), truncated: capped.truncated },
  });
}
