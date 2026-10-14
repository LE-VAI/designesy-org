// f05 Shipped line heights are in your contract (engine spec 6.3; derived from v17).
// Distinct line-height values: unitless as ratios, px and rem as lengths. In
// the contract when a ratio is within 0.01 of a declared ratio, a length within
// 0.01px of a declared length, or a length over its own rule's font size within
// 0.01 of a declared ratio. Share: PASS at 0.90, WARN from 0.70. Needs 3.

import { shippedLineHeights } from '../extract';
import { lineHeightRatio } from '../normalize';
import { capList, px, result, shareStatus, skip, type Ctx, type CheckResultV2 } from './common';

export function f05(ctx: Ctx): CheckResultV2 {
  const ratios: number[] = [];
  const lengths: number[] = [];
  for (const s of ctx.contract.typography) {
    if (!s.lineHeight) continue;
    const r = lineHeightRatio(s.lineHeight, s.fontSize);
    if (r !== null) ratios.push(r);
    if (s.lineHeight.kind === 'length' && s.lineHeight.dim.px !== null) lengths.push(s.lineHeight.dim.px);
  }
  if (!ratios.length && !lengths.length) return skip('f05', ctx, 'not_declared', 'Not declared: your contract declares no line heights, so f05 did not run.');
  const shipped = [...shippedLineHeights(ctx.page).values()];
  if (shipped.length < 3) return skip('f05', ctx, 'not_located', `Not located: this page shows ${shipped.length} distinct line ${shipped.length === 1 ? 'height' : 'heights'}, and the check needs at least 3.`);
  const near = (list: number[], v: number, tol: number) => list.some((x) => Math.abs(x - v) <= tol);
  const ok = (l: (typeof shipped)[number]) =>
    l.kind === 'ratio' ? near(ratios, l.value, 0.01) : near(lengths, l.value, 0.01) || l.ruleFontPx.some((f) => near(ratios, l.value / f, 0.01));
  const off = shipped.filter((l) => !ok(l));
  const status = shareStatus(shipped.length - off.length, shipped.length);
  const show = (l: (typeof shipped)[number]) => (l.kind === 'ratio' ? String(l.value) : px(l.value));
  const capped = capList(off);
  const detail = off.length
    ? `${off.length} of ${shipped.length} shipped line heights ${off.length === 1 ? 'is' : 'are'} not declared: ${capped.items.slice(0, 5).map((l) => `${show(l)} in ${l.where[0]}`).join(', ')}`
    : `${shipped.length} of ${shipped.length} shipped line heights are declared`;
  return result('f05', ctx, status, detail, {
    declared: [...ratios.map((r) => ({ value: String(Math.round(r * 1000) / 1000) })), ...lengths.map((l) => ({ value: px(l) }))],
    shipped: off.map((l) => ({ value: show(l), where: l.where, uses: l.uses })),
    evidence: { findings: capped.items.map((l) => ({ value: show(l), uses: l.uses, where: l.where.join(', ') })), truncated: capped.truncated },
  });
}
