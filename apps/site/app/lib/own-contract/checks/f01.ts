// f01 Mapped tokens ship their declared values (engine spec 6.3; derived from v01).
// For each token located by map or name, the page's resolved custom property
// against the declared value: colors within 1 per channel and 0.01 alpha,
// dimensions within 0.01px, durations exactly, families case-folded.
// PASS when all match, WARN from 90%, FAIL below. Needs 3 such tokens.

import { sameAsDeclared } from '../bind';
import { result, skip, type Ctx, type CheckResultV2 } from './common';

export function f01(ctx: Ctx): CheckResultV2 {
  const named = ctx.bindings.filter((b) => (b.located === 'map' || b.located === 'name') && !b.nested);
  if (named.length < 3) {
    return skip('f01', ctx, 'not_located', `Not located: ${named.length} of your tokens were found by map or name on this page, and the check needs at least 3.`);
  }
  const mismatches = named.filter((b) => !sameAsDeclared(b, b.shipped));
  const matched = named.length - mismatches.length;
  const status = mismatches.length === 0 ? 'PASS' : matched / named.length >= 0.9 - 1e-9 ? 'WARN' : 'FAIL';
  const detail = mismatches.length === 0
    ? `${matched} of ${named.length} tokens found by name ship their declared values`
    : `${matched} of ${named.length} tokens found by name ship their declared values; ${mismatches.length} ${mismatches.length === 1 ? 'differs' : 'differ'}: ${mismatches.slice(0, 3).map((b) => `${b.path} declares ${b.declaredText}, ${b.cssVar} ships ${(b.shipped ?? '').trim().slice(0, 40)}`).join('; ')}`;
  return result('f01', ctx, status, detail, {
    declared: mismatches.map((b) => ({ path: b.path, value: b.declaredText })),
    shipped: mismatches.map((b) => ({ path: b.path, value: (b.shipped ?? '').trim().slice(0, 80), where: [b.cssVar!] })),
    evidence: { findings: mismatches.slice(0, 20).map((b) => ({ path: b.path, declared: b.declaredText, shipped: (b.shipped ?? '').trim().slice(0, 80), cssVar: b.cssVar ?? null })), truncated: Math.max(0, mismatches.length - 20) },
  });
}
