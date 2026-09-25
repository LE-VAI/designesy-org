#!/usr/bin/env node
/**
 * extractor brace-bound gate — value extractors must stop at a closing brace.
 *
 * WHY THIS EXISTS
 * The drift engine's property extractor has always bounded its capture at `;`,
 * `}`, or end-of-input, and says why:
 *
 *   "In minified CSS, the last declaration in a block has no trailing semicolon
 *    (minifiers strip it to save bytes), so `margin:0}.foo{font-size:.8rem`
 *    would otherwise capture `0}.foo{font-size:.8rem` as the value."
 *
 * Three sibling engines (monitor, guardrails, compare) copied the extractor
 * WITHOUT that bound. Measured on the site's own stylesheet on 2026-09-25, that
 * leaked three declarations past their closing brace:
 *
 *   monitor saw : "var(--sans)}.radar-chart-polygon{fill:var(--signal-dim)"
 *   drift saw   : "var(--sans)"
 *
 * The swallowed text's first-tokens are not typefaces, but the family check
 * counted them — so the monitor engine reported 5 distinct font stacks where the
 * drift engine reported 3 for the same site, and returned WARN where drift
 * correctly returned PASS.
 *
 * WHY THIS IS WORTH A GATE
 * The failure is silent and self-consistent: each engine still produces a
 * well-formed verdict, and nothing crashes. It surfaces only as two published
 * engines disagreeing about one input — and the lane's record is that when two
 * engines disagree, one of them is measuring its own instrument. For the compare
 * engine specifically it is worse than a wrong number: a diff tool that misreads
 * one side reports a difference that is not there.
 *
 * WHAT IT ASSERTS
 * Every `extractValuesByProperty` in the API routes must bound its capture with
 * a negated brace class. This is a source-level check because the defect lives in
 * a regex, and a regex cannot be caught by types, lint, or a prerender.
 *
 * THE CLAUSE THAT COULD NOT FAIL — guarded twice, per this lane's record:
 *   * the regex is read from the BODY of the function, not from the file, so a
 *     correct pattern in a comment or a sibling function cannot satisfy it;
 *   * a minimum-copy count is asserted, so deleting the extractors fails the gate
 *     instead of passing vacuously.
 *
 * Mutation-tested by restoring the unbounded pattern in monitor/route.ts and
 * confirming a non-zero exit.
 *
 * Usage:  node scripts/check-extractor-brace-bound.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const API = path.join(APP, 'app', 'api');
const SHARED = path.join(APP, 'app', 'lib', 'drift-checks.ts');

/**
 * Routes that must DEFINE a property extractor.
 *
 * drift and monitor are NOT in this list any more: since 2026-09-25 they import
 * the shared one from app/lib/drift-checks.ts, which is the fix for their having
 * held two divergent copies. Asserting a definition in those files would fail on
 * correct code, so they are asserted in the "must import" list below instead.
 */
const MUST_DEFINE = [
  path.join(API, 'guardrails', 'route.ts'),
  path.join(API, 'compare', 'route.ts'),
  SHARED,
];

/**
 * Routes that must IMPORT the shared extractor rather than define their own.
 * This is the invariant that keeps the two drift engines measuring one artifact.
 */
const MUST_IMPORT = [
  path.join(API, 'drift', 'route.ts'),
  path.join(API, 'monitor', 'route.ts'),
];

function routeFiles() {
  return fs
    .readdirSync(API, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(API, e.name, 'route.ts'))
    .filter((p) => fs.existsSync(p));
}

/**
 * Pull the body of extractValuesByProperty, so the assertion cannot be satisfied
 * by a correct regex elsewhere in the file.
 */
function extractorBody(source) {
  const start = source.indexOf('function extractValuesByProperty');
  if (start === -1) return null;
  // Take a generous slice: the body is short, and slicing to the next top-level
  // `function` keeps a neighbouring helper's regex out of scope.
  const rest = source.slice(start + 1);
  const nextFn = rest.indexOf('\nfunction ');
  return nextFn === -1 ? source.slice(start) : source.slice(start, start + 1 + nextFn);
}

const findings = [];

