#!/usr/bin/env node
/**
 * Own-contract engine gate: a team's own DESIGN.md or DTCG file is read,
 * rejected or scored exactly as the engine spec says.
 *
 * WHY THIS EXISTS
 * Contract mode scores a page against a contract the team wrote, not against
 * Designesy's. Every number it returns rests on intake (what the contract
 * declares), binding (where the page ships it) and fourteen fidelity checks
 * with exact thresholds. None of that is visible on a page until the route is
 * built, and a reader that silently drops a token (the DESIGN.md linter does,
 * probe P3) or a check that is off by one band would still render a clean
 * grade. This gate pins each rule to a fixture.
 *
 * WHAT IT ASSERTS (offline; no network)
 *   1. Intake: fixtures DM-1 to DM-11 and DT-1 to DT-11 give the outcomes of
 *      engine spec 15.1 (accepted with a model that matches its golden, or the
 *      problem code, with the fields the page builds its copy from: line,
 *      path, ref, chain, reason, counts); generated DT-10 limits (2,001
 *      tokens, 17 levels, 300 KiB); the token map; FORMAT_UNKNOWN; the 1 s
 *      budget; values cut to 80 characters; nothing logged.
 *   2. Parity (PAR-1): the same system as DESIGN.md and as DTCG reads to the
 *      same counts.
 *   3. Digest: stable under key order, prose, name and whitespace; moved by a
 *      value, a path, a pair or the token map.
 *   4. Linked contracts: the fetch maps every failure to its reason, aborts a
 *      stall, and caps size.
 *   5. Regex timing: each parser that sees caller input reads 1 MB of
 *      pathological input in under 200 ms.
 *
 * PROVING IT CAN FAIL
 *   --flip   expects DM-2 (an accepted contract) to be rejected; the run must
 *            exit 1. Run against a checkout without app/lib/own-contract, the
 *            gate exits 1 at load.
 *   --update rewrites the golden models (review the diff before committing).
 *
 * Usage:  node scripts/check-own-contract.mjs [--flip] [--update]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..');
const FIX = path.join(HERE, 'fixtures', 'own-contract');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');

const FLIP = process.argv.includes('--flip');
const UPDATE = process.argv.includes('--update');

const h = createHarness({ app: APP });
const oc = h.load('app/lib/own-contract/index.ts');
const norm = h.load('app/lib/own-contract/normalize.ts');
const detect = h.load('app/lib/own-contract/detect.ts');
const dmd = h.load('app/lib/own-contract/design-md.ts');
const dtcg = h.load('app/lib/own-contract/dtcg.ts');
const digestMod = h.load('app/lib/own-contract/digest.ts');
const problems = h.load('app/lib/own-contract/problems.ts');
const fetchMod = h.load('app/lib/own-contract/fetch-contract.ts');
const limits = h.load('app/lib/own-contract/limits.ts');
const { lint } = await import('@google/design.md/linter');

// Nothing in contract mode may print contract-derived data (engine spec 13):
// every console call during the run is captured and must stay empty.
const logged = [];
const realConsole = {};
for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
  realConsole[k] = console[k];
}
function captureConsole() {
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logged.push(a.map(String).join(' '));
}
function releaseConsole() {
  Object.assign(console, realConsole);
}

const failures = [];
let passed = 0;
async function check(name, fn) {
  captureConsole();
  try {
    await fn();
    releaseConsole();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    releaseConsole();
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(err && err.message).split('\n').join('\n        ')}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

// Fixtures are read with LF line endings whatever the checkout wrote (the
// fixtures directory is also eol=lf in .gitattributes); section 8b feeds the
// same contracts with CRLF and CR on purpose.
const lf = (t) => t.replace(/\r\n?/g, '\n');
const fixture = (name) => lf(fs.readFileSync(path.join(FIX, name), 'utf8'));
// A detector standing in for v36's findConfusables (the route passes the real one).
const confusables = (s) => [...s].flatMap((ch, pos) => (ch === 'а' ? [{ char: ch, pos, ascii: 'a' }] : ch === 'о' ? [{ char: ch, pos, ascii: 'o' }] : []));
const read = (content, extra = {}) => oc.readContract({ content, ...extra }, { lint, findConfusables: confusables });
const readFix = (name, extra) => read(fixture(name), extra);
const codes = (r) => (r.ok ? [] : r.problems.map((p) => p.code));
const only = (r, code) => {
  assert.equal(r.ok, false, `expected a rejection with ${code}, got an accepted contract`);
  const hits = r.problems.filter((p) => p.code === code);
  assert.ok(hits.length > 0, `expected ${code}, got ${codes(r).join(', ') || 'nothing'}`);
  return hits;
};
const accepted = (r) => {
  assert.equal(r.ok, true, `expected an accepted contract, got ${codes(r).join(', ')}: ${r.ok ? '' : r.problems.map((p) => p.message).join(' | ')}`);
  return r.contract;
};
const byPath = (list, p) => {
  const t = list.find((x) => x.path === p);
  assert.ok(t, `no token at ${p} (have ${list.map((x) => x.path).join(', ')})`);
  return t;
};
const hex = (t) => t.hex.slice(0, 7);

/** A JSON-safe snapshot of the model, for the goldens. */
function modelSnapshot(c) {
  return {
    format: c.format, formatVersion: c.formatVersion, name: c.name, digest: c.digest, stats: c.stats,
    colors: c.colors.map((t) => ({ path: t.path, hex: t.hex, ...(t.aliasOf ? { aliasOf: t.aliasOf } : {}), ...(t.nested ? { nested: true } : {}), ...(t.cssVar ? { cssVar: t.cssVar } : {}) })),
    typography: c.typography, families: c.families, radii: c.radii, spacing: c.spacing, sizes: c.sizes,
    durations: c.durations, easings: c.easings, pairs: c.pairs, aliases: c.aliases, omitted: c.omitted,
    tokenMap: Object.fromEntries(c.tokenMap),
    warnings: c.problems.map((p) => `${p.code}:${p.path ?? ''}`),
  };
}
function golden(name, c) {
  const file = path.join(FIX, `${name}.golden.json`);
  const snap = JSON.parse(JSON.stringify(modelSnapshot(c)));
  if (UPDATE || !fs.existsSync(file)) {
    fs.writeFileSync(file, `${JSON.stringify(snap, null, 2)}\n`);
    if (!UPDATE) throw new Error(`${path.basename(file)} did not exist; written now. Review it and run again.`);
    return;
  }
  assert.deepEqual(snap, JSON.parse(fs.readFileSync(file, 'utf8')), `${name} model differs from ${path.basename(file)} (run with --update after review)`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('1. Format detection (engine spec 4.1)');

await check('a brace-first file is DTCG, with its $schema version', () => {
  assert.deepEqual(detect.detectFormat(fixture('DT-1.json')), { format: 'dtcg', formatVersion: '2025.10' });
  assert.deepEqual(detect.detectFormat('﻿  {"a":1}'), { format: 'dtcg', formatVersion: null });
  assert.equal(detect.readAsLabel(detect.detectFormat(fixture('DT-1.json'))), 'Read as DTCG tokens (2025.10)');
  assert.equal(detect.readAsLabel(detect.detectFormat('{}')), 'DTCG tokens (format version not stated)');
});
await check('front matter or a fenced yaml block is DESIGN.md; anything else is unknown', () => {
  assert.equal(detect.detectFormat(fixture('DM-2.md')).format, 'design.md');
  assert.equal(detect.detectFormat(fixture('DM-11.md')).format, 'design.md');
  assert.equal(detect.detectFormat('Just some notes about colors.').format, null);
  assert.equal(detect.detectFormat('# A design system\n\nNo YAML.').format, 'design.md', 'a Markdown document is a DESIGN.md');
  assert.equal(detect.detectFormat('#hashtag, not a heading').format, null);
  assert.equal(detect.readAsLabel({ format: 'design.md', formatVersion: null }), 'Read as DESIGN.md (alpha)');
});
await check('FORMAT_UNKNOWN is a 422 with the approved sentence', async () => {
  const r = await read('Just some notes about colors.');
  assert.equal(r.status, 422);
  assert.equal(only(r, 'FORMAT_UNKNOWN')[0].message, 'We could not tell whether this is a DESIGN.md or a DTCG file. Choose the format and run it again.');
});
await check('an explicit format wins over detection', async () => {
  const r = await read(fixture('DM-2.md'), { format: 'dtcg' });
  only(r, 'JSON_INVALID');
});

// ─────────────────────────────────────────────────────────────────────────────
section('2. Normalization (engine spec 3.2)');

await check('every DESIGN.md color form converts (linter probe P1 values reproduced)', () => {
  const H = (s) => norm.hexOf(norm.parseColor(s));
  assert.equal(H('oklch(98% 0.01 250)'), '#f4f9ffff');
  assert.equal(H('hsl(0 70% 45%)'), '#c32222ff');
  assert.equal(H('#abc'), '#aabbccff');
  assert.equal(H('#0008'), '#00000088');
  assert.equal(H('rebeccapurple'), '#663399ff');
  assert.equal(H('rgb(10 20 30 / 50%)'), '#0a141e80');
  assert.equal(H('rgba(220, 225, 234, 1)'), '#dce1eaff');
  assert.equal(H('hwb(120 10% 20%)'), '#1acc1aff');
  assert.equal(H('color-mix(in srgb, #ff0000 50%, #0000ff)'), '#800080ff');
  assert.equal(H('color(srgb 1 0 0)'), '#ff0000ff');
  for (const s of ['lab(30 10 -50)', 'lch(50 60 260)', 'oklab(0.9 -0.01 -0.03)']) assert.ok(norm.parseColor(s), s);
  for (const s of ['currentColor', 'transparent', 'var(--x)', 'nope', 'rgb(1,2)']) assert.equal(norm.parseColor(s), null, s);
});
await check('WCAG contrast: #111418 on #FFFFFF is 18.47 to 1; #FFFFFF on #7DA4FF is 2.43', () => {
  const r = (a, b) => Math.round(norm.contrastRatio(norm.parseColor(a), norm.parseColor(b)) * 100) / 100;
  assert.equal(r('#111418', '#FFFFFF'), 18.47);
  assert.equal(r('#FFFFFF', '#7DA4FF'), 2.43);
  assert.equal(r('#FFFFFF', '#1A5CFF'), 5.23);
});
await check('dimensions, line heights, roles, families, durations, easings, features', () => {
  assert.deepEqual(norm.parseDimension('1.5rem'), { value: 1.5, unit: 'rem', px: 24 });
  assert.deepEqual(norm.parseDimension('.5em'), { value: 0.5, unit: 'em', px: null });
  assert.equal(norm.parseDimension('12pt'), null);
  assert.equal(norm.hasOtherUnit('12pt'), true);
  assert.deepEqual(norm.parseLineHeight(1.5), { kind: 'ratio', value: 1.5 });
  assert.deepEqual(norm.parseLineHeight('24px'), { kind: 'length', dim: { value: 24, unit: 'px', px: 24 } });
  assert.equal(norm.lineHeightRatio({ kind: 'length', dim: { value: 24, unit: 'px', px: 24 } }, { value: 16, unit: 'px', px: 16 }), 1.5);
  assert.deepEqual(['headline-lg', 'display', 'h2', 'body-md', 'paragraph', 'caption', 'code', 'mono-sm', 'misc'].map(norm.typeRole), ['heading', 'heading', 'heading', 'body', 'body', 'label', 'code', 'code', 'other']);
  assert.deepEqual(norm.splitFamilies('"IBM Plex Mono", ui-monospace, monospace'), ['IBM Plex Mono', 'ui-monospace', 'monospace']);
  assert.equal(norm.isGenericFamily('BlinkMacSystemFont'), true);
  assert.equal(norm.isGenericFamily('Roboto'), false);
  assert.equal(norm.parseDurationMs('0.2s'), 200);
  assert.deepEqual(norm.parseEasing('ease-out'), [0, 0, 0.58, 1]);
  assert.deepEqual(norm.parseEasing('cubic-bezier(0.2, 0, 0, 1)'), [0.2, 0, 0, 1]);
  assert.deepEqual(norm.parseFeatureTags("'tnum' 1, 'ss01', 'liga' 0"), ['tnum', 'ss01']);
});

// ─────────────────────────────────────────────────────────────────────────────
section('3. DESIGN.md intake (fixtures DM-1 to DM-11)');

await check('DM-1 full: accepted, every color form, both line-height forms, features, pairs, sizes', async () => {
  const c = accepted(await readFix('DM-1.md'));
  assert.equal(c.format, 'design.md');
  assert.equal(c.formatVersion, 'alpha');
  assert.equal(c.name, 'Fixture Full');
  assert.equal(c.colors.filter((t) => !t.nested).length, 18);
  assert.equal(hex(byPath(c.colors, 'colors.surface')), '#ffffff');
  assert.equal(hex(byPath(c.colors, 'colors.on-primary')), '#ffffff');
  assert.equal(byPath(c.colors, 'colors.veil').rgba.a, 0.533);
  assert.equal(byPath(c.colors, 'colors.focus').aliasOf, 'colors.primary');
  const display = byPath(c.typography, 'typography.display');
  assert.deepEqual(display.lineHeight, { kind: 'ratio', value: 1.1 });
  assert.deepEqual(display.families, ['Manrope', 'sans-serif']);
  assert.equal(display.role, 'heading');
  assert.deepEqual(byPath(c.typography, 'typography.body-md').lineHeight, { kind: 'length', dim: { value: 24, unit: 'px', px: 24 } });
  assert.deepEqual(byPath(c.typography, 'typography.body-md').fontSize, { value: 1, unit: 'rem', px: 16 });
  assert.deepEqual(byPath(c.typography, 'typography.code').features, ['tnum', 'zero']);
  assert.equal(c.pairs.length, 3);
  assert.deepEqual(c.pairs.find((p) => p.source === 'components.button-primary'), { text: 'colors.on-primary', background: 'colors.primary', role: 'primary-action', largeText: false, source: 'components.button-primary' });
  assert.equal(c.pairs.find((p) => p.source === 'components.hero').largeText, true, 'a 48px display style is large text');
  assert.equal(byPath(c.sizes, 'components.button-primary.height').interactive, true);
  assert.equal(byPath(c.sizes, 'components.checkbox.size').interactive, true);
  assert.ok(!c.spacing.some((t) => t.path === 'spacing.ratio'), 'unitless spacing is skipped, not scored');
  assert.equal(byPath(c.radii, 'components.card.rounded').nested, true);
  assert.equal(c.linter.package, '@google/design.md');
  assert.equal(c.linter.version, '0.4.0');
  assert.ok(c.problems.every((p) => p.severity === 'warning'));
  golden('DM-1', c);
});
await check('DM-2 minimal: accepted; radius, spacing, sizes and pairs are empty', async () => {
  const r = await readFix('DM-2.md');
  if (FLIP) {
    only(r, 'TOO_FEW_COLORS');
    return;
  }
  const c = accepted(r);
  assert.equal(c.colors.length, 3);
  assert.equal(c.typography.length, 1);
  for (const g of ['radii', 'spacing', 'sizes', 'pairs', 'durations', 'easings']) assert.equal(c[g].length, 0, g);
  assert.deepEqual(c.stats, { declared: 3 + 1 + 1, byGroup: { colors: 3, typography: 1, radii: 0, spacing: 0, sizes: 0, durations: 0, easings: 0 } });
});
await check('DM-3a two colors: 422 TOO_FEW_COLORS, count 2, singular and plural copy', async () => {
  const r = await readFix('DM-3a.md');
  assert.equal(r.status, 422);
  const [p] = only(r, 'TOO_FEW_COLORS');
  assert.equal(p.count, 2);
  assert.equal(p.message, 'Your contract declares 2 colors that resolve to a value. Scoring needs at least 3.');
  assert.equal(problems.messageFor('TOO_FEW_COLORS', { count: 1 }), 'Your contract declares 1 color that resolves to a value. Scoring needs at least 3.');
});
await check('DM-3b no font size: 422 NO_TYPE_STYLE', async () => {
  const [p] = only(await readFix('DM-3b.md'), 'NO_TYPE_STYLE');
  assert.equal(p.message, 'Add at least one text style with both a font family and a font size.');
});
await check('DM-3c broken reference (probe P3): TOKEN_DROPPED with reason and ref', async () => {
  const [p] = only(await readFix('DM-3c.md'), 'TOKEN_DROPPED');
  assert.equal(p.path, 'colors.primary');
  assert.equal(p.reason, 'alias_unresolved');
  assert.equal(p.ref, '{colors.missing}');
  assert.match(p.message, /^colors\.primary is declared, but its value didn't survive reading \(its reference points to a token that does not exist\)/);
});
await check('DM-3d no YAML (probe P7): NO_TOKENS_FOUND', async () => {
  const r = await readFix('DM-3d.md');
  assert.deepEqual(codes(r), ['NO_TOKENS_FOUND']);
});
await check('DM-3e tokens only in tables (probe P9): TOKENS_IN_PROSE with rows, lines and keys', async () => {
  const [p] = only(await readFix('DM-3e.md'), 'TOKENS_IN_PROSE');
  assert.equal(p.colorRows, 14);
  assert.deepEqual(p.colorLines, [11, 24]);
  assert.equal(p.typeRows, 6);
  assert.deepEqual(p.typeLines, [30, 35]);
  assert.ok(p.keys.includes('name'));
  assert.ok(p.message.startsWith('Your DESIGN.md lists tokens in tables. Scoring reads tokens from YAML front matter, as the DESIGN.md format defines them.'));
  assert.ok(p.message.includes('Found 14 color rows under Colors (lines 11 to 24) and 6 text styles under Typography (lines 30 to 35).'));
});
await check('DM-4 omitted sections: recorded by group with their reason', async () => {
  const c = accepted(await readFix('DM-4.md'));
  assert.deepEqual(c.omitted, [{ group: 'spacing' }, { group: 'radii', reason: 'Corners are square by design.' }]);
});
await check('DM-5 duplicate ## Colors (probe P4): DUPLICATE_SECTION with heading and line', async () => {
  const [p] = only(await readFix('DM-5.md'), 'DUPLICATE_SECTION');
  assert.equal(p.heading, 'Colors');
  assert.equal(p.line, 20);
});
await check('DM-6 confusable token name: accepted with CONFUSABLE_NAME', async () => {
  const c = accepted(await readFix('DM-6.md'));
  const w = c.problems.filter((p) => p.code === 'CONFUSABLE_NAME');
  assert.equal(w.length, 1);
  assert.equal(w[0].path, 'colors.pаper');
  assert.equal(w[0].severity, 'warning');
});
await check('DM-7 reference loop: ALIAS_CYCLE with the chain; a token reaching it is TOKEN_DROPPED alias_cycle', async () => {
  const r = await readFix('DM-7.md');
  const cyc = only(r, 'ALIAS_CYCLE');
  assert.equal(cyc.length, 1, 'one problem per loop');
  assert.deepEqual(cyc[0].chain, ['colors.a', 'colors.b', 'colors.c', 'colors.a']);
  assert.equal(cyc[0].message, 'colors.a: its references loop back to itself (colors.a -> colors.b -> colors.c -> colors.a). Point one of them at a literal value.');
  const drop = only(r, 'TOKEN_DROPPED');
  assert.deepEqual(drop.map((p) => [p.path, p.reason]), [['colors.d', 'alias_cycle']]);
});
await check('DM-8 color referencing a radius: TOKEN_DROPPED alias_wrong_type', async () => {
  const [p] = only(await readFix('DM-8.md'), 'TOKEN_DROPPED');
  assert.equal(p.path, 'colors.edge');
  assert.equal(p.reason, 'alias_wrong_type');
});
await check('DM-9 malformed YAML: YAML_INVALID with the file line', async () => {
  const [p] = only(await readFix('DM-9.md'), 'YAML_INVALID');
  assert.ok(p.line >= 2 && p.line <= 6, `line ${p.line}`);
});
await check('DM-10 invalid color and unit (probe P6): LINT_ERROR per path, not doubled as TOKEN_DROPPED', async () => {
  const r = await readFix('DM-10.md');
  assert.deepEqual(only(r, 'LINT_ERROR').map((p) => p.path).sort(), ['colors.accent', 'rounded.big']);
  assert.equal(r.problems.filter((p) => p.code === 'TOKEN_DROPPED').length, 0);
});
await check('DM-11 tokens in a fenced yaml block: accepted', async () => {
  const c = accepted(await readFix('DM-11.md'));
  assert.equal(c.colors.length, 3);
});
await check('every TOKEN_DROPPED reason is from the closed list', () => {
  const types = h.load('app/lib/own-contract/types.ts');
  assert.deepEqual([...types.DROP_REASONS], ['alias_unresolved', 'alias_cycle', 'alias_wrong_type', 'value_not_scalar', 'value_invalid', 'unit_unsupported', 'unknown']);
});

// ─────────────────────────────────────────────────────────────────────────────
section('4. DTCG intake (fixtures DT-1 to DT-11)');

await check('DT-1 full 2025.10: color spaces, dimension roles, motion, typography, composites, pairs, token map', async () => {
  const c = accepted(await readFix('DT-1.json'));
  assert.equal(c.formatVersion, '2025.10');
  assert.equal(c.name, 'Fixture DTCG Full');
  assert.equal(hex(byPath(c.colors, 'color.primary')), '#1a5cff');
  assert.equal(byPath(c.colors, 'color.primary').cssVar, '--brand', 'the contract token map binds its variable');
  const ink = byPath(c.colors, 'color.ink').rgba;
  assert.ok(Math.abs(ink.r - 0x11) <= 1 && Math.abs(ink.g - 0x14) <= 1 && Math.abs(ink.b - 0x18) <= 1, `hsl ink ${JSON.stringify(ink)}`);
  const acc = byPath(c.colors, 'color.accent').rgba;
  const accCss = norm.parseColor('oklch(66% 0.18 250)');
  assert.ok(norm.sameRgb(acc, accCss), 'DTCG oklch equals the CSS oklch');
  assert.deepEqual(byPath(c.colors, 'color.deep').rgba, byPath(c.colors, 'color.deep-nohex').rgba, 'components win over hex');
  assert.equal(hex(byPath(c.colors, 'color.wide')), '#a0522d', 'an unconverted space falls back to hex');
  assert.ok(!c.colors.some((t) => t.path === 'color.far'));
  assert.ok(c.problems.some((p) => p.code === 'COLOR_SPACE_UNSUPPORTED' && p.path === 'color.far' && p.space === 'prophoto-rgb'));
  assert.deepEqual(c.radii.map((t) => t.path), ['radius.sm', 'radius.md', 'corner.pill']);
  assert.equal(byPath(c.radii, 'corner.pill').cssVar, '--pill');
  assert.deepEqual(c.spacing.map((t) => [t.path, t.dim.px]), [['space.sm', 8], ['space.md', 16]]);
  assert.deepEqual(c.sizes.map((t) => [t.path, t.interactive]), [['control.min', true]]);
  assert.ok(c.problems.some((p) => p.code === 'DIMENSION_ROLE_UNKNOWN' && p.path === 'misc.odd'));
  assert.deepEqual(c.durations.map((t) => [t.path, t.ms]), [['duration.quick', 120], ['duration.slow', 400], ['motion.fade.duration', 120]]);
  assert.deepEqual(c.easings.map((t) => t.points), [[0.2, 0, 0, 1], [0.2, 0, 0, 1]]);
  const body = byPath(c.typography, 'typography.body');
  assert.deepEqual(body.families, ['Manrope', 'sans-serif']);
  assert.deepEqual(body.fontSize, { value: 16, unit: 'px', px: 16 });
  assert.deepEqual(body.lineHeight, { kind: 'ratio', value: 1.5 });
  assert.deepEqual(byPath(c.typography, 'typography.code').features, ['tnum']);
  assert.ok(byPath(c.colors, 'border.focus.color').nested);
  assert.equal(byPath(c.colors, 'shadow.card.color').rgba.a, 0.2);
  assert.deepEqual(c.pairs.map((p) => [p.text, p.background, p.role]), [['color.on-primary', 'color.primary', 'primary-action'], ['color.ink', 'color.on-primary', 'component']]);
  assert.deepEqual(Object.fromEntries(c.tokenMap), { 'color.primary': '--brand' });
  golden('DT-1', c);
});
await check('DT-2 legacy hex strings: accepted with LEGACY_COLOR_STRING each', async () => {
  const c = accepted(await readFix('DT-2.json'));
  assert.equal(c.problems.filter((p) => p.code === 'LEGACY_COLOR_STRING').length, 3);
  assert.equal(c.problems[0].message, 'color.a uses an older colour string. It was read as #111111. The 2025.10 format prefers a colour object.');
});
await check('DT-3 $type only on groups: inherited by nested tokens', async () => {
  const c = accepted(await readFix('DT-3.json'));
  assert.equal(hex(byPath(c.colors, 'brand.nested.c')), '#0055ff');
});
await check('DT-4 three-hop alias chain: resolved, each alias recorded', async () => {
  const c = accepted(await readFix('DT-4.json'));
  assert.equal(hex(byPath(c.colors, 'color.three')), '#0055ff');
  assert.equal(byPath(c.colors, 'color.three').aliasOf, 'color.two');
  assert.deepEqual(c.aliases.map((a) => `${a.from}>${a.to}`), ['color.one>color.base', 'color.two>color.one', 'color.three>color.two']);
});
await check('DT-5 JSON Pointer $ref: a token and a composite member resolve', async () => {
  const c = accepted(await readFix('DT-5.json'));
  assert.equal(hex(byPath(c.colors, 'color.ref')), '#0055ff');
  assert.equal(byPath(c.typography, 'typography.small').fontSize.px, 16);
});
await check('DT-6 $extends with an override: the local token wins, the rest are inherited', async () => {
  const c = accepted(await readFix('DT-6.json'));
  assert.equal(hex(byPath(c.colors, 'dark.paper')), '#000000');
  assert.equal(hex(byPath(c.colors, 'dark.ink')), '#111111');
  assert.equal(hex(byPath(c.colors, 'dark.accent')), '#0055ff');
});
await check('DT-7a alias cycle: 422 ALIAS_CYCLE, one problem, the ordered chain', async () => {
  const r = await readFix('DT-7a.json');
  assert.equal(r.status, 422);
  const cyc = only(r, 'ALIAS_CYCLE');
  assert.equal(cyc.length, 1);
  assert.deepEqual(cyc[0].chain, ['color.a', 'color.b', 'color.c', 'color.a']);
});
await check('DT-7b $extends cycle: ALIAS_CYCLE over the groups', async () => {
  const [p] = only(await readFix('DT-7b.json'), 'ALIAS_CYCLE');
  assert.equal(p.chain[0], p.chain[p.chain.length - 1]);
  assert.deepEqual([...new Set(p.chain)].sort(), ['one', 'two']);
});
await check('DT-8 a token with no type to inherit: skipped with NO_TYPE, never guessed', async () => {
  const c = accepted(await readFix('DT-8.json'));
  assert.ok(c.problems.some((p) => p.code === 'NO_TYPE' && p.path === 'loose.thing'));
  assert.ok(![...c.radii, ...c.spacing, ...c.sizes].some((t) => t.path === 'loose.thing'));
});
await check('DT-9 groups named __proto__ and constructor: plain names, no prototype change', async () => {
  const c = accepted(await readFix('DT-9.json'));
  assert.ok(c.colors.some((t) => t.path === '__proto__.polluted'));
  assert.ok(c.colors.some((t) => t.path === 'constructor.prototype'));
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(typeof ({}).constructor, 'function');
});
await check('DT-10 limits: 2,001 tokens, 17 levels, 300 KiB', async () => {
  const many = { color: { $type: 'color' } };
  for (let i = 0; i < 2001; i++) many.color[`c${i}`] = { $value: '#111111' };
  const [p] = only(await read(JSON.stringify(many)), 'TOO_MANY_TOKENS');
  assert.equal(p.count, 2001);
  let deep = { leaf: { $type: 'color', $value: '#111111' } };
  for (let i = 0; i < 17; i++) deep = { [`g${i}`]: deep };
  only(await read(JSON.stringify(deep)), 'TOO_DEEP');
  const big = `{"pad":"${'x'.repeat(300 * 1024)}"}`;
  const r = await read(big);
  assert.equal(r.status, 413);
  assert.equal(r.problems[0].code, 'contract_too_large');
  assert.equal(r.problems[0].message, 'This contract is 300 KB. Scoring reads contracts up to 256 KB. Remove unused tokens or score part of it.');
});
await check('DT-11 malformed JSON: JSON_INVALID with line and column', async () => {
  const [p] = only(await readFix('DT-11.json'), 'JSON_INVALID');
  assert.equal(p.line, 5);
  assert.ok(p.column >= 1);
});
await check('a DTCG value that is not a value: VALUE_INVALID with its kind, cut to 80 characters', async () => {
  const doc = { color: { $type: 'color', a: { $value: '#111111' }, b: { $value: '#222222' }, c: { $value: `not-a-color-${'z'.repeat(200)}` } }, t: { $type: 'typography', b: { $value: { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' } } } } };
  const [p] = only(await read(JSON.stringify(doc)), 'VALUE_INVALID');
  assert.equal(p.kind, 'color');
  assert.equal(p.value.length, 80);
  assert.ok(p.value.endsWith('…'));
  assert.ok(!p.message.includes('z'.repeat(81)));
});
await check('an unresolved DTCG reference: ALIAS_UNRESOLVED with ref', async () => {
  const doc = { color: { $type: 'color', a: { $value: '{color.nope}' }, b: { $value: '#111111' } } };
  const [p] = only(await read(JSON.stringify(doc)), 'ALIAS_UNRESOLVED');
  assert.equal(p.path, 'color.a');
  assert.equal(p.ref, '{color.nope}');
});
await check('a 17-hop alias chain: ALIAS_TOO_DEEP', async () => {
  const color = { $type: 'color', t0: { $value: '#111111' } };
  for (let i = 1; i <= 18; i++) color[`t${i}`] = { $value: `{color.t${i - 1}}` };
  only(await read(JSON.stringify({ color })), 'ALIAS_TOO_DEEP');
});

// ─────────────────────────────────────────────────────────────────────────────
section('5. Token map, budget and problem shape');

await check('a token map key that is not a token: TOKEN_MAP_INVALID with key', async () => {
  const [p] = only(await readFix('DM-2.md', { tokenMap: { 'colors.nope': '--x' } }), 'TOKEN_MAP_INVALID');
  assert.equal(p.key, 'colors.nope');
  assert.equal(p.message, 'Token map: "colors.nope" is not a token in your contract. Use a path from your file, like colors.primary.');
});
await check('a token map value that is not a variable name: TOKEN_MAP_INVALID with value', async () => {
  const [p] = only(await readFix('DM-2.md', { tokenMap: { 'colors.ink': 'ink' } }), 'TOKEN_MAP_INVALID');
  assert.equal(p.value, 'ink');
});
await check('501 token map entries: TOKEN_MAP_INVALID with the count', async () => {
  const map = {};
  for (let i = 0; i < 501; i++) map[`k${i}`] = '--x';
  const [p] = only(await readFix('DM-2.md', { tokenMap: map }), 'TOKEN_MAP_INVALID');
  assert.equal(p.count, 501);
});
await check('a valid request token map binds variables and wins over the contract map', async () => {
  const c = accepted(await readFix('DT-1.json', { tokenMap: { 'color.primary': '--primary', 'typography.body.fontSize': '--text-base' } }));
  assert.equal(byPath(c.colors, 'color.primary').cssVar, '--primary');
  assert.equal(c.tokenMap.get('typography.body.fontSize'), '--text-base');
});
await check('intake over 1 s: CONTRACT_TOO_COMPLEX', async () => {
  let t = 0;
  const r = await oc.readContract({ content: fixture('DM-2.md') }, { lint, now: () => (t += 1100) });
  only(r, 'CONTRACT_TOO_COMPLEX');
});
await check('clipValue keeps at most 80 characters and makes control characters visible', () => {
  assert.equal(problems.clipValue('x'.repeat(200)).length, 80);
  assert.equal(problems.clipValue('a\nb'), 'a b');
  assert.equal(problems.clipValue('short'), 'short');
});
await check('a long linter value reaches the message cut to 80 characters', async () => {
  const doc = `---\nname: Long\ncolors:\n  ink: "#111111"\n  paper: "#FFFFFF"\n  accent: "${'q'.repeat(300)}"\ntypography:\n  body:\n    fontFamily: Inter\n    fontSize: 16px\n---\n`;
  const [p] = only(await read(doc), 'LINT_ERROR');
  assert.ok(p.value.length <= 80);
  assert.ok(!p.message.includes('q'.repeat(81)));
});
await check('every error code has an HTTP status and a message builder', () => {
  for (const c of problems.ERROR_CODES) {
    assert.ok([413, 422].includes(problems.statusOf(c)), c);
    assert.ok(problems.messageFor(c, {}).length > 10, c);
  }
  assert.equal(problems.statusOf('scope_conflict'), 400);
  assert.equal(problems.statusOf('contract_shape'), 400);
});

// ─────────────────────────────────────────────────────────────────────────────
section('6. Parity (PAR-1) and the contract digest (engine spec 11.2)');

await check('PAR-1: one system as DESIGN.md and as DTCG reads to the same counts', async () => {
  const a = accepted(await readFix('acme-design.md'));
  const b = accepted(await readFix('acme-tokens.json'));
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.stats.declared, 52, 'the prototype scenario declares 52 tokens');
  assert.equal(a.pairs.length, 4);
  assert.equal(b.pairs.length, 4);
  assert.equal(a.aliases.length, 6);
  assert.equal(b.aliases.length, 6);
  const hexes = (c) => [...new Set(c.colors.filter((t) => !t.nested).map(hex))].sort();
  assert.deepEqual(hexes(a), hexes(b));
  assert.notEqual(a.digest, b.digest, 'paths differ, so digests differ');
});
await check('digest is stable under key order, prose, name and whitespace', async () => {
  const base = fixture('DM-2.md');
  const d0 = accepted(await read(base)).digest;
  const reordered = base.replace('  ink: "#111111"\n  paper: "#FFFFFF"\n', '  paper: "#FFFFFF"\n  ink: "#111111"\n');
  assert.notEqual(reordered, base);
  const renamed = base.replace('name: Minimal', 'name: Another name');
  const prose = `${base}\n## More\n\nNew prose.\n`;
  for (const v of [reordered, renamed, prose]) assert.equal(accepted(await read(v)).digest, d0);
  const dt = accepted(await readFix('DT-4.json')).digest;
  const dtSpaced = JSON.stringify(JSON.parse(fixture('DT-4.json')));
  assert.equal(accepted(await read(dtSpaced)).digest, dt);
});
await check('digest moves with a value, a path, a pair or the token map', async () => {
  const base = fixture('DM-2.md');
  const d0 = accepted(await read(base)).digest;
  const variants = [
    base.replace('"#0055FF"', '"#0055FE"'),
    base.replace('  accent:', '  brand:'),
    base.replace('---\n\n## Overview', 'components:\n  button:\n    backgroundColor: "{colors.accent}"\n    textColor: "{colors.paper}"\n---\n\n## Overview'),
  ];
  for (const v of variants) assert.notEqual(accepted(await read(v)).digest, d0);
  assert.notEqual(accepted(await read(base, { tokenMap: { 'colors.ink': '--ink' } })).digest, d0);
});
await check('canonical JSON: sorted keys, shortest numbers', () => {
  assert.equal(digestMod.canonicalJson({ b: 1.5, a: [2, { d: true, c: null }] }), '{"a":[2,{"c":null,"d":true}],"b":1.5}');
});
await check('10 cold reads of one contract give one digest (determinism)', async () => {
  const ds = new Set();
  for (let i = 0; i < 10; i++) ds.add(accepted(await readFix('acme-design.md')).digest);
  assert.equal(ds.size, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
section('7. Linked contracts (engine spec 4.2)');

const respond = (body, init = {}) => async () => new Response(body, init);
await check('a 404 contract URL: CONTRACT_URL_UNREACHABLE http_error with status', async () => {
  const r = await fetchMod.fetchContract('https://example.com/DESIGN.md', respond('nope', { status: 404 }));
  assert.equal(r.ok, false);
  assert.equal(r.problem.code, 'CONTRACT_URL_UNREACHABLE');
  assert.equal(r.problem.why, 'http_error');
  assert.equal(r.problem.status, 404);
});
await check('a wrong content type is named', async () => {
  const r = await fetchMod.fetchContract('https://example.com/x', respond('x', { headers: { 'content-type': 'image/png' } }));
  assert.equal(r.problem.why, 'content_type');
  assert.equal(r.problem.value, 'image/png');
});
await check('over 256 KB, declared or read: 413 contract_too_large', async () => {
  const declared = await fetchMod.fetchContract('https://example.com/x', respond('x', { headers: { 'content-type': 'text/plain', 'content-length': String(300 * 1024) } }));
  assert.equal(declared.status, 413);
  const read = await fetchMod.fetchContract('https://example.com/x', respond('y'.repeat(257 * 1024), { headers: { 'content-type': 'text/plain' } }));
  assert.equal(read.status, 413);
});
await check('a stalled contract URL aborts at the timeout (8 s by default)', async () => {
  assert.equal(limits.CONTRACT_FETCH_TIMEOUT_MS, 8000);
  const stall = () => new Promise(() => {});
  const t0 = Date.now();
  const r = await fetchMod.fetchContract('https://example.com/slow', stall, 60);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(r.problem.why, 'timeout');
});
await check('a guard refusal reads as "blocked"; a good fetch returns the text', async () => {
  const blocked = await fetchMod.fetchContract('http://127.0.0.1/x', async () => { throw new Error('SSRF guard: blocked URL http://127.0.0.1/x'); });
  assert.equal(blocked.problem.why, 'blocked');
  const ok = await fetchMod.fetchContract('https://example.com/DESIGN.md', respond(fixture('DM-2.md'), { headers: { 'content-type': 'text/markdown' } }));
  assert.equal(ok.ok, true);
  assert.equal(ok.content, fixture('DM-2.md'));
});

// ─────────────────────────────────────────────────────────────────────────────
section('8. Regex timing: 1 MB of pathological input under 200 ms per parser');

const MB = 1024 * 1024;
const timed = (label, fn) => {
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `${label} took ${ms.toFixed(0)} ms`);
};
await check('color, dimension, easing, feature and duration parsers', () => {
  timed('parseColor', () => norm.parseColor(`rgb(${'1 '.repeat(MB / 2)})`));
  timed('parseColor hex', () => norm.parseColor(`#${'a'.repeat(MB)}`));
  timed('parseDimension', () => norm.parseDimension(`${'9'.repeat(MB)}x`));
  timed('hasOtherUnit', () => norm.hasOtherUnit(`${'9'.repeat(MB)}%%`));
  timed('parseEasing', () => norm.parseEasing(`cubic-bezier(${'1,'.repeat(MB / 2)}`));
  timed('parseFeatureTags', () => norm.parseFeatureTags(`'${"tnum' 1, '".repeat(MB / 11)}`));
  timed('parseDurationMs', () => norm.parseDurationMs(`${'9'.repeat(MB)}m`));
  timed('parseLineHeight', () => norm.parseLineHeight(`${'9'.repeat(MB)}.`));
});
await check('detection, front matter, prose tables, headings and JSON positions', () => {
  timed('detectFormat', () => detect.detectFormat(`${'x'.repeat(MB)}`));
  timed('hasFencedYaml', () => detect.hasFencedYaml('`'.repeat(MB)));
  timed('yamlBlocks', () => dmd.yamlBlocks(`---\n${'a: b\n'.repeat(MB / 5)}`));
  timed('proseTables', () => dmd.proseTables(`${'| #fff | a |\n'.repeat(MB / 13)}`, 1));
  timed('proseTables pipes', () => dmd.proseTables(`|${'|'.repeat(MB)}`, 1));
  timed('jsonErrorPosition', () => dtcg.jsonErrorPosition('{'.repeat(MB), `Unexpected token at position ${MB - 1}`));
});

// ─────────────────────────────────────────────────────────────────────────────
section('8b. Line endings: LF, CRLF and CR read the same');

const EOL_FIXTURES = ['DM-1.md', 'DM-2.md', 'DM-3c.md', 'DM-3e.md', 'DM-4.md', 'DM-5.md', 'DM-7.md', 'DM-9.md', 'DM-10.md', 'DM-11.md', 'DT-1.json', 'DT-2.json', 'DT-11.json', 'acme-design.md', 'acme-tokens.json'];
const asCrlf = (t) => t.replace(/\n/g, '\r\n');
const asCr = (t) => t.replace(/\n/g, '\r');
/** What a reader of one contract sees: the model and its digest, or the problems; warnings either way. */
const outcome = (r) => (r.ok
  ? { ok: true, model: JSON.parse(JSON.stringify(modelSnapshot(r.contract))), warnings: r.contract.problems }
  : { ok: false, status: r.status, problems: r.problems, warnings: r.warnings });
await check('normalizeLineEndings turns CRLF and a lone CR into LF, and leaves LF alone', () => {
  assert.equal(oc.normalizeLineEndings('a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(oc.normalizeLineEndings('a\r\r\nb'), 'a\n\nb');
  const t = 'x\ny';
  assert.equal(oc.normalizeLineEndings(t), t);
});
for (const name of EOL_FIXTURES) {
  await check(`${name}: LF, CRLF and CR give one model, digest, problems (line numbers included) and warnings`, async () => {
    const text = fixture(name);
    const base = outcome(await read(text));
    for (const [label, variant] of [['CRLF', asCrlf(text)], ['CR', asCr(text)]]) {
      assert.notEqual(variant, text);
      assert.deepEqual(outcome(await read(variant)), base, `${label} differs from LF`);
    }
  });
}
await check('a CRLF contract reports the size the caller sent, and every format is detected the same way', async () => {
  const text = fixture('DM-2.md');
  const crlf = accepted(await read(asCrlf(text)));
  assert.equal(crlf.source.bytes, new TextEncoder().encode(asCrlf(text)).length);
  for (const n of EOL_FIXTURES) assert.deepEqual(detect.detectFormat(asCr(fixture(n))), detect.detectFormat(fixture(n)), n);
});

// ─────────────────────────────────────────────────────────────────────────────
section('9. Privacy');

await check('no console output during any intake above (engine spec 13)', () => {
  assert.deepEqual(logged, [], `console output: ${logged.slice(0, 3).join(' | ')}`);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Own-contract engine: ${failures.length} failing check(s).`);
  process.exit(1);
}
console.log('Own-contract engine: every check holds.');
