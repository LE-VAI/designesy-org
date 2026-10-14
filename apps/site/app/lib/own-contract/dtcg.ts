// DTCG 2025.10 reader (engine spec section 4.4), ours, written against the
// W3C Design Tokens Format Module 2025.10.
//
// The tree is walked with Map-based structures and plain key iteration: no
// parsed object is ever spread, merged or assigned into another, so a group
// named `__proto__` or `constructor` is just a name (section 12, "prototype
// safety"; fixture DT-9).
//
// Rules from the format:
//   * an object with `$value` is a token; any other object is a group;
//   * a token's type is its own `$type`, else the referenced token's type when
//     its value is a reference, else the nearest group's `$type`; never guessed
//     from the value ("Tools MUST NOT attempt to guess the type");
//   * references are `{group.token}` and JSON Pointer `{ "$ref": "#/..." }`;
//   * groups inherit with `$extends` (local tokens win); `$root` tokens;
//   * circular references are errors (ALIAS_CYCLE, with the loop's chain).

import { dtcgVersionOf } from './detect';
import { MAX_ALIAS_HOPS, MAX_DEPTH, MAX_RESOLUTION_STEPS, MAX_TOKENS } from './limits';
import { SUPPORTED_SPACES, dimension, fromSpace, hexOf, parseColor, parseDimension, parseDurationMs, parseEasing, splitFamilies, typeRole } from './normalize';
import { messageFor, problem, warning } from './problems';
import type { Alias, ColorToken, ContrastPair, Dimension, DimensionToken, DurationToken, EasingToken, FamilyToken, ParsedContract, Problem, ReadOutcome, SizeToken, TypeStyle } from './types';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

const EXT = 'org.designesy';
const INTERACTIVE_WORDS = ['button', 'btn', 'input', 'field', 'select', 'chip', 'tab', 'link', 'toggle', 'checkbox', 'radio', 'switch', 'target', 'control'];

interface RawToken {
  path: string;
  value: Json;
  ownType: string | null;
  groupType: string | null;
  /** org.designesy extension data on the token and its groups, nearest first. */
  ext: Array<Map<string, Json>>;
  deprecated: boolean;
}

