#!/usr/bin/env node
/**
 * DESIGN.md agreement gate: the tokens in the served DESIGN.md's front matter
 * equal the tables people read and the :root tokens the site ships.
 *
 * WHY THIS EXISTS
 * /DESIGN.md (app/export/designmd/route.ts) listed its colors only in a
 * Markdown table, so the site's own contract scorer refused it with
 * TOKENS_IN_PROSE: the DESIGN.md format, and the scorer, read tokens from YAML
 * front matter. The file now carries the tokens twice, in the front matter
 * for tools and in the tables for people (app/lib/design-md-front-matter.ts).
 * Two copies drift unless something compares them, so this gate does, and it
 * compares the front matter with what the stylesheets actually ship, so a
 * value changed in a stylesheet and not in the contract fails here too.
 *
 * WHAT IT CHECKS (on the text the route serves, rendered offline)
 *   1. Front matter against the tables: every color row has a front matter
 *      color of the same name and value (a var(--x) row is {colors.x}; a
 *      color-mix() row is the color it resolves to; a row written
 *      "dark · light: other" is compared on its dark part), and every front
 *      matter color has a row, except `primary`, the format's required name,
 *      which must be a reference to an existing color. The Typography
 *      section's heading and body line-height lines equal the front matter.
 *   2. Front matter against the shipped tokens, the first :root block in
 *      app/globals.css: each color equals its custom property (a reference
 *      must ship as var() of the same target; a color-mix() is resolved here,
 *      from :root, in sRGB with premultiplied alpha, and the front matter
 *      must hold it rounded to the byte); each type size equals
 *      --text-<step>; each family stack equals --sans, --serif (through
 *      --display) or --mono with next/font's --font-* variable replaced by
 *      the face app/layout.tsx loads into it; heading weight, leading and
 *      tracking equal the `h1, h2, h3, h4` rule and body leading the `body`
 *      rule, a var(--leading-*) read through :root; each radius equals
 *      --radius-<name> (--radius for default); each spacing step equals its
 *      --space-* property.
 *      A fluid size is two entries, <role>-narrow and <role>-wide, holding
 *      the two ends of the clamp() :root ships as --text-<role>. Their family,
 *      weight and leading are read here from the stylesheets under app/, the
 *      way the generator's FLUID_TYPE says the element gets them: the first
 *      rule the contract names for the role, then each rule in `from`, with
 *      weight 400 where none sets one. Every rule that reads --text-<role>
 *      must be one the contract names. Each leading-<role> entry is read the
 *      same way from the first rule that ships --leading-<role> (globals.css
 *      first, then the other stylesheets by path). Every line height :root
 *      ships as a --leading-* token is some entry's lineHeight.
 *      Contract colors :root does not declare would be listed in NOT_ON_ROOT
 *      with a reason; there are none today. An entry must stay a contract
 *      color that :root does not declare, so the list cannot outlive the gap
 *      it records.
 *   3. The file as the scorer reads it: the format's linter reports no error
 *      and no warning (check v37 lints this file on designesy.org and WARNs
 *      on any warning), and the own-contract reader accepts it with every
 *      front matter token in its model.
 *
 * A CLAUSE THAT CANNOT FAIL PROVES NOTHING
 * Every run first feeds the comparison one-value mutants built from the real
 * inputs: a front matter color changed, a table value changed, a :root value
 * changed, a color-mix() percentage changed, a fluid role's rule weight
 * changed and a leading rule's size changed. Each must be reported; if any
 * passes, the gate fails.
 *
 * Usage (from apps/site):  node scripts/check-design-md.mjs
 * Exits 1 on any disagreement.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');
const { lint } = await import('@google/design.md/linter');

const lf = (t) => t.replace(/\r\n?/g, '\n');
const h = createHarness({ app: APP });
const route = h.load('app/export/designmd/route.ts');
const fm = h.load('app/lib/design-md-front-matter.ts');
const dmd = h.load('app/lib/own-contract/design-md.ts');
const { designSystemContract: contract } = h.load('app/lib/design-system-contract.ts');

const served = lf(await route.GET().text());
const css = lf(fs.readFileSync(path.join(APP, 'app', 'globals.css'), 'utf8'));
const layout = lf(fs.readFileSync(path.join(APP, 'app', 'layout.tsx'), 'utf8'));

// ── Readers ──────────────────────────────────────────────────────────────────

const norm = (s) => String(s).trim().replace(/\s+/g, ' ');

/** The YAML between the first two `---` lines. */
function frontMatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') throw new Error('the served file does not start with front matter');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('the front matter is not closed');
  return parseYaml(lines.slice(1, end).join('\n'));
}