// Guard the guard: if the files this gate exists to inspect are missing, a clean
// result would be vacuous. Checked on the explicit lists rather than on a
// count of whatever happens to be found, so renaming a route fails loudly.
const missing = [...MUST_DEFINE, ...MUST_IMPORT].filter((f) => !fs.existsSync(f));
if (missing.length) {
  findings.push({
    id: 'expected-source-missing',
    why: `These files this gate inspects do not exist: ${missing.map((f) => path.relative(APP, f)).join(', ')}. A brace-bound check over an empty set passes for the wrong reason.`,
    fix: 'Update MUST_DEFINE / MUST_IMPORT in this script to match where the extractors and their callers actually live.',
  });
}

// A route that must import the shared extractor must not also define its own —
// that is the divergence this whole gate exists to prevent.
for (const file of MUST_IMPORT) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (extractorBody(source) !== null) {
    findings.push({
      id: 'duplicate-extractor-definition',
      why: `${path.relative(APP, file)} defines its own extractValuesByProperty while it is supposed to import the shared one. Two copies is exactly how the drift and monitor engines came to read 3 vs 5 font stacks for the same page.`,
      fix: "Delete the local definition and import extractValuesByProperty from '../../lib/drift-checks'.",
    });
  }
}

let checked = 0;
for (const file of MUST_DEFINE) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const body = extractorBody(source);
  if (body === null) {
    findings.push({
      id: 'extractor-definition-missing',
      why: `${path.relative(APP, file)} is expected to define extractValuesByProperty but does not, so its brace bound cannot be asserted.`,
      fix: 'Restore the definition, or move the file between MUST_DEFINE and MUST_IMPORT if the extractor was consolidated elsewhere.',
    });
    continue;
  }
  checked++;

  const m = body.match(/new RegExp\(`([^`]+)`/);
  if (!m) {
    findings.push({
      id: 'extractor-not-found',
      why: `${path.relative(APP, file)} defines extractValuesByProperty but its regex could not be read, so the brace bound cannot be asserted.`,
      fix: 'Restore a single `new RegExp(\`...\`)` inside the function, or update this gate to match the new shape.',
    });
    continue;
  }

  const pattern = m[1];
  // The bound: the capture class must exclude `}`, and the terminator must
  // include it. Both halves matter — a class that excludes `}` but a terminator
  // that only lists `;` would still stop early yet is not the shipped shape.
  const classExcludesBrace = /\[\^;[^\]}]*\}/.test(pattern) || pattern.includes('[^;{}]');
  const terminatesOnBrace = /\(\?:\[;{}\]\|/.test(pattern) || pattern.includes('(?:[;{}]|$)');

  if (!classExcludesBrace || !terminatesOnBrace) {
    findings.push({
      id: 'unbounded-value-capture',
      why: `${path.relative(APP, file)} captures a property value without stopping at a closing brace (${pattern}). In minified CSS the last declaration in a block has no trailing semicolon, so the capture runs past the block into the next rule and the swallowed text becomes the "value" — which is how this engine read 5 font stacks where the drift engine read 3 for the same site (2026-09-25).`,
      fix: 'Use the bounded form: new RegExp(`${prop}\\\\s*:\\\\s*([^;{}]+?)(?:[;{}]|$)`, \'gi\')',
    });
  }
}

if (checked < MUST_DEFINE.length) {
  findings.push({
    id: 'too-few-extractors-checked',
    why: `Checked only ${checked} of ${MUST_DEFINE.length} expected extractor definition(s). A gate that checks nothing passes for the wrong reason.`,
    fix: 'Verify extractValuesByProperty still exists in the shared module, guardrails and compare.',
  });
}

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify({ ok: findings.length === 0, checked, findings }, null, 2));
} else if (findings.length === 0) {
  console.log(`extractor-brace-bound: OK — ${checked} extractor(s) bound their capture at a closing brace`);
} else {
  console.error(`extractor-brace-bound: ${findings.length} finding(s)\n`);
  for (const f of findings) {
    console.error(`  [${f.id}]`);
    console.error(`    why: ${f.why}`);
    console.error(`    fix: ${f.fix}\n`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
