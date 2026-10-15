// f03 Shipped font sizes are on your type scale (contract-mode spec §6.3; derived from v16).
// Distinct font-size values in px or rem (em and keywords left out; clamp()
// gives its absolute bounds). On the scale within 0.01px of a declared size.
// Share: PASS at 0.90, WARN from 0.70. Needs 3 sizes.

import { shippedFontSizes } from '../extract';
import { capList, px, result, shareStatus, skip, type Ctx, type CheckResultV2 } from './common';

export function f03(ctx: Ctx): CheckResultV2 {
  const scale = ctx.contract.typography.map((s) => s.fontSize?.px).filter((x): x is number => typeof x === 'number');
  if (!scale.length) return skip('f03', ctx, 'not_declared', 'Not declared: your contract has no font sizes, so f03 did not run.');
  const shipped = [...shippedFontSizes(ctx.page).entries()];
  ctx.compared.typography = (ctx.compared.typography ?? 0) + shipped.length;
  if (shipped.length < 3) return skip('f03', ctx, 'not_located', `Not located: this page shows ${shipped.length} distinct font ${shipped.length === 1 ? 'size' : 'sizes'}, and the check needs at least 3.`);
  const off = shipped.filter(([v]) => !scale.some((s) => Math.abs(s - v) <= 0.01));
  const status = shareStatus(shipped.length - off.length, shipped.length);
  const inScale = shipped.length - off.length;
  const capped = capList(off);
  const detail = `${inScale} of ${shipped.length} shipped sizes ${inScale === 1 ? 'is' : 'are'} on your scale` + (off.length ? `. Off it: ${capped.items.slice(0, 5).map(([v, e]) => `${px(v)} in ${e.where[0]}`).join(', ')}` : '');
  return result('f03', ctx, status, detail, {
    declared: [...new Set(scale)].sort((a, b) => a - b).map((v) => ({ value: px(v) })),
    shipped: off.map(([v, e]) => ({ value: px(v), where: e.where, uses: e.uses })),
    evidence: { findings: capped.items.map(([v, e]) => ({ value: px(v), uses: e.uses, where: e.where.join(', ') })), truncated: capped.truncated },
  });
}
