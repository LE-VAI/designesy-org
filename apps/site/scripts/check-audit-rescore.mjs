#!/usr/bin/env node
/**
 * Audit rescore gate: the browser audit cannot move a grade it did not change.
 *
 * WHY THIS EXISTS
 * "Run full browser audit" on the score form settles three checks (v02, v04,
 * v21) and the result is scored again. The form did that in the browser, with
 * its own copy of the arithmetic: eleven of the fourteen category weights,
 * and no anti-slop deduction or originality lift. With the audit answering
 * every check exactly as the run had it, stripe.com went from D 67.9 to C 70,
 * pentagram.com from F 56.6 to C 72.1 and bolt.new from C 73.1 to B 84.7. The
 * copy sat in a client component, outside the source-drift gate, and every
 * check passed it: the numbers it printed were well formed.
 *
 * Now the score after an audit comes from /api/score/rescore: the engine's own
 * cached run, the audit's verdicts merged in by app/api/score/rescore/merge.ts,
 * scored by scoreArithmetic from app/api/score/route.ts (the function both
 * engine copies share, compared by packages/score/scripts/source-drift.mjs).
 *
 * WHAT IT ASSERTS
 *   1. The shipped scoreArithmetic, run on five recorded engine runs, gives
 *      each run's own score and grade (so the function under test is the
 *      engine's arithmetic, not a stand-in).
 *   2. Merging the audit's verdicts unchanged gives the same score, grade and
 *      category scores, for every run.
 *   3. A changed verdict does change the score (the path is live).
 *   4. A rescore request can only carry the audit's own three checks, with a
 *      known status; anything else is dropped.
 *   5. Wiring: the score form keeps no arithmetic and calls the rescore
 *      endpoint; the endpoint scores with scoreArithmetic and the run's own
 *      slop and originality totals.
 *
 * PROVING IT CAN FAIL
 * The retired client copy is kept below as `retiredClientMath`. Assertion 2
 * is run on it too, and it must fail on at least one recorded run, or this
 * gate could not have caught the defect it exists for.
 *
 * Usage:  node scripts/check-audit-rescore.mjs
 * Exits 1 on any failure. Needs Node 22.18+ (type stripping for merge.ts).
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

// merge.ts carries ESM syntax in a package with no "type" field, so Node
// reparses it as a module and says so on stderr. That note is expected here.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
  String(warning).includes('Module type of') ? undefined : emitWarning.call(process, warning, ...rest);

const { AUDIT_CHECK_IDS, auditVerdicts, mergeVerdicts } = await import(
  pathToFileURL(path.join(APP, 'app', 'api', 'score', 'rescore', 'merge.ts')).href
);

/** Named function declarations from a TypeScript file, as runnable JavaScript. */
function shippedFunctions(file, names) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const parts = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && names.includes(st.name.text)) {
      parts.push(src.slice(st.getStart(sf), st.end).replace(/^export\s+/, ''));
    }
  }
  assert.equal(parts.length, names.length, `expected ${names.join(', ')} in ${path.relative(APP, file)}`);
  const { outputText } = ts.transpileModule(parts.join('\n'), {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 },
  });
  return new Function(`${outputText}\nreturn { ${names.join(', ')} };`)();
}

const ROUTE = path.join(APP, 'app', 'api', 'score', 'route.ts');
const { scoreArithmetic, computeGrade } = shippedFunctions(ROUTE, ['scoreArithmetic', 'computeGrade']);
const RUNS = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'audit-rescore-runs.json'), 'utf8')).runs;

/** The score form's arithmetic before this gate, kept to prove the gate fails on it. */
function retiredClientMath(checks) {
  const W = { cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9, takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3 };
  const counts = {};
  for (const c of checks) if (c.status !== 'SKIP' && c.status !== 'MANUAL') counts[c.category] = (counts[c.category] || 0) + 1;
  let wp = 0, wt = 0;
  for (const c of checks) {
    if (c.status === 'SKIP' || c.status === 'MANUAL') continue;
    const cw = (W[c.category] || 5) / (counts[c.category] || 1);
    wt += cw;
    if (c.status === 'PASS') wp += cw;
    else if (c.status === 'WARN') wp += cw * 0.5;
  }
  let score = wt === 0 ? 0 : Math.round((wp / wt) * 1000) / 10;
  const a = checks.filter((c) => c.category === 'accessibility' && c.status !== 'SKIP' && c.status !== 'MANUAL');
  const pct = a.length === 0 ? 100 : ((a.filter((c) => c.status === 'PASS').length + a.filter((c) => c.status === 'WARN').length * 0.5) / a.length) * 100;
  if (a.length > 0 && pct < 60 && score > 70) score = 70;
  const caps = { v06: 65, v22: 70, v02: 70, v24: 75, v25: 75, v16: 70 };
  for (const c of checks) if (c.status === 'FAIL' && caps[c.id] !== undefined && score > caps[c.id]) score = caps[c.id];
  return { score, grade: computeGrade(score) };
}

