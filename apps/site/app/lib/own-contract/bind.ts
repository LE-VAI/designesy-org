// Binding (engine spec 5.2, 5.3): where the page ships each declared token.
//
// A token is located, first rule that holds:
//   1. by map:  the token map (request or $extensions) names a variable the
//               page declares;
//   2. by name: a candidate variable exists on the page: the DESIGN.md format
//               linter's Tailwind v4 and CSS-variable export names, the full
//               path joined with "-", or the bare name. Two candidates with
//               different values are ambiguous: not located by name, and a
//               BINDING_AMBIGUOUS note goes to coverage;
//   3. by value: the normalized value appears in usage CSS, or as a custom
//               property value.
// A mapped variable the page does not declare leaves the token unlocated (it
// is not an error: the page may not use it).
//
// Candidate names are built from the token path and compared by string
// equality; nothing here builds a regular expression from a name (section 12).

import { resolveVars, type PageCss } from './css';
import { absPx, foldFace, rgbKey, rootValueIndex, shippedFaces, shippedFontSizes, shippedLengths, shippedLineHeights, shippedMotion, usageColors, isSpacingProp, RADIUS_PROPS } from './extract';
import { lineHeightRatio, parseColor, parseDurationMs, parseEasing, sameRgba } from './normalize';
import type { GroupName, OwnContract, Rgba8 } from './types';

export type UnitKind = 'color' | 'fontSize' | 'lineHeight' | 'family' | 'radius' | 'spacing' | 'size' | 'duration' | 'easing';

export interface Binding {
  path: string;
  kind: UnitKind;
  /** The coverage group it counts in; null for nested values and line heights. */
  group: GroupName | null;
  located: 'map' | 'name' | 'value' | null;
  /** The variable it was located through (map or name). */
  cssVar?: string;
  /** That variable's resolved value on the page. */
  shipped?: string;
  /** The declared value, for comparisons. */
  declared: { color?: Rgba8; px?: number | null; unit?: string; value?: number; ratio?: number | null; face?: string; ms?: number; points?: number[] };
  /** Display form of the declared value. */
  declaredText: string;
  /** The face key, for family units (coverage counts distinct faces). */
  faceKey?: string;
  nested?: boolean;
}

/** Lower-case and replace `.`, `_` and `/` with `-` (section 5.2). */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[._/]/g, '-').replace(/-\$root$/, '').replace(/\$root-?/g, '');
}

/** The path without its group segment: 'colors.primary' -> 'primary'; 'color.brand.500' -> 'brand-500'. */
function nameOf(path: string): string {
  const segs = path.split('.').filter((s) => s !== '$root');
  return slug(segs.slice(1).join('.') || segs[0]);
}

function candidates(kind: UnitKind, path: string, stylePath?: string): string[] {
  const full = `--${slug(path)}`;
  if (kind === 'fontSize' || kind === 'lineHeight' || (kind === 'family' && stylePath)) {
    const n = nameOf(stylePath ?? path);
    const prefix = kind === 'fontSize' ? ['--text-', '--font-size-'] : kind === 'lineHeight' ? ['--leading-', '--line-height-'] : ['--font-', '--font-family-'];
    return [...prefix.map((p) => p + n), full];
  }
  const n = nameOf(path);
  const bare = `--${n}`;
  switch (kind) {
    case 'color': return [`--color-${n}`, full, bare];
    case 'family': return [`--font-${n}`, full, bare];
    case 'radius': return [`--radius-${n}`, `--rounded-${n}`, full, bare];
    case 'spacing': return [`--spacing-${n}`, full, bare];
    default: return [full, bare];
  }
}

const fmtPx = (px: number) => `${Math.round(px * 100) / 100}px`;

