// f08 Shipped spacing is on your spacing scale (contract-mode spec §6.3; derived from d04).
// Every component of padding, margin, gap, row-gap and column-gap (negative
// margins as their size; var() resolved; 0, auto, percentages, em and
// functions left out). Share: PASS at 0.90, WARN from 0.70. Needs 5 values.

import { isSpacingProp, shippedLengths } from '../extract';
import { capList, notDeclared, px, result, shareStatus, skip, type Ctx, type CheckResultV2 } from './common';

export function f08(ctx: Ctx): CheckResultV2 {
  const scale = ctx.contract.spacing.map((r) => r.dim.px).filter((x): x is number => typeof x === 'number');
  if (!scale.length) return notDeclared('f08', ctx, 'spacing', 'spacing scale');
  const shipped = [...shippedLengths(ctx.page, isSpacingProp, { abs: true }).entries()];
  ctx.compared.spacing = shipped.length;
  if (shipped.length < 5) return skip('f08', ctx, 'not_located', `Not located: this page shows ${shipped.length} distinct spacing ${shipped.length === 1 ? 'value' : 'values'}, and the check needs at least 5.`);
  const off = shipped.filter(([v]) => !scale.some((s) => Math.abs(s - v) <= 0.01));
  const status = shareStatus(shipped.length - off.length, shipped.length);
  const capped = capList(off);
  const detail = off.length
    ? `${off.length} of ${shipped.length} shipped spacing values ${off.length === 1 ? 'is' : 'are'} off the scale: ${capped.items.slice(0, 6).map(([v]) => px(v)).join(', ')}`
    : `${shipped.length} of ${shipped.length} shipped spacing values are on your scale`;
  return result('f08', ctx, status, detail, {
    declared: scale.map((v) => ({ value: px(v) })),
    shipped: off.map(([v, e]) => ({ value: px(v), where: e.where, uses: e.uses })),
    evidence: { findings: capped.items.map(([v, e]) => ({ value: px(v), uses: e.uses, where: e.where.join(', ') })), truncated: capped.truncated },
  });
}
