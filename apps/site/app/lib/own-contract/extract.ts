// Shipped values, one extractor per kind (contract-mode spec §5.1): what the page's
// usage CSS sets for color, font size, family, line height, radius, spacing,
// target size and motion. Every value goes through var() resolution first;
// a declaration whose var() cannot be resolved is left out.
//
// Exclusions (section 5.1): 0, auto, inherit, initial, unset, currentColor,
// transparent, percentages, viewport units, em (lesser decision L9), and
// calc()/min()/max() (clamp() gives f03 its absolute bounds). Colors inside
// gradients, box-shadow and text-shadow are not counted for f02.

import { resolveVars, splitTop, valueParts, type Decl, type PageCss } from './css';
import { EASING_KEYWORDS, cleanFamily, isGenericFamily, parseColor, parseDimension, parseDurationMs, parseEasing } from './normalize';
import type { Rgba8 } from './types';

export interface Use { selector: string; uses: number }

export const COLOR_PROPS = new Set([
  'color', 'background-color', 'background', 'border-color', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-block-color', 'border-inline-color',
  'border-block-start-color', 'border-block-end-color', 'border-inline-start-color', 'border-inline-end-color', 'border-block', 'border-inline',
  'outline', 'outline-color', 'fill', 'stroke', 'caret-color', 'accent-color', 'text-decoration-color', 'text-decoration',
]);
export const RADIUS_PROPS = new Set([
  'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'border-start-start-radius', 'border-start-end-radius', 'border-end-start-radius', 'border-end-end-radius',
]);
export const SPACING_PROPS = new Set(['gap', 'row-gap', 'column-gap', 'grid-gap', 'grid-row-gap', 'grid-column-gap']);
export const isSpacingProp = (p: string) => SPACING_PROPS.has(p) || p === 'padding' || p === 'margin' || p.startsWith('padding-') || p.startsWith('margin-');
export const SIZE_PROPS = new Set(['min-height', 'min-width', 'min-block-size', 'min-inline-size']);
const NON_COLOR_FUNCS = ['linear-gradient(', 'radial-gradient(', 'conic-gradient(', 'repeating-linear-gradient(', 'repeating-radial-gradient(', 'repeating-conic-gradient(', 'url(', 'image-set(', '-webkit-gradient(', 'element('];

export function resolved(d: Decl, page: PageCss): string | null {
  return resolveVars(d.value, page.rootVars);
}

export const rgbKey = (c: Rgba8) => `${c.r},${c.g},${c.b}`;

/** Colors in one value (gradients, url() and images left out). */
export function colorsIn(value: string): Rgba8[] {
  const out: Rgba8[] = [];
  for (const part of valueParts(value)) {
    const low = part.toLowerCase();
    if (NON_COLOR_FUNCS.some((f) => low.startsWith(f))) continue;
    const c = parseColor(part);
    if (c) out.push(c);
  }
  return out;
}

/** f02: distinct base colors (RGB; alpha reported, not compared) with their uses and selectors. */
export function shippedColors(page: PageCss): Map<string, { rgba: Rgba8; uses: number; where: string[] }> {
  const out = new Map<string, { rgba: Rgba8; uses: number; where: string[] }>();
  for (const d of page.usage) {
    if (!COLOR_PROPS.has(d.prop)) continue;
    const v = resolved(d, page);
    if (v === null) continue;
    for (const c of colorsIn(v)) {
      const k = rgbKey(c);
      const e = out.get(k) ?? { rgba: { ...c, a: 1 }, uses: 0, where: [] };
      e.uses++;
      if (e.where.length < 3 && !e.where.includes(d.selector)) e.where.push(d.selector.slice(0, 120));
      out.set(k, e);
    }
  }
  return out;
}

/** Absolute px of a px or rem token; null for anything else. */
export function absPx(token: string): number | null {
  const d = parseDimension(token);
  return d && d.px !== null ? d.px : null;
}

