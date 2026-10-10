#!/usr/bin/env node
/**
 * Results language gate: one value reads one way on every result surface.
 *
 * WHY THIS EXISTS
 * The results audit of 2026-10-10 found one concept rendered up to seven ways:
 * the score as "67.9%", "70%", "51/100", "D · 67.9" and "67.9 %"; a category
 * at 50 drawn blue, yellow and red under three colour rules; grade D orange,
 * red and yellow; pass green on the score form and blue in the instrument;
 * "N/A", "skipped" and "not applicable" for one status; "composite" naming two
 * different numbers. Each surface had its own copy of the words, the formats
 * and the colour thresholds, so they drifted apart one edit at a time.
 *
 * The owner approved one language (2026-10-10): score as "67.9 /100", one
 * decimal; the contract's grade tokens for grades; one three-step rule (80, 60)
 * for categories and checks, pass in the contract's green; the plain names
 * (Contract score, Combined score, Standard and Strict rules, failed check,
 * Needs work, Needs a browser run, Does not apply, Typography, Interface feel,
 * Control polish, Color roles, Page basics, DESIGN.md). They live in
 * app/score/verdict.ts; this gate holds every visitor surface to them.
 *
 * WHAT IT ASSERTS
 *   1. verdict.ts: the score format, the category tone (equal to the
 *      leaderboard's scoreTone at every score), the grade bands (equal to the
 *      engine's computeGrade at every tenth), the scale position, the status
 *      words and counts, and the attention line.
 *   2. No visitor surface carries a retired term or format: "Legitimacy",
 *      "contract violation", "universal scope", "N/A", "Manual", "by a
 *      person", the old category names as labels, "composite" as a word, a
 *      score printed with "%", its own colour thresholds, or fmtPct.
 *   3. The share card and the badge draw grades in the contract's grade
 *      colours; the instrument's pass lamp is the contract's green.
 *
 * PROVING IT CAN FAIL
 * Each surface assertion is run once on a copy of score-form.tsx with one
 * retired form put back ("Legitimacy Score", "{x}%", "'N/A'"), and must fail.
 *
 * Usage:  node scripts/check-results-language.mjs
 * Exits 1 on any failure. Needs Node 22.18+ (type stripping for verdict.ts).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..');
const require = createRequire(path.join(APP, 'package.json'));
const ts = require('typescript');

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
  String(warning).includes('Module type of') ? undefined : emitWarning.call(process, warning, ...rest);

const V = await import(pathToFileURL(path.join(APP, 'app', 'score', 'verdict.ts')).href);

/** Named function declarations from a TypeScript file, as runnable JavaScript. */
function shipped(file, names) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const parts = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && names.includes(st.name.text)) {
      parts.push(src.slice(st.getStart(sf), st.end).replace(/^export\s+/, ''));
    }
  }
  assert.equal(parts.length, names.length, `expected ${names.join(', ')} in ${path.relative(APP, file)}`);
  const { outputText } = ts.transpileModule(parts.join('\n'), { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 } });
  return new Function(`${outputText}\nreturn { ${names.join(', ')} };`)();
}