/** Rows of the Colors table: `| \`color.a.b\` | \`value\` | role |`. */
function colorTable(text) {
  const rows = new Map();
  for (const line of text.split('\n')) {
    const m = /^\|\s*`color\.([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line.trim());
    if (m) rows.set(m[1].replace(/\./g, '-'), m[2].trim());
  }
  return rows;
}

/** Custom properties of the first :root block. */
function rootVars(sheet) {
  const start = sheet.indexOf(':root {');
  if (start < 0) throw new Error('globals.css has no :root block');
  let depth = 0;
  let end = start;
  for (let i = sheet.indexOf('{', start); i < sheet.length; i++) {
    if (sheet[i] === '{') depth++;
    else if (sheet[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = sheet.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = new Map();
  for (const m of body.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  return vars;
}

/** Declarations of the first rule whose selector list is exactly `selector`. */
function rule(sheet, selector) {
  const want = selector.replace(/\s+/g, '');
  const re = /(^|\n)([^{}\n][^{}]*?)\{([^{}]*)\}/g;
  for (const m of sheet.matchAll(re)) {
    if (m[2].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '') !== want) continue;
    const decls = new Map();
    for (const d of m[3].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    return decls;
  }
  throw new Error(`globals.css has no \`${selector}\` rule`);
}

/** A selector list split at its top-level commas. */
function splitSelectors(list) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(norm(cur)); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(norm(cur));
  return out;
}

/** The style rules of one stylesheet: its file, the at-rules around it, its
    selector list and its declarations, in source order. */
function parseRules(file, sheet) {
  const src = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) { buf += ch; if (ch === quote && src[i - 1] !== '\\') quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '{') { stack.push(norm(buf)); buf = ''; continue; }
    if (ch !== '}') { buf += ch; continue; }
    const prelude = stack.pop() ?? '';
    if (!prelude.startsWith('@') && buf.trim()) {
      const decls = new Map();
      for (const d of buf.split(';')) {
        const k = d.indexOf(':');
        if (k > 0) decls.set(d.slice(0, k).trim(), norm(d.slice(k + 1)));
      }
      out.push({ file, at: stack.filter((p) => p.startsWith('@')), text: prelude, selectors: splitSelectors(prelude), decls });
    }
    buf = '';
  }
  return out;
}