function isObject(v: Json | undefined): v is JsonObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function own(o: JsonObject, k: string): Json | undefined {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

/** org.designesy data of one node as a Map (never spread). */
function extOf(o: JsonObject): Map<string, Json> {
  const e = own(o, '$extensions');
  if (!isObject(e)) return new Map();
  const d = own(e, EXT);
  if (!isObject(d)) return new Map();
  const m = new Map<string, Json>();
  for (const k of Object.keys(d)) m.set(k, d[k]);
  return m;
}

/** "{a.b}" -> "a.b"; null when the string is not a whole reference. */
function curlyRef(v: Json | undefined): string | null {
  if (typeof v !== 'string') return null;
  const m = /^\{([^{}]+)\}$/.exec(v.trim());
  return m ? m[1].trim() : null;
}

/** A JSON Pointer `{ "$ref": "#/a/b/$value/x" }` as segments. */
function pointerRef(v: Json | undefined): string[] | null {
  if (!isObject(v)) return null;
  const r = own(v, '$ref');
  if (typeof r !== 'string' || !r.startsWith('#/')) return null;
  return r.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Line and column of a JSON.parse error, from V8's message. */
export function jsonErrorPosition(text: string, message: string): { line: number; column: number } {
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(message);
  const at = pos ? Number(pos[1]) : text.length;
  const before = text.slice(0, at);
  const line = before.split('\n').length;
  return { line, column: at - before.lastIndexOf('\n') };
}

export function readDtcg(text: string): ReadOutcome {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  let root: Json;
  try {
    root = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as Json;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'parser error';
    const pos = jsonErrorPosition(text, msg);
    errors.push(problem('JSON_INVALID', { line: pos.line, column: pos.column, value: msg.replace(/\s*\(line \d+ column \d+\)/, '').replace(/ in JSON at position \d+.*/, '') }));
    return { errors, warnings, parsed: null };
  }
  if (!isObject(root)) {
    errors.push(problem('NO_TOKENS_FOUND'));
    return { errors, warnings, parsed: null };
  }

  // ── 1. Walk ──
  const tokens = new Map<string, RawToken>();
  const groups = new Map<string, { node: JsonObject; type: string | null; ext: Array<Map<string, Json>> }>();
  const order: string[] = [];
  let tooDeep: string | null = null;

  const walk = (node: JsonObject, path: string[], depth: number, groupType: string | null, ext: Array<Map<string, Json>>) => {
    if (depth > MAX_DEPTH) {
      if (!tooDeep) tooDeep = path.join('.');
      return;
    }
    const t = own(node, '$type');
    const type = typeof t === 'string' ? t : groupType;
    const here = [extOf(node), ...ext];
    if (path.length) groups.set(path.join('.'), { node, type, ext: here });
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (key.startsWith('$') && key !== '$root') continue;
      if (!isObject(child)) continue;
      const p = [...path, key];
      if (Object.prototype.hasOwnProperty.call(child, '$value')) {
        const ownType = own(child, '$type');
        const path = p.join('.');
        tokens.set(path, {
          path,
          value: child.$value,
          ownType: typeof ownType === 'string' ? ownType : null,
          groupType: type,
          ext: [extOf(child), ...here],
          deprecated: own(child, '$deprecated') === true || typeof own(child, '$deprecated') === 'string',
        });
        order.push(path);
      } else if (key !== '$root') {
        walk(child, p, depth + 1, type, here);
      }
    }
  };
  walk(root, [], 0, null, []);
  if (tooDeep) {
    errors.push(problem('TOO_DEEP', { path: tooDeep, limit: MAX_DEPTH }));
    return { errors, warnings, parsed: null };
  }

  // ── 2. $extends: inherited tokens, local ones win ──
  const extendsOf = (g: JsonObject): string | null => {
    const e = own(g, '$extends');
    const c = curlyRef(e as Json);
    if (c) return c;
    if (typeof e === 'string') return e.replace(/^\{|\}$/g, '');
    const ptr = pointerRef(e as Json);
    return ptr ? ptr.join('.') : null;
  };
  const extended = new Set<string>();
  const applyExtends = (gpath: string, stack: string[]): boolean => {
    if (extended.has(gpath)) return true;
    const g = groups.get(gpath);
    if (!g) return true;
    const target = extendsOf(g.node);
    if (!target) { extended.add(gpath); return true; }
    if (stack.includes(target) || target === gpath) {
      const loop = target === gpath ? [gpath, gpath] : [...stack.slice(stack.indexOf(target)), gpath, target];
      errors.push(problem('ALIAS_CYCLE', { path: loop[0], chain: loop }));
      return false;
    }
    if (!groups.has(target)) {
      errors.push(problem('ALIAS_UNRESOLVED', { path: gpath, ref: `{${target}}` }));
      return false;
    }
    if (!applyExtends(target, [...stack, gpath])) return false;
    // A group that extends another and states no $type takes the base's, so
    // its local overrides are typed like the tokens they replace.
    const base = groups.get(target)!;
    if (!g.type && base.type) {
      g.type = base.type;
      for (const tok of tokens.values()) if (tok.path.startsWith(`${gpath}.`) && tok.groupType === null) tok.groupType = base.type;
    }
    for (const [p, tok] of [...tokens]) {
      if (!p.startsWith(`${target}.`)) continue;
      const rel = p.slice(target.length + 1);
      const np = `${gpath}.${rel}`;
      if (tokens.has(np)) continue;
      tokens.set(np, { ...tok, path: np, groupType: tok.groupType });
      order.push(np);
    }
    extended.add(gpath);
    return true;
  };
  for (const gpath of groups.keys()) applyExtends(gpath, []);
  if (errors.length) return { errors, warnings, parsed: null };

  if (tokens.size > MAX_TOKENS) {
    errors.push(problem('TOO_MANY_TOKENS', { count: tokens.size, limit: MAX_TOKENS }));
    return { errors, warnings, parsed: null };
  }
  if (tokens.size === 0) {
    errors.push(problem('NO_TOKENS_FOUND'));
    return { errors, warnings, parsed: null };
  }

  // ── 3. Resolve references ──
  let steps = 0;
  type Resolved = { value: Json; type: string | null; hops: number } | null;
  const memo = new Map<string, Resolved>();
  const reported = new Set<string>();
  const fail = (p: Problem) => {
    let key = `${p.code}:${p.path}`;
    if (p.code === 'ALIAS_CYCLE' && p.chain) {
      // One problem per loop, whichever token it was reached from: rotate the
      // loop to start at its smallest path.
      const loop = p.chain.slice(0, -1);
      const min = loop.reduce((a, b) => (b < a ? b : a));
      const i = loop.indexOf(min);
      p.chain = [...loop.slice(i), ...loop.slice(0, i), min];
      p.path = min;
      p.message = messageFor('ALIAS_CYCLE', p);
      key = `ALIAS_CYCLE:${p.chain.join('>')}`;
    }
    if (!reported.has(key)) { reported.add(key); errors.push(p); }
  };
  const lookup = (ref: string): string | null => {
    if (tokens.has(ref)) return ref;
    if (tokens.has(`${ref}.$root`)) return `${ref}.$root`;
    return null;
  };

  // Resolve a value inside token `at`; `chain` is the token paths followed so far.
  const resolveValue = (v: Json, at: string, chain: string[]): { value: Json; refType: string | null; hops: number } | null => {
    if (++steps > MAX_RESOLUTION_STEPS) {
      fail(problem('ALIAS_TOO_DEEP', { path: at, limit: MAX_RESOLUTION_STEPS }));
      return null;
    }
    const curly = curlyRef(v);
    const ptr = curly ? null : pointerRef(v);
    if (curly || ptr) {
      let targetPath: string | null;
      let rest: string[] = [];
      if (curly) targetPath = lookup(curly);
      else {
        const vi = ptr!.indexOf('$value');
        const head = vi >= 0 ? ptr!.slice(0, vi) : ptr!;
        rest = vi >= 0 ? ptr!.slice(vi + 1) : [];
        targetPath = lookup(head.join('.'));
      }
      const written = curly ? `{${curly}}` : `#/${ptr!.join('/')}`;
      if (!targetPath) {
        fail(problem('ALIAS_UNRESOLVED', { path: at, ref: written }));
        return null;
      }
      if (chain.includes(targetPath)) {
        const loop = [...chain.slice(chain.indexOf(targetPath)), targetPath];
        fail(problem('ALIAS_CYCLE', { path: loop[0], chain: loop }));
        return null;
      }
      const r = resolveToken(targetPath, chain);
      if (!r) return null;
      let value = r.value;
      for (const seg of rest) {
        if (isObject(value)) value = own(value, seg) ?? null;
        else if (Array.isArray(value) && /^\d+$/.test(seg)) value = value[Number(seg)] ?? null;
        else value = null;
      }
      return { value, refType: rest.length ? null : r.type, hops: r.hops + 1 };
    }
    if (Array.isArray(v)) {
      const out: Json[] = [];
      let hops = 0;
      for (const x of v) {
        const r = resolveValue(x, at, chain);
        if (!r) return null;
        out.push(r.value);
        hops = Math.max(hops, r.hops);
      }
      return { value: out, refType: null, hops };
    }
    if (isObject(v)) {
      const out: JsonObject = Object.create(null) as JsonObject;
      let hops = 0;
      for (const k of Object.keys(v)) {
        const r = resolveValue(v[k], at, chain);
        if (!r) return null;
        out[k] = r.value;
        hops = Math.max(hops, r.hops);
      }
      return { value: out, refType: null, hops };
    }
    return { value: v, refType: null, hops: 0 };
  };
  const resolveToken = (path: string, chain: string[]): Resolved => {
    if (memo.has(path)) return memo.get(path)!;
    const t = tokens.get(path)!;
    const r = resolveValue(t.value, path, [...chain, path]);
    let out: Resolved = r ? { value: r.value, type: t.ownType ?? r.refType ?? t.groupType, hops: r.hops } : null;
    if (out && out.hops > MAX_ALIAS_HOPS) {
      fail(problem('ALIAS_TOO_DEEP', { path, limit: MAX_ALIAS_HOPS }));
      out = null;
    }
    // Only cache results reached from a clean start, so a cycle found through
    // one chain is reported once with that chain.
    if (chain.length === 0) memo.set(path, out);
    return out;
  };

  const resolved = new Map<string, { value: Json; type: string | null; hops: number }>();
  for (const path of order) {
    if (resolved.has(path)) continue;
    const r = resolveToken(path, []);
    if (r) resolved.set(path, r);
  }
  if (errors.length) return { errors, warnings, parsed: null };

  // ── 4. Model ──
  const colors: ColorToken[] = [];
  const typography: TypeStyle[] = [];
  const families: FamilyToken[] = [];
  const radii: DimensionToken[] = [];
  const spacing: DimensionToken[] = [];
  const sizes: SizeToken[] = [];
  const durations: DurationToken[] = [];
  const easings: EasingToken[] = [];
  const aliases: Alias[] = [];

  const extValue = (t: RawToken, key: string): Json | undefined => {
    for (const m of t.ext) if (m.has(key)) return m.get(key);
    return undefined;
  };

  const readColor = (v: Json, path: string, nested: boolean): ColorToken | null => {
    if (typeof v === 'string') {
      const c = parseColor(v);
      if (!c) { errors.push(problem('VALUE_INVALID', { path, value: v, kind: 'color' })); return null; }
      warnings.push(warning('LEGACY_COLOR_STRING', { path, value: hexOf(c).slice(0, 7) }));
      return { kind: 'color', path, rgba: c, hex: hexOf(c), original: v, ...(nested ? { nested } : {}) };
    }
    if (!isObject(v)) { errors.push(problem('VALUE_INVALID', { path, value: v, kind: 'color' })); return null; }
    const space = own(v, 'colorSpace');
    const comps = own(v, 'components');
    const alphaRaw = own(v, 'alpha');
    const alpha = typeof alphaRaw === 'number' ? alphaRaw : 1;
    const hex = own(v, 'hex');
    let c = null;
    if (typeof space === 'string' && SUPPORTED_SPACES.has(space) && Array.isArray(comps) && comps.length === 3) {
      const n = comps.map((x) => (x === 'none' ? 0 : x));
      if (n.every((x) => typeof x === 'number')) c = fromSpace(space, n as number[], alpha);
    }
    if (!c && typeof hex === 'string') {
      const h = parseColor(hex);
      if (h) c = { ...h, a: alpha };
      if (c && typeof space === 'string' && !SUPPORTED_SPACES.has(space)) {
        // Read from its hex member: comparable, so no warning.
      }
    }
    if (!c) {
      if (typeof space === 'string' && !SUPPORTED_SPACES.has(space)) {
        warnings.push(warning('COLOR_SPACE_UNSUPPORTED', { path, space }));
        return null;
      }
      errors.push(problem('VALUE_INVALID', { path, value: v, kind: 'color' }));
      return null;
    }
    return { kind: 'color', path, rgba: c, hex: hexOf(c), original: typeof hex === 'string' ? hex : hexOf(c).slice(0, 7), ...(nested ? { nested } : {}) };
  };

  const readDim = (v: Json, path: string): Dimension | null => {
    if (typeof v === 'string') {
      const d = parseDimension(v);
      if (d) return d;
    } else if (isObject(v)) {
      const val = own(v, 'value');
      const unit = own(v, 'unit');
      if (typeof val === 'number' && typeof unit === 'string') {
        const d = dimension(val, unit);
        if (d) return d;
      }
    }
    errors.push(problem('VALUE_INVALID', { path, value: v, kind: 'dimension' }));
    return null;
  };

  const roleOf = (t: RawToken): string | null => {
    const r = extValue(t, 'role');
    if (typeof r === 'string') return r;
    const segs = t.path.toLowerCase().split('.');
    const has = (words: string[]) => segs.some((s) => words.some((w) => s === w || s.startsWith(`${w}-`) || s.endsWith(`-${w}`)));
    if (has(['radius', 'radii', 'rounded', 'corner'])) return 'radius';
    if (has(['font-size', 'fontsize', 'text-size', 'type-scale'])) return 'fontSize';
    if (has(['line-height', 'lineheight', 'leading'])) return 'lineHeight';
    if (has(['space', 'spacing', 'gap', 'inset', 'gutter', 'stack'])) return 'spacing';
    if (has(['size', 'height', 'width', 'target', 'control'])) return 'size';
    return null;
  };

  const lastName = (path: string) => path.split('.').filter((s) => s !== '$root').pop() || path;

  for (const path of order) {
    const r = resolved.get(path);
    const t = tokens.get(path)!;
    if (!r) continue;
    const type = r.type;
    if (!type) {
      warnings.push(warning('NO_TYPE', { path }));
      continue;
    }
    const ref = curlyRef(t.value) ?? (pointerRef(t.value)?.filter((s) => s !== '$value').join('.') || null);
    const cssVarRaw = extValue(t, 'cssVar');
    const cssVar = typeof cssVarRaw === 'string' ? cssVarRaw : undefined;
    const base = { path, ...(ref ? { aliasOf: lookup(ref) ?? ref } : {}), ...(t.deprecated ? { deprecated: true } : {}), ...(cssVar && t.ext[0].has('cssVar') ? { cssVar } : {}) };
    if (ref) aliases.push({ from: path, to: lookup(ref) ?? ref });

    switch (type) {
      case 'color': {
        const c = readColor(r.value, path, false);
        if (c) colors.push({ ...c, ...base });
        break;
      }
      case 'dimension': {
        const d = readDim(r.value, path);
        if (!d) break;
        const role = roleOf(t);
        if (role === 'radius') radii.push({ kind: 'dimension', dim: d, ...base });
        else if (role === 'spacing') spacing.push({ kind: 'dimension', dim: d, ...base });
        else if (role === 'size') {
          const inter = extValue(t, 'interactive');
          const lower = path.toLowerCase();
          sizes.push({ kind: 'dimension', dim: d, interactive: typeof inter === 'boolean' ? inter : INTERACTIVE_WORDS.some((w) => lower.includes(w)), ...base });
        } else if (role === 'fontSize') typography.push({ kind: 'typography', role: typeRole(lastName(path)), fontSize: d, ...base });
        else if (role === 'lineHeight') typography.push({ kind: 'typography', role: typeRole(lastName(path)), lineHeight: { kind: 'length', dim: d }, ...base });
        else warnings.push(warning('DIMENSION_ROLE_UNKNOWN', { path }));
        break;
      }
      case 'fontFamily': {
        const fam = splitFamilies(r.value as Json);
        if (!fam.length) { errors.push(problem('VALUE_INVALID', { path, value: r.value, kind: 'fontFamily' })); break; }
        families.push({ kind: 'fontFamily', families: fam, ...base });
        break;
      }
      case 'duration': {
        let ms: number | null = null;
        if (typeof r.value === 'string') ms = parseDurationMs(r.value);
        else if (isObject(r.value)) {
          const val = own(r.value, 'value');
          const unit = own(r.value, 'unit');
          if (typeof val === 'number' && (unit === 'ms' || unit === 's')) ms = unit === 's' ? val * 1000 : val;
        }
        if (ms === null) { errors.push(problem('VALUE_INVALID', { path, value: r.value, kind: 'duration' })); break; }
        durations.push({ kind: 'duration', ms, ...base });
        break;
      }
      case 'cubicBezier': {
        const v = r.value;
        const pts = Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'number') ? (v as number[]) : typeof v === 'string' ? parseEasing(v) : null;
        if (!pts) { errors.push(problem('VALUE_INVALID', { path, value: v, kind: 'cubicBezier' })); break; }
        easings.push({ kind: 'cubicBezier', points: [pts[0], pts[1], pts[2], pts[3]], ...base });
        break;
      }
      case 'number': {
        if (roleOf(t) === 'lineHeight' && typeof r.value === 'number') typography.push({ kind: 'typography', role: typeRole(lastName(path)), lineHeight: { kind: 'ratio', value: r.value }, ...base });
        break;
      }
      case 'typography': {
        if (!isObject(r.value)) { errors.push(problem('VALUE_INVALID', { path, value: r.value, kind: 'typography' })); break; }
        const v = r.value;
        const style: TypeStyle = { kind: 'typography', role: typeRole(lastName(path)), ...base };
        const fam = splitFamilies(own(v, 'fontFamily') as Json);
        if (fam.length) style.families = fam;
        const fs = own(v, 'fontSize');
        if (fs !== undefined) {
          const d = readDim(fs, `${path}.fontSize`);
          if (d) style.fontSize = d;
        }
        const fw = own(v, 'fontWeight');
        if (typeof fw === 'number') style.fontWeight = fw;
        const lh = own(v, 'lineHeight');
        if (typeof lh === 'number') style.lineHeight = { kind: 'ratio', value: lh };
        else if (lh !== undefined && lh !== null) {
          const d = readDim(lh, `${path}.lineHeight`);
          if (d) style.lineHeight = { kind: 'length', dim: d };
        }
        const ls = own(v, 'letterSpacing');
        if (ls !== undefined && ls !== null) {
          const d = typeof ls === 'string' || isObject(ls) ? (typeof ls === 'string' ? parseDimension(ls) : dimension(Number(own(ls, 'value')), String(own(ls, 'unit')))) : null;
          if (d) style.letterSpacing = d;
        }
        const feats = extValue(t, 'features');
        if (Array.isArray(feats)) style.features = feats.filter((x): x is string => typeof x === 'string' && x.length === 4).map((x) => x.toLowerCase());
        typography.push(style);
        if (fam.length) families.push({ kind: 'fontFamily', path: `${path}.fontFamily`, families: fam });
        break;
      }
      case 'transition': {
        if (!isObject(r.value)) break;
        const d = own(r.value, 'duration');
        const ms = typeof d === 'string' ? parseDurationMs(d) : isObject(d) && typeof own(d, 'value') === 'number' ? (own(d, 'unit') === 's' ? (own(d, 'value') as number) * 1000 : (own(d, 'value') as number)) : null;
        if (ms !== null) durations.push({ kind: 'duration', path: `${path}.duration`, ms });
        const tf = own(r.value, 'timingFunction');
        const pts = Array.isArray(tf) && tf.length === 4 && tf.every((x) => typeof x === 'number') ? (tf as number[]) : null;
        if (pts) easings.push({ kind: 'cubicBezier', path: `${path}.timingFunction`, points: [pts[0], pts[1], pts[2], pts[3]] });
        break;
      }
      case 'border':
      case 'shadow':
      case 'gradient': {
        const subs: Array<{ v: Json; p: string }> = [];
        const v = r.value;
        if (type === 'border' && isObject(v)) subs.push({ v: own(v, 'color') ?? null, p: `${path}.color` });
        if (type === 'shadow') (Array.isArray(v) ? v : [v]).forEach((s, i) => isObject(s) && subs.push({ v: own(s, 'color') ?? null, p: Array.isArray(v) ? `${path}.${i}.color` : `${path}.color` }));
        if (type === 'gradient' && Array.isArray(v)) v.forEach((s, i) => isObject(s) && subs.push({ v: own(s, 'color') ?? null, p: `${path}.${i}.color` }));
        for (const s of subs) {
          if (s.v === null) continue;
          const c = readColor(s.v, s.p, true);
          if (c) colors.push(c);
        }
        break;
      }
      default:
        // fontWeight, strokeStyle and unknown types are counted, not scored.
        break;
    }
  }

  // ── 5. Root extension: pairs and the token map ──
  const rootExt = extOf(root);
  const pairs: ContrastPair[] = [];
  const rawPairs = rootExt.get('pairs');
  if (Array.isArray(rawPairs)) {
    rawPairs.forEach((p, i) => {
      if (!isObject(p)) return;
      const end = (field: 'text' | 'background'): string | null => {
        const v = own(p, field);
        const ref = curlyRef(v as Json);
        if (ref) {
          const target = lookup(ref);
          if (!target) { errors.push(problem('ALIAS_UNRESOLVED', { path: `$extensions.${EXT}.pairs.${i}.${field}`, ref: `{${ref}}` })); return null; }
          return target;
        }
        const c = v === undefined ? null : readColor(v as Json, `${EXT}.pairs.${i}.${field}`, true);
        if (!c) return null;
        colors.push(c);
        return c.path;
      };
      const text = end('text');
      const background = end('background');
      if (!text || !background) return;
      const role = own(p, 'role') === 'primary-action' ? 'primary-action' : 'component';
      pairs.push({ text, background, role, largeText: own(p, 'largeText') === true, source: `${EXT}.pairs.${i}` });
    });
  }
  const declaredTokenMap = new Map<string, string>();
  const tm = rootExt.get('tokenMap');
  if (isObject(tm)) for (const k of Object.keys(tm)) if (typeof tm[k] === 'string') declaredTokenMap.set(k, tm[k] as string);

  if (errors.length) return { errors, warnings, parsed: null };

  const desc = own(root, '$description');
  const parsed: ParsedContract = {
    format: 'dtcg',
    formatVersion: dtcgVersionOf(own(root, '$schema')),
    name: typeof desc === 'string' && desc.trim() ? desc.trim() : null,
    colors,
    typography,
    families,
    radii,
    spacing,
    sizes,
    durations,
    easings,
    pairs,
    aliases,
    omitted: [],
    declaredTokenMap,
    linter: null,
  };
  return { errors, warnings, parsed };
}