const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');
/** Source without comments, so a retired term may be named in a comment explaining its retirement. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`);
  }
}

console.log('results language');

// ── 1. The words and formats ───────────────────────────────────────────────
check('score format: one decimal, "/100" beside it', () => {
  assert.equal(V.fmtScore(67.9), '67.9');
  assert.equal(V.fmtScore(70), '70.0');
  assert.equal(V.fmtScore(56.599999999999994), '56.6');
  assert.equal(V.fmtScore(100), '100.0');
  assert.equal(V.fmtCategory(87.5), '88');
});

check('category tone equals the leaderboard scoreTone at every score', () => {
  const { scoreTone } = shipped(path.join(APP, 'app', 'lib', 'data', 'cohort.ts'), ['scoreTone']);
  for (let s = 0; s <= 1000; s++) assert.equal(V.categoryTone(s / 10), scoreTone(s / 10), `at ${s / 10}`);
  assert.equal(V.categoryTone(null), 'none');
  assert.deepEqual(['PASS', 'WARN', 'FAIL', 'SKIP', 'MANUAL'].map(V.statusTone), ['pass', 'warn', 'fail', 'none', 'none']);
});

check("grade bands equal the engine's computeGrade at every tenth", () => {
  const { computeGrade } = shipped(path.join(APP, 'app', 'api', 'score', 'route.ts'), ['computeGrade']);
  for (let s = 0; s <= 1000; s++) {
    const score = s / 10;
    const band = V.GRADE_BANDS.find((b) => score >= b.from && (score < b.to || (b.to === 100 && score <= 100)));
    assert.equal(band?.grade, computeGrade(score), `at ${score}`);
  }
});

check('scale position: F takes a third, D to A a sixth each', () => {
  assert.equal(V.scalePosition(0), 0);
  assert.ok(Math.abs(V.scalePosition(60) - 1 / 3) < 1e-9);
  assert.ok(Math.abs(V.scalePosition(80) - 2 / 3) < 1e-9);
  assert.equal(V.scalePosition(100), 1);
  assert.ok(Math.abs(V.scalePosition(30) - 1 / 6) < 1e-9);
});

check('status words, counts and the attention line', () => {
  assert.deepEqual(V.STATUS_LABEL, { PASS: 'Pass', FAIL: 'Fail', WARN: 'Needs work', MANUAL: 'Needs a browser run', SKIP: 'Does not apply' });
  assert.equal(V.statusCount('WARN', 1), '1 needs work');
  assert.equal(V.statusCount('WARN', 12), '12 need work');
  assert.equal(V.statusCount('SKIP', 1), '1 does not apply');
  assert.equal(V.statusCount('MANUAL', 3), '3 need a browser run');
  assert.equal(V.statusCountWords('SKIP', 10), 'do not apply');
  assert.equal(V.attentionLine({ score: 50, fail: 1, warn: 3, manual: 0, skip: 2 }), '1 failed · 3 need work');
  assert.equal(V.attentionLine({ score: 100, fail: 0, warn: 0, manual: 1 }), '1 needs a browser run');
  assert.equal(V.attentionLine({ score: 100, fail: 0, warn: 0, manual: 0, skip: 1 }), 'All passed');
  assert.equal(V.attentionLine({ score: null, manual: 1, skip: 0 }), 'Not measured: needs a browser run');
  assert.equal(V.attentionLine({ score: null, manual: 0, skip: 1 }), 'Not measured: does not apply');
  assert.equal(V.scopeLabel('universal'), 'Standard rules');
  assert.equal(V.scopeLabel('contract'), 'Strict rules');
  assert.deepEqual(['cadence', 'takt', 'poise', 'semantic', 'identity', 'spec'].map(V.categoryLabel),
    ['Typography', 'Interface feel', 'Control polish', 'Color roles', 'Page basics', 'DESIGN.md']);
});

// ── 2. The visitor surfaces ────────────────────────────────────────────────
const SURFACES = [
  'app/score/score-form.tsx',
  'app/score/verify-form.tsx',
  'app/score/report/score-report.tsx',
  'app/score/result-parts.tsx',
  'app/score/score-empty-run.tsx',
  'app/score/target-landing.tsx',
  'app/score/page.tsx',
  'app/score/lovable/page.tsx',
  'app/score/v0/page.tsx',
  'app/score/bolt/page.tsx',
  'app/score/opengraph-image.tsx',
  'app/score/badge/route.ts',
  'app/lib/engine/instrument.tsx',
  'app/report/page.tsx',
  'app/report/report-form.tsx',
  'app/leaderboard/page.tsx',
];
const RETIRED = [
  [/legitimacy/i, 'the old score name ("Contract score")'],
  [/contract violation/i, '"contract violation" ("failed check")'],
  [/\b(universal|contract) scope\b/i, 'a scope name ("Standard rules", "Strict rules")'],
  [/\bN\/A\b/, '"N/A" ("Does not apply")'],
  [/['"`>]\s*Manual( checks)?\s*[<'"`]/, '"Manual" ("Needs a browser run")'],
  [/by a person/i, '"by a person" ("needs a browser run")'],
  [/['"`>]\s*(Cadence|Takt|Poise|Semantic|Identity|Spec)\s*[<'"`]/, 'an old category name as a label'],
  [/\bcomposite\b/i, '"composite" ("Combined score" for the four-engine number, "contract score" for the one engine)'],
  [/\bfmtPct\b/, 'fmtPct (scores take fmtScore and "/100")'],
  [/\{[^{}]*\bscore\b[^{}]*\}%|\bscore\}%|score\.toFixed\(1\)\}%/i, 'a score printed with "%"'],
  [/score\s*>=\s*90\s*\?/, 'a colour threshold of its own (categoryTone, the grade tokens)'],
];
function retiredIn(src) {
  const c = code(src);
  return RETIRED.filter(([re]) => re.test(c)).map(([, why]) => why);
}

check(`no retired term or format on ${SURFACES.length} visitor surfaces`, () => {
  const bad = [];
  for (const rel of SURFACES) for (const why of retiredIn(read(rel))) bad.push(`${rel}: ${why}`);
  assert.deepEqual(bad, []);
});

check('the surface check fails on each retired form put back (the gate can fail)', () => {
  const form = read('app/score/score-form.tsx');
  for (const [inject, expect] of [
    ['<span className="x">Legitimacy Score</span>', /old score name/],
    ['<span>{result.score}%</span>', /printed with "%"/],
    ["const t = 'N/A';", /N\/A/],
    ['<b>Takt</b>', /old category name/],
  ]) {
    const hits = retiredIn(form + '\n' + inject + '\n');
    assert.ok(hits.some((h) => expect.test(h)), `putting back ${inject} was not caught`);
  }
});

// ── 3. Colours outside CSS ─────────────────────────────────────────────────
check("share card and badge grades are the contract's grade colours; pass is green", () => {
  const css = read('app/globals.css');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('[data-theme="light"] {'));
  const token = (g) => (root.match(new RegExp(`--grade-${g}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1]?.toLowerCase();
  const want = Object.fromEntries(['a', 'b', 'c', 'd', 'f'].map((g) => [g.toUpperCase(), token(g)]));
  for (const rel of ['app/score/opengraph-image.tsx', 'app/score/badge/route.ts']) {
    const src = read(rel);
    const block = (src.match(/const GRADE_(?:COLOR|FILL): Record<string, string> = \{([\s\S]*?)\};/) || [])[1] || '';
    const got = Object.fromEntries([...block.matchAll(/([A-F]):\s*'(#[0-9a-fA-F]{6})'/g)].map((m) => [m[1], m[2].toLowerCase()]));
    assert.deepEqual(got, want, rel);
  }
  const inst = read('app/instrument.css');
  assert.match(inst, /--lv-pass-a:\s*var\(--ok\)/, 'the instrument pass lamp is not --ok');
});

if (failures.length) {
  console.log(`\n${failures.length} failing: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nall results language checks pass');
