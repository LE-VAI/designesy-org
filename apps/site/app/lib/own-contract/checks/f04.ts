// f04 Shipped font families are in your contract (engine spec 6.3; derived from v26).
// The first named family of each font-family stack, aliases resolved, generic
// keywords skipped, next/font's "X Fallback" read as X. Unlike v26, Roboto,
// Helvetica, Arial and Segoe UI are real faces here. A face is declared when
// any declared stack names it (the first entry is the face, the rest accepted
// fallbacks). PASS with none undeclared, WARN with 1, FAIL with 2 or more.

import { foldFace, shippedFaces } from '../extract';
import { result, skip, type Ctx, type CheckResultV2 } from './common';

export function f04(ctx: Ctx): CheckResultV2 {
  const declared = new Set<string>();
  for (const f of ctx.contract.families) for (const n of f.families) declared.add(foldFace(n).toLowerCase());
  for (const s of ctx.contract.typography) for (const n of s.families ?? []) declared.add(foldFace(n).toLowerCase());
  if (!declared.size) return skip('f04', ctx, 'not_declared', 'Not declared: your contract has no font families, so f04 did not run.');
  const shipped = [...shippedFaces(ctx.page).entries()];
  ctx.compared.typography = (ctx.compared.typography ?? 0) + shipped.length;
  if (!shipped.length) return skip('f04', ctx, 'not_located', 'Not located: this page names no font family the engine can read, and the check needs at least 1.');
  const extra = shipped.filter(([k]) => !declared.has(k));
  const status = extra.length === 0 ? 'PASS' : extra.length === 1 ? 'WARN' : 'FAIL';
  const names = shipped.map(([, e]) => e.name);
  const detail = extra.length === 0
    ? (names.length === 1 ? `The shipped family is declared: ${names[0]}` : `${names.length === 2 ? 'Both' : `All ${names.length}`} shipped families are declared: ${names.join(', ')}`)
    : `${extra.length} shipped ${extra.length === 1 ? 'family is' : 'families are'} not in your contract: ${extra.slice(0, 5).map(([, e]) => `${e.name} in ${e.where[0]}`).join(', ')}`;
  return result('f04', ctx, status, detail, {
    declared: [...declared].map((v) => ({ value: v })),
    shipped: extra.map(([, e]) => ({ value: e.name, where: e.where, uses: e.uses })),
  });
}
