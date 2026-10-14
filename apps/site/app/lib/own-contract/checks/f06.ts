// f06 Declared font features ship (engine spec 6.3; derived from v19).
// Each declared OpenType tag must appear in font-feature-settings, or as its
// font-variant keyword (tnum tabular-nums, lnum lining-nums, onum
// oldstyle-nums, pnum proportional-nums, zero slashed-zero, smcp small-caps).
// WARN when any is missing; never FAIL. No evidence minimum.

import { resolved } from '../extract';
import { result, skip, type Ctx, type CheckResultV2 } from './common';

const KEYWORD: Record<string, string> = {
  tnum: 'tabular-nums', lnum: 'lining-nums', onum: 'oldstyle-nums', pnum: 'proportional-nums', zero: 'slashed-zero', smcp: 'small-caps',
  c2sc: 'all-small-caps', frac: 'diagonal-fractions', afrc: 'stacked-fractions', ordn: 'ordinal',
};

export function f06(ctx: Ctx): CheckResultV2 {
  const tags = [...new Set(ctx.contract.typography.flatMap((s) => s.features ?? []))];
  if (!tags.length) return skip('f06', ctx, 'not_declared', 'Not declared: your contract has no font features, so f06 did not run.');
  const settings: string[] = [];
  const variants: string[] = [];
  for (const d of ctx.page.usage) {
    if (d.prop !== 'font-feature-settings' && !d.prop.startsWith('font-variant')) continue;
    const v = resolved(d, ctx.page);
    if (v === null) continue;
    (d.prop === 'font-feature-settings' ? settings : variants).push(v.toLowerCase());
  }
  const shipped = (tag: string) => {
    for (const s of settings) {
      for (const item of s.split(',')) {
        const t = item.trim();
        if ((t.startsWith(`"${tag}"`) || t.startsWith(`'${tag}'`)) && !/\s(?:0|off)$/.test(t)) return true;
      }
    }
    const kw = KEYWORD[tag];
    return !!kw && variants.some((v) => v.split(/\s+/).includes(kw));
  };
  const missing = tags.filter((t) => !shipped(t));
  if (!missing.length) return result('f06', ctx, 'PASS', `Every declared feature ships: ${tags.join(', ')}`, { declared: tags.map((t) => ({ value: t })) });
  return result('f06', ctx, 'WARN', `${missing.length} of ${tags.length} declared ${tags.length === 1 ? 'feature does' : 'features do'} not ship: ${missing.join(', ')}`, {
    declared: tags.map((t) => ({ value: t })),
    shipped: tags.filter((t) => !missing.includes(t)).map((t) => ({ value: t })),
  });
}
