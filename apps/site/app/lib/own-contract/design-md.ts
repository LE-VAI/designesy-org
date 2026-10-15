// DESIGN.md reader (contract-mode spec §4.3).
//
// Two reads of the same text, because the format's linter (@google/design.md
// 0.4.0) drops some values from its resolved model without an error:
//   1. raw: the YAML front matter (or fenced yaml blocks, in order) parsed with
//      the `yaml` package the linter itself depends on, core schema, no custom
//      tags, at most 100 aliases;
//   2. linter: lint(text), the same import v37 uses.
// Values come from the linter where it resolves them (colors in every CSS
// form, dimensions); line heights, families and font features come from the
// raw read (the linter drops unitless line heights, probe P2). A token the raw
// read declares and the model lacks is TOKEN_DROPPED (probe P3), with the
// reason this file can name; a loop of references is ALIAS_CYCLE with its
// chain; duplicate `##` sections are DUPLICATE_SECTION (probe P4: the linter
// accepts them although the format rejects them).

import { LineCounter, parseDocument } from 'yaml';
import { YAML_MAX_ALIASES } from './limits';
import { cleanFamily, dimension, hasOtherUnit, parseColor, parseDimension, parseFeatureTags, parseLineHeight, splitFamilies, typeRole, hexOf } from './normalize';
import { problem, warning } from './problems';
import type { LinterTotals, Alias, ColorToken, ContrastPair, DimensionToken, DropReason, FamilyToken, ParsedContract, Problem, ReadOutcome, SizeToken, TypeStyle } from './types';

/** The linter's import, injectable so tests and the route share one loader. */
export type LintFn = (text: string) => LintReportLike;
export interface LintReportLike {
  findings: Array<{ severity: 'error' | 'warning' | 'info'; path?: string; message: string; rule?: string }>;
  summary: { errors: number; warnings: number; infos: number };
  designSystem: {
    name?: string;
    colors: Map<string, { hex: string; r: number; g: number; b: number; a?: number }>;
    typography: Map<string, { fontFamily?: string; fontSize?: { value: number; unit: string }; fontWeight?: number; letterSpacing?: { value: number; unit: string } }>;
    rounded: Map<string, { value: number; unit: string }>;
    spacing: Map<string, { value: number; unit: string }>;
    components: Map<string, { properties: Map<string, unknown>; unresolvedRefs: string[] }>;
  };
}

export const LINTER_VERSION = '0.4.0';

const PRIMARY_ACTION = new Set(['button-primary', 'button', 'primary-button', 'cta']);
const INTERACTIVE_WORDS = ['button', 'btn', 'input', 'field', 'select', 'chip', 'tab', 'link', 'toggle', 'checkbox', 'radio', 'switch'];
const TOKEN_GROUPS = ['colors', 'typography', 'rounded', 'spacing', 'components'];
const SECTION_GROUP: Record<string, string> = { colors: 'colors', typography: 'typography', rounded: 'radii', radius: 'radii', spacing: 'spacing', components: 'components', layout: 'spacing', shapes: 'radii' };

interface YamlBlock { text: string; firstLine: number }

/** The front matter, or else every fenced yaml block, with the file line each starts on. */
export function yamlBlocks(text: string): { blocks: YamlBlock[]; bodyStartLine: number } {
  const lines = text.split('\n');
  if (lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === '---' || t === '...') return { blocks: [{ text: lines.slice(1, i).join('\n'), firstLine: 2 }], bodyStartLine: i + 2 };
    }
    return { blocks: [{ text: lines.slice(1).join('\n'), firstLine: 2 }], bodyStartLine: lines.length + 1 };
  }
  const blocks: YamlBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim().toLowerCase();
    if (t !== '```yaml' && t !== '```yml') continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '```') j++;
    blocks.push({ text: lines.slice(i + 1, j).join('\n'), firstLine: i + 2 });
    i = j;
  }
  return { blocks, bodyStartLine: 1 };
}

/** `##` headings outside code fences, with their 1-based lines. */
function headings(lines: string[], from: number): Array<{ level: number; text: string; line: number }> {
  const out: Array<{ level: number; text: string; line: number }> = [];
  let fenced = false;
  for (let i = from - 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('```')) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(t);
    if (m) out.push({ level: m[1].length, text: m[2], line: i + 1 });
  }
  return out;
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/;