/** Every stylesheet under app/, globals.css first and the rest by path. */
function stylesheetRules() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) files.push(path.relative(path.join(APP, 'app'), p).split(path.sep).join('/'));
    }
  };
  walk(path.join(APP, 'app'));
  files.sort((a, b) => (a === 'globals.css' ? -1 : b === 'globals.css' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return files.flatMap((file) => parseRules(file, lf(fs.readFileSync(path.join(APP, 'app', file), 'utf8'))));
}

/** next/font variable -> the face loaded into it, from app/layout.tsx. */
function nextFontFaces(src) {
  const faces = new Map();
  for (const m of src.matchAll(/const \w+ = (\w+)\(\{[^}]*?variable: '(--font-[a-z]+)'/g)) faces.set(m[2], m[1].replace(/_/g, ' '));
  return faces;
}

// ── Comparison ───────────────────────────────────────────────────────────────

/** Contract colors that :root does not declare, each with why it is let
    through. Remove an entry when the gap closes; the gate fails on a stale one. */
const NOT_ON_ROOT = {};

const sameColor = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
const refOf = (v) => (typeof v === 'string' ? /^\{colors\.([a-z0-9-]+)\}$/.exec(v.trim())?.[1] ?? null : null);
const varOf = (v) => /^var\(--([a-z0-9-]+)\)$/.exec(norm(v))?.[1] ?? null;
const isMix = (v) => /^color-mix\(/.test(norm(v));

/** A :root color as CSS computes it: a hex or rgb()/rgba() literal,
    transparent, var() of another :root property, or color-mix(in srgb, ...),
    whose two colors are premultiplied by their alphas, interpolated and
    divided back by the mixed alpha. Channels 0-255, alpha 0-1, unrounded. */
function rootColor(value, vars, depth = 0) {
  if (depth > 8) throw new Error(`color reference too deep: ${value}`);
  const v = norm(value);
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(v);
  if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: m[4] ? parseInt(m[4], 16) / 255 : 1 };
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (varOf(v)) {
    const next = vars.get(`--${varOf(v)}`);
    if (next === undefined) throw new Error(`:root declares no --${varOf(v)}`);
    return rootColor(next, vars, depth + 1);
  }
  m = /^color-mix\(in srgb, (.+?)(?: ([\d.]+)%)?, (.+?)(?: ([\d.]+)%)?\)$/.exec(v);
  if (!m) throw new Error(`cannot resolve the color ${value}`);
  const [c1, c2] = [rootColor(m[1], vars, depth + 1), rootColor(m[3], vars, depth + 1)];
  let p1 = m[2] === undefined ? undefined : Number(m[2]) / 100;
  let p2 = m[4] === undefined ? undefined : Number(m[4]) / 100;
  if (p1 === undefined && p2 === undefined) p1 = p2 = 0.5;
  else if (p1 === undefined) p1 = 1 - p2;
  else if (p2 === undefined) p2 = 1 - p1;
  const scale = Math.min(1, p1 + p2);
  [p1, p2] = [p1 / (p1 + p2), p2 / (p1 + p2)];
  const pre = (c) => [c.r * c.a, c.g * c.a, c.b * c.a, c.a];
  const mixed = pre(c1).map((x, i) => x * p1 + pre(c2)[i] * p2);
  const a = mixed[3];
  return { r: a ? mixed[0] / a : 0, g: a ? mixed[1] / a : 0, b: a ? mixed[2] / a : 0, a: a * scale };
}

/** Whether a front matter hex is `color` rounded to the byte. */
function holds(hex, color) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(String(hex).trim());
  if (!m) return false;
  const got = [1, 2, 3].map((i) => parseInt(m[i], 16)).concat(m[4] ? parseInt(m[4], 16) : 255);
  const want = [color.r, color.g, color.b, color.a * 255];
  return got.every((x, i) => Math.abs(x - want[i]) <= 0.5 + 1e-9);
}

/** `<stylesheet> <selector>` as the contract and the generator write a rule,
    without a trailing note such as "(phone media query)". The stylesheet is
    its path under app/, or its bare name when no other stylesheet has it. */
function ruleRef(ref, files) {
  const m = /^(\S+\.css) (.+?)(?: \([^()]*\))?$/.exec(norm(ref));
  if (!m) throw new Error(`cannot read the rule "${ref}"`);
  const matches = files.filter((f) => f === m[1] || f.endsWith(`/${m[1]}`));
  if (matches.length !== 1) throw new Error(`the rule "${ref}" names ${m[1]}, which is ${matches.length ? `${matches.length} stylesheets: ${matches.join(', ')}` : 'no stylesheet under app/'}`);
  return { file: matches[0], selector: m[2] };
}

/** Family, weight, size and line height a rule's own declarations set, the
    font shorthand included (which resets weight and line height it omits). */
function typeFacts(decls) {
  const f = {};
  for (const [k, v] of decls) {
    if (k === 'font') {
      const m = /^(?:(\d{3}|normal|bold) )?(\S+?)(?: ?\/ ?(\S+))? (.+)$/.exec(v);
      if (!m) continue;
      Object.assign(f, { weight: m[1] ?? 'normal', size: m[2], lineHeight: m[3] ?? 'normal', family: m[4] });
    } else if (k === 'font-family') f.family = v;
    else if (k === 'font-weight') f.weight = v;
    else if (k === 'font-size') f.size = v;
    else if (k === 'line-height') f.lineHeight = v;
  }
  return f;
}

/** The type facts an element gets from rules taken in order: each link is the
    rules one reference names, and the first link that sets a fact gives it. */
function chainFacts(links, bad, what) {
  const out = {};
  for (const { ref, rules } of links) {
    for (const k of ['family', 'weight', 'size', 'lineHeight']) {
      if (out[k] !== undefined) continue;
      const vals = [...new Set(rules.map((r) => typeFacts(r.decls)[k]).filter((v) => v !== undefined))];
      if (vals.length > 1) bad(`${what}: the rules ${ref} names set ${k} to ${vals.join(' and ')}`);
      if (vals.length) out[k] = vals[0];
    }
  }
  return out;
}

function compare({ text, vars, faces, rules }) {
  const problems = [];
  const bad = (msg) => problems.push(msg);
  const front = frontMatter(text);
  const colors = front.colors ?? {};
  const table = colorTable(text);
  if (table.size < 3) bad(`the Colors table has ${table.size} rows`);

  // 1. Front matter against the tables.
  for (const [name, value] of table) {
    if (!(name in colors)) { bad(`table row color.${name} has no front matter color "${name}"`); continue; }
    const dark = value.split('·')[0].trim();
    if (isMix(dark)) {
      let color = null;
      try { color = rootColor(dark, vars); } catch (e) { bad(`table row color.${name}: ${e.message}`); }
      if (color && !holds(colors[name], color)) bad(`colors.${name}: front matter "${colors[name]}", table "${value}" resolves to ${fm.toHex([color.r, color.g, color.b, color.a])}`);
      continue;
    }
    const want = varOf(dark) ? `{colors.${varOf(dark)}}` : dark;
    if (!sameColor(colors[name], want)) bad(`colors.${name}: front matter "${colors[name]}", table "${value}"`);
  }
  for (const [name, value] of Object.entries(colors)) {
    if (table.has(name)) continue;
    if (name === fm.PRIMARY_ALIAS.name) {
      if (refOf(value) !== fm.PRIMARY_ALIAS.of) bad(`colors.primary is "${value}", expected {colors.${fm.PRIMARY_ALIAS.of}}`);
      continue;
    }
    bad(`front matter colors.${name} has no table row`);
  }
  const typo = front.typography ?? {};
  const proseLine = (label) => new RegExp(`^- \\*\\*${label}:\\*\\* ([0-9.]+)`, 'm').exec(text)?.[1];
  if (Number(proseLine('Heading line-height')) !== typo.h1?.lineHeight) bad(`Typography says heading line-height ${proseLine('Heading line-height')}, front matter h1 has ${typo.h1?.lineHeight}`);
  if (Number(proseLine('Body line-height')) !== typo.body?.lineHeight) bad(`Typography says body line-height ${proseLine('Body line-height')}, front matter body has ${typo.body?.lineHeight}`);

  // 2. Front matter against the shipped :root tokens and rules.
  for (const [name, value] of Object.entries(colors)) {
    const ref = refOf(value);
    if (ref && !(ref in colors)) bad(`colors.${name} refers to ${ref}, which the front matter does not declare`);
    if (name === fm.PRIMARY_ALIAS.name) continue;
    const shipped = vars.get(`--${name}`);
    if (name in NOT_ON_ROOT) {
      if (shipped !== undefined) bad(`colors.${name} is listed in NOT_ON_ROOT, but :root now declares --${name}: remove the entry`);
      continue;
    }
    if (shipped === undefined) { bad(`colors.${name}: :root declares no --${name}`); continue; }
    if (ref) {
      if (varOf(shipped) !== ref) bad(`colors.${name} is {colors.${ref}}, :root ships --${name}: ${shipped}`);
    } else if (isMix(shipped)) {
      let color = null;
      try { color = rootColor(shipped, vars); } catch (e) { bad(`colors.${name}: ${e.message}`); }
      if (color && !holds(value, color)) bad(`colors.${name} is ${value}, :root ships --${name}: ${shipped}, which resolves to ${fm.toHex([color.r, color.g, color.b, color.a])}`);
    } else if (!sameColor(value, shipped)) bad(`colors.${name} is ${value}, :root ships --${name}: ${shipped}`);
  }
  const stack = (token) => {
    let v = vars.get(token);
    for (let hop = 0; v && varOf(v) && hop < 4; hop++) v = vars.get(`--${varOf(v)}`);
    if (!v) return undefined;
    return norm(v.replace(/var\((--font-[a-z]+)\)/g, (_, f) => faces.get(f) ?? `<no face for ${f}>`));
  };
  const resolveVar = (v) => {
    let x = v;
    for (let hop = 0; x !== undefined && varOf(x) && hop < 4; hop++) x = vars.get(`--${varOf(x)}`);
    return x;
  };
  const leadingRatios = new Set([...vars].filter(([k, v]) => k.startsWith('--leading-') && Number.isFinite(Number(v))).map(([, v]) => Number(v)));
  const heading = rule(css, 'h1, h2, h3, h4');
  const body = rule(css, 'body');
  const familyToken = { h1: '--display', h2: '--display', h3: '--display', lead: '--sans', body: '--sans', label: '--mono' };

  // The rules a reference names: every top-level rule in that stylesheet whose
  // selector list is exactly the one written.
  const files = [...new Set(rules.map((r) => r.file))];
  const refTo = (ref) => {
    try { return ruleRef(ref, files); } catch (e) { bad(e.message); return { file: '', selector: '' }; }
  };
  const named = (ref) => {
    const { file, selector } = refTo(ref);
    const found = rules.filter((r) => r.file === file && r.text === selector && r.at.length === 0);
    if (!found.length) bad(`no top-level rule \`${selector}\` in app/${file}`);
    return { ref, rules: found };
  };
  // What a rule's facts come to: a family through its stack, a weight and a
  // line height as numbers (line height undefined when normal).
  const familyOf = (v) => (varOf(v) ? stack(`--${varOf(v)}`) : norm(v));
  const weightOf = (v) => (v === undefined || v === 'normal' ? 400 : v === 'bold' ? 700 : Number(v));
  const leadingOf = (v) => (v === undefined || v === 'normal' ? undefined : Number(resolveVar(v)));
  const sameFacts = (what, facts, style) => {
    if (facts.family === undefined) bad(`${what}: no rule in its chain sets a font-family`);
    else if (norm(style.fontFamily) !== familyOf(facts.family)) bad(`${what}.fontFamily is "${style.fontFamily}", its rules give ${facts.family}: "${familyOf(facts.family)}"`);
    const lh = leadingOf(facts.lineHeight);
    if (lh !== style.lineHeight && !(lh !== undefined && style.lineHeight !== undefined && Math.abs(lh - style.lineHeight) < 1e-9)) bad(`${what}.lineHeight is ${style.lineHeight}, its rules give ${facts.lineHeight ?? 'none'}${lh !== undefined ? ` (${lh})` : ''}`);
    if (style.lineHeight !== undefined && !leadingRatios.has(style.lineHeight)) bad(`${what}.lineHeight ${style.lineHeight} is no --leading-* token`);
  };
  const usesText = (r, role) => [r.decls.get('font-size'), r.decls.get('font')].some((v) => v !== undefined && v.includes(`var(--text-${role})`));
  const usesLeading = (r, role) => [r.decls.get('line-height'), r.decls.get('font')].some((v) => v !== undefined && new RegExp(`var\\(--leading-${role}\\)`).test(v));

  const fluid = Object.values(contract.typography.fluid);
  const fluidRoles = new Set(fluid.map((spec) => spec.token.replace(/^--text-/, '')));
  for (const role of Object.keys(fm.FLUID_TYPE)) if (!fluidRoles.has(role)) bad(`FLUID_TYPE names ${role}, which is no contract fluid size: remove it`);
  for (const spec of fluid) {
    const role = spec.token.replace(/^--text-/, '');
    const refs = spec.selectors.map(refTo);
    for (const r of rules.filter((x) => usesText(x, role))) {
      if (!refs.some((ref) => ref.file === r.file && r.selectors.includes(ref.selector))) bad(`app/${r.file} \`${r.text}\` reads --text-${role}, and the contract's selectors for it do not name the rule`);
    }
    const sized = refs.map((ref) => ({ ref: `${ref.file} ${ref.selector}`, rules: rules.filter((r) => r.file === ref.file && r.selectors.includes(ref.selector) && usesText(r, role)) }));
    for (const s of sized) if (!s.rules.length) bad(`the contract names ${s.ref} for --text-${role}, and no rule there reads it`);
    const type = fm.FLUID_TYPE[role];
    if (!type || !sized[0].rules.length) continue;
    const facts = chainFacts([{ ref: sized[0].ref, rules: [sized[0].rules[0]] }, ...type.from.map(named)], bad, `--text-${role}`);
    const clamp = vars.get(`--text-${role}`);
    const ends = clamp && /^clamp\((.+), (\S+)\)$/.exec(clamp);
    const lower = ends && /^([^,]+),/.exec(ends[1])?.[1];
    const px = (t) => { const m = t && /^([\d.]+)(rem|px)$/.exec(t.trim()); return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : undefined; };
    for (const [end, bound] of [['narrow', lower], ['wide', ends?.[2]]]) {
      const step = `${role}-${end}`;
      const style = typo[step];
      if (!style) { bad(`the front matter has no typography.${step}`); continue; }
      const want = px(bound);
      if (want === undefined || Math.abs(want - parseFloat(style.fontSize)) > 0.005) bad(`typography.${step}.fontSize is ${style.fontSize}, :root ships --text-${role}: ${clamp}`);
      if (Number(style.fontWeight) !== weightOf(facts.weight)) bad(`typography.${step}.fontWeight is ${style.fontWeight}, its rules give ${facts.weight ?? 'none (400)'}`);
      sameFacts(`typography.${step}`, facts, style);
    }
  }

  const carried = new Set(Object.values(typo).map((s) => s.lineHeight).filter((v) => v !== undefined));
  for (const ratio of leadingRatios) if (!carried.has(ratio)) bad(`:root ships the line height ${ratio}, and no typography entry carries it`);
  for (const [role, type] of Object.entries(fm.LEADING_TYPE)) {
    const step = `leading-${role}`;
    const style = typo[step];
    if (!style) { bad(`LEADING_TYPE names ${role}, and the front matter has no typography.${step}: remove it`); continue; }
    const first = rules.find((r) => usesLeading(r, role));
    const ship = refTo(type.ship);
    if (!first || first.file !== ship.file || first.text !== ship.selector) {
      bad(`typography.${step} is read from ${type.ship}, and the first rule that ships --leading-${role} is ${first ? `app/${first.file} \`${first.text}\`` : 'none'}`);
      continue;
    }
    const facts = chainFacts([{ ref: type.ship, rules: [first] }, ...type.from.map(named)], bad, `--leading-${role}`);
    const stepOf = /^(?:var\(--text-([a-z0-9]+)\)|clamp\(var\(--text-([a-z0-9]+)\),)/.exec(norm(facts.size ?? ''));
    const sizeVar = stepOf && vars.get(`--text-${stepOf[1] ?? stepOf[2]}`);
    if (!sizeVar || norm(style.fontSize) !== sizeVar) bad(`typography.${step}.fontSize is ${style.fontSize}, its rules give ${facts.size ?? 'none'}`);
    sameFacts(`typography.${step}`, facts, style);
    if (style.lineHeight !== Number(vars.get(`--leading-${role}`))) bad(`typography.${step}.lineHeight is ${style.lineHeight}, :root ships --leading-${role}: ${vars.get(`--leading-${role}`)}`);
  }

  for (const [step, style] of Object.entries(typo)) {
    if (step.startsWith('leading-') || fluidRoles.has(/^(.+)-(narrow|wide)$/.exec(step)?.[1])) continue;
    const sizeVar = vars.get(`--text-${step}`);
    if (norm(style.fontSize) !== sizeVar) bad(`typography.${step}.fontSize is ${style.fontSize}, :root ships --text-${step}: ${sizeVar}`);
    const tok = familyToken[step];
    if (!tok) bad(`typography.${step} has no family token to compare with`);
    else if (norm(style.fontFamily) !== stack(tok)) bad(`typography.${step}.fontFamily is "${style.fontFamily}", ${tok} ships "${stack(tok)}"`);
    const ruleFor = step.startsWith('h') ? heading : body;
    for (const [field, prop] of [['fontWeight', 'font-weight'], ['lineHeight', 'line-height'], ['letterSpacing', 'letter-spacing']]) {
      if (style[field] === undefined) continue;
      if (String(style[field]) !== resolveVar(ruleFor.get(prop))) bad(`typography.${step}.${field} is ${style[field]}, the ${step.startsWith('h') ? 'heading' : 'body'} rule ships ${prop}: ${ruleFor.get(prop)}`);
    }
  }
  for (const [name, value] of Object.entries(front.rounded ?? {})) {
    const v = name === 'default' ? '--radius' : `--radius-${name}`;
    if (norm(value) !== vars.get(v)) bad(`rounded.${name} is ${value}, :root ships ${v}: ${vars.get(v)}`);
  }
  for (const [name, value] of Object.entries(front.spacing ?? {})) {
    if (String(value) !== vars.get(`--${name}`)) bad(`spacing.${name} is ${value}, :root ships --${name}: ${vars.get(`--${name}`)}`);
  }
  if (Object.keys(front.spacing ?? {}).length < 5 || Object.keys(front.rounded ?? {}).length < 3 || Object.keys(typo).length < 1) bad('the front matter is missing a token group');
  return { problems, front };
}

// ── Canaries: each one-value mutant must be reported ─────────────────────────

const vars = rootVars(css);
const faces = nextFontFaces(layout);
const rules = stylesheetRules();
const failures = [];

if (faces.size !== Object.keys(fm.NEXT_FONT_FACES).length) failures.push(`app/layout.tsx loads ${faces.size} next/font faces, lib/design-md-front-matter.ts names ${Object.keys(fm.NEXT_FONT_FACES).length}`);
for (const [v, face] of Object.entries(fm.NEXT_FONT_FACES)) if (faces.get(v) !== face) failures.push(`NEXT_FONT_FACES ${v} is ${face}, app/layout.tsx loads ${faces.get(v)}`);

for (const name of Object.keys(NOT_ON_ROOT)) if (!colorTable(served).has(name)) failures.push(`NOT_ON_ROOT lists ${name}, which is no longer a contract color: remove the entry`);

/** The rules with one declaration of one rule changed; the same array when nothing matched. */
function withDecl(file, selector, prop, from, to) {
  const i = rules.findIndex((r) => r.file === file && r.text === selector && r.decls.get(prop) === from);
  if (i < 0) return rules;
  const copy = rules.slice();
  copy[i] = { ...rules[i], decls: new Map([...rules[i].decls, [prop, to]]) };
  return copy;
}

const clean = compare({ text: served, vars, faces, rules });
const canaries = [
  ['a front matter color changed', { text: served.replace(/^ {2}paper: "#010102"$/m, '  paper: "#010103"'), vars, faces, rules }],
  ['a table value changed', { text: served.replace('| `color.paper` | `#010102` |', '| `color.paper` | `#010103` |'), vars, faces, rules }],
  ['a :root value changed', { text: served, vars: new Map([...vars, ['--radius-lg', '13px']]), faces, rules }],
  ['a color-mix() percentage changed', { text: served, vars: vars.has('--ok-chip') ? new Map([...vars, ['--ok-chip', vars.get('--ok-chip').replace(/ (\d+)%/, (_, p) => ` ${Number(p) - 10}%`)]]) : vars, faces, rules }],
  ['a fluid role\'s rule weight changed', { text: served, vars, faces, rules: withDecl('globals.css', '.surface-title', 'font-weight', '700', '600') }],
  ['a leading rule\'s size changed', { text: served, vars, faces, rules: withDecl('globals.css', '.cmdk-item-meta', 'font-size', 'var(--text-label)', 'var(--text-body)') }],
];
for (const [what, input] of canaries) {
  if (input.text === served && input.vars === vars && input.rules === rules) failures.push(`canary "${what}" did not change its input`);
  else if (compare(input).problems.length === 0) failures.push(`canary "${what}" was not reported: the comparison cannot fail`);
}

failures.push(...clean.problems);

// 3. The file as the scorer reads it.
const report = lint(served);
if (report.summary.errors || report.summary.warnings) {
  failures.push(`the DESIGN.md linter reports ${report.summary.errors} error(s) and ${report.summary.warnings} warning(s): ${report.findings.filter((f) => f.severity !== 'info').slice(0, 5).map((f) => `${f.path ?? ''} ${f.message}`).join(' | ')}`);
}
const read = dmd.readDesignMd(served, lint);
if (read.errors.length || !read.parsed) failures.push(`the own-contract reader refuses the file: ${read.errors.map((p) => p.code).join(', ')}`);
else {
  const f = clean.front;
  const want = { colors: Object.keys(f.colors).length, typography: Object.keys(f.typography).length, radii: Object.keys(f.rounded).length, spacing: Object.values(f.spacing).filter((v) => typeof v !== 'number').length };
  const got = { colors: read.parsed.colors.length, typography: read.parsed.typography.length, radii: read.parsed.radii.length, spacing: read.parsed.spacing.length };
  for (const k of Object.keys(want)) if (want[k] !== got[k]) failures.push(`the reader's model holds ${got[k]} ${k}, the front matter declares ${want[k]}`);
}

if (failures.length) {
  console.error(`[design-md] FAIL: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
const f = clean.front;
console.log(`[design-md] OK: ${Object.keys(f.colors).length} colors, ${Object.keys(f.typography).length} type styles, ${Object.keys(f.rounded).length} radii and ${Object.keys(f.spacing).length} spacing steps agree with the tables, :root and ${new Set(rules.map((r) => r.file)).size} stylesheets; linter ${report.summary.errors}/${report.summary.warnings}/${report.summary.infos}; ${canaries.length} canaries reported`);
