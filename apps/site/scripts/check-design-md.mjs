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
 * compares the front matter with what globals.css actually ships, so a value
 * changed in the stylesheet and not in the contract fails here too.
 *
 * WHAT IT CHECKS (on the text the route serves, rendered offline)
 *   1. Front matter against the tables: every color row has a front matter
 *      color of the same name and value (a var(--x) row is {colors.x}; a row
 *      written "dark · light: other" is compared on its dark part), and every
 *      front matter color has a row, except `primary`, the format's required
 *      name, which must be a reference to an existing color. The Typography
 *      section's heading and body line-height lines equal the front matter.
 *   2. Front matter against the shipped tokens, the first :root block in
 *      app/globals.css: each color equals its custom property (a reference
 *      must ship as var() of the same target); each type size equals
 *      --text-<step>; each family stack equals --sans, --serif (through
 *      --display) or --mono with next/font's --font-* variable replaced by
 *      the face app/layout.tsx loads into it; heading weight, leading and
 *      tracking equal the `h1, h2, h3, h4` rule and body leading the `body`
 *      rule; each radius equals --radius-<name> (--radius for default); each
 *      spacing step equals its --space-* property.
 *      One known exception, listed in NOT_ON_ROOT with its reason: a contract
 *      color :root does not declare. It must stay a contract color that :root
 *      does not declare, so the list cannot outlive the gap it records.
 *   3. The file as the scorer reads it: the format's linter reports no error
 *      and no warning (check v37 lints this file on designesy.org and WARNs
 *      on any warning), and the own-contract reader accepts it with every
 *      front matter token in its model.
 *
 * A CLAUSE THAT CANNOT FAIL PROVES NOTHING
 * Every run first feeds the comparison three one-value mutants built from the
 * real inputs: a front matter color changed, a table value changed and a :root
 * value changed. Each must be reported; if any passes, the gate fails.
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

const served = lf(await route.GET().text());
const css = lf(fs.readFileSync(path.join(APP, 'app', 'globals.css'), 'utf8'));
const layout = lf(fs.readFileSync(path.join(APP, 'app', 'layout.tsx'), 'utf8'));

// ── Readers ──────────────────────────────────────────────────────────────────

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

/** next/font variable -> the face loaded into it, from app/layout.tsx. */
function nextFontFaces(src) {
  const faces = new Map();
  for (const m of src.matchAll(/const \w+ = (\w+)\(\{[^}]*?variable: '(--font-[a-z]+)'/g)) faces.set(m[2], m[1].replace(/_/g, ' '));
  return faces;
}

// ── Comparison ───────────────────────────────────────────────────────────────

/** Contract colors that :root does not declare, each with why it is let
    through. Remove an entry when the gap closes; the gate fails on a stale one. */
const NOT_ON_ROOT = {
  live: 'the contract names --live (#22c55e, "the same value as --grade-a") for the is-live dot, but no stylesheet declares or reads --live: the dot paints --grade-a. The front matter keeps the contract value, which the site ships as --grade-a.',
};

const norm = (s) => String(s).trim().replace(/\s+/g, ' ');
const sameColor = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
const refOf = (v) => (typeof v === 'string' ? /^\{colors\.([a-z0-9-]+)\}$/.exec(v.trim())?.[1] ?? null : null);
const varOf = (v) => /^var\(--([a-z0-9-]+)\)$/.exec(norm(v))?.[1] ?? null;

function compare({ text, vars, faces }) {
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
    } else if (!sameColor(value, shipped)) bad(`colors.${name} is ${value}, :root ships --${name}: ${shipped}`);
  }
  const stack = (token) => {
    let v = vars.get(token);
    for (let hop = 0; v && varOf(v) && hop < 4; hop++) v = vars.get(`--${varOf(v)}`);
    if (!v) return undefined;
    return norm(v.replace(/var\((--font-[a-z]+)\)/g, (_, f) => faces.get(f) ?? `<no face for ${f}>`));
  };
  const heading = rule(css, 'h1, h2, h3, h4');
  const body = rule(css, 'body');
  const familyToken = { h1: '--display', h2: '--display', h3: '--display', lead: '--sans', body: '--sans', label: '--mono' };
  for (const [step, style] of Object.entries(typo)) {
    const sizeVar = vars.get(`--text-${step}`);
    if (norm(style.fontSize) !== sizeVar) bad(`typography.${step}.fontSize is ${style.fontSize}, :root ships --text-${step}: ${sizeVar}`);
    const tok = familyToken[step];
    if (!tok) bad(`typography.${step} has no family token to compare with`);
    else if (norm(style.fontFamily) !== stack(tok)) bad(`typography.${step}.fontFamily is "${style.fontFamily}", ${tok} ships "${stack(tok)}"`);
    const ruleFor = step.startsWith('h') ? heading : body;
    for (const [field, prop] of [['fontWeight', 'font-weight'], ['lineHeight', 'line-height'], ['letterSpacing', 'letter-spacing']]) {
      if (style[field] === undefined) continue;
      if (String(style[field]) !== ruleFor.get(prop)) bad(`typography.${step}.${field} is ${style[field]}, the ${step.startsWith('h') ? 'heading' : 'body'} rule ships ${prop}: ${ruleFor.get(prop)}`);
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
const failures = [];

if (faces.size !== Object.keys(fm.NEXT_FONT_FACES).length) failures.push(`app/layout.tsx loads ${faces.size} next/font faces, lib/design-md-front-matter.ts names ${Object.keys(fm.NEXT_FONT_FACES).length}`);
for (const [v, face] of Object.entries(fm.NEXT_FONT_FACES)) if (faces.get(v) !== face) failures.push(`NEXT_FONT_FACES ${v} is ${face}, app/layout.tsx loads ${faces.get(v)}`);

for (const name of Object.keys(NOT_ON_ROOT)) if (!colorTable(served).has(name)) failures.push(`NOT_ON_ROOT lists ${name}, which is no longer a contract color: remove the entry`);

const clean = compare({ text: served, vars, faces });
const canaries = [
  ['a front matter color changed', { text: served.replace(/^ {2}paper: "#010102"$/m, '  paper: "#010103"'), vars, faces }],
  ['a table value changed', { text: served.replace('| `color.paper` | `#010102` |', '| `color.paper` | `#010103` |'), vars, faces }],
  ['a :root value changed', { text: served, vars: new Map([...vars, ['--radius-lg', '13px']]), faces }],
];
for (const [what, input] of canaries) {
  if (input.text === served && input.vars === vars) failures.push(`canary "${what}" did not change its input`);
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
console.log(`[design-md] OK: ${Object.keys(f.colors).length} colors, ${Object.keys(f.typography).length} type styles, ${Object.keys(f.rounded).length} radii and ${Object.keys(f.spacing).length} spacing steps agree with the tables and :root; linter ${report.summary.errors}/${report.summary.warnings}/${report.summary.infos}; ${canaries.length} canaries reported`);