/** The args of a top-level function call `name(...)`, or null. */
function fnArgs(token: string, name: string): string[] | null {
  const low = token.toLowerCase();
  if (!low.startsWith(`${name}(`) || !low.endsWith(')')) return null;
  return splitTop(token.slice(name.length + 1, -1), ',').map((s) => s.trim());
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** f03: distinct font sizes in px (clamp() contributes its absolute bounds). */
export function shippedFontSizes(page: PageCss): Map<number, { uses: number; where: string[] }> {
  const out = new Map<number, { uses: number; where: string[] }>();
  const add = (px: number, sel: string) => {
    const k = r4(px);
    const e = out.get(k) ?? { uses: 0, where: [] };
    e.uses++;
    if (e.where.length < 3 && !e.where.includes(sel)) e.where.push(sel.slice(0, 120));
    out.set(k, e);
  };
  for (const d of page.usage) {
    if (d.prop !== 'font-size') continue;
    const v = resolved(d, page);
    if (v === null) continue;
    const t = v.trim();
    const clamp = fnArgs(t, 'clamp');
    if (clamp && clamp.length === 3) {
      const lo = absPx(clamp[0]);
      const hi = absPx(clamp[2]);
      if (lo !== null && hi !== null) { add(lo, d.selector); add(hi, d.selector); }
      continue;
    }
    const px = absPx(t);
    if (px !== null && px > 0) add(px, d.selector);
  }
  return out;
}

/** next/font names fold to the face: '__Inter_aaf875' and '__Inter_Fallback_aaf875' read 'Inter'; 'X Fallback' reads 'X'. */
export function foldFace(name: string): string {
  const n = cleanFamily(name);
  const m = /^__(.+?)(?:_Fallback)?_[0-9a-f]{5,8}$/i.exec(n);
  if (m) return m[1].replace(/_/g, ' ');
  return n.replace(/\s+fallback$/i, '');
}

/** f04: the first named family of each font-family stack (generics skipped), folded. */
export function shippedFaces(page: PageCss): Map<string, { name: string; uses: number; where: string[] }> {
  const out = new Map<string, { name: string; uses: number; where: string[] }>();
  for (const d of page.usage) {
    if (d.prop !== 'font-family') continue;
    const v = resolved(d, page);
    if (v === null) continue;
    const first = splitTop(v, ',').map((s) => cleanFamily(s)).find((s) => s && !isGenericFamily(s) && !s.toLowerCase().startsWith('var('));
    if (!first) continue;
    const name = foldFace(first);
    const k = name.toLowerCase();
    const e = out.get(k) ?? { name, uses: 0, where: [] };
    e.uses++;
    if (e.where.length < 3 && !e.where.includes(d.selector)) e.where.push(d.selector.slice(0, 120));
    out.set(k, e);
  }
  return out;
}

export type ShippedLineHeight = { key: string; kind: 'ratio' | 'length'; value: number; ruleFontPx: number[]; uses: number; where: string[] };

/** f05: distinct line heights (unitless as ratios, px and rem as lengths), with the font sizes of their rules. */
export function shippedLineHeights(page: PageCss): Map<string, ShippedLineHeight> {
  const fontPxByRule = new Map<number, number>();
  for (const d of page.usage) {
    if (d.prop !== 'font-size') continue;
    const v = resolved(d, page);
    const px = v === null ? null : absPx(v.trim());
    if (px) fontPxByRule.set(d.rule, px);
  }
  const out = new Map<string, ShippedLineHeight>();
  for (const d of page.usage) {
    if (d.prop !== 'line-height') continue;
    const v = resolved(d, page);
    if (v === null) continue;
    const t = v.trim();
    let kind: 'ratio' | 'length';
    let value: number;
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t) && t.length < 32) {
      kind = 'ratio';
      value = parseFloat(t);
    } else {
      const px = absPx(t);
      if (px === null) continue;
      kind = 'length';
      value = px;
    }
    if (!(value > 0)) continue;
    const key = `${kind}:${r4(value)}`;
    const e = out.get(key) ?? { key, kind, value, ruleFontPx: [], uses: 0, where: [] };
    e.uses++;
    const fpx = fontPxByRule.get(d.rule);
    if (fpx && !e.ruleFontPx.includes(fpx)) e.ruleFontPx.push(fpx);
    if (e.where.length < 3 && !e.where.includes(d.selector)) e.where.push(d.selector.slice(0, 120));
    out.set(key, e);
  }
  return out;
}

/** Distinct px components of the declarations whose property passes `want` (0, %, em, auto and functions left out). */
export function shippedLengths(page: PageCss, want: (prop: string) => boolean, opts: { abs?: boolean; minPx?: number } = {}): Map<number, { uses: number; where: string[] }> {
  const out = new Map<number, { uses: number; where: string[] }>();
  for (const d of page.usage) {
    if (!want(d.prop)) continue;
    const v = resolved(d, page);
    if (v === null) continue;
    for (const part of valueParts(v)) {
      let px = absPx(part);
      if (px === null || px === 0) continue;
      if (opts.abs) px = Math.abs(px);
      if (px < 0) continue;
      if (opts.minPx !== undefined && px < opts.minPx) continue;
      const k = r4(px);
      const e = out.get(k) ?? { uses: 0, where: [] };
      e.uses++;
      if (e.where.length < 3 && !e.where.includes(d.selector)) e.where.push(d.selector.slice(0, 120));
      out.set(k, e);
    }
  }
  return out;
}

