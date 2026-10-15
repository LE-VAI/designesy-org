#!/usr/bin/env node
/**
 * Contract page copy gate: every string /score/contract builds from a result
 * reads the way the approved copy says, with the counts, scores and versions taken from the data, never typed.
 *
 * WHY THIS EXISTS
 * The page's sentences carry numbers: how many problems a contract has, which
 * check capped fidelity and at what, how long to wait after a rate limit, how
 * many rows of a prose DESIGN.md sat in tables. A builder that pluralises one
 * case wrong ("1 checks need work") or prints a scenario's value instead of
 * the run's still renders a clean page. The builders are pure functions
 * (app/score/contract/copy.ts), so each is pinned here to its output.
 *
 * WHAT IT ASSERTS (offline)
 *   1. Problems: field order (by line, then column; a problem with no line
 *      first), the panel's lead and sub-label in the singular and the plural,
 *      the minimum list read from the codes, the TOKENS_IN_PROSE detail and
 *      its front-matter rewrite from the pasted text, the caret line.
 *   2. Verdict: the four approved leads (no failure, warnings only, one
 *      failure with and without a ceiling, several failures), the baseline
 *      tail in the singular (a colon) and the plural, the hidden prefix with
 *      both numbers or "no score", the fidelity-null and unreachable lines.
 *   3. Request errors (W10): 429 with and without Retry-After (1 second, N
 *      seconds), 413 (the engine's sentence kept), 400 scope_conflict, 502,
 *      and no answer at all.
 *   4. Inputs: "Read as" from the engine's own detector, sizes, the site and
 *      contract URL checks, the four running steps resolving together.
 *   5. No builder prints a version or a check count literal: the page's
 *      source holds no "v0.4." and no engine version string.
 *
 * PROVING IT CAN FAIL
 *   --break  expects the singular baseline tail to use "starting with"
 *            (the retired wording); the run must
 *            exit 1.
 *
 * Usage:  node scripts/check-contract-copy.mjs [--break]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');
const BREAK = process.argv.includes('--break');

const h = createHarness({ app: APP });
const C = h.load('app/score/contract/copy.ts');

const failures = [];
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
  }
}

// ── 1. Problems ──
check('field order', () => {
  const got = C.inFieldOrder([
    { code: 'B', line: 9 },
    { code: 'A' },
    { code: 'C', line: 3, column: 7 },
    { code: 'D', line: 3, column: 2 },
    { code: 'E', line: 3, column: 2 },
  ]).map((p) => p.code);
  assert.deepEqual(got, ['A', 'D', 'E', 'C', 'B']);
});
check('intro, one parse problem', () => {
  assert.equal(C.problemsIntro([{ code: 'YAML_INVALID' }]), 'The site was not scored. Fix this problem in your contract and run it again.');
  assert.equal(C.problemsSub(1), 'Fix this problem');
});
check('intro, several problems', () => {
  assert.equal(C.problemsIntro([{ code: 'ALIAS_CYCLE' }, { code: 'TOO_FEW_COLORS' }]), 'The site was not scored. Fix these 2 problems in your contract and run it again.');
  assert.equal(C.problemsSub(3), 'Fix these 3 problems');
});
check('intro, minimum', () => {
  assert.equal(C.problemsIntro([{ code: 'TOO_FEW_COLORS' }]), 'The site was not scored. One problem in your contract leaves it below the minimum, so there is nothing to compare the page with.');
  assert.equal(C.problemsIntro([{ code: 'TOO_FEW_COLORS' }, { code: 'NO_TYPE_STYLE' }]), 'The site was not scored. 2 problems in your contract leave it below the minimum, so there is nothing to compare the page with.');
});
check('minimum rows', () => {
  const few = C.minimumRows([{ code: 'TOO_FEW_COLORS', count: 2 }]);
  assert.deepEqual(few.map((r) => [r.ok, r.found]), [[true, 'met'], [false, '2 found'], [true, 'met'], [null, 'optional']]);
  const prose = C.minimumRows([{ code: 'TOKENS_IN_PROSE' }]);
  assert.deepEqual(prose.map((r) => r.found), ['not met: tables', '0 found', '0 found', 'optional']);
  assert.equal(prose[1].text, '3 or more colors in front matter');
});
const PROSE = [
  '---', 'name: Acme', 'version: 1', '---', '# Acme', '', '## Colors', '',
  '| Token | Value | Use |', '|---|---|---|', '| primary | #1A5CFF | buttons |', '| ink | #111418 | text |', '| surface | #FFFFFF | page |', '| accent | #FF7A00 | rare |',
  '', '## Typography', '', '| Style | Family | Size | Weight | Line height |', '|---|---|---|---|---|', '| display | Fraunces | 48px | 600 | 1.1 |', '| body | Inter | 16px | 400 | 1.5 |',
].join('\n');
const prose = { code: 'TOKENS_IN_PROSE', message: 'x', colorRows: 4, colorLines: [11, 14], typeRows: 2, typeLines: [20, 21], keys: ['name', 'version'] };
check('prose detail', () => {
  assert.equal(C.proseDetail(prose), 'Found 4 color rows under Colors (lines 11 to 14) and 2 text styles under Typography (lines 20 to 21). The front matter holds only name and version.');
  assert.equal(C.proseDetail({ ...prose, colorRows: 1, colorLines: [11, 11], typeRows: undefined, typeLines: undefined, keys: [] }), 'Found 1 color row under Colors (line 11). There is no front matter.');
});
check('prose rewrite', () => {
  assert.equal(C.proseRewrite(PROSE, prose), [
    '---', 'name: Acme', 'colors:', '  primary: "#1A5CFF"', '  ink: "#111418"', '  surface: "#FFFFFF"',
    'typography:', '  body:', '    fontFamily: Inter', '    fontSize: 16px', '    lineHeight: 1.5', '---',
  ].join('\n'));
  assert.equal(C.proseRewrite('nothing here', prose), null);
});
check('caret line', () => {
  assert.equal(C.caretLine([prose]), 11);
  assert.equal(C.caretLine([{ code: 'A' }, { code: 'B', line: 5 }, { code: 'C', line: 2 }]), 2);
  assert.equal(C.lineOffset('ab\ncd\nef', 3), 6);
});
check('provenance line: the linter totals as reported, and the rows that absorbed findings', () => {
  const L = { package: '@google/design.md', version: '0.4.0', errors: 2, warnings: 1, infos: 0 };
  assert.equal(C.lintLine(null, []), null);
  assert.equal(C.lintText(C.lintLine(L, [{ code: 'VALUE_INVALID', linterFinding: true }, { code: 'TOKEN_DROPPED', linterFinding: true }, { code: 'DUPLICATE_SECTION' }])), 'Linted with @google/design.md 0.4.0: 2 errors, 1 warning (shown above as 2 problems).');
  assert.equal(C.lintText(C.lintLine({ ...L, errors: 1, warnings: 0 }, [{ code: 'VALUE_INVALID', linterFinding: true }])), 'Linted with @google/design.md 0.4.0: 1 error, 0 warnings (shown above as 1 problem).');
  // The totals are the linter's own, whatever the rows show.
  assert.equal(C.lintText(C.lintLine({ ...L, errors: 5, warnings: 3 }, [])), 'Linted with @google/design.md 0.4.0: 5 errors, 3 warnings.');
});

// ── 2. Verdict ──
const titles = { f02: 'Shipped colors are in your palette', f10: 'Your primary action pair meets contrast on shipped values', f03: 'Shipped font sizes are on your type scale', v03: 'Interactive elements show focus-visible rings', v25: 'One h1 and no skipped heading levels', v34: 'AI surfaces carry a disclosure' };
const ceilings = { f09: 65, f10: 70 };
const L = (score, grade, extra = {}) => ({ score, grade, scored: 9, total: 14, ...extra });
check('lead: every check passed', () => {
  assert.equal(C.verdictWords(L(95, 'A'), L(92, 'A'), [{ id: 'f02', status: 'PASS' }], titles, ceilings), 'The page follows your contract. Every scored check passed.');
});
check('lead: warnings only', () => {
  assert.equal(C.verdictWords(L(85, 'B'), L(92, 'A'), [{ id: 'f02', status: 'WARN' }], titles, ceilings), 'The page follows your contract. 1 check needs work.');
  assert.equal(C.verdictWords(L(80, 'B'), L(92, 'A'), [{ id: 'f02', status: 'WARN' }, { id: 'f03', status: 'WARN' }], titles, ceilings), 'The page follows your contract. 2 checks need work.');
});
check('lead: one failure with its ceiling', () => {
  assert.equal(
    C.verdictWords(L(70, 'C', { ceilingApplied: true }), L(74, 'C'), [{ id: 'f10', status: 'FAIL' }, { id: 'v03', status: 'FAIL' }], titles, ceilings),
    'The page follows most of your contract. One check failed: your primary action pair meets contrast on shipped values, which caps fidelity at 70. The baseline also has 1 failing check: interactive elements show focus-visible rings.',
  );
});
check('lead: one failure, no ceiling', () => {
  assert.equal(C.verdictWords(L(72, 'C'), L(90, 'A'), [{ id: 'f02', status: 'FAIL' }], titles, ceilings), 'The page follows most of your contract. One check failed: shipped colors are in your palette.');
});
check('lead: several failures, baseline plural', () => {
  const got = C.verdictWords(L(50, 'F'), L(60, 'D'), [{ id: 'f02', status: 'FAIL' }, { id: 'f03', status: 'FAIL' }, { id: 'v25', status: 'FAIL' }, { id: 'v34', status: 'FAIL' }], titles, ceilings);
  assert.equal(got, 'The page follows most of your contract. 2 checks failed, starting with shipped colors are in your palette. The baseline also has 2 failing checks, starting with one h1 and no skipped heading levels.');
});
check('singular tail takes a colon', () => {
  const got = C.verdictWords(L(95, 'A'), L(80, 'B'), [{ id: 'v34', status: 'FAIL' }], titles, ceilings);
  const want = BREAK ? 'The page follows your contract. Every scored check passed. The baseline also has 1 failing check, starting with AI surfaces carry a disclosure.' : 'The page follows your contract. Every scored check passed. The baseline also has 1 failing check: AI surfaces carry a disclosure.';
  assert.equal(got, want);
});
check('verdict prefix and null lines', () => {
  assert.equal(C.verdictPrefix(L(70, 'C'), L(74, 'C')), 'Contract fidelity 70.0, grade C. Baseline 74.0, grade C. ');
  assert.equal(C.verdictPrefix(L(null, null), L(81.25, 'B')), 'Contract fidelity: no score. Baseline 81.3, grade B. ');
  assert.equal(C.verdictFidelityNull(L(81.25, 'B')), 'Fidelity has no score for this page, because too few of your checks could run. The baseline is 81.3, grade B.');
  assert.equal(C.VERDICT_UNREACHABLE, 'Could not read this site, so neither number has a score. Your contract was read and is valid.');
});

// ── 3. Request errors ──
check('429', () => {
  assert.deepEqual(C.requestError({ status: 429, retryAfter: 1 }, 'a.com'), { title: 'Too many runs', message: 'Too many runs from this network. Try again in 1 second.' });
  assert.equal(C.requestError({ status: 429, retryAfter: 42 }, 'a.com').message, 'Too many runs from this network. Try again in 42 seconds.');
  assert.equal(C.requestError({ status: 429 }, 'a.com').message, 'Too many runs from this network. Try again in a minute.');
});
check('413 keeps the engine sentence', () => {
  const s = 'This contract is 300 KB. Scoring reads contracts up to 256 KB. Remove unused tokens or score part of it.';
  assert.deepEqual(C.requestError({ status: 413, error: s }, 'a.com'), { title: 'Contract too large', message: s });
});
check('400 scope conflict, 502, network', () => {
  assert.equal(C.requestError({ status: 400, code: 'scope_conflict' }, 'a.com').title, 'Not run');
  assert.deepEqual(C.requestError({ status: 502, error: 'The site timed out.' }, 'acme.dev/pricing'), { title: 'Could not reach acme.dev/pricing', message: 'The site timed out.' });
  assert.deepEqual(C.requestError({ status: 0 }, 'a.com'), { title: 'Could not reach the scoring server', message: 'Check your connection and run it again. Nothing was scored.' });
});

// ── 4. Inputs and running ──
check('read as', () => {
  assert.deepEqual(C.readAs('---\ncolors:\n  a: "#000"\n---'), { label: 'Read as DESIGN.md (alpha)', known: true });
  assert.deepEqual(C.readAs('{"$schema":"https://www.designtokens.org/schemas/2025.10/format.json"}'), { label: 'Read as DTCG tokens (2025.10)', known: true });
  assert.deepEqual(C.readAs('plain words'), { label: 'Format not recognized yet', known: false });
  assert.equal(C.readAs('   '), null);
});
check('sizes and addresses', () => {
  assert.equal(C.kb(8192), '8.0 KB');
  assert.equal(C.fileTooLarge(300 * 1024), 'This contract is 300 KB. The limit is 256 KB.');
  assert.equal(C.overLimit(256 * 1024), false);
  assert.equal(C.overLimit(256 * 1024 + 1), true);
  assert.equal(C.looksLikeSite('staging.example.com/pricing'), true);
  assert.equal(C.looksLikeSite('localhost'), false);
  assert.equal(C.looksLikeContractUrl('http://a.com/DESIGN.md'), false);
  assert.equal(C.looksLikeContractUrl('https://a.com/DESIGN.md'), true);
  assert.equal(C.siteKey('https://acme.dev/pricing/'), 'acme.dev/pricing');
});
check('steps run and resolve together', () => {
  assert.deepEqual(C.steps('a.com', 'running').map((s) => s.state), ['running', 'running', 'running', 'running']);
  assert.deepEqual(C.steps('a.com', 'done').map((s) => s.state), ['done', 'done', 'done', 'done']);
  assert.equal(C.steps('a.com', 'running')[1].text, 'a.com');
});

// ── 5. No typed versions or counts in the page's source ──
check('no version or count literals', () => {
  const dir = path.join(APP, 'app', 'score', 'contract');
  for (const f of fs.readdirSync(dir).filter((n) => /\.(tsx?|css)$/.test(n))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/\bv0\.4\.\d/.test(src), `${f} types a contract version`);
    assert.ok(!/(['"`]|engine )1\.\d+\.\d+/.test(src), `${f} types an engine version`);
    assert.ok(!/\b(30|32|34|14|16|18) checks\b/.test(src), `${f} types a check count`);
  }
});

if (failures.length) {
  console.error(`[contract-copy] FAIL: ${failures.length} of ${passed + failures.length} assertions`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`[contract-copy] PASS: ${passed} assertions on app/score/contract/copy.ts${BREAK ? ' (--break did not fail: the gate cannot see the defect)' : ''}`);

