#!/usr/bin/env node
/**
 * Score verdict gate: a run that read nothing is never reported as a grade.
 *
 * WHY THIS EXISTS
 * /score/lovable is prefilled with lovable.dev, which answers 403 to every
 * candidate URL. The API then returns ok with total 0, score null and an
 * unreachableDetail. verdictLine() counted zero checks as zero fails, so the
 * page led with "Strong conformance: this design system reads as engineered
 * rather than assembled." above an empty 0% ring, "0 CSS tokens extracted"
 * and "No matching verification checks". The build, the types and every
 * visual gate passed it: the sentence was valid and the numbers were right.
 *
 * WHAT IT ASSERTS
 *   1. verdict.ts: an empty run (total 0, or unreachable) is detected, its
 *      verdict says so, and the API's own reason is the reason line; the
 *      graded verdicts are unchanged.
 *   2. Evidence: a raw declaration block is described in words and kept out of
 *      the plain list; names and values stay as they are.
 *   3. Render: score-empty-run.tsx, rendered on the server, carries the title,
 *      the reason and a real retry button, and no ring, percentage or verdict.
 *   4. Wiring: score-form.tsx renders that card for an empty run and gates the
 *      graded result (ring, counts, signals, filters, list) behind !isEmptyRun.
 *
 * Usage:  node scripts/check-score-verdict.mjs
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

// verdict.ts carries ESM syntax in a package with no "type" field, so Node
// reparses it as a module and says so on stderr. That note is expected here.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
  String(warning).includes('Module type of') ? undefined : emitWarning.call(process, warning, ...rest);

const { verdictLine, isEmptyRun, emptyRunReason, readEvidence, describeCss } = await import(
  pathToFileURL(path.join(APP, 'app', 'score', 'verdict.ts')).href
);

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

console.log('score verdict');

// The shape /api/score returns for lovable.dev (HTTP 403 on every candidate).
const UNREACHABLE = {
  ok: true,
  unreachable: true,
  unreachableDetail:
    'Could not read https://lovable.dev/: the server returned HTTP 403 for every candidate URL. No score is reported, because a site that cannot be fetched cannot be graded.',
  score: null,
  grade: null,
  pass: 0, fail: 0, warn: 0, skip: 0, manual: 0, total: 0,
  categoryScores: {},
  checks: [],
};

check('total 0 is an empty run, with or without the unreachable flag', () => {
  assert.equal(isEmptyRun(UNREACHABLE), true);
  assert.equal(isEmptyRun({ total: 0, fail: 0, warn: 0 }), true);
  assert.equal(isEmptyRun({}), true);
  assert.equal(isEmptyRun({ total: 42, fail: 0, warn: 0 }), false);
});

check('an empty run never reads as conformance', () => {
  for (const r of [UNREACHABLE, { total: 0, fail: 0, warn: 0 }]) {
    const line = verdictLine(r);
    assert.doesNotMatch(line, /conformance/i, line);
    assert.match(line, /^Could not read this site/, line);
  }
});

check('the reason line is the API account when it gave one', () => {
  assert.equal(emptyRunReason(UNREACHABLE, 'https://lovable.dev'), UNREACHABLE.unreachableDetail);
  const fallback = emptyRunReason({ total: 0 }, 'https://example.com');
  assert.match(fallback, /https:\/\/example\.com/);
  assert.match(fallback, /no checks ran/);
});

check('graded verdicts are unchanged', () => {
  assert.match(verdictLine({ total: 42, fail: 0, warn: 2 }), /^Strong conformance/);
  assert.match(verdictLine({ total: 42, fail: 0, warn: 12 }), /^Partial conformance/);
  assert.equal(
    verdictLine({ total: 42, fail: 3, warn: 1, categoryScores: { motion: { score: 40 }, tokens: { score: 90 } } }),
    '3 contract violations, weakest in Motion.',
  );
  assert.equal(verdictLine({ total: 42, fail: 1, warn: 0 }), '1 contract violation.');
});

check('raw CSS evidence is described in words; names stay plain', () => {
  const v0 = [
    '{content:"";background:linear-gradient(105deg,#0000 0% 40%,#fff3 45%);animation:2.5s ease-in-out infinite P9sagW_shimmer;',
    '{z-index:0;pointer-events:none;content:"";background:linear-gradient(90deg, var(--v0-red-100) 0%, co',
  ];
  const ev = readEvidence(v0);
  assert.deepEqual(ev.plain, []);
  assert.equal(ev.raw.length, 2);
  assert.equal(describeCss(v0[0]), 'Linear gradient on a pseudo-element, animated');
  assert.match(ev.summary, /^Linear gradient on a pseudo-element, animated · Linear gradient on a pseudo-element$/);
  const fonts = readEvidence(['roboto', 'inter', '#6366F1']);
  assert.deepEqual(fonts.plain, ['roboto', 'inter', '#6366F1']);
  assert.equal(fonts.summary, '');
});

// ── Render check ───────────────────────────────────────────────────────────
// Transpile the component with the repo's TypeScript and render it with the
// repo's React, so the markup asserted on is the markup that ships.
check('the empty-run card renders a title, the reason and a retry button, and no grade', () => {
  const ts = require('typescript');
  const src = fs.readFileSync(path.join(APP, 'app', 'score', 'score-empty-run.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(require, mod, mod.exports);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const html = renderToStaticMarkup(
    React.createElement(mod.exports.ScoreEmptyRun, {
      url: 'https://lovable.dev',
      reason: emptyRunReason(UNREACHABLE, 'https://lovable.dev'),
      onRetry: () => {},
    }),
  );
  assert.match(html, />Could not read this site</);
  assert.match(html, /HTTP 403 for every candidate URL/);
  assert.match(html, /<button type="button" class="score-action-btn score-empty-run-retry"[^>]*>Try again<\/button>/);
  assert.match(html, /aria-labelledby="score-empty-run-title"/);
  assert.doesNotMatch(html, /constel|score-percent|score-metric|conformance|\b0%/, html);
});

check('score-form renders the empty-run card and gates the graded result', () => {
  const form = fs.readFileSync(path.join(APP, 'app', 'score', 'score-form.tsx'), 'utf8');
  assert.match(form, /result\.ok && isEmptyRun\(result\) && \(\s*<div className="score-results[^"]*"[^>]*>\s*<ScoreEmptyRun/);
  assert.match(form, /result\.ok && !isEmptyRun\(result\) && \(\s*<div className="score-results/);
  // Nothing else renders the grade ring: the only score-results blocks are the two above.
  assert.equal((form.match(/className="score-results/g) || []).length, 2);
  // No history entry for a run that read nothing.
  assert.match(form, /if \(isEmptyRun\(data\)\) \{[\s\S]{0,120}return;\s*\}[\s\S]{0,400}saveScore\(/);
});

if (failures.length) {
  console.log(`\n${failures.length} failing: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nall score verdict checks pass');