const TIME_PROPS = new Set(['transition', 'transition-duration', 'animation', 'animation-duration']);
const CURVE_PROPS = new Set(['transition', 'transition-timing-function', 'animation', 'animation-timing-function']);

/** f11: distinct durations (ms, 0 left out) and curves, from transition and animation. */
export function shippedMotion(page: PageCss): { durations: Map<number, number>; curves: Map<string, { points: [number, number, number, number]; uses: number }> } {
  const durations = new Map<number, number>();
  const curves = new Map<string, { points: [number, number, number, number]; uses: number }>();
  for (const d of page.usage) {
    if (!TIME_PROPS.has(d.prop) && !CURVE_PROPS.has(d.prop)) continue;
    const v = resolved(d, page);
    if (v === null) continue;
    for (const item of splitTop(v, ',')) {
      const parts = valueParts(item.trim());
      if (TIME_PROPS.has(d.prop)) {
        // In a shorthand the first time is the duration, the second the delay.
        const times = parts.map(parseDurationMs).filter((x): x is number => x !== null);
        const ms = d.prop.endsWith('-duration') ? times[0] : times[0];
        if (ms !== undefined && ms > 0) durations.set(ms, (durations.get(ms) ?? 0) + 1);
      }
      if (CURVE_PROPS.has(d.prop)) {
        for (const p of parts) {
          const low = p.toLowerCase();
          if (!(low in EASING_KEYWORDS) && !low.startsWith('cubic-bezier(')) continue;
          const pts = parseEasing(p);
          if (!pts) continue;
          const k = pts.map((x) => Math.round(x * 1e6) / 1e6).join(',');
          const e = curves.get(k) ?? { points: pts, uses: 0 };
          e.uses++;
          curves.set(k, e);
        }
      }
    }
  }
  return { durations, curves };
}

/** The v24 interactive selector set: button, a, input, textarea, select, [role=button], .btn, .button, .chip, .tab, .nav-link. */
export function isInteractiveSelector(selector: string): boolean {
  for (const raw of splitTop(selector, ',')) {
    const part = raw.trim().toLowerCase();
    if (/(^|[\s>+~(])(?:button|a|input|textarea|select)(?=$|[\s.#:[>+~,)])/.test(part)) return true;
    if (part.includes('[role') && part.includes('button')) return true;
    if (/\.(?:btn|button|chip|tab|nav-link)(?![\w-])/.test(part)) return true;
  }
  return false;
}

/** f12: explicit min sizes on interactive selectors, in px. */
export function shippedTargets(page: PageCss): Array<{ px: number; prop: string; selector: string }> {
  const out: Array<{ px: number; prop: string; selector: string }> = [];
  for (const d of page.usage) {
    if (!SIZE_PROPS.has(d.prop) || !isInteractiveSelector(d.selector)) continue;
    const v = resolved(d, page);
    const px = v === null ? null : absPx(v.trim());
    if (px === null) continue;
    out.push({ px, prop: d.prop, selector: d.selector.slice(0, 120) });
  }
  return out;
}

/** Every color, family and length any root custom property holds (for "located by value"). */
export function rootValueIndex(page: PageCss): { colors: Set<string>; px: Set<number>; faces: Set<string> } {
  const colors = new Set<string>();
  const px = new Set<number>();
  const faces = new Set<string>();
  for (const raw of page.rootVars.values()) {
    const v = resolveVars(raw, page.rootVars);
    if (v === null) continue;
    for (const c of colorsIn(v)) colors.add(rgbKey(c));
    for (const part of valueParts(v)) {
      const p = absPx(part);
      if (p !== null) px.add(r4(Math.abs(p)));
    }
    const first = splitTop(v, ',')[0];
    if (first) faces.add(foldFace(first).toLowerCase());
  }
  return { colors, px, faces };
}

/** Every color in usage CSS, any property (for "located by value"). */
export function usageColors(page: PageCss): Set<string> {
  const out = new Set<string>();
  for (const d of page.usage) {
    const v = resolved(d, page);
    if (v === null) continue;
    for (const c of colorsIn(v)) out.add(rgbKey(c));
  }
  return out;
}
