// f02 Shipped colors are in your palette (engine spec 6.3; derived from d03, d05).
// Distinct base colors the usage CSS paints (color, backgrounds, borders,
// outline, fill, stroke, caret, accent, text decoration); a color is in the
// palette when its RGB is within 1 per channel of a declared color (alpha is
// the same base color). Share: PASS at 0.90, WARN from 0.70. Needs 3 colors.

import { shippedColors } from '../extract';
import { SHARE_PASS_AT } from '../formula';
import { hex6, oklabDistance, sameRgb } from '../normalize';
import { capList, result, shareStatus, skip, type Ctx, type CheckResultV2 } from './common';

/** The collapsed line (brand D75, R3-07), built from the counts and the threshold.
    `outside` is the list the line names (at most the evidence cap); `outsideTotal`
    is every shipped colour outside the palette, which the count is taken from. */
export function paletteLine(shipped: number, outside: string[], passAt = SHARE_PASS_AT, outsideTotal = outside.length): string {
  const inside = shipped - outsideTotal;
  const verb = inside === 1 ? 'is' : 'are';
  const head = `${inside} of ${shipped} shipped colors ${verb} in your palette (${Math.round(passAt * 100)}% needed to pass).`;
  return outside.length ? `${head} Outside it: ${outside.join(', ')}` : head;
}

export function f02(ctx: Ctx): CheckResultV2 {
  const declared = ctx.contract.colors;
  const shipped = [...shippedColors(ctx.page).values()];
  ctx.compared.colors = shipped.length;
  if (shipped.length < 3) {
    return skip('f02', ctx, 'not_located', `Not located: this page shows ${shipped.length} distinct ${shipped.length === 1 ? 'color' : 'colors'}, and the check needs at least 3.`);
  }
  const outside = shipped.filter((s) => !declared.some((d) => sameRgb(s.rgba, d.rgba)));
  const status = shareStatus(shipped.length - outside.length, shipped.length);
  const findings = outside.map((s) => {
    let best = declared[0];
    let bestD = Infinity;
    for (const d of declared) {
      const dist = oklabDistance(s.rgba, d.rgba);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return { value: hex6(s.rgba), nearest: best ? best.path : null, nearestValue: best ? hex6(best.rgba) : null, distance: Math.round(bestD * 1000) / 1000, uses: s.uses, where: s.where.join(', ') };
  });
  const capped = capList(findings);
  const outsideList = capped.items.map((f) => f.value as string);
  return result('f02', ctx, status, paletteLine(shipped.length, outsideList, SHARE_PASS_AT, outside.length) + (capped.truncated ? ` and ${capped.truncated} more` : ''), {
    shipped: outside.map((s) => ({ value: hex6(s.rgba), where: s.where, uses: s.uses })),
    evidence: { findings: capped.items, truncated: capped.truncated },
  });
}