/** Parse a shipped variable value as the unit's kind, for comparisons. */
export function sameAsDeclared(b: Binding, shipped: string | undefined): boolean {
  if (shipped === undefined) return false;
  const s = shipped.trim();
  switch (b.kind) {
    case 'color': {
      const c = parseColor(s);
      return !!c && !!b.declared.color && sameRgba(c, b.declared.color);
    }
    case 'family':
      return foldFace(s.split(',')[0]).toLowerCase() === b.declared.face;
    case 'lineHeight': {
      if (b.declared.ratio !== undefined && b.declared.ratio !== null && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return Math.abs(parseFloat(s) - b.declared.ratio) <= 0.01;
      const px = absPx(s);
      return px !== null && b.declared.px !== undefined && b.declared.px !== null && Math.abs(px - b.declared.px) <= 0.01;
    }
    case 'duration': {
      const ms = parseDurationMs(s);
      return ms !== null && ms === b.declared.ms;
    }
    case 'easing': {
      const p = parseEasing(s);
      return !!p && !!b.declared.points && p.every((x, i) => Math.abs(x - b.declared.points![i]) <= 0.001);
    }
    default: {
      if (b.declared.px === null || b.declared.px === undefined) {
        // em: compare as written.
        return s.toLowerCase() === `${b.declared.value}${b.declared.unit}`;
      }
      const px = absPx(s);
      return px !== null && Math.abs(px - b.declared.px) <= 0.01;
    }
  }
}

/** Every declared unit of the contract, unbound. */
export function unitsOf(c: OwnContract): Array<Binding & { names: string[] }> {
  const out: Array<Binding & { names: string[] }> = [];
  const push = (b: Omit<Binding, 'located'>, names: string[]) => out.push({ ...b, located: null, names });
  for (const t of c.colors) {
    push({ path: t.path, kind: 'color', group: t.nested ? null : 'colors', declared: { color: t.rgba }, declaredText: t.hex.slice(0, 7).toUpperCase(), cssVar: t.cssVar, nested: t.nested }, t.nested ? [] : candidates('color', t.path));
  }
  for (const s of c.typography) {
    if (s.fontSize) {
      const path = `${s.path}.fontSize`;
      const cssVar = c.tokenMap.get(path) ?? c.tokenMap.get(s.path) ?? s.cssVar;
      push({ path, kind: 'fontSize', group: 'typography', declared: { px: s.fontSize.px, unit: s.fontSize.unit, value: s.fontSize.value }, declaredText: `${s.fontSize.value}${s.fontSize.unit}`, cssVar }, candidates('fontSize', path, s.path));
    }
    if (s.lineHeight) {
      const path = `${s.path}.lineHeight`;
      const ratio = lineHeightRatio(s.lineHeight, s.fontSize);
      const lhPx = s.lineHeight.kind === 'length' ? s.lineHeight.dim.px : null;
      push({ path, kind: 'lineHeight', group: null, declared: { ratio: s.lineHeight.kind === 'ratio' ? s.lineHeight.value : ratio, px: lhPx }, declaredText: s.lineHeight.kind === 'ratio' ? String(s.lineHeight.value) : `${s.lineHeight.dim.value}${s.lineHeight.dim.unit}`, cssVar: c.tokenMap.get(path) }, candidates('lineHeight', path, s.path));
    }
  }
  const styleOf = (familyPath: string) => (familyPath.endsWith('.fontFamily') ? familyPath.slice(0, -'.fontFamily'.length) : undefined);
  for (const f of c.families) {
    const face = f.families.find((x) => x) ?? '';
    const stylePath = styleOf(f.path);
    push({ path: f.path, kind: 'family', group: 'typography', declared: { face: foldFace(face).toLowerCase() }, declaredText: face, faceKey: foldFace(face).toLowerCase(), cssVar: f.cssVar }, candidates('family', f.path, stylePath));
  }
  const dims = (list: OwnContract['radii'], kind: UnitKind, group: GroupName) => {
    for (const t of list) push({ path: t.path, kind, group: t.nested ? null : group, declared: { px: t.dim.px, unit: t.dim.unit, value: t.dim.value }, declaredText: `${t.dim.value}${t.dim.unit}`, cssVar: t.cssVar, nested: t.nested }, t.nested ? [] : candidates(kind, t.path));
  };
  dims(c.radii, 'radius', 'radii');
  dims(c.spacing, 'spacing', 'spacing');
  dims(c.sizes, 'size', 'sizes');
  for (const t of c.durations) push({ path: t.path, kind: 'duration', group: 'durations', declared: { ms: t.ms }, declaredText: `${t.ms}ms`, cssVar: t.cssVar }, candidates('duration', t.path));
  for (const t of c.easings) push({ path: t.path, kind: 'easing', group: 'easings', declared: { points: t.points }, declaredText: `cubic-bezier(${t.points.join(', ')})`, cssVar: t.cssVar }, candidates('easing', t.path));
  return out;
}

/** A shipped value in the form two candidates are compared in (so #fff and #ffffff agree). */
function comparable(kind: UnitKind, v: string | undefined): string {
  const s = (v ?? '').trim().toLowerCase();
  if (kind === 'color') {
    const c = parseColor(s);
    return c ? `${rgbKey(c)},${c.a}` : s;
  }
  if (kind === 'family') return foldFace(s.split(',')[0]).toLowerCase();
  const px = absPx(s);
  return px !== null ? `${Math.round(px * 10000) / 10000}px` : s;
}

export interface BindResult {
  bindings: Binding[];
  notes: string[];
}

export function bindContract(c: OwnContract, page: PageCss): BindResult {
  const notes: string[] = [];
  const shippedOf = (v: string) => {
    const raw = page.rootVars.get(v);
    if (raw === undefined) return undefined;
    return resolveVars(raw, page.rootVars) ?? raw;
  };

  // By-value indexes, built once.
  const rootIdx = rootValueIndex(page);
  const colors = usageColors(page);
  for (const k of rootIdx.colors) colors.add(k);
  const fontPx = new Set([...shippedFontSizes(page).keys()]);
  const faces = new Set([...shippedFaces(page).keys()]);
  for (const f of rootIdx.faces) faces.add(f);
  const radiusPx = new Set([...shippedLengths(page, (p) => RADIUS_PROPS.has(p)).keys()]);
  const spacingPx = new Set([...shippedLengths(page, isSpacingProp, { abs: true }).keys()]);
  const sizePx = new Set([...shippedLengths(page, (p) => p === 'height' || p === 'width' || p.startsWith('min-') || p.startsWith('max-') || p.endsWith('-size')).keys()]);
  const lineHeights = shippedLineHeights(page);
  const motion = shippedMotion(page);
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const pxHit = (set: Set<number>, px: number | null | undefined) => px !== null && px !== undefined && (set.has(r4(px)) || rootIdx.px.has(r4(px)));

  const byValue = (b: Binding): boolean => {
    switch (b.kind) {
      case 'color': return !!b.declared.color && colors.has(rgbKey(b.declared.color));
      case 'fontSize': return pxHit(fontPx, b.declared.px);
      case 'family': return !!b.declared.face && faces.has(b.declared.face);
      case 'radius': return pxHit(radiusPx, b.declared.px);
      case 'spacing': return pxHit(spacingPx, b.declared.px);
      case 'size': return pxHit(sizePx, b.declared.px);
      case 'lineHeight':
        for (const l of lineHeights.values()) {
          if (l.kind === 'ratio' && b.declared.ratio != null && Math.abs(l.value - b.declared.ratio) <= 0.01) return true;
          if (l.kind === 'length' && b.declared.px != null && Math.abs(l.value - b.declared.px) <= 0.01) return true;
        }
        return false;
      case 'duration': return b.declared.ms !== undefined && motion.durations.has(b.declared.ms);
      case 'easing': return [...motion.curves.values()].some((cv) => cv.points.every((x, i) => Math.abs(x - b.declared.points![i]) <= 0.001));
    }
  };

  const bindings: Binding[] = [];
  for (const u of unitsOf(c)) {
    const { names, ...b } = u;
    if (b.cssVar) {
      // Mapped: located by map when the page declares it, else unlocated.
      if (page.rootVars.has(b.cssVar)) bindings.push({ ...b, located: 'map', shipped: shippedOf(b.cssVar) });
      else bindings.push({ ...b, cssVar: undefined, located: null });
      continue;
    }
    const present = [...new Set(names)].filter((n) => page.rootVars.has(n));
    if (present.length) {
      const values = new Set(present.map((n) => comparable(b.kind, shippedOf(n))));
      if (values.size === 1) {
        bindings.push({ ...b, located: 'name', cssVar: present[0], shipped: shippedOf(present[0]) });
        continue;
      }
      notes.push(`BINDING_AMBIGUOUS ${b.path}: ${present.join(', ')} hold different values`);
    }
    bindings.push({ ...b, located: byValue(b as Binding) ? 'value' : null });
  }
  return { bindings, notes };
}

export { fmtPx };