/** The audit answering every one of its checks exactly as the run had it. */
const unchangedVerdicts = (run) =>
  run.checks.filter((c) => AUDIT_CHECK_IDS.includes(c.id)).map((c) => ({ id: c.id, status: c.status, detail: '' }));

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

console.log('audit rescore');

check(`the shipped arithmetic gives each recorded run its own score and grade (${RUNS.length} runs)`, () => {
  for (const run of RUNS) {
    const r = scoreArithmetic(run.checks, run.slopTotal, run.originalityPoints);
    assert.equal(r.score, run.score, `${run.site}: scoreArithmetic gives ${r.score}, the engine reported ${run.score}. If the arithmetic changed on purpose, re-capture the fixture`);
    assert.equal(computeGrade(r.score), run.grade, run.site);
  }
});

check('an audit that changes no verdict changes no score, grade or category score', () => {
  for (const run of RUNS) {
    const before = scoreArithmetic(run.checks, run.slopTotal, run.originalityPoints);
    const merged = mergeVerdicts(run.checks, unchangedVerdicts(run));
    const after = scoreArithmetic(merged, run.slopTotal, run.originalityPoints);
    assert.equal(after.score, before.score, `${run.site}: ${before.score} became ${after.score}`);
    assert.equal(computeGrade(after.score), computeGrade(before.score), run.site);
    assert.deepEqual(after.categoryScores, before.categoryScores, run.site);
  }
});

check('the retired client arithmetic fails the same assertion (the gate can fail)', () => {
  const moved = RUNS.filter((run) => {
    const after = retiredClientMath(mergeVerdicts(run.checks, unchangedVerdicts(run)));
    return after.score !== run.score || after.grade !== run.grade;
  });
  assert.ok(moved.length > 0, 'the retired copy agreed with the engine on every run, so these fixtures cannot tell them apart');
  console.log(`        retired copy moved ${moved.length} of ${RUNS.length}: ${moved.map((r) => `${r.site} ${r.grade} ${r.score} -> ${retiredClientMath(r.checks).grade} ${retiredClientMath(r.checks).score}`).join('; ')}`);
});

check('a changed verdict does change the score', () => {
  const run = RUNS.find((r) => r.checks.some((c) => c.id === 'v21' && c.status === 'MANUAL'));
  assert.ok(run, 'no recorded run leaves v21 to the browser');
  const before = scoreArithmetic(run.checks, run.slopTotal, run.originalityPoints);
  const failed = scoreArithmetic(mergeVerdicts(run.checks, [{ id: 'v21', status: 'FAIL', detail: '' }]), run.slopTotal, run.originalityPoints);
  assert.notEqual(failed.score, before.score, `${run.site}: a failed v21 left the score at ${before.score}`);
});

check('a rescore request carries only the audit checks, with a known status', () => {
  const got = auditVerdicts([
    { id: 'v06', status: 'PASS', detail: 'not an audit check' },
    { id: 'v21', status: 'GREAT', detail: 'not a status' },
    { id: 'v21', status: 'PASS', detail: 'LCP 1.2 s' },
    { id: 'v21', status: 'FAIL', detail: 'a second v21' },
    'v02',
    null,
  ]);
  assert.deepEqual(got, [{ id: 'v21', status: 'PASS', detail: 'LCP 1.2 s' }]);
  assert.deepEqual(auditVerdicts('v21'), []);
  assert.deepEqual([...AUDIT_CHECK_IDS].sort(), ['v02', 'v04', 'v21']);
});

check('wiring: no arithmetic in the score form; the endpoint scores with the engine', () => {
  const form = fs.readFileSync(path.join(APP, 'app', 'score', 'score-form.tsx'), 'utf8');
  assert.doesNotMatch(form, /CATEGORY_WEIGHTS/, 'score-form.tsx carries a category weight table again');
  assert.doesNotMatch(form, /\bwp\s*\/\s*wt\b|weightedPoints\s*\/\s*weightedTotal/, 'score-form.tsx computes a weighted score again');
  assert.match(form, /fetch\('\/api\/score\/rescore'/, 'score-form.tsx does not call /api/score/rescore');
  const endpoint = fs.readFileSync(path.join(APP, 'app', 'api', 'score', 'rescore', 'route.ts'), 'utf8');
  assert.match(endpoint, /scoreArithmetic\(merged, run\.slop\.total, run\.originality\.points\)/);
  assert.match(endpoint, /mergeVerdicts\(run\.checks, verdicts\)/);
  assert.match(endpoint, /auditVerdicts\(body\.checks\)/);
});

if (failures.length) {
  console.log(`\n${failures.length} failing: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nall audit rescore checks pass');
