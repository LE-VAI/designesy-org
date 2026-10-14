// f14 Styles use your contract's tokens (engine spec 6.3; from the research
// packet's token-versus-raw ratio). Declarations of the f02, f03, f04, f05,
// f07 and f08 properties with a measurable value. A declaration uses your
// token when it holds var(--x) and --x is located by map or name, or --x
// resolves to a value your contract declares for that kind. PASS at 0.80,
// WARN from 0.50, FAIL below. Needs 10 declarations and 3 tokens located by
// map or name (a var() cannot be attributed to the contract otherwise).

import { varNames } from '../css';
import { COLOR_PROPS, RADIUS_PROPS, absPx, colorsIn, foldFace, isSpacingProp, resolved } from '../extract';
import { TOKEN_USE_PASS_AT, TOKEN_USE_WARN_AT } from '../formula';
import { sameRgb } from '../normalize';
import { pct, result, skip, type Ctx, type CheckResultV2 } from './common';

type Kind = 'color' | 'fontSize' | 'family' | 'lineHeight' | 'radius' | 'spacing';
function kindOf(prop: string): Kind | null {
  if (COLOR_PROPS.has(prop)) return 'color';
  if (prop === 'font-size') return 'fontSize';
  if (prop === 'font-family') return 'family';
  if (prop === 'line-height') return 'lineHeight';
  if (RADIUS_PROPS.has(prop)) return 'radius';
  if (isSpacingProp(prop)) return 'spacing';
  return null;
}

export function f14(ctx: Ctx): CheckResultV2 {
  const named = ctx.bindings.filter((b) => (b.located === 'map' || b.located === 'name') && b.cssVar);
  const namedVars = new Set(named.map((b) => b.cssVar!));
  const c = ctx.contract;
  const declaredPx = {
    fontSize: c.typography.map((s) => s.fontSize?.px).filter((x): x is number => typeof x === 'number'),
    radius: c.radii.map((r) => r.dim.px).filter((x): x is number => typeof x === 'number'),
    spacing: c.spacing.map((r) => r.dim.px).filter((x): x is number => typeof x === 'number'),
  };
  const faces = new Set([...c.families.flatMap((f) => f.families), ...c.typography.flatMap((s) => s.families ?? [])].map((f) => foldFace(f).toLowerCase()));
  const declaresValue = (kind: Kind, v: string): boolean => {
    const s = v.trim();
    switch (kind) {
      case 'color': return colorsIn(s).some((x) => c.colors.some((d) => sameRgb(x, d.rgba)));
      case 'family': return faces.has(foldFace(s.split(',')[0]).toLowerCase());
      case 'fontSize': case 'radius': case 'spacing': {
        const p = absPx(s);
        return p !== null && declaredPx[kind].some((d) => Math.abs(d - Math.abs(p)) <= 0.01);
      }
      default: return false;
    }
  };
  let total = 0;
  let using = 0;
  for (const d of ctx.page.usage) {
    const kind = kindOf(d.prop);
    if (!kind) continue;
    const v = resolved(d, ctx.page);
    if (v === null || !v.trim() || ['inherit', 'initial', 'unset', 'revert', 'none', 'auto', '0', 'transparent', 'currentcolor', 'normal'].includes(v.trim().toLowerCase())) continue;
    total++;
    const vars = varNames(d.value);
    if (vars.some((n) => namedVars.has(n) || declaresValue(kind, ctx.page.rootVars.get(n) ?? ''))) using++;
  }
  if (named.length < 3 || total < 10) {
    return skip('f14', ctx, 'not_located', named.length < 3
      ? `Not located: ${named.length} of your tokens were found by map or name, and the check needs at least 3 to attribute a var() to your contract.`
      : `Not located: this page has ${total} measurable color, type, radius and spacing declarations, and the check needs at least 10.`);
  }
  const share = using / total;
  const status = share >= TOKEN_USE_PASS_AT - 1e-9 ? 'PASS' : share >= TOKEN_USE_WARN_AT - 1e-9 ? 'WARN' : 'FAIL';
  return result('f14', ctx, status, `${pct(share)} of color, spacing, radius and type declarations use a token (${using} of ${total})`, {
    evidence: { findings: [{ declarations: total, usingTokens: using, share: Math.round(share * 1000) / 1000 }], truncated: 0 },
  });
}
