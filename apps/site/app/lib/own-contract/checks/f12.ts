// f12 Interactive targets meet your declared minimum size (contract-mode spec §6.3;
// derived from v24). Floor: the larger of 24px (WCAG 2.5.8 AA) and the
// smallest declared interactive size. Shipped: explicit min-height and
// min-width on interactive selectors (the v24 set). FAIL under 24px, WARN
// under the floor, PASS otherwise. Static CSS cannot see padding or rendered
// size: explicit sizes only.

import { shippedTargets } from '../extract';
import { TARGET_FLOOR_PX } from '../formula';
import { px, result, skip, type Ctx, type CheckResultV2 } from './common';

export function f12(ctx: Ctx): CheckResultV2 {
  const declared = ctx.contract.sizes.filter((s) => s.interactive && s.dim.px !== null);
  if (!declared.length) return skip('f12', ctx, 'not_declared', 'Not declared: your contract declares no interactive size, so f12 did not run.');
  const floor = Math.max(TARGET_FLOOR_PX, Math.min(...declared.map((s) => s.dim.px as number)));
  const shipped = shippedTargets(ctx.page);
  ctx.compared.sizes = shipped.length;
  if (!shipped.length) return skip('f12', ctx, 'not_located', 'Not located: this page shows 0 explicit target sizes, and the check needs at least 1. Explicit sizes only.');
  const under24 = shipped.filter((t) => t.px < TARGET_FLOOR_PX);
  const underFloor = shipped.filter((t) => t.px < floor);
  const status = under24.length ? 'FAIL' : underFloor.length ? 'WARN' : 'PASS';
  const bad = under24.length ? under24 : underFloor;
  const detail = status === 'PASS'
    ? `${shipped.length} explicit target ${shipped.length === 1 ? 'size meets' : 'sizes meet'} the ${px(floor)} floor (explicit sizes only)`
    : `${bad.length} of ${shipped.length} explicit target sizes ${bad.length === 1 ? 'is' : 'are'} under ${px(under24.length ? TARGET_FLOOR_PX : floor)}: ${bad.slice(0, 3).map((t) => `${t.prop} ${px(t.px)} on ${t.selector}`).join(', ')} (explicit sizes only)`;
  return result('f12', ctx, status, detail, {
    declared: declared.map((s) => ({ path: s.path, value: px(s.dim.px as number) })),
    shipped: bad.map((t) => ({ value: px(t.px), where: [t.selector] })),
  });
}