/** Table rows in the markdown body: color rows anywhere, text-style rows under a type heading. */
export function proseTables(text: string, bodyStartLine: number): { colorRows: number[]; typeRows: number[] } {
  const lines = text.split('\n');
  const colorRows: number[] = [];
  const typeRows: number[] = [];
  let fenced = false;
  let section = '';
  for (let i = bodyStartLine - 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('```')) { fenced = !fenced; continue; }
    if (fenced) continue;
    const h = /^#{1,6}\s+(.+)$/.exec(t);
    if (h) { section = h[1].toLowerCase(); continue; }
    if (!t.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|?$/.test(t)) continue; // separator row
    const next = (lines[i + 1] || '').trim();
    if (/^\|[\s|:-]+\|?$/.test(next)) continue; // header row
    if (COLOR_LITERAL.test(t)) colorRows.push(i + 1);
    else if (/typograph|\btype\b|text style|font/.test(section)) typeRows.push(i + 1);
  }
  return { colorRows, typeRows };
}

function isRef(v: unknown): v is string {
  return typeof v === 'string' && /^\{[^{}]+\}$/.test(v.trim());
}
function refTarget(v: string): string {
  return v.trim().slice(1, -1).trim();
}

function asEntries(v: unknown): Array<[string, unknown]> {
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [String(k), x]);
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.keys(v).map((k) => [k, (v as Record<string, unknown>)[k]]);
  return [];
}

/**
 * Read a DESIGN.md. `lint` is the linter's lint(); the caller loads it (a
 * dynamic import in the route, a direct import in the tests).
 */
