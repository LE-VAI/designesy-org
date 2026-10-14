// The contrast pair evaluation f09 and f10 share (engine spec 6.3).
// When both colors are located by map or name, the page's values are used
// ("shipped values"); when located only by value, the shipped value equals
// the declared one and the detail says "evaluated on declared values; not
// located by name"; when either is not located, the pair is skipped.
// WCAG 2.x ratio: PASS at 4.5 (3 for large text), WARN from 3, FAIL below 3.
// APCA Lc is reported, never scored (the v06 precedent).

import type { Binding } from '../bind';
import { CONTRAST_FAIL_BELOW, CONTRAST_LARGE_PASS, CONTRAST_PASS } from '../formula';
import { apcaLc, contrastRatio, hex6, parseColor } from '../normalize';
import type { ContrastPair, Rgba8 } from '../types';
import { result, skip, type Ctx, type CheckResultV2, type Evidence, type Status } from './common';

interface Evaluated { pair: ContrastPair; ratio: number; need: number; status: Status; mode: 'shipped' | 'declared'; text: Rgba8; background: Rgba8; declaredText: Rgba8; declaredBg: Rgba8; textVar?: string; bgVar?: string; apca: number }

const name = (p: ContrastPair) => p.source.split('.').pop() || p.source;
export const ratio2 = (r: number) => Math.round(r * 100) / 100;
/**
 * A ratio to one decimal ("2.4", "5.4"), except where rounding would carry it
 * across a band it does not reach: 4.48 reads "4.48", never "4.5".
 */
export function fmtRatio(r: number): string {
  const one = Math.round(r * 10) / 10;
  for (const t of [CONTRAST_FAIL_BELOW, CONTRAST_PASS]) if (r < t && one >= t) return (Math.floor(r * 100) / 100).toFixed(2);
  return one.toFixed(1);
}
const ratio1 = fmtRatio;

function evaluate(ctx: Ctx, pair: ContrastPair): Evaluated | null {
  const tb = ctx.byPath.get(pair.text);
  const bb = ctx.byPath.get(pair.background);
  if (!tb || !bb || !tb.located || !bb.located || !tb.declared.color || !bb.declared.color) return null;
  const named = (b: Binding) => b.located === 'map' || b.located === 'name';
  let mode: 'shipped' | 'declared' = 'declared';
  let text = tb.declared.color;
  let background = bb.declared.color;
  if (named(tb) && named(bb)) {
    const t = parseColor((tb.shipped ?? '').trim());
    const b = parseColor((bb.shipped ?? '').trim());
    if (t && b) { text = t; background = b; mode = 'shipped'; }
  }
  const ratio = contrastRatio(text, background);
  const need = pair.largeText ? CONTRAST_LARGE_PASS : CONTRAST_PASS;
  const status: Status = ratio >= need ? 'PASS' : ratio >= CONTRAST_FAIL_BELOW ? 'WARN' : 'FAIL';
  return { pair, ratio, need, status, mode, text, background, declaredText: tb.declared.color, declaredBg: bb.declared.color, textVar: tb.cssVar, bgVar: bb.cssVar, apca: apcaLc(text, background) };
}

const RANK: Record<string, number> = { FAIL: 0, WARN: 1, PASS: 2 };

export function pairCheck(id: 'f09' | 'f10', ctx: Ctx, role: ContrastPair['role']): CheckResultV2 {
  const pairs = ctx.contract.pairs.filter((p) => p.role === role);
  if (!pairs.length) {
    return skip(id, ctx, 'not_declared', role === 'primary-action'
      ? 'Not declared: your contract names no primary action pair (a button-primary, button, primary-button or cta component with a text and a background color), so f10 did not run.'
      : 'Not declared: your contract declares no text and background pairs, so f09 did not run.');
  }
  const done = pairs.map((p) => evaluate(ctx, p)).filter((x): x is Evaluated => x !== null);
  if (!done.length) {
    return skip(id, ctx, 'not_located', `Not located: neither color of ${pairs.length === 1 ? 'the declared pair' : 'any declared pair'} was found on this page, so the pair could not be measured.`);
  }
  done.sort((a, b) => RANK[a.status] - RANK[b.status] || a.ratio - b.ratio);
  const worst = done[0];
  const where = worst.mode === 'shipped' ? 'shipped values' : 'declared values';
  const note = done.some((d) => d.mode === 'declared') ? ' (evaluated on declared values; not located by name)' : '';
  let detail: string;
  if (worst.status === 'PASS') {
    detail = done.length === 1
      ? `${name(worst.pair)} is ${ratio1(worst.ratio)} to 1 on ${where}${note}`
      : `${done.length} pairs; the lowest is ${name(worst.pair)} at ${ratio1(worst.ratio)} to 1${note}`;
  } else {
    detail = `${name(worst.pair)} is ${ratio1(worst.ratio)} to 1 on ${where} (needs ${worst.need === 3 ? '3' : '4.5'} to 1)${note}`;
  }
  const declared: Evidence[] = [
    { path: worst.pair.text, value: hex6(worst.declaredText) },
    { path: worst.pair.background, value: hex6(worst.declaredBg) },
  ];
  const shipped: Evidence[] = [
    { path: worst.pair.text, value: hex6(worst.text), ...(worst.textVar && worst.mode === 'shipped' ? { where: [worst.textVar] } : {}) },
    { path: worst.pair.background, value: hex6(worst.background), ...(worst.bgVar && worst.mode === 'shipped' ? { where: [worst.bgVar] } : {}) },
  ];
  return result(id, ctx, worst.status, detail, {
    declared,
    shipped,
    evidence: {
      findings: done.slice(0, 20).map((d) => ({ source: d.pair.source, text: hex6(d.text), background: hex6(d.background), ratio: ratio2(d.ratio), need: d.need, apcaLc: d.apca, values: d.mode, declaredRatio: ratio2(contrastRatio(d.declaredText, d.declaredBg)) })),
      truncated: Math.max(0, done.length - 20),
    },
  });
}
