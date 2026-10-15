// f13 Declared aliases ship as variable references (contract-mode spec §6.3; derived
// from v29). For each alias whose two ends are located by map or name: shipped
// as a reference when the alias variable's value is var(--target) (a fallback
// is allowed), flattened when it holds the literal. PASS when 80% ship as
// references, else WARN; never FAIL. Needs 2 evaluable aliases.

import { varNames } from '../css';
import { ALIAS_PASS_AT } from '../formula';
import { result, skip, type Ctx, type CheckResultV2 } from './common';

export function f13(ctx: Ctx): CheckResultV2 {
  const aliases = ctx.contract.aliases;
  if (!aliases.length) return skip('f13', ctx, 'not_declared', 'Not declared: your contract declares no aliases, so f13 did not run.');
  const named = (p: string) => {
    const b = ctx.byPath.get(p);
    return b && (b.located === 'map' || b.located === 'name') && b.cssVar ? b : null;
  };
  const evaluable = aliases.map((a) => ({ a, from: named(a.from), to: named(a.to) })).filter((x) => x.from && x.to);
  if (evaluable.length < 2) {
    return skip('f13', ctx, 'not_located', `Not located: ${evaluable.length} of your ${aliases.length} aliases have both ends on this page by name, and the check needs at least 2.`);
  }
  const flattened = evaluable.filter((x) => varNames(ctx.page.rootVars.get(x.from!.cssVar!) ?? '')[0] !== x.to!.cssVar);
  const refs = evaluable.length - flattened.length;
  const status = refs / evaluable.length >= ALIAS_PASS_AT - 1e-9 ? 'PASS' : 'WARN';
  const detail = `${refs} of ${evaluable.length} aliases ship as variable references` + (flattened.length ? `; flattened: ${flattened.slice(0, 3).map((x) => `${x.from!.cssVar} holds ${(ctx.page.rootVars.get(x.from!.cssVar!) ?? '').slice(0, 40)}, not var(${x.to!.cssVar})`).join('; ')}` : '');
  return result('f13', ctx, status, detail, {
    declared: evaluable.map((x) => ({ path: x.a.from, value: `{${x.a.to}}` })),
    shipped: flattened.map((x) => ({ path: x.a.from, value: (ctx.page.rootVars.get(x.from!.cssVar!) ?? '').slice(0, 80), where: [x.from!.cssVar!] })),
  });
}