export function readDesignMd(text: string, lint: LintFn): ReadOutcome {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const lines = text.split('\n');
  const { blocks, bodyStartLine } = yamlBlocks(text);
  // The linter reads every file, accepted or not, so its own totals can be
  // cited on every outcome (the provenance line).
  let report: LintReportLike | null = null;
  try {
    report = lint(text);
  } catch {
    report = null;
  }
  const linter: LinterTotals | null = report
    ? { package: '@google/design.md', version: LINTER_VERSION, errors: report.summary.errors, warnings: report.summary.warnings, infos: report.summary.infos }
    : null;

  // ── 1. Raw read ──
  const raw = new Map<string, unknown>();
  for (const b of blocks) {
    const lc = new LineCounter();
    const doc = parseDocument(b.text, { schema: 'core', uniqueKeys: true, prettyErrors: false, lineCounter: lc, customTags: [] });
    if (doc.errors.length) {
      const e = doc.errors[0];
      const pos = e.pos ? lc.linePos(e.pos[0]) : null;
      errors.push(problem('YAML_INVALID', { line: pos ? b.firstLine + pos.line - 1 : b.firstLine, value: e.message.split('\n')[0] }));
      continue;
    }
    let js: unknown;
    try {
      js = doc.toJS({ maxAliasCount: YAML_MAX_ALIASES, mapAsMap: true });
    } catch (e) {
      errors.push(problem('YAML_INVALID', { line: b.firstLine, value: e instanceof Error ? e.message : 'parser error' }));
      continue;
    }
    for (const [k, v] of asEntries(js)) {
      const prev = raw.get(k);
      if (prev instanceof Map && v instanceof Map) for (const [ik, iv] of v) prev.set(ik, iv);
      else raw.set(k, v);
    }
  }

  // ── 2. Sections ──
  const seen = new Map<string, number>();
  for (const h of headings(lines, bodyStartLine)) {
    if (h.level !== 2) continue;
    const key = h.text.trim().toLowerCase();
    if (seen.has(key)) errors.push(problem('DUPLICATE_SECTION', { heading: h.text.trim(), line: h.line }));
    else seen.set(key, h.line);
  }

  if (errors.some((p) => p.code === 'YAML_INVALID')) return { errors, warnings, parsed: null, linter };

  const hasGroups = TOKEN_GROUPS.some((g) => asEntries(raw.get(g)).length > 0);
  if (!hasGroups) {
    const prose = proseTables(text, bodyStartLine);
    if (prose.colorRows.length) {
      const span = (rows: number[]): [number, number] | undefined => (rows.length ? [rows[0], rows[rows.length - 1]] : undefined);
      errors.push(problem('TOKENS_IN_PROSE', {
        colorRows: prose.colorRows.length,
        colorLines: span(prose.colorRows),
        typeRows: prose.typeRows.length,
        typeLines: span(prose.typeRows),
        keys: [...raw.keys()].map(String),
      }));
    } else {
      errors.push(problem('NO_TOKENS_FOUND'));
    }
    return { errors, warnings, parsed: null, linter };
  }

  // ── 3. Linter read ──
  if (!report) report = lint(text);
  const ds = report.designSystem;
  // The linter's own sentence rides as linterMessage, whole (a long one is
  // cut at a word boundary, never mid-word); `value` stays what the engine
  // spec says it is, the offending value, cut to 80 characters. A LINT_ERROR
  // is the reading only where no structured code covers its path: the dedupe
  // at the end of this reader drops it when one does.
  const scalarAt = (path: string | undefined): string | undefined => {
    if (!path) return undefined;
    const dot = path.indexOf('.');
    if (dot < 0) return undefined;
    for (const [k, v] of asEntries(raw.get(path.slice(0, dot)))) if (k === path.slice(dot + 1)) return v === null || typeof v === 'object' ? undefined : String(v);
    return undefined;
  };
  for (const f of report.findings) {
    if (f.severity === 'error') {
      errors.push(problem('LINT_ERROR', { path: f.path, value: scalarAt(f.path), linterMessage: f.message, rule: f.rule }));
    } else if (f.severity === 'warning') {
      warnings.push(warning('LINT_WARNING', { path: f.path, value: scalarAt(f.path), linterMessage: f.message, rule: f.rule }));
    }
  }

  // ── 4. References: cycles, unresolved targets, wrong kinds ──
  const rawValue = (path: string): unknown => {
    const dot = path.indexOf('.');
    if (dot < 0) return undefined;
    const g = raw.get(path.slice(0, dot));
    for (const [k, v] of asEntries(g)) if (k === path.slice(dot + 1)) return v;
    return undefined;
  };
  const exists = (path: string) => rawValue(path) !== undefined;
  const cyclePaths = new Set<string>();
  const cycleSeen = new Set<string>();
  const follow = (start: string): { end: string | null; cycle: string[] | null } => {
    const chain = [start];
    let cur = start;
    for (let hop = 0; hop < 64; hop++) {
      const v = rawValue(cur);
      if (!isRef(v)) return { end: cur, cycle: null };
      const next = refTarget(v);
      const at = chain.indexOf(next);
      if (at >= 0) return { end: null, cycle: [...chain.slice(at), next] };
      if (!exists(next)) return { end: null, cycle: null };
      chain.push(next);
      cur = next;
    }
    return { end: null, cycle: null };
  };
  for (const g of ['colors', 'rounded', 'spacing']) {
    for (const [k] of asEntries(raw.get(g))) {
      const { cycle } = follow(`${g}.${k}`);
      if (!cycle) continue;
      const loop = cycle.slice(0, -1);
      for (const p of loop) cyclePaths.add(p);
      // One problem per loop: rotate it to start at its smallest path.
      const min = loop.reduce((a, b) => (b < a ? b : a));
      const i = loop.indexOf(min);
      const rotated = [...loop.slice(i), ...loop.slice(0, i), min];
      const key = rotated.join('>');
      if (cycleSeen.has(key)) continue;
      cycleSeen.add(key);
      errors.push(problem('ALIAS_CYCLE', { path: min, chain: rotated }));
    }
  }

  const dropReason = (group: string, path: string, v: unknown): DropReason | null => {
    if (v === null || v === undefined || typeof v === 'object') return 'value_not_scalar';
    if (isRef(v)) {
      const target = refTarget(v);
      if (!exists(target)) return 'alias_unresolved';
      const { end, cycle } = follow(path);
      if (cycle) return 'alias_cycle';
      if (end && !end.startsWith(`${group}.`)) return 'alias_wrong_type';
      return 'unknown';
    }
    const s = String(v);
    if (group === 'colors') return parseColor(s) ? 'unknown' : 'value_invalid';
    if (hasOtherUnit(s)) return 'unit_unsupported';
    return parseDimension(s) ? 'unknown' : 'value_invalid';
  };
  const dropped = (group: string, name: string, v: unknown) => {
    const path = `${group}.${name}`;
    if (cyclePaths.has(path)) return;
    const reason = dropReason(group, path, v) ?? 'unknown';
    // A literal that is not a value of its kind is VALUE_INVALID, the approved
    // per-kind sentence, as the DTCG reader reports it; the linter's row for
    // the same path then gives way to it (below).
    if (reason === 'value_invalid' || reason === 'unit_unsupported') {
      errors.push(problem('VALUE_INVALID', { path, value: String(v), kind: group === 'colors' ? 'color' : 'dimension' }));
      return;
    }
    // The linter already said why for this path, in its own words.
    if (reason === 'unknown' && errors.some((p) => p.code === 'LINT_ERROR' && p.path === path)) return;
    errors.push(problem('TOKEN_DROPPED', { path, reason, ref: isRef(v) ? String(v).trim() : undefined, value: isRef(v) ? undefined : (typeof v === 'object' ? undefined : String(v)) }));
  };

  // ── 5. Model ──
  const colors: ColorToken[] = [];
  const aliases: Alias[] = [];
  for (const [name, v] of asEntries(raw.get('colors'))) {
    const c = ds.colors.get(name);
    if (!c) { dropped('colors', name, v); continue; }
    const rgba = { r: c.r, g: c.g, b: c.b, a: Math.round((c.a ?? 1) * 1000) / 1000 };
    const t: ColorToken = { kind: 'color', path: `colors.${name}`, rgba, hex: hexOf(rgba), original: typeof v === 'string' ? v : String(v) };
    if (isRef(v)) {
      t.aliasOf = refTarget(v);
      aliases.push({ from: t.path, to: t.aliasOf });
    }
    colors.push(t);
  }

  const dims = (group: 'rounded' | 'spacing', model: Map<string, { value: number; unit: string }>): DimensionToken[] => {
    const out: DimensionToken[] = [];
    for (const [name, v] of asEntries(raw.get(group))) {
      // Unitless spacing is allowed by the format and has no px size: skipped, not dropped.
      if (group === 'spacing' && typeof v === 'number') continue;
      const m = model.get(name);
      const d = m ? dimension(m.value, m.unit) : null;
      if (!d) { dropped(group, name, v); continue; }
      const t: DimensionToken = { kind: 'dimension', path: `${group}.${name}`, dim: d };
      if (isRef(v)) {
        t.aliasOf = refTarget(v);
        aliases.push({ from: t.path, to: t.aliasOf });
      }
      out.push(t);
    }
    return out;
  };
  const radii = dims('rounded', ds.rounded);
  const spacing = dims('spacing', ds.spacing);

  const typography: TypeStyle[] = [];
  const families: FamilyToken[] = [];
  for (const [name, v] of asEntries(raw.get('typography'))) {
    const fields = new Map(asEntries(v));
    const m = ds.typography.get(name);
    if (!m && fields.size === 0) { dropped('typography', name, v); continue; }
    const style: TypeStyle = { kind: 'typography', path: `typography.${name}`, role: typeRole(name) };
    const fam = splitFamilies(fields.get('fontFamily'));
    if (fam.length) style.families = fam;
    if (m?.fontSize) {
      const d = dimension(m.fontSize.value, m.fontSize.unit);
      if (d) style.fontSize = d;
    }
    if (typeof m?.fontWeight === 'number') style.fontWeight = m.fontWeight;
    const lh = parseLineHeight(fields.get('lineHeight'));
    if (lh) style.lineHeight = lh;
    if (m?.letterSpacing) {
      const d = dimension(m.letterSpacing.value, m.letterSpacing.unit);
      if (d) style.letterSpacing = d;
    }
    const feats = parseFeatureTags(fields.get('fontFeature'));
    if (feats.length) style.features = feats;
    typography.push(style);
    if (fam.length) families.push({ kind: 'fontFamily', path: `${style.path}.fontFamily`, families: fam });
  }

  // Components: pairs, sizes, and literal radii and padding.
  const pairs: ContrastPair[] = [];
  const sizes: SizeToken[] = [];
  const styleByPath = new Map(typography.map((s) => [s.path, s]));
  for (const [name, v] of asEntries(raw.get('components'))) {
    const fields = new Map(asEntries(v));
    const model = ds.components.get(name);
    const colorPath = (field: string): string | null => {
      const fv = fields.get(field);
      if (fv === undefined) return null;
      if (isRef(fv)) return refTarget(fv);
      // A literal pair color is declared where it is written.
      const prop = model?.properties.get(field) as { type?: string; r?: number; g?: number; b?: number; a?: number } | undefined;
      if (!prop || prop.type !== 'color') return null;
      const rgba = { r: prop.r!, g: prop.g!, b: prop.b!, a: Math.round((prop.a ?? 1) * 1000) / 1000 };
      const path = `components.${name}.${field}`;
      colors.push({ kind: 'color', path, rgba, hex: hexOf(rgba), original: String(fv), nested: true });
      return path;
    };
    const text = colorPath('textColor');
    const background = colorPath('backgroundColor');
    if (text && background) {
      let largeText = false;
      const ty = fields.get('typography');
      const style = isRef(ty) ? styleByPath.get(refTarget(ty)) : undefined;
      if (style?.fontSize?.px) largeText = style.fontSize.px >= 24 || (style.fontSize.px >= 18.66 && (style.fontWeight ?? 400) >= 700);
      pairs.push({ text, background, role: PRIMARY_ACTION.has(name) ? 'primary-action' : 'component', largeText, source: `components.${name}` });
    }
    for (const field of ['height', 'size']) {
      const fv = fields.get(field);
      if (fv === undefined) continue;
      const prop = model?.properties.get(field) as { type?: string; value?: number; unit?: string } | undefined;
      const d = prop && prop.type === 'dimension' ? dimension(prop.value!, prop.unit!) : null;
      if (!d) continue;
      const lower = name.toLowerCase();
      sizes.push({ kind: 'dimension', path: `components.${name}.${field}`, dim: d, interactive: INTERACTIVE_WORDS.some((w) => lower.includes(w)) });
    }
    for (const [field, target] of [['rounded', radii], ['padding', spacing]] as const) {
      const fv = fields.get(field);
      if (fv === undefined || isRef(fv)) continue; // a reference is already declared in its group
      const prop = model?.properties.get(field) as { type?: string; value?: number; unit?: string } | undefined;
      const d = prop && prop.type === 'dimension' ? dimension(prop.value!, prop.unit!) : null;
      if (d) target.push({ kind: 'dimension', path: `components.${name}.${field}`, dim: d, nested: true });
    }
  }

  // Omitted sections: their checks SKIP not_declared.
  const omitted: Array<{ group: string; reason?: string }> = [];
  const om = raw.get('omitted');
  if (Array.isArray(om)) {
    for (const o of om) {
      if (typeof o === 'string') omitted.push({ group: SECTION_GROUP[o.toLowerCase()] ?? o.toLowerCase() });
      else {
        const f = new Map(asEntries(o));
        const sec = f.get('section');
        if (typeof sec === 'string') {
          const reason = f.get('reason');
          omitted.push({ group: SECTION_GROUP[sec.toLowerCase()] ?? sec.toLowerCase(), ...(typeof reason === 'string' ? { reason } : {}) });
        }
      }
    }
  }

  const nameRaw = raw.get('name');
  const versionRaw = raw.get('version');
  const parsed: ParsedContract = {
    format: 'design.md',
    formatVersion: versionRaw === undefined || versionRaw === null ? null : String(versionRaw),
    name: typeof nameRaw === 'string' ? cleanFamily(nameRaw) || null : null,
    colors,
    typography,
    families,
    radii,
    spacing,
    sizes,
    durations: [],
    easings: [],
    pairs,
    aliases,
    omitted,
    declaredTokenMap: new Map(),
    linter,
  };
  return { errors: withoutCoveredLint(errors), warnings, parsed, linter };
}

/** One cause per path: a LINT_ERROR is dropped where a structured code
    (VALUE_INVALID, TOKEN_DROPPED, ALIAS_*) names the same path, so the
    caller reads the approved sentence once instead of two sentences for one
    fault. A LINT_ERROR with no structured code beside it stays. */
export function withoutCoveredLint(errors: Problem[]): Problem[] {
  const covered = new Set(errors.filter((p) => p.code !== 'LINT_ERROR' && p.path).map((p) => p.path as string));
  const linted = new Set(errors.filter((p) => p.code === 'LINT_ERROR' && p.path && covered.has(p.path)).map((p) => p.path as string));
  return errors
    .filter((p) => p.code !== 'LINT_ERROR' || !p.path || !covered.has(p.path))
    .map((p) => (p.code !== 'LINT_ERROR' && p.path && linted.has(p.path) ? { ...p, linterFinding: true } : p));
}
