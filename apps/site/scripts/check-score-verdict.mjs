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
 *      graded verdicts name their failed checks' categories.
 *   2. Evidence: a raw declaration block is described in words and kept out of
 *      the plain list; names and values stay as they are.
 *   3. Render: score-empty-run.tsx, rendered on the server, carries the title,
 *      the reason and a real retry button, and no ring, percentage or verdict.
 *   4. Wiring: score-form.tsx renders that card for an empty run and gates the
 *      graded result (ring, counts, signals, filters, list) behind !isEmptyRun.
 *   5. Wiring: the report (score-report.tsx) renders the same card for an
 *      empty run and never defaults a missing score to 0 or a grade to F (it
 *      read "F 0.0%" for lovable.dev); its failure block offers a retry.
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

const { verdictLine, isEmptyRun, emptyRunReason, readEvidence, describeCss, categoryChips, resultAnnouncement } = await import(
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

check('graded verdicts: failed checks named by where they are, then what needs work', () => {
  assert.match(verdictLine({ total: 42, fail: 0, warn: 2 }), /^Strong conformance/);
  assert.equal(verdictLine({ total: 42, fail: 0, warn: 12 }), 'No failed checks. 12 need work.');
  assert.equal(
    verdictLine({
      total: 42, fail: 3, warn: 1,
      checks: [{ category: 'motion', status: 'FAIL' }, { category: 'motion', status: 'FAIL' }, { category: 'cadence', status: 'FAIL' }, { category: 'tokens', status: 'WARN' }],
    }),
    '3 failed checks, in Motion and Typography, and 1 that needs work.',
  );
  assert.equal(verdictLine({ total: 42, fail: 1, warn: 0 }), '1 failed check.');
  // stripe.com, 2026-10-10: one failure, in accessibility, and twelve warnings.
  assert.equal(
    verdictLine({ total: 44, fail: 1, warn: 12, checks: [{ category: 'accessibility', status: 'FAIL' }] }),
    '1 failed check, in Accessibility, and 12 that need work.',
  );
  for (const r of [{ total: 42, fail: 3, warn: 1 }, { total: 42, fail: 0, warn: 12 }]) {
    assert.doesNotMatch(verdictLine(r), /contract violation|weakest/);
  }
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
  // Two blocks of one kind read as a count, not the same phrase twice.
  assert.equal(ev.summary, '2 linear gradients on pseudo-elements, 1 animated');
  assert.equal(readEvidence([v0[0]]).summary, 'Linear gradient on a pseudo-element, animated');
  const fonts = readEvidence(['roboto', 'inter', '#6366F1']);
  assert.deepEqual(fonts.plain, ['roboto', 'inter', '#6366F1']);
  assert.equal(fonts.summary, '');
});

check('category chips cover every evaluated category and sum to the check count', () => {
  const checks = [
    { category: 'motion' }, { category: 'copywriting' }, { category: 'accessibility' },
    { category: 'spec' }, { category: 'copywriting' }, { category: 'novel' }, { category: 'motion' },
  ];
  const chips = categoryChips(checks);
  assert.equal(chips.reduce((n, c) => n + c.count, 0), checks.length);
  assert.deepEqual(chips.map((c) => c.key), ['motion', 'accessibility', 'copywriting', 'spec', 'novel']);
  assert.deepEqual(chips.map((c) => c.label), ['Motion', 'Accessibility', 'Copywriting', 'DESIGN.md', 'Novel']);
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

check('the report renders the empty-run card, never a defaulted F 0.0%', () => {
  const report = fs.readFileSync(path.join(APP, 'app', 'score', 'report', 'score-report.tsx'), 'utf8');
  assert.match(report, /import \{ ScoreEmptyRun \} from '\.\.\/score-empty-run';/);
  assert.match(report, /isEmptyRun\(result\)/);
  assert.match(report, /<ScoreEmptyRun url=\{scoredUrl\} reason=\{emptyRunReason\(result, scoredUrl\)\} onRetry=\{retry\} \/>/);
  assert.doesNotMatch(report, /result\.score \?\? 0|result\.grade \?\? 'F'/, 'the report defaults a missing score or grade again');
  // The failure block's retry runs the score again.
  assert.match(report, /<h2>Score failed<\/h2>[\s\S]{0,300}onClick=\{retry\}[\s\S]{0,120}Try again/);
});

check('the report announces a finished run in the approved words', () => {
  const run = {
    grade: 'D', score: 67.9, fail: 1, total: 44,
    categoryScores: { accessibility: { score: 50, fail: 1, weight: 15 }, tokens: { score: 100, fail: 0, weight: 9 } },
  };
  assert.equal(resultAnnouncement(run), 'Contract score D, 67.9 out of 100. 1 failed check, in Accessibility.');
  assert.equal(resultAnnouncement({ grade: 'A', score: 100, fail: 0 }), 'Contract score A, 100.0 out of 100. No failed checks.');
  assert.equal(
    resultAnnouncement({ grade: 'F', score: 56.6, fail: 3, categoryScores: { motion: { score: 50, fail: 1, weight: 10 }, cadence: { score: 60, fail: 2, weight: 18 } } }),
    'Contract score F, 56.6 out of 100. 3 failed checks, in Typography and Motion.',
  );
  // The live region is mounted empty and written after paint, and the success
  // branch keeps it (it used to unmount there, so a finished report was silent).
  const report = fs.readFileSync(path.join(APP, 'app', 'score', 'report', 'score-report.tsx'), 'utf8');
  assert.match(report, /role="status" aria-live="polite">\s*\{liveText\}\s*<\/p>/);
  assert.match(report, /resultAnnouncement\(result\)/);
  assert.equal((report.match(/\{live\}/g) || []).length, 4, 'the live region is not in all four branches');
});

if (failures.length) {
  console.log(`\n${failures.length} failing: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nall score verdict checks pass');
