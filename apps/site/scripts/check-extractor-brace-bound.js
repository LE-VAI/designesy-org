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

/** Routes known to carry a property extractor. Asserted non-empty below. */
const MIN_EXPECTED_FILES = 4;

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

const files = routeFiles();
if (files.length < MIN_EXPECTED_FILES) {
  findings.push({
    id: 'too-few-route-files',
    why: `Only ${files.length} route file(s) found under app/api (expected at least ${MIN_EXPECTED_FILES}). The scan is not seeing the app, so a clean result would be vacuous.`,
    fix: 'Check that APP resolves to apps/site and that app/api still contains the engine routes.',
  });
}

let checked = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const body = extractorBody(source);
  if (body === null) continue;
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

if (checked < MIN_EXPECTED_FILES) {
  findings.push({
    id: 'too-few-extractors-checked',
    why: `Found only ${checked} extractor(s) to check (expected at least ${MIN_EXPECTED_FILES}). A gate that checks nothing passes for the wrong reason.`,
    fix: 'Verify extractValuesByProperty still exists in drift, monitor, guardrails and compare.',
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
