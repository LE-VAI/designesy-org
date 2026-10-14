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
  // The approved sentence, word for word; the counts ride as fields.
  assert.equal(p.message, 'Your DESIGN.md lists tokens in tables. Scoring reads tokens from YAML front matter, as the DESIGN.md format defines them. Move the values into colors, typography, rounded and spacing groups at the top of the file.');
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
  // The owner-approved payload: character, script, code point, 1-based position, Latin counterpart.
  assert.equal(w[0].char, 'а');
  assert.equal(w[0].script, 'Cyrillic');
  assert.equal(w[0].codePoint, '0430');
  assert.equal(w[0].position, 9);
  assert.equal(w[0].latin, 'a');
  assert.equal(w[0].message, 'colors.pаper contains a lookalike character: "а" (Cyrillic, U+0430) at position 9, where a Latin "a" is expected. Retype the name so it uses only the characters you mean.');
});
await check('CONFUSABLE_NAME with no Latin counterpart in the table drops the Latin clause', async () => {
  // A helper whose table has no Latin letter for the character (v36's table
  // names one for every entry today; the message must still read right).
  const noLatin = (s) => [...s].flatMap((ch, pos) => (ch === 'ж' ? [{ char: ch, pos, ascii: '' }] : []));
  const doc = fixture('DM-2.md').replace('  accent:', '  жaccent:');
  const c = accepted(await oc.readContract({ content: doc }, { lint, findConfusables: noLatin }));
  const [w] = c.problems.filter((p) => p.code === 'CONFUSABLE_NAME');
  assert.deepEqual([w.char, w.script, w.codePoint, w.position, 'latin' in w], ['ж', 'Cyrillic', '0436', 8, false]);
  assert.equal(w.message, 'colors.жaccent contains a lookalike character: "ж" (Cyrillic, U+0436) at position 8. Retype the name so it uses only the characters you mean.');
  const full = problems.confusableWarnings('aｂc', [{ char: 'ｂ', pos: 1, ascii: 'b' }])[0];
  assert.deepEqual([full.script, full.codePoint, full.position, full.latin], ['Fullwidth Latin', 'FF42', 2, 'b']);
  const greek = problems.confusableWarnings('xο', [{ char: 'ο', pos: 1, ascii: 'o' }])[0];
  assert.equal(greek.script, 'Greek');
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
  for (const p of r.problems) assert.ok(!p.message.includes('..'), p.message);
  assert.match(only(r, 'LINT_ERROR')[0].message, /\. The DESIGN\.md format's linter rejects this, so scoring can't read the file as written\.$/);
});
await check('O6 copy: the size, URL, value and section messages read as approved', () => {
  const m = problems.messageFor;
  assert.equal(m('contract_too_large', { count: 300 * 1024 }), 'This contract is 300 KB. Scoring reads contracts up to 256 KB. Remove unused tokens or score part of it.');
  assert.equal(m('CONTRACT_URL_UNREACHABLE', { url: 'https://x.example.com/D.md', why: 'http_error', status: 403 }), 'We could not fetch your contract from https://x.example.com/D.md: the server answered HTTP 403. Check the link opens without signing in.');
  assert.equal(m('CONTRACT_URL_UNREACHABLE', { url: 'https://x.example.com/D.md', why: 'content_type', value: 'image/png' }), 'We could not fetch your contract from https://x.example.com/D.md: the file type is not one scoring reads. It served image/png; use a text or JSON file.');
  assert.equal(m('VALUE_INVALID', { path: 'ease.out', value: 'bouncy', kind: 'cubicBezier' }), 'ease.out: "bouncy" is not a valid curve. Use a form like "cubic-bezier(0.2, 0, 0, 1)".');
  assert.equal(m('DUPLICATE_SECTION', { heading: 'Colors' }), 'The heading "Colors" appears twice. The DESIGN.md format allows each section once, so merge the two and run it again.');
  assert.equal(m('TOO_MANY_TOKENS', { count: 2001 }), 'Your contract declares 2001 tokens. Scoring reads up to 2,000 at once. Score the part your pages use, or split the file.');
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
  assert.equal(c.problems.find((p) => p.code === 'NO_TYPE').message, 'loose.thing has no $type, so it was skipped: the DTCG format doesn\'t let scoring guess a type. Add "$type": "color" (or "dimension", "duration", and so on) to the token or its group.');
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

// ═════════════════════════════════════════════════════════════════════════════
// Scoring: binding, coverage, f01 to f14, both layers, null scores, baseline
// titles, the published formula and the site fixtures (engine spec 5 to 9).
// Modules load lazily, so a checkout without them fails each check by name
// instead of stopping at load.
// ═════════════════════════════════════════════════════════════════════════════

const lazy = (file) => {
  let mod = null;
  let err = null;
  return new Proxy({}, {
    get(_t, key) {
      if (!mod && !err) {
        try { mod = h.load(file); } catch (e) { err = e; }
      }
      if (err) throw new Error(`${file} does not load: ${err.message.split('\n')[0]}`);
      return mod[key];
    },
  });
};
const run = lazy('app/lib/own-contract/run.ts');
const score = lazy('app/lib/own-contract/score.ts');
const baselineMod = lazy('app/lib/own-contract/baseline.ts');
const nulls = lazy('app/lib/own-contract/nulls.ts');
const formula = lazy('app/lib/own-contract/formula.ts');
const pageCss = lazy('app/lib/own-contract/css.ts');
const defs = h.load('app/lib/check-definitions.ts');

/** A front-matter DESIGN.md from groups written as YAML lines. */
const md = (body) => `---\nname: Test\n${body}\n---\n`;
const C_BASE = md(`colors:
  ink: "#111111"
  paper: "#FFFFFF"
  accent: "#0055FF"
  muted: "#666666"
  line: "#DDDDDD"
  focus: "{colors.accent}"
  link: "{colors.accent}"
typography:
  body:
    fontFamily: Inter, Arial, sans-serif
    fontSize: 16px
    lineHeight: 1.5
  h1:
    fontFamily: Inter
    fontSize: 32px
    lineHeight: 1.2
  small:
    fontFamily: Inter
    fontSize: 12px
    lineHeight: 1.4
  label:
    fontFamily: Inter
    fontSize: 14px
    lineHeight: 20px
  code:
    fontFamily: IBM Plex Mono
    fontSize: 15px
    lineHeight: 1.5
    fontFeature: "'tnum' 1, 'zero'"
rounded:
  sm: 4px
  md: 8px
  lg: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  base: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    height: 44px
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  checkbox:
    size: 20px`);

const contractOf = async (text, extra) => accepted(await read(text, extra));
/** Run every fidelity check of `contract` against one page; returns { byId, ctx }. */
const fidelityOf = async (contractText, css, html = '<html><body><h1>Page</h1></body></html>', extra) => {
  const contract = await contractOf(contractText, extra);
  const ctx = run.buildContext(contract, { html, css });
  const checks = run.runFidelityChecks(ctx);
  return { byId: Object.fromEntries(checks.map((c) => [c.id, c])), ctx, checks };
};
const st = async (id, contractText, css, html, extra) => {
  const { byId } = await fidelityOf(contractText, css, html, extra);
  return byId[id];
};
const expectStatus = (c, status, skipReason) => {
  assert.ok(c, 'no check result');
  assert.equal(c.status, status, `${c.id}: ${c.status} (${c.skipReason ?? ''}) "${c.detail}"`);
  if (skipReason) assert.equal(c.skipReason, skipReason, `${c.id} skipReason`);
};
const rule = (sel, decls) => `${sel} { ${decls} }\n`;

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
await check('a CRLF and an LF copy of the same contract hash identically (contract digest)', async () => {
  for (const name of ['DM-1.md', 'DM-4.md', 'acme-design.md', 'DT-1.json', 'acme-tokens.json']) {
    const lfDigest = accepted(await read(fixture(name))).digest;
    const crlfDigest = accepted(await read(asCrlf(fixture(name)))).digest;
    assert.match(lfDigest, /^[0-9a-f]{64}$/);
    assert.equal(crlfDigest, lfDigest, `${name}: the CRLF copy hashes differently`);
  }
});
await check('a CRLF contract reports the size the caller sent, and every format is detected the same way', async () => {
  const text = fixture('DM-2.md');
  const crlf = accepted(await read(asCrlf(text)));
  assert.equal(crlf.source.bytes, new TextEncoder().encode(asCrlf(text)).length);
  for (const n of EOL_FIXTURES) assert.deepEqual(detect.detectFormat(asCr(fixture(n))), detect.detectFormat(fixture(n)), n);
});

// ─────────────────────────────────────────────────────────────────────────────
section('10. Page CSS reader and binding (engine spec 5.1 to 5.3)');

await check('root custom properties come from :root, :root, :host and html, never from theme or media blocks', () => {
  const p = pageCss.readPageCss(':root { --a: #111; } @media (min-width: 1px) { :root { --a: #222; } } [data-theme=dark] { --a: #333; } html { --b: 4px; } @layer theme { :root, :host { --c: red; } } .dark { --a: #444 }');
  assert.equal(p.rootVars.get('--a'), '#111');
  assert.equal(p.rootVars.get('--b'), '4px');
  assert.equal(p.rootVars.get('--c'), 'red');
});
await check('usage declarations exclude custom properties, prefixed properties and theme blocks', () => {
  const p = pageCss.readPageCss(':root { --x: 1px } a { color: red; -webkit-text-fill-color: blue } .dark a { color: green } @media (prefers-color-scheme: dark) { a { color: pink } } @font-face { font-family: X } @keyframes k { from { color: teal } }');
  assert.deepEqual(p.usage.map((d) => `${d.prop}:${d.value}`), ['color:red']);
});
await check('braces and semicolons inside strings and url() do not break a rule', () => {
  const p = pageCss.readPageCss('a::before { content: "{;}"; color: #123456 } b { background: url("x;{.png") #abcdef }');
  assert.deepEqual(p.usage.map((d) => d.prop), ['content', 'color', 'background']);
});
await check('var() resolves through :root with fallbacks and stops on cycles', () => {
  const p = pageCss.readPageCss(':root { --a: var(--b); --b: 8px; --c: var(--c); }');
  assert.equal(pageCss.resolveVars('var(--a)', p.rootVars), '8px');
  assert.equal(pageCss.resolveVars('var(--nope, 3px)', p.rootVars), '3px');
  assert.equal(pageCss.resolveVars('var(--c)', p.rootVars), null);
});
await check('a token is located by map, by name (Tailwind v4 and path names), or by value; two names with different values are ambiguous', async () => {
  const contract = await contractOf(C_BASE, { tokenMap: { 'colors.muted': '--grey' } });
  const ctx = run.buildContext(contract, {
    html: '',
    css: ':root { --color-ink: #111111; --colors-paper: #fff; --grey: #666666; --color-accent: #0055ff; --accent: #0044ee; --text-body: 16px; --radius-sm: 4px; } a { color: #dddddd }',
  });
  const b = (p) => ctx.bindings.find((x) => x.path === p);
  assert.equal(b('colors.ink').located, 'name');
  assert.equal(b('colors.ink').cssVar, '--color-ink');
  assert.equal(b('colors.paper').located, 'name');
  assert.equal(b('colors.muted').located, 'map');
  assert.equal(b('colors.line').located, 'value');
  assert.equal(b('colors.accent').located, 'value', '--color-accent and --accent disagree, so not by name; its value is on the page');
  assert.ok(ctx.notes.some((n) => n.startsWith('BINDING_AMBIGUOUS')));
  assert.equal(b('typography.body.fontSize').located, 'name');
  assert.equal(b('rounded.sm').located, 'name');
});
await check('a mapped variable missing from the page leaves the token unlocated', async () => {
  const contract = await contractOf(C_BASE, { tokenMap: { 'colors.ink': '--missing' } });
  const ctx = run.buildContext(contract, { html: '', css: ':root { --color-ink: #111111 } a { color: #111111 }' });
  assert.equal(ctx.bindings.find((x) => x.path === 'colors.ink').located, null);
});
await check('coverage: declared, located by map, name and value, groups, and a hint under 20%', async () => {
  const contract = await contractOf(C_BASE);
  const ctx = run.buildContext(contract, { html: '', css: 'a { color: #111111 }' });
  const cov = run.coverageOf(ctx);
  assert.equal(cov.declared, contract.stats.declared);
  assert.equal(cov.byValue, 1);
  assert.equal(cov.located, cov.byMap + cov.byName + cov.byValue);
  assert.equal(cov.ratio, Math.round((cov.located / cov.declared) * 1000) / 1000);
  assert.ok(cov.hint && cov.hint.startsWith(`Only 1 of ${cov.declared} declared tokens were found on this page.`));
  assert.deepEqual(Object.keys(cov.groups).sort(), ['colors', 'durations', 'easings', 'radii', 'sizes', 'spacing', 'typography']);
});

// ─────────────────────────────────────────────────────────────────────────────
section('11. Fidelity checks at their thresholds (engine spec 6.2, 6.3)');

const ROOT_OK = ':root { --color-ink: #111111; --color-paper: #ffffff; --color-accent: #0055ff; --color-muted: #666666; --color-line: #dddddd; --color-focus: var(--color-accent); --color-link: var(--color-accent); }';
// f01
await check('f01 PASS: every token located by name ships its declared value (1 per channel tolerated)', async () => {
  expectStatus(await st('f01', C_BASE, ':root { --color-ink: #121111; --color-paper: #fff; --color-accent: #0055ff }'), 'PASS');
});
await check('f01 WARN at exactly 90% matching; FAIL below', async () => {
  const ten = ':root { --color-ink: #111111; --color-paper: #fff; --color-accent: #0055ff; --color-muted: #666666; --color-line: #dddddd; --text-body: 16px; --text-h1: 32px; --text-small: 12px; --text-label: 14px; --radius-sm: 5px }';
  const c = await st('f01', C_BASE, ten);
  expectStatus(c, 'WARN');
  assert.equal(c.shipped.length, 1);
  assert.deepEqual(c.shipped[0], { path: 'rounded.sm', value: '5px', where: ['--radius-sm'] });
  expectStatus(await st('f01', C_BASE, ':root { --color-ink: #111111; --color-paper: #000; --color-accent: #0055ff }'), 'FAIL');
});
await check('f01 SKIP not_located with fewer than 3 tokens located by map or name', async () => {
  expectStatus(await st('f01', C_BASE, ':root { --color-ink: #111111; --color-paper: #fff }'), 'SKIP', 'not_located');
});
// f02
const PAL10 = md(`colors:
${['101010', '202020', '303030', '404040', '505050', '606060', '707070', '808080', '909090', 'a0a0a0'].map((x, i) => `  c${i}: "#${x}"`).join('\n')}
typography:
  body:
    fontFamily: Inter
    fontSize: 16px`);
const shipColors = (list) => list.map((c, i) => rule(`.c${i}`, `color: ${c}`)).join('');
const inPal = ['#101010', '#202020', '#303030', '#404040', '#505050', '#606060', '#707070', '#808080', '#909090', '#a0a0a0'];
await check('f02 PASS at exactly 90% of shipped colors in the palette, with the R3-07 line', async () => {
  const c = await st('f02', PAL10, shipColors([...inPal.slice(0, 9), '#123456']));
  expectStatus(c, 'PASS');
  assert.equal(c.detail, '9 of 10 shipped colors are in your palette (90% needed to pass). Outside it: #123456');
});
await check('f02 WARN at exactly 70%; FAIL below; outside colors name their nearest declared color', async () => {
  expectStatus(await st('f02', PAL10, shipColors([...inPal.slice(0, 7), '#ff0000', '#00ff00', '#0000ff'])), 'WARN');
  const c = await st('f02', PAL10, shipColors([...inPal.slice(0, 6), '#ff0000', '#00ff00', '#0000ff', '#111112'.replace('111112', 'fe0000')]));
  expectStatus(c, 'FAIL');
  const ev = c.evidence.findings.find((f) => f.value === '#FF0000');
  assert.ok(ev, 'off-palette #FF0000 listed');
  assert.ok(typeof ev.nearest === 'string' && ev.nearest.startsWith('colors.c'));
});
await check('f02 ignores alpha for membership and skips gradients and shadows', async () => {
  const c = await st('f02', PAL10, shipColors(['rgba(16,16,16,.5)', '#202020', '#303030']) + rule('.g', 'background: linear-gradient(#ff0000, #00ff00); box-shadow: 0 0 1px #0000ff'));
  expectStatus(c, 'PASS');
  assert.equal(c.detail, '3 of 3 shipped colors are in your palette (90% needed to pass).');
});
await check('f02 SKIP not_located below 3 distinct shipped colors', async () => {
  expectStatus(await st('f02', PAL10, shipColors(['#101010', '#202020'])), 'SKIP', 'not_located');
});
await check('the f02 line names one or two outside colors from the counts (A-CP-4)', () => {
  assert.equal(run.paletteLine(20, ['#7DA4FF']), '19 of 20 shipped colors are in your palette (90% needed to pass). Outside it: #7DA4FF');
  assert.equal(run.paletteLine(20, ['#AAAAAA', '#BBBBBB']), '18 of 20 shipped colors are in your palette (90% needed to pass). Outside it: #AAAAAA, #BBBBBB');
  assert.equal(run.paletteLine(1, []), '1 of 1 shipped colors is in your palette (90% needed to pass).');
});
// f03
const SIZES10 = md(`colors:
  a: "#111111"
  b: "#222222"
  c: "#333333"
typography:
${[12, 14, 16, 20, 24, 32, 40, 48, 56, 64].map((s) => `  s${s}:\n    fontFamily: Inter\n    fontSize: ${s}px`).join('\n')}`);
const shipSizes = (list) => list.map((s, i) => rule(`.t${i}`, `font-size: ${s}`)).join('');
await check('f03 PASS at 90% on the scale (rem read at 16px); WARN at 70%; FAIL below', async () => {
  expectStatus(await st('f03', SIZES10, shipSizes(['0.75rem', '14px', '1rem', '20px', '24px', '2rem', '40px', '48px', '56px', '17px'])), 'PASS');
  expectStatus(await st('f03', SIZES10, shipSizes(['12px', '14px', '16px', '20px', '24px', '32px', '40px', '13px', '15px', '17px'])), 'WARN');
  expectStatus(await st('f03', SIZES10, shipSizes(['12px', '14px', '16px', '20px', '24px', '32px', '13px', '15px', '17px', '19px'])), 'FAIL');
});
await check('f03 reads clamp() bounds, ignores em and keywords, and SKIPs not_located under 3 sizes', async () => {
  const c = await st('f03', SIZES10, shipSizes(['clamp(1rem, 2vw, 2rem)', '1.5em', 'larger', '12px']));
  expectStatus(c, 'PASS');
  assert.match(c.detail, /^3 of 3 shipped sizes are on your scale/);
  expectStatus(await st('f03', SIZES10, shipSizes(['12px', '14px'])), 'SKIP', 'not_located');
});
// f04
await check('f04 PASS: every shipped face is declared, or a declared fallback; next/font names fold', async () => {
  const c = await st('f04', C_BASE, rule('body', 'font-family: Inter, sans-serif') + rule('pre', 'font-family: "IBM Plex Mono", monospace') + rule('.x', 'font-family: Arial') + rule('.n', "font-family: '__Inter_aaf875', '__Inter_Fallback_aaf875'"));
  expectStatus(c, 'PASS');
});
await check('f04 WARN with one undeclared face (Roboto counts as a real face); FAIL with two', async () => {
  expectStatus(await st('f04', C_BASE, rule('body', 'font-family: Inter') + rule('.r', 'font-family: Roboto, sans-serif')), 'WARN');
  expectStatus(await st('f04', C_BASE, rule('body', 'font-family: Roboto') + rule('.g', 'font-family: Georgia, serif')), 'FAIL');
});
await check('f04 resolves var() families and SKIPs not_located with no shipped face', async () => {
  expectStatus(await st('f04', C_BASE, ':root { --font-sans: "Inter", system-ui } body { font-family: var(--font-sans) }'), 'PASS');
  expectStatus(await st('f04', C_BASE, rule('body', 'font-family: system-ui, sans-serif')), 'SKIP', 'not_located');
});
// f05
const LH7 = md(`colors:
  a: "#111111"
  b: "#222222"
  c: "#333333"
typography:
${[1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7].map((r, i) => `  r${i}:\n    fontFamily: Inter\n    fontSize: 16px\n    lineHeight: ${r}`).join('\n')}`);
const shipLh = (list) => list.map((s, i) => rule(`.l${i}`, `line-height: ${s}`)).join('');
await check('f05 PASS: ratios, lengths, and a length over its own rule font-size match declared ratios', async () => {
  expectStatus(await st('f05', C_BASE, shipLh(['1.5', '1.2', '1.4']) + rule('.lab', 'line-height: 20px') + rule('.b', 'font-size: 16px; line-height: 24px')), 'PASS');
});
await check('f05 WARN at 70%; FAIL below; SKIP not_located under 3', async () => {
  expectStatus(await st('f05', LH7, shipLh(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '2'])), 'WARN');
  expectStatus(await st('f05', LH7, shipLh(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.8', '1.9', '2', '2.1'])), 'FAIL');
  expectStatus(await st('f05', LH7, shipLh(['1.1', 'normal'])), 'SKIP', 'not_located');
});
await check('f05 SKIP not_declared when no style declares a line height', async () => {
  expectStatus(await st('f05', PAL10, shipLh(['1.1', '1.2', '1.3'])), 'SKIP', 'not_declared');
});
// f06
await check('f06 PASS by font-variant keywords or font-feature-settings; WARN when one is missing; never FAIL', async () => {
  expectStatus(await st('f06', C_BASE, rule('code', 'font-variant-numeric: tabular-nums slashed-zero')), 'PASS');
  expectStatus(await st('f06', C_BASE, rule('code', 'font-feature-settings: "tnum" 1, "zero"')), 'PASS');
  const w = await st('f06', C_BASE, rule('code', 'font-variant-numeric: tabular-nums'));
  expectStatus(w, 'WARN');
  assert.match(w.detail, /zero/);
  expectStatus(await st('f06', C_BASE, ''), 'WARN');
});
await check('f06 SKIP not_declared when no style declares a feature', async () => {
  expectStatus(await st('f06', PAL10, rule('code', 'font-variant-numeric: tabular-nums')), 'SKIP', 'not_declared');
});
// f07
const R7 = md(`colors:
  a: "#111111"
  b: "#222222"
  c: "#333333"
typography:
  body:
    fontFamily: Inter
    fontSize: 16px
rounded:
${[2, 4, 6, 8, 10, 12, 14].map((r) => `  r${r}: ${r}px`).join('\n')}`);
const shipRadii = (list) => list.map((s, i) => rule(`.r${i}`, `border-radius: ${s}`)).join('');
await check('f07 PASS on the scale; 0, percentages, hairlines and em are left out', async () => {
  const c = await st('f07', C_BASE, shipRadii(['4px', '8px', '1rem', '50%', '0', '1px', '2em']) + rule('.c', 'border-top-left-radius: 4px 8px'));
  expectStatus(c, 'PASS');
  assert.match(c.detail, /^3 of 3 shipped radii are on your radius scale/);
});
await check('f07 WARN at 70%; FAIL below; SKIP not_located under 3', async () => {
  expectStatus(await st('f07', R7, shipRadii(['2px', '4px', '6px', '8px', '10px', '12px', '14px', '3px', '5px', '7px'])), 'WARN');
  expectStatus(await st('f07', R7, shipRadii(['2px', '4px', '6px', '8px', '10px', '12px', '3px', '5px', '7px', '9px'])), 'FAIL');
  expectStatus(await st('f07', R7, shipRadii(['2px', '4px'])), 'SKIP', 'not_located');
});
await check('f07 counts a radius above the largest finite one as "full" only when the contract declares full', async () => {
  const full = R7.replace('  r14: 14px', '  r14: 14px\n  full: 9999px');
  expectStatus(await st('f07', full, shipRadii(['2px', '4px', '999px', '24px'])), 'PASS');
  expectStatus(await st('f07', R7, shipRadii(['2px', '4px', '999px', '24px'])), 'FAIL');
});
await check('f07 and f08 SKIP not_declared for a group the contract omits or lacks', async () => {
  const c = await st('f07', fixture('DM-4.md'), shipRadii(['2px', '4px', '6px']));
  expectStatus(c, 'SKIP', 'not_declared');
  assert.match(c.detail, /Corners are square by design\./);
  expectStatus(await st('f08', fixture('DM-4.md'), rule('a', 'padding: 4px 8px 12px 16px; margin: 24px')), 'SKIP', 'not_declared');
});
// f08
await check('f08 PASS: padding, margin and gap components, negative margins as their size, var() resolved', async () => {
  expectStatus(await st('f08', C_BASE, ':root { --gap: 12px } ' + rule('a', 'padding: 4px 8px; margin: 16px -24px 32px; gap: var(--gap)') + rule('b', 'row-gap: 0; column-gap: auto; margin: 10%')), 'PASS');
});
await check('f08 FAIL below 70%; SKIP not_located under 5 distinct values', async () => {
  expectStatus(await st('f08', C_BASE, rule('a', 'padding: 4px 8px 12px 10px; margin: 14px')), 'FAIL');
  expectStatus(await st('f08', C_BASE, rule('a', 'padding: 4px 8px 12px 16px')), 'SKIP', 'not_located');
});
// f09
await check('f09 PASS on declared values when the pair is located only by value, and says so', async () => {
  const c = await st('f09', C_BASE, rule('.card', 'color: #111111; background: #ffffff'));
  expectStatus(c, 'PASS');
  assert.match(c.detail, /evaluated on declared values; not located by name/);
});
await check('f09 uses shipped values when both colors are located by name: 4.48 WARN, 2.32 FAIL', async () => {
  const w = await st('f09', C_BASE, ':root { --color-ink: #777777; --color-paper: #ffffff }');
  expectStatus(w, 'WARN');
  assert.match(w.detail, /4\.5 to 1/);
  expectStatus(await st('f09', C_BASE, ':root { --color-ink: #aaaaaa; --color-paper: #ffffff }'), 'FAIL');
});
await check('f09 on #111418 / #FFFFFF reads 18.47 to 1', async () => {
  const c = await st('f09', md(`colors:\n  ink: "#111418"\n  paper: "#FFFFFF"\n  x: "#333333"\ntypography:\n  body:\n    fontFamily: Inter\n    fontSize: 16px\ncomponents:\n  input:\n    backgroundColor: "{colors.paper}"\n    textColor: "{colors.ink}"`), ':root { --color-ink: #111418; --color-paper: #ffffff }');
  expectStatus(c, 'PASS');
  assert.equal(c.evidence.findings[0].ratio, 18.47);
});
await check('f09 large text passes at 3 to 1; the worst pair decides', async () => {
  const big = md(`colors:\n  ink: "#949494"\n  paper: "#FFFFFF"\n  dark: "#111111"\ntypography:\n  display:\n    fontFamily: Inter\n    fontSize: 48px\ncomponents:\n  hero:\n    backgroundColor: "{colors.paper}"\n    textColor: "{colors.ink}"\n    typography: "{typography.display}"\n  card:\n    backgroundColor: "{colors.paper}"\n    textColor: "{colors.dark}"`);
  expectStatus(await st('f09', big, ':root { --color-ink: #949494; --color-paper: #fff; --color-dark: #111 }'), 'PASS');
});
await check('f09 SKIP not_located when a pair color is not on the page; not_declared with no pairs', async () => {
  expectStatus(await st('f09', C_BASE, rule('a', 'color: #0055ff')), 'SKIP', 'not_located');
  expectStatus(await st('f09', PAL10, rule('a', 'color: #101010')), 'SKIP', 'not_declared');
});
// f10
await check('f10 primary action pair: 5.61 PASS, 3.76 WARN, 2.43 FAIL on shipped values', async () => {
  expectStatus(await st('f10', C_BASE, ':root { --color-accent: #0055ff; --color-paper: #fff }'), 'PASS');
  expectStatus(await st('f10', C_BASE, ':root { --color-accent: #4c7bff; --color-paper: #fff }'), 'WARN');
  const f = await st('f10', C_BASE, ':root { --color-accent: #7da4ff; --color-paper: #fff }');
  expectStatus(f, 'FAIL');
  assert.equal(f.evidence.findings[0].ratio, 2.43);
  assert.equal(f.declared.find((e) => e.path === 'colors.accent').value, '#0055FF');
  assert.equal(f.shipped.find((e) => e.path === 'colors.accent').value, '#7DA4FF');
  // The brand's fix text, filled with the ratio this pair needs.
  assert.equal(f.remediation, 'Darken or lighten one color of the pair in your contract and in the shipped CSS until the pair reaches 4.5 to 1.');
});
await check('f09 and f10 fix text names the ratio the pair needs: 3 to 1 for large text; none on a pass', async () => {
  const big = md(`colors:\n  ink: "#cccccc"\n  paper: "#FFFFFF"\n  dark: "#111111"\ntypography:\n  display:\n    fontFamily: Inter\n    fontSize: 48px\ncomponents:\n  hero:\n    backgroundColor: "{colors.paper}"\n    textColor: "{colors.ink}"\n    typography: "{typography.display}"`);
  const c = await st('f09', big, ':root { --color-ink: #cccccc; --color-paper: #fff; --color-dark: #111 }');
  expectStatus(c, 'FAIL');
  assert.equal(c.remediation, 'Darken or lighten one color of the pair in your contract and in the shipped CSS until the pair reaches 3 to 1.');
  const pass = await st('f10', C_BASE, ':root { --color-accent: #0055ff; --color-paper: #fff }');
  assert.equal(pass.remediation, undefined);
  assert.ok(formula.FIDELITY_DEFS.find((d) => d.id === 'f09').fix.endsWith('until the pair reaches {need} to 1.'));
});
await check('f10 SKIP not_declared when the contract names no primary action pair', async () => {
  expectStatus(await st('f10', PAL10, ':root { --color-c0: #101010 }'), 'SKIP', 'not_declared');
});
// f11
const DT_MOTION = (durations, easings = { out: [0.2, 0, 0, 1] }) => JSON.stringify({
  color: { $type: 'color', a: { $value: '#111111' }, b: { $value: '#222222' }, c: { $value: '#333333' } },
  typography: { $type: 'typography', body: { $value: { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' } } } },
  duration: { $type: 'duration', ...Object.fromEntries(durations.map((ms) => [`d${ms}`, { $value: { value: ms, unit: 'ms' } }])) },
  ease: { $type: 'cubicBezier', ...Object.fromEntries(Object.entries(easings).map(([k, v]) => [k, { $value: v }])) },
});
const shipMotion = (list) => list.map((s, i) => rule(`.m${i}`, `transition: ${s}`)).join('');
await check('f11 SKIP not_applicable for a DESIGN.md contract', async () => {
  expectStatus(await st('f11', C_BASE, shipMotion(['opacity 200ms', 'color .3s'])), 'SKIP', 'not_applicable');
});
await check('f11 PASS when shipped durations and curves are declared (keywords mapped, 0s left out)', async () => {
  expectStatus(await st('f11', DT_MOTION([100, 200], { out: [0.2, 0, 0, 1], std: [0.25, 0.1, 0.25, 1] }), shipMotion(['opacity 200ms cubic-bezier(0.2, 0, 0, 1)', 'transform 0.1s ease', 'color 0s'])), 'PASS');
});
await check('f11 WARN at 70% of durations; FAIL below; the worse share decides', async () => {
  const seven = [100, 150, 200, 250, 300, 350, 400];
  expectStatus(await st('f11', DT_MOTION(seven), rule('a', `transition-duration: ${[...seven, 500, 600, 700].map((x) => `${x}ms`).join(', ')}`)), 'WARN');
  expectStatus(await st('f11', DT_MOTION(seven), rule('a', `transition-duration: ${[100, 150, 200, 250, 300, 350, 500, 600, 700, 800].map((x) => `${x}ms`).join(', ')}`)), 'FAIL');
  expectStatus(await st('f11', DT_MOTION([100, 200]), shipMotion(['opacity 100ms cubic-bezier(0.9, 0, 0.1, 1)', 'color 200ms cubic-bezier(0.8, 0, 0.2, 1)'])), 'FAIL');
});
await check('f11 SKIP not_located under 2 shipped durations; not_declared with no motion tokens', async () => {
  expectStatus(await st('f11', DT_MOTION([100]), shipMotion(['opacity 100ms'])), 'SKIP', 'not_located');
  expectStatus(await st('f11', fixture('DT-2.json'), shipMotion(['opacity 100ms', 'color 200ms'])), 'SKIP', 'not_declared');
});
// f12
await check('f12 PASS when explicit target sizes meet the floor (24px, or the declared minimum when larger)', async () => {
  expectStatus(await st('f12', C_BASE, rule('button', 'min-height: 44px') + rule('.chip', 'min-width: 1.5rem')), 'PASS');
});
await check('f12 WARN under a declared floor above 24px; FAIL under 24px', async () => {
  const raised = C_BASE.replace('  checkbox:\n    size: 20px', '  checkbox:\n    size: 32px');
  const w = await st('f12', raised, rule('button', 'min-height: 28px'));
  expectStatus(w, 'WARN');
  expectStatus(await st('f12', C_BASE, rule('button', 'min-height: 20px')), 'FAIL');
});
await check('f12 SKIP not_located with no explicit size; not_declared with no interactive size', async () => {
  expectStatus(await st('f12', C_BASE, rule('.card', 'min-height: 10px')), 'SKIP', 'not_located');
  expectStatus(await st('f12', PAL10, rule('button', 'min-height: 44px')), 'SKIP', 'not_declared');
});
// f13
await check('f13 PASS when aliases ship as var() references; WARN when one of two is flattened', async () => {
  expectStatus(await st('f13', C_BASE, ROOT_OK), 'PASS');
  const w = await st('f13', C_BASE, ROOT_OK.replace('--color-link: var(--color-accent)', '--color-link: #0055ff'));
  expectStatus(w, 'WARN');
  assert.match(w.detail, /^1 of 2 aliases ship as variable references/);
});
await check('f13 SKIP not_located under 2 evaluable aliases; not_declared with none', async () => {
  expectStatus(await st('f13', C_BASE, ':root { --color-accent: #0055ff; --color-focus: var(--color-accent) }'), 'SKIP', 'not_located');
  expectStatus(await st('f13', PAL10, ':root { --color-c0: #101010 }'), 'SKIP', 'not_declared');
});
// f14
const decls = (n, withVar) => Array.from({ length: n }, (_, i) => rule(`.d${i}`, i < withVar ? 'color: var(--color-ink)' : 'color: #111111')).join('');
await check('f14 PASS at 80% of measurable declarations through a located token; WARN from 50%; FAIL below', async () => {
  expectStatus(await st('f14', C_BASE, ROOT_OK + decls(10, 8)), 'PASS');
  expectStatus(await st('f14', C_BASE, ROOT_OK + decls(10, 5)), 'WARN');
  expectStatus(await st('f14', C_BASE, ROOT_OK + decls(10, 4)), 'FAIL');
});
await check('f14 SKIP not_located under 10 declarations or under 3 tokens located by name', async () => {
  expectStatus(await st('f14', C_BASE, ROOT_OK + decls(9, 9)), 'SKIP', 'not_located');
  expectStatus(await st('f14', C_BASE, ':root { --color-ink: #111111; --color-paper: #fff }' + decls(12, 12)), 'SKIP', 'not_located');
});
await check('every fidelity result carries layer, reads, derivedFrom, title and category', async () => {
  const { checks } = await fidelityOf(C_BASE, ROOT_OK);
  assert.deepEqual(checks.map((c) => c.id), ['f01', 'f02', 'f03', 'f04', 'f05', 'f06', 'f07', 'f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14']);
  for (const c of checks) {
    assert.equal(c.layer, 'fidelity', c.id);
    assert.ok(Array.isArray(c.reads) && c.reads.length, `${c.id} reads`);
    assert.ok(Array.isArray(c.derivedFrom) && c.derivedFrom.length, `${c.id} derivedFrom`);
    assert.ok(c.item && c.category, c.id);
    if (c.status === 'SKIP') assert.ok(['not_declared', 'not_located', 'not_applicable'].includes(c.skipReason), c.id);
  }
});
await check('evidence lists stop at 20 entries with a truncated count', async () => {
  const many = Array.from({ length: 30 }, (_, i) => `#${(0x100000 + i * 4099).toString(16).slice(0, 6)}`);
  const c = await st('f02', PAL10, shipColors(many));
  assert.ok(c.evidence.findings.length <= 20);
  assert.ok(c.evidence.truncated >= 10);
});

// ─────────────────────────────────────────────────────────────────────────────
section('12. Scoring both layers (engine spec 8; owner decisions D1, D3, D6, D10)');

const fid = (statuses) => Object.entries(statuses).map(([id, status]) => ({ id, status, category: formula.FIDELITY_CATEGORY[id], layer: 'fidelity' }));
const STATE4_FID = { f01: 'PASS', f02: 'PASS', f03: 'PASS', f04: 'PASS', f05: 'WARN', f06: 'SKIP', f07: 'PASS', f08: 'PASS', f09: 'PASS', f10: 'FAIL', f11: 'SKIP', f12: 'SKIP', f13: 'PASS', f14: 'WARN' };
const STATE4_BASE = { v02: 'MANUAL', v03: 'FAIL', v09: 'WARN', v05: 'PASS', v11: 'PASS', v12: 'SKIP', v21: 'MANUAL', v25: 'PASS', v27: 'SKIP', v35: 'WARN', v07: 'PASS', v34: 'PASS', v36: 'PASS', v38: 'WARN', v39: 'PASS', v40: 'PASS', v44: 'SKIP', v45: 'SKIP' };
const base = (statuses) => Object.entries(statuses).map(([id, status]) => ({ id, status, category: defs.CHECKS.find((c) => c.id === id).category, layer: 'baseline' }));

await check('the 8.2 worked example scores 58.0, grade F, no ceiling', () => {
  const r = score.scoreFidelity(fid({ f02: 'FAIL', f03: 'PASS', f04: 'PASS', f07: 'PASS', f09: 'PASS', f05: 'WARN', f08: 'WARN', f10: 'WARN', f14: 'WARN', f01: 'SKIP', f06: 'SKIP', f11: 'SKIP', f12: 'SKIP', f13: 'SKIP' }));
  assert.equal(r.score, 58.0);
  assert.equal(r.grade, 'F');
  assert.equal(r.ceilingApplied, false);
  assert.equal(r.uncappedScore, null);
  assert.equal(r.scored, 9);
  assert.equal(r.total, 14);
});
await check('the prototype scenario: fidelity 82.6 capped to 70.0 C by f10 (uncapped B); baseline 74.0 C', () => {
  const f = score.scoreFidelity(fid(STATE4_FID));
  assert.equal(f.score, 70.0);
  assert.equal(f.grade, 'C');
  assert.equal(f.uncappedScore, 82.6);
  assert.equal(score.gradeOf(f.uncappedScore), 'B');
  assert.equal(f.ceilingApplied, true);
  assert.match(f.ceilingReason, /primary action pair/);
  const b = score.scoreBaseline(base(STATE4_BASE));
  assert.equal(b.score, 74.0);
  assert.equal(b.grade, 'C');
  assert.equal(b.a11yFloorApplied, false);
  assert.equal(b.scored, 12);
  assert.equal(b.total, 18);
});
await check('the prototype no-score scenario: fidelity null (2 of 14 scored), baseline 71.3 C', () => {
  const f = score.scoreFidelity(fid({ ...Object.fromEntries(Object.keys(STATE4_FID).map((k) => [k, 'SKIP'])), f04: 'PASS', f09: 'PASS' }));
  assert.equal(f.score, null);
  assert.equal(f.grade, null);
  assert.deepEqual(f.nullReason, { code: 'too_few_checks', detail: '2 of 14 checks scored; at least 3 are needed.' });
  const b = score.scoreBaseline(base({ ...STATE4_BASE, v07: 'WARN' }));
  assert.equal(b.score, 71.3);
});
await check('ceilings: f09 FAIL caps at 65, f10 at 70, the lower wins; never raises a score', () => {
  const all = (s) => Object.fromEntries(Object.keys(STATE4_FID).map((k) => [k, s]));
  const both = score.scoreFidelity(fid({ ...all('PASS'), f09: 'FAIL', f10: 'FAIL' }));
  assert.equal(both.score, 65.0);
  assert.equal(both.uncappedScore, 80.0);
  const low = score.scoreFidelity(fid({ ...all('FAIL'), f01: 'PASS', f10: 'FAIL' }));
  assert.equal(low.ceilingApplied, false, 'a score already under the cap is not capped');
  assert.equal(low.uncappedScore, null);
});
await check('baseline: no A while any check fails; a baseline that would be 95 with one FAIL scores 89.9', () => {
  const allPass = Object.fromEntries(Object.keys(STATE4_BASE).map((k) => [k, k === 'v02' || k === 'v21' ? 'MANUAL' : 'PASS']));
  // One copywriting FAIL: 8/3 of 57 points lost, 95.3 before the cap.
  const one = score.scoreBaseline(base({ ...allPass, v38: 'FAIL' }));
  assert.equal(one.uncappedScore, 95.3);
  assert.equal(one.score, 89.9);
  assert.equal(one.grade, 'B');
  assert.equal(one.ceilingApplied, true);
  assert.equal(one.ceilingReason, 'A FAIL caps the grade at B: v38 fails, and the baseline cannot exceed 89.9 while any check fails.');
  const two = score.scoreBaseline(base({ ...allPass, v38: 'FAIL', v11: 'FAIL' }));
  assert.equal(two.score, 89.9);
  assert.match(two.ceilingReason, /v11 and v38 fail|v38 and v11 fail/);
  // WARNs alone never cap; a FAIL under 89.9 is not raised or capped; the lower ceilings still win.
  const warns = score.scoreBaseline(base({ ...allPass, v38: 'WARN' }));
  assert.equal(warns.score, 97.7);
  assert.equal(warns.ceilingApplied, false);
  assert.equal(score.scoreBaseline(base(STATE4_BASE)).score, 74.0);
  assert.equal(score.scoreBaseline(base({ ...allPass, v44: 'FAIL' })).score, 65.0);
  assert.equal(score.scoreBaseline(base({ ...allPass, v25: 'FAIL' })).score, 75.0);
  assert.equal(formula.ownContractFormula().baseline.anyFailCap, 89.9);
});
await check('baseline: the accessibility floor (under 60% caps at 70), v25 at 75, v44 at 65; MANUAL left out', () => {
  const allPass = Object.fromEntries(Object.keys(STATE4_BASE).map((k) => [k, k === 'v02' || k === 'v21' ? 'MANUAL' : 'PASS']));
  assert.equal(score.scoreBaseline(base(allPass)).score, 100.0);
  const floor = score.scoreBaseline(base({ ...allPass, v25: 'FAIL', v27: 'FAIL', v35: 'WARN' }));
  assert.equal(floor.a11yFloorApplied, true);
  assert.equal(floor.score, 70.0);
  assert.equal(score.scoreBaseline(base({ ...allPass, v25: 'FAIL' })).score, 75.0);
  assert.equal(score.scoreBaseline(base({ ...allPass, v44: 'FAIL' })).score, 65.0);
});
await check('grades: A 90, B 80, C 70, D 60, else F; one decimal throughout', () => {
  assert.deepEqual([90, 89.9, 80, 70, 60, 59.9].map(score.gradeOf), ['A', 'B', 'B', 'C', 'D', 'F']);
});
await check('category scores carry weight and counts per category', () => {
  const r = score.scoreFidelity(fid(STATE4_FID));
  assert.deepEqual(r.categoryScores.contrast, { score: 50.0, weight: 20, pass: 1, warn: 0, fail: 1, skip: 0, manual: 0 });
  assert.equal(r.categoryScores.motion.score, null);
});

// ─────────────────────────────────────────────────────────────────────────────
section('13. Baseline set and titles (owner decisions D7, D10; O2)');

await check('the baseline is the 18 checks of D10 in registry order; v46 stays out', () => {
  assert.deepEqual([...baselineMod.BASELINE_IDS].sort(), ['v02', 'v03', 'v05', 'v07', 'v09', 'v11', 'v12', 'v21', 'v25', 'v27', 'v34', 'v35', 'v36', 'v38', 'v39', 'v40', 'v44', 'v45']);
  const order = defs.CHECKS.map((c) => c.id).filter((id) => baselineMod.BASELINE_IDS.includes(id));
  assert.deepEqual([...baselineMod.BASELINE_IDS], order);
  assert.ok(!baselineMod.BASELINE_IDS.includes('v46'));
});
await check('group weights: accessibility 15, keyboard 13, motion 10, copywriting 8, identity 6, security 5; static maximum 57', () => {
  const g = baselineMod.BASELINE_GROUPS;
  assert.deepEqual(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, [v.weight, [...v.checks].sort().join(',')]])), {
    accessibility: [15, 'v25,v27,v35,v44'], keyboard: [13, 'v03,v09'], motion: [10, 'v05,v11,v12,v45'], copywriting: [8, 'v38,v39,v40'],
    identity: [6, 'v07,v34'], security: [5, 'v36'], responsive: [3, 'v02'], performance: [6, 'v21'],
  });
  assert.equal(baselineMod.BASELINE_STATIC_MAX, 57);
});
await check('every baseline check carries a contractTitle with no Poise, Takt, wordmark or Designesy', () => {
  for (const id of baselineMod.BASELINE_IDS) {
    const d = defs.CHECKS.find((c) => c.id === id);
    assert.ok(d.contractTitle && d.contractTitle.length > 8, `${id} has no contractTitle`);
    assert.doesNotMatch(d.contractTitle, /poise|takt|wordmark|designesy/i, id);
  }
  assert.equal(defs.CHECKS.find((c) => c.id === 'v05').contractTitle, 'Reduced motion is honored');
  assert.equal(defs.CHECKS.find((c) => c.id === 'v09').contractTitle, 'Keyboard affordances are present');
  // Since engine 1.4.1 v27 reads select and textarea too (brand copy, 2026-10-14).
  assert.equal(defs.CHECKS.find((c) => c.id === 'v27').contractTitle, 'Form fields are at least 16px');
});
await check('legacy surfaces keep item; the registry count is unchanged', () => {
  assert.equal(defs.ENGINE_CHECK_COUNT, 45);
  assert.equal(defs.CHECKS.find((c) => c.id === 'v09').item, 'Poise keyboard-path verification remains published and current');
  assert.ok(defs.CHECKS.filter((c) => !baselineMod.BASELINE_IDS.includes(c.id)).every((c) => c.contractTitle === undefined));
});
await check('baseline results take their contractTitle and layer, keep their registry category', () => {
  const legacy = defs.CHECKS.map((c) => ({ id: c.id, item: c.item, category: c.category, status: 'PASS', detail: 'x' }));
  const out = baselineMod.baselineChecks(legacy);
  assert.equal(out.length, 18);
  const v09 = out.find((c) => c.id === 'v09');
  assert.equal(v09.item, 'Keyboard affordances are present');
  assert.equal(v09.category, 'poise');
  assert.equal(v09.layer, 'baseline');
});

// ─────────────────────────────────────────────────────────────────────────────
section('14. Null scores (engine spec 9; owner decision D2)');

await check('empty shell: little text, an empty mount node and a module script', () => {
  assert.equal(nulls.isEmptyShell('<html><body><div id="root"></div><script type="module" src="/a.js"></script></body></html>'), true);
  assert.equal(nulls.isEmptyShell('<html><body><app-root> </app-root><script src="/main.js"></script></body></html>'), true);
  assert.equal(nulls.isEmptyShell(`<html><body><div id="root"></div><p>${'Real text. '.repeat(40)}</p><script type="module"></script></body></html>`), false, 'enough text');
  assert.equal(nulls.isEmptyShell('<html><body><div id="root"><h1>Hi</h1></div><script type="module"></script></body></html>'), false, 'mount not empty');
  assert.equal(nulls.isEmptyShell('<html><body><div id="root"></div></body></html>'), false, 'no script');
});
await check('no CSS: under 500 bytes after trimming', () => {
  assert.equal(nulls.hasNoCss(`  ${'a{}'.repeat(10)}  `), true);
  assert.equal(nulls.hasNoCss('a { color: red }'.repeat(40)), false);
});

// ─────────────────────────────────────────────────────────────────────────────
section('15. The published formula (engine spec 10.5 rule 3; brand D76)');

await check('lists f01 to f14 with weights summing to 100, ceilings, baseline groups, null rules, a version and a date', () => {
  const f = formula.ownContractFormula();
  assert.deepEqual(f.fidelity.checks.map((c) => c.id), ['f01', 'f02', 'f03', 'f04', 'f05', 'f06', 'f07', 'f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14']);
  assert.equal(Object.values(f.fidelity.weights).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(f.fidelity.weights, { contrast: 20, typography: 18, color: 16, tokens: 14, spacing: 12, shape: 8, motion: 6, targets: 6 });
  assert.deepEqual(f.fidelity.ceilings, [{ check: 'f09', cap: 65 }, { check: 'f10', cap: 70 }]);
  assert.equal(f.baseline.checks.length, 18);
  assert.equal(f.baseline.staticMaximum, 57);
  assert.deepEqual(f.nullRules.map((r) => r.code), ['site_unreachable', 'empty_shell', 'no_css', 'too_few_checks']);
  assert.match(f.version, /^\d+\.\d+\.\d+$/);
  assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/);
  for (const c of f.fidelity.checks) assert.ok(c.title && c.criterion && c.fix && c.category, c.id);
});

// ─────────────────────────────────────────────────────────────────────────────
section('16. Site fixtures S-1 to S-7 with DM-1 (engine spec 15.1)');

const S = (name) => lf(fs.readFileSync(path.join(FIX, 'sites', name), 'utf8'));
const BASELINE_PASS = defs.CHECKS.map((c) => ({ id: c.id, item: c.item, category: c.category, status: c.type === 'manual' ? 'MANUAL' : 'PASS', detail: 'fixture' }));
const runSite = async (name, contractFile = 'DM-1.md', site = {}) => {
  const contract = await contractOf(fixture(contractFile));
  const html = S(`${name}.html`);
  const cssFile = path.join(FIX, 'sites', `${name}.css`);
  const css = fs.existsSync(cssFile) ? lf(fs.readFileSync(cssFile, 'utf8')) : '';
  return run.scoreOwnContract({ contract, page: { html, css, site: { stylesheetsFetched: 1, stylesheetsTotal: 1, stylesheetsTruncated: false, ...site } }, baselineChecks: BASELINE_PASS });
};
const byIdOf = (r) => Object.fromEntries(r.checks.map((c) => [c.id, c]));
await check('S-1 on-contract, Tailwind v4 names: fidelity A, every token located by name', async () => {
  const r = await runSite('S-1');
  assert.equal(r.fidelity.grade, 'A', `fidelity ${r.fidelity.score}: ${r.checks.filter((c) => c.layer === 'fidelity' && c.status !== 'PASS').map((c) => `${c.id} ${c.status} ${c.detail}`).join(' | ')}`);
  assert.equal(r.coverage.byName, r.coverage.located);
  assert.equal(r.coverage.located, r.coverage.declared);
});
await check('S-2 drifted: f02 FAIL, f08 FAIL, f13 WARN, f10 WARN', async () => {
  const c = byIdOf(await runSite('S-2'));
  expectStatus(c.f02, 'FAIL');
  expectStatus(c.f08, 'FAIL');
  expectStatus(c.f13, 'WARN');
  expectStatus(c.f10, 'WARN');
});
await check('S-3 literal values only: scored by value; f01, f13, f14 not_located', async () => {
  const r = await runSite('S-3');
  const c = byIdOf(r);
  for (const id of ['f01', 'f13', 'f14']) expectStatus(c[id], 'SKIP', 'not_located');
  assert.ok(r.fidelity.score !== null);
  assert.equal(r.coverage.byName, 0);
  assert.ok(r.coverage.byValue > 0);
});
await check('S-4 empty React mount with a module script: both layers null, empty_shell', async () => {
  const r = await runSite('S-4');
  assert.equal(r.fidelity.nullReason.code, 'empty_shell');
  assert.equal(r.baseline.nullReason.code, 'empty_shell');
  assert.equal(r.fidelity.score, null);
  assert.equal(r.baseline.score, null);
});
await check('S-5 HTML with no CSS: both layers null, no_css', async () => {
  const r = await runSite('S-5');
  assert.equal(r.fidelity.nullReason.code, 'no_css');
  assert.equal(r.baseline.nullReason.code, 'no_css');
});
await check('S-6 61 stylesheets, one unanswered: the cap and the missing sheet are reported in site and coverage notes', async () => {
  const r = await runSite('S-1', 'DM-1.md', { stylesheetsFetched: 59, stylesheetsTotal: 61, stylesheetsTruncated: true });
  assert.deepEqual(r.site, { stylesheetsFetched: 59, stylesheetsTotal: 61, stylesheetsTruncated: true });
  assert.ok(r.coverage.notes.some((n) => n.startsWith('STYLESHEET_CAP')), r.coverage.notes.join(' | '));
  assert.ok(r.coverage.notes.some((n) => n.startsWith('STYLESHEETS_MISSING')), r.coverage.notes.join(' | '));
});
await check('S-7 hostile CSS (2 MB, long brace runs, 10,000-character selectors) completes in under 2 s', async () => {
  const hostile = `${'{'.repeat(200000)}${`.${'a'.repeat(10000)} { color: #111 }\n`.repeat(50)}${'a{color:#123456;padding:4px}'.repeat(60000)}`;
  assert.ok(hostile.length > 2 * 1024 * 1024);
  const contract = await contractOf(fixture('DM-1.md'));
  const t0 = performance.now();
  const r = run.scoreOwnContract({ contract, page: { html: S('S-1.html'), css: hostile, site: {} }, baselineChecks: BASELINE_PASS });
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
  assert.equal(r.checks.length, 14 + 18);
});
await check('one run lists fidelity first, then the 18 baseline checks; counts are over every check', async () => {
  const r = await runSite('S-1');
  assert.deepEqual(r.checks.slice(0, 14).map((c) => c.id), ['f01', 'f02', 'f03', 'f04', 'f05', 'f06', 'f07', 'f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14']);
  assert.deepEqual(r.checks.slice(14).map((c) => c.id), [...baselineMod.BASELINE_IDS]);
  assert.equal(r.total, 32);
  assert.equal(r.pass + r.warn + r.fail + r.skip + r.manual, 32);
  assert.equal(r.scored, r.pass + r.warn + r.fail);
});
await check('PAR-1: one system as DESIGN.md and as DTCG gives the same f02, f03, f04, f05, f07, f08 and f09 on every site fixture', async () => {
  for (const site of ['S-1', 'S-2', 'S-3']) {
    const a = byIdOf(await runSite(site, 'acme-design.md'));
    const b = byIdOf(await runSite(site, 'acme-tokens.json'));
    for (const id of ['f02', 'f03', 'f04', 'f05', 'f07', 'f08', 'f09']) assert.equal(`${a[id].status}:${a[id].skipReason ?? ''}`, `${b[id].status}:${b[id].skipReason ?? ''}`, `${site} ${id}: ${a[id].detail} | ${b[id].detail}`);
  }
});
await check('ratios read to one decimal, never rounded across a band', () => {
  const pairs = h.load('app/lib/own-contract/checks/pairs.ts');
  assert.deepEqual([2.434, 5.37, 18.468, 4.478, 2.96, 4.5, 3.0].map(pairs.fmtRatio), ['2.4', '5.4', '18.5', '4.47', '2.96', '4.5', '3.0']);
});
await check('10 runs of one contract against one page give identical checks (determinism)', async () => {
  const seen = new Set();
  for (let i = 0; i < 10; i++) seen.add(JSON.stringify((await runSite('S-2')).checks));
  assert.equal(seen.size, 1);
});
await check('a 2 MB stylesheet of nested blocks reads in linear time (1 MB under 200 ms)', () => {
  const t0 = performance.now();
  pageCss.readPageCss(`@media x { ${'@supports y { '.repeat(20000)}a { color: red }${' }'.repeat(20000)} }`);
  pageCss.readPageCss(`a { content: "${'"'.repeat(0)}${'\\"'.repeat(200000)}" }`);
  pageCss.readPageCss('('.repeat(MB));
  assert.ok(performance.now() - t0 < 600);
});

// ═════════════════════════════════════════════════════════════════════════════
// The route: POST /api/score with a contract (engine spec 10 to 13), the
// published formula, and requests without a contract unchanged.
// ═════════════════════════════════════════════════════════════════════════════

const routeFile = path.join(APP, 'app', 'api', 'score', 'route.ts');
const ROUTE_WIRED = fs.readFileSync(routeFile, 'utf8').includes('handleOwnContract');
const siteText = (n, ext) => lf(fs.readFileSync(path.join(FIX, 'sites', `${n}.${ext}`), 'utf8'));
const PAGES = {
  'https://shop.example.com/': siteText('S-1', 'html'),
  'https://shop.example.com/site.css': siteText('S-1', 'css'),
  'https://drift.example.com/': siteText('S-2', 'html'),
  'https://drift.example.com/site.css': siteText('S-2', 'css'),
  'https://shell.example.com/': siteText('S-4', 'html'),
  'https://shell.example.com/assets/index.css': siteText('S-4', 'css'),
  'https://bare.example.com/': siteText('S-5', 'html'),
  'https://contracts.example.com/DESIGN.md': fixture('DM-1.md'),
};
let scoreUrlCalls = 0;
let stalled = 0;
const apiHarness = (extra = {}) => createHarness({
  app: APP,
  pages: PAGES,
  api: (url) => (url === 'https://slow.example.com/DESIGN.md' ? (stalled++, new Promise(() => {})) : undefined),
  stubs: {
    '@google/design.md/linter': { lint },
    'next/cache': { unstable_cache: (fn) => (...a) => { scoreUrlCalls++; return fn(...a); } },
  },
  ...extra,
});
const api = apiHarness();
/** POST to the score route; returns status, headers and the parsed body. */
async function postScore(body, harness = api) {
  const route = harness.load('app/api/score/route.ts');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('not found', { status: 404 });
  try {
    const res = await route.POST(new Request('https://harness.test/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, headers: res.headers, body: parsed };
  } finally {
    globalThis.fetch = realFetch;
  }
}
const needWired = () => assert.ok(ROUTE_WIRED, 'app/api/score/route.ts does not hand a contract to handleOwnContract');
let SAMPLE = null;

section('18. POST /api/score with a contract (engine spec 10.1 to 10.3, 11.3)');

await check('a contract run answers 200 with the documented shape, no-store, versions equal to the constants', async () => {
  needWired();
  const r = await postScore({ url: 'shop.example.com', contract: { content: fixture('DM-1.md') } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const b = r.body;
  SAMPLE = b;
  for (const k of ['ok', 'mode', 'scope', 'contractVersion', 'engineVersion', 'score', 'grade', 'fidelity', 'baseline', 'coverage', 'ownContract', 'site', 'checks', 'pass', 'warn', 'fail', 'skip', 'manual', 'total', 'scored', 'tokensExtracted', 'receipt']) assert.ok(k in b, `missing ${k}`);
  for (const k of ['slop', 'originality', 'categoryScores', 'a11yFloorApplied', 'hardFailCeilingApplied', 'hardFailCeilingReason']) assert.ok(!(k in b), `${k} must not appear in this mode`);
  assert.equal(b.mode, 'own-contract');
  assert.equal(b.scope, 'own-contract');
  const dsc = h.load('app/lib/design-system-contract.ts');
  assert.equal(b.contractVersion, dsc.CONTRACT_VERSION);
  assert.equal(b.engineVersion, defs.ENGINE_VERSION);
  assert.equal(b.engineVersion, '1.5.1');
  assert.equal(b.score, b.fidelity.score);
  assert.equal(b.grade, b.fidelity.grade);
  for (const k of ['score', 'grade', 'scored', 'total', 'pass', 'warn', 'fail', 'skip', 'manual', 'categoryScores', 'ceilingApplied', 'ceilingReason', 'uncappedScore', 'nullReason']) {
    assert.ok(k in b.fidelity, `fidelity.${k}`);
    assert.ok(k in b.baseline, `baseline.${k}`);
  }
  assert.ok('a11yFloorApplied' in b.baseline);
  assert.equal(b.fidelity.grade, 'A');
  assert.deepEqual(Object.keys(b.ownContract).sort(), ['bytes', 'digest', 'format', 'formatVersion', 'linter', 'name', 'omitted', 'problems', 'source', 'tokens']);
  assert.deepEqual(Object.keys(b.ownContract.tokens).sort(), ['aliases', 'colors', 'durations', 'easings', 'pairs', 'radii', 'sizes', 'spacing', 'typography']);
  assert.equal(b.ownContract.source, 'inline');
  assert.deepEqual(Object.keys(b.site).sort(), ['cssBytes', 'htmlBytes', 'requestedUrl', 'stylesheetsFetched', 'stylesheetsTotal', 'stylesheetsTruncated']);
  assert.equal(b.checks.length, 14 + 18);
  assert.ok(b.checks.slice(0, 14).every((c) => c.layer === 'fidelity'));
  assert.ok(b.checks.slice(14).every((c) => c.layer === 'baseline'));
  assert.equal(b.checks.find((c) => c.id === 'v09').item, 'Keyboard affordances are present');
  const rc = h.load('app/lib/receipt.ts');
  assert.equal(b.receipt.digest, rc.verdictDigest(b.checks));
  assert.equal(b.receipt.scope, 'own-contract');
  assert.equal(b.receipt.engine_version, '1.5.1');
  assert.deepEqual(b.receipt.own_contract, { digest: b.ownContract.digest, format: 'design.md', source: 'inline', linter: '@google/design.md@0.4.0' });
  assert.match(b.receipt.verify.instructions, /Compare own_contract\.digest first/);
});
await check('a contract that cannot be scored answers 422 contract_not_scoreable with its problems', async () => {
  needWired();
  const r = await postScore({ url: 'shop.example.com', contract: { content: fixture('DM-3e.md') } });
  assert.equal(r.status, 422);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.body.ok, false);
  assert.equal(r.body.code, 'contract_not_scoreable');
  assert.equal(r.body.error, 'Your contract cannot be scored yet.');
  assert.equal(r.body.problems[0].code, 'TOKENS_IN_PROSE');
  assert.deepEqual(r.body.problems[0].colorLines, [11, 24]);
  assert.deepEqual(r.body.warnings, []);
  const cyc = await postScore({ url: 'shop.example.com', contract: { content: fixture('DT-7a.json') } });
  assert.deepEqual(cyc.body.problems.find((p) => p.code === 'ALIAS_CYCLE').chain, ['color.a', 'color.b', 'color.c', 'color.a']);
  const drop = await postScore({ url: 'shop.example.com', contract: { content: fixture('DM-3c.md') } });
  const p = drop.body.problems.find((x) => x.code === 'TOKEN_DROPPED');
  assert.equal(p.reason, 'alias_unresolved');
  assert.equal(p.ref, '{colors.missing}');
});
await check('request errors: 400 scope_conflict, 400 contract_shape, 400 format_unsupported, 413 body_too_large, 413 contract_too_large', async () => {
  needWired();
  const sc = await postScore({ url: 'shop.example.com', scope: 'contract', contract: { content: fixture('DM-2.md') } });
  assert.deepEqual([sc.status, sc.body.code], [400, 'scope_conflict']);
  assert.equal(sc.body.error, 'Send either `scope: "contract"` or a contract in the request, not both.');
  const universal = await postScore({ url: 'shop.example.com', scope: 'universal', contract: { content: fixture('DM-2.md') } });
  assert.equal(universal.status, 200, 'scope universal is accepted and ignored');
  for (const bad of [{}, { content: 'a', url: 'https://x.example.com' }, { content: 5 }, { content: 'a', format: 'yaml' }, { content: 'a', tokenMap: [] }, 'text']) {
    const r = await postScore({ url: 'shop.example.com', contract: bad });
    assert.deepEqual([r.status, r.body.code], [400, 'contract_shape'], JSON.stringify(bad));
  }
  const fmt = await postScore({ url: 'shop.example.com', format: 'review', contract: { content: fixture('DM-2.md') } });
  assert.deepEqual([fmt.status, fmt.body.code], [400, 'format_unsupported']);
  const body = await postScore({ url: 'shop.example.com', contract: { content: `${fixture('DM-2.md')}\n${'x'.repeat(301 * 1024)}` } });
  assert.deepEqual([body.status, body.body.code], [413, 'body_too_large']);
  const big = await postScore({ url: 'shop.example.com', contract: { content: `${fixture('DM-2.md')}\n${'x'.repeat(260 * 1024)}` } });
  assert.deepEqual([big.status, big.body.code], [413, 'contract_too_large']);
  const badUrl = await postScore({ url: 'not a url', contract: { content: fixture('DM-2.md') } });
  assert.equal(badUrl.status, 400, 'the existing URL validation runs first');
});
await check('the mode limiter answers 429 with Retry-After; a limiter that throws fails open', async () => {
  needWired();
  const deny = apiHarness({ overrides: { 'app/lib/rate-limit.ts': (real) => ({ ...real, fixedWindow: () => ({}), getLimiter: () => ({ limit: async () => ({ success: false, reset: Date.now() + 30_000 }) }) }) } });
  const r = await postScore({ url: 'shop.example.com', contract: { content: fixture('DM-2.md') } }, deny);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) >= 29 && Number(r.headers.get('retry-after')) <= 30);
  const broken = apiHarness({ overrides: { 'app/lib/rate-limit.ts': (real) => ({ ...real, fixedWindow: () => ({}), getLimiter: () => ({ limit: async () => { throw new Error('upstash down'); } }) }) } });
  assert.equal((await postScore({ url: 'shop.example.com', contract: { content: fixture('DM-2.md') } }, broken)).status, 200);
  const limits = h.load('app/lib/own-contract/api.ts').CONTRACT_LIMITS;
  assert.deepEqual([limits.minute.tokens, limits.minute.window, limits.day.tokens, limits.day.window], [20, '60 s', 300, '1 d']);
});
await check('a linked contract is fetched through the URL guard and named in the receipt', async () => {
  needWired();
  const before = api.calls.length;
  const r = await postScore({ url: 'shop.example.com', contract: { url: 'https://contracts.example.com/DESIGN.md' } });
  assert.equal(r.status, 200);
  assert.ok(api.calls.slice(before).some((c) => c.url === 'https://contracts.example.com/DESIGN.md'), 'the contract URL went through safeFetch');
  assert.equal(r.body.ownContract.source, 'url');
  assert.equal(r.body.receipt.own_contract.url, 'https://contracts.example.com/DESIGN.md');
  const missing = await postScore({ url: 'shop.example.com', contract: { url: 'https://contracts.example.com/none.md' } });
  assert.equal(missing.status, 422);
  assert.equal(missing.body.problems[0].code, 'CONTRACT_URL_UNREACHABLE');
  assert.equal(missing.body.problems[0].why, 'http_error');
});
await check('an unreachable site: 200, both layers no score (site_unreachable), the contract still reported', async () => {
  needWired();
  const r = await postScore({ url: 'down.example.com', contract: { content: fixture('DM-1.md') } });
  assert.equal(r.status, 200);
  assert.equal(r.body.fidelity.score, null);
  assert.equal(r.body.baseline.score, null);
  assert.equal(r.body.fidelity.nullReason.code, 'site_unreachable');
  assert.equal(r.body.unreachable, true);
  assert.equal(r.body.ownContract.name, 'Fixture Full');
  assert.equal(r.body.receipt.digest, null);
  assert.equal(r.body.receipt.own_contract.digest, r.body.ownContract.digest);
});
await check('an empty shell and a page with no CSS: both layers no score with their codes', async () => {
  needWired();
  const shell = await postScore({ url: 'shell.example.com', contract: { content: fixture('DM-1.md') } });
  assert.equal(shell.body.fidelity.nullReason.code, 'empty_shell');
  assert.equal(shell.body.baseline.nullReason.code, 'empty_shell');
  const bare = await postScore({ url: 'bare.example.com', contract: { content: fixture('DM-1.md') } });
  assert.equal(bare.body.fidelity.nullReason.code, 'no_css');
});
await check('10 runs give the same verdict digest and contract digest (determinism)', async () => {
  needWired();
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const r = await postScore({ url: 'drift.example.com', contract: { content: fixture('DM-1.md') } });
    seen.add(`${r.body.receipt.digest}|${r.body.receipt.own_contract.digest}`);
  }
  assert.equal(seen.size, 1);
});
await check('a contract run never calls the cached scoreUrl; a legacy run does', async () => {
  needWired();
  const before = scoreUrlCalls;
  await postScore({ url: 'shop.example.com', contract: { content: fixture('DM-1.md') } });
  assert.equal(scoreUrlCalls, before);
  await postScore({ url: 'shop.example.com' });
  assert.equal(scoreUrlCalls, before + 1, 'the probe sees the legacy path');
});
await check('usage: a run counts under score-contract:<client> only, from the closed list', async () => {
  needWired();
  const usage = h.load('app/lib/usage.ts');
  assert.equal(usage.scoreContractKey('browser'), 'score-contract:browser');
  assert.deepEqual([...usage.USAGE_KEY_PREFIXES], ['mcp', 'score', 'score-contract']);
  const src = fs.readFileSync(routeFile, 'utf8');
  assert.match(src, /if \(r\.status === 200\) after\(\(\) => recordUsage\(scoreContractKey\(scoreClientOf\(/);
});
await check('a stalled contract URL aborts at 8 s with CONTRACT_URL_UNREACHABLE timeout', async () => {
  needWired();
  const t0 = Date.now();
  const r = await postScore({ url: 'shop.example.com', contract: { url: 'https://slow.example.com/DESIGN.md' } });
  const s = (Date.now() - t0) / 1000;
  assert.equal(stalled, 1, 'the stub saw the request');
  assert.ok(s >= 7.9 && s < 10, `${s.toFixed(1)} s`);
  assert.equal(r.body.problems[0].why, 'timeout');
});
await check('the real URL guard refuses contract URLs on loopback and the metadata address', async () => {
  const appRequire = createRequire(path.join(APP, 'package.json'));
  const ts = appRequire('typescript');
  const src = fs.readFileSync(path.join(APP, 'app', 'lib', 'url-guard.ts'), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', out)(mod.exports, appRequire, mod);
  for (const u of ['http://127.0.0.1/DESIGN.md', 'http://169.254.169.254/latest/meta-data', 'http://localhost/DESIGN.md', 'http://[::1]/x', 'http://2130706433/x']) {
    const r = await fetchMod.fetchContract(u, mod.exports.safeFetch);
    assert.equal(r.ok, false, u);
    assert.equal(r.problem.why, 'blocked', `${u}: ${r.problem.why}`);
  }
});
await check('the published formula route is static and serves the formula with its version', async () => {
  const r = await api.get('app/api/score/checks/own-contract/route.ts', 'https://harness.test/api/score/checks/own-contract');
  assert.equal(r.status, 200);
  const f = JSON.parse(r.text);
  assert.equal(f.fidelity.checks.length, 14);
  assert.equal(f.contractVersion, h.load('app/lib/design-system-contract.ts').CONTRACT_VERSION);
  assert.equal(f.engineVersion, defs.ENGINE_VERSION);
  assert.equal(api.load('app/api/score/checks/own-contract/route.ts').dynamic, 'force-static');
  assert.deepEqual(f.intake.problem.reason.values, ['alias_unresolved', 'alias_cycle', 'alias_wrong_type', 'value_not_scalar', 'value_invalid', 'unit_unsupported', 'unknown']);
  assert.ok(f.intake.problem.fields.includes('chain') && f.intake.problem.fields.includes('reason'));
  for (const k of ['char', 'script', 'codePoint', 'position', 'latin']) assert.ok(f.intake.problem.fields.includes(k), k);
  assert.equal(f.baseline.anyFailCap, 89.9);
  assert.equal(f.intake.problem.valueMaxChars, 80);
  assert.equal(f.intake.rejected.code, 'contract_not_scoreable');
});

// ─────────────────────────────────────────────────────────────────────────────
section('19. Requests without a contract are unchanged (engine spec 15.4; A-EN-1)');

const SNAPSHOT = path.join(FIX, 'legacy-snapshot.json');
const STRIP_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
/** A response with the timestamps and the engine version taken out (both move by design). */
function canonicalLegacy(body) {
  if (typeof body === 'string') return body.replace(STRIP_TIME, '<time>').replace(/\b1\.[45]\.\d\b/g, '<engine>');
  const walk = (v, key) => {
    if (key === 'engine_version' || key === 'engineVersion') return '<engine>';
    if (typeof v === 'string') return v.replace(STRIP_TIME, '<time>');
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).map((k) => [k, walk(v[k], k)]));
    return v;
  };
  return walk(body);
}
/** Every legacy input: the calibration corpus, the recorded real page, and the site fixtures. */
async function legacyInputs() {
  const corpus = await import(new URL('../../../packages/score/test/fixtures/corpus.mjs', import.meta.url).href);
  const parity = JSON.parse(fs.readFileSync(path.join(APP, '..', '..', 'packages', 'score', 'test', 'fixtures', 'parity-page.json'), 'utf8'));
  const list = corpus.FIXTURES.filter((f) => typeof f.html === 'string').map((f) => ({ name: `corpus/${f.name}`, html: f.html, css: f.css || '' }));
  list.push({ name: 'parity-page', html: parity.html, css: parity.css });
  for (const s of ['S-1', 'S-2', 'S-3', 'S-4']) list.push({ name: `site/${s}`, html: siteText(s, 'html'), css: siteText(s, 'css') });
  list.push({ name: 'site/S-5', html: siteText('S-5', 'html'), css: '' });
  return list;
}
async function legacyResponses(app) {
  const inputs = await legacyInputs();
  const pages = {};
  inputs.forEach((f, i) => {
    const host = `https://legacy-${i}.example.com/`;
    pages[host] = f.html.includes('</head>') ? f.html.replace('</head>', '<link rel="stylesheet" href="/fixture.css"></head>') : `<link rel="stylesheet" href="/fixture.css">${f.html}`;
    if (f.css) pages[`${host}fixture.css`] = f.css;
  });
  const harness = createHarness({ app, pages, stubs: { '@google/design.md/linter': { lint } } });
  const out = {};
  const runs = [];
  inputs.forEach((f, i) => {
    for (const scope of ['universal', 'contract']) runs.push({ key: `${f.name}|designesy|${scope}`, body: { url: `legacy-${i}.example.com`, scope } });
    if (f.name === 'parity-page' || f.name === 'corpus/good-baseline') for (const format of ['canonical', 'google', 'review']) runs.push({ key: `${f.name}|${format}|universal`, body: { url: `legacy-${i}.example.com`, scope: 'universal', format } });
  });
  for (const run of runs) {
    const r = await postScore(run.body, harness);
    const canon = JSON.stringify(canonicalLegacy(r.body));
    out[run.key] = { status: r.status, sha256: (await import('node:crypto')).createHash('sha256').update(canon).digest('hex'), score: r.body && typeof r.body === 'object' ? r.body.score ?? r.body.summary?.score ?? null : null };
  }
  return out;
}

const RECORD = process.argv.indexOf('--record-legacy');
if (RECORD > 0) {
  const app = path.resolve(process.argv[RECORD + 1]);
  const snap = await legacyResponses(app);
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify({ $comment: 'Legacy /api/score responses (no contract) recorded from engine 1.4.1 (the checkout given to --record-legacy), timestamps and engine version taken out. scripts/check-own-contract.mjs section 19 asserts every later engine answers the same.', recordedFrom: path.basename(path.dirname(app)), runs: snap }, null, 2)}\n`);
  console.log(`recorded ${Object.keys(snap).length} legacy runs to ${path.relative(APP, SNAPSHOT)}`);
  process.exit(0);
}

await check('every legacy run (40 pages, both scopes, every format) answers exactly as engine 1.4.1 did', async () => {
  assert.ok(fs.existsSync(SNAPSHOT), 'legacy-snapshot.json is missing (record it with --record-legacy <a 1.4.1 apps/site>)');
  const want = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')).runs;
  const got = await legacyResponses(APP);
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort());
  const moved = Object.keys(want).filter((k) => want[k].sha256 !== got[k].sha256 || want[k].status !== got[k].status);
  assert.deepEqual(moved, [], `${moved.length} legacy responses moved: ${moved.slice(0, 5).join(', ')}`);
  assert.ok(Object.keys(want).length >= 80);
});

// ─────────────────────────────────────────────────────────────────────────────
section('20. Privacy');

await check('no console output during any intake above (engine spec 13)', () => {
  assert.deepEqual(logged, [], `console output: ${logged.slice(0, 3).join(' | ')}`);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Own-contract engine: ${failures.length} failing check(s).`);
  process.exit(1);
}
console.log('Own-contract engine: every check holds.');
