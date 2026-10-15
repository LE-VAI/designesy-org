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
 *   6. The result: f02's line from its counts (equal to the engine's own
 *      builder, and counting colours cut from the list), the readout count
 *      lines, grades and lamps, the cap, gaps and leaderboard flags, the first
 *      finding and its declared and shipped pair (ratios never rounded across
 *      a band), the weight and criterion lines, the list sub-lines, filters
 *      and announcements, the W7 why line, the W8 and W9 cards, and the
 *      receipt (digest groups, the copied text, the file name).
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

// ── 6. The result: readouts, flags, first finding, lists, receipt ──
const T = { sharePassAt: 0.9, contrastPass: 4.5, contrastLargePass: 3, contrastFailBelow: 3 };
const ENG = h.load('app/lib/own-contract/checks/f02.ts');
check('f02 line built from the counts, as the engine writes it (R3-07): one and two colours outside', () => {
  assert.equal(C.paletteLine(20, ['#7DA4FF'], 0.9), '19 of 20 shipped colors are in your palette (90% needed to pass). Outside it: #7DA4FF');
  assert.equal(C.paletteLine(20, ['#7DA4FF'], 0.9), ENG.paletteLine(20, ['#7DA4FF'], 0.9));
  assert.equal(C.paletteLine(6, ['#a', '#b'], 0.9), '4 of 6 shipped colors are in your palette (90% needed to pass). Outside it: #a, #b');
  assert.equal(C.paletteLine(6, ['#a', '#b'], 0.9), ENG.paletteLine(6, ['#a', '#b'], 0.9));
  assert.equal(C.paletteLine(3, [], 0.9), '3 of 3 shipped colors are in your palette (90% needed to pass).');
});
check('f02 line past the 20-colour list counts the colours cut from it', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `#${String(i).padStart(6, '0')}`);
  assert.ok(C.paletteLine(34, twenty, 0.9, 13).startsWith('1 of 34 shipped colors is in your palette'));
  assert.ok(C.paletteLine(34, twenty, 0.9, 13).endsWith(' and 13 more'));
});
check('readout count lines, scored and with no score', () => {
  assert.deepEqual(C.countLine({ scored: 9, total: 14 }), { k: '9', rest: ' of 14 checks scored' });
  assert.deepEqual(C.countLine({ scored: 1, total: 14 }, true, 3), { k: '1', rest: ' of 14 checks scored; at least 3 are needed' });
});
check('grades on the engine bands', () => {
  assert.deepEqual([89.9, 90, 84.7, 70, 69.9, 59.9].map(C.gradeOf), ['B', 'A', 'B', 'C', 'D', 'F']);
  assert.deepEqual(['A', 'B', 'C', 'D', 'F'].map(C.gradeLamp), ['PASS', 'PASS', 'WARN', 'WARN', 'FAIL']);
});
check('cap flag from the run: ceiling, the engine reason, the uncapped score and its grade', () => {
  const f = { score: 70, grade: 'C', scored: 9, total: 14, ceilingApplied: true, ceilingReason: 'Your primary action pair is 1.2 to 1 on shipped values, under 3 to 1.', uncappedScore: 84.7 };
  assert.deepEqual(C.capFlag(f), { lead: 'Capped at 70.', text: 'Your primary action pair is 1.2 to 1 on shipped values, under 3 to 1. Without the cap: 84.7, grade B.' });
  assert.equal(C.capFlag({ ...f, ceilingApplied: false }), null);
});
check('gaps flag: both clauses, and a zero clause left out', () => {
  const sk = (id, r) => ({ id, status: 'SKIP', skipReason: r });
  assert.equal(C.gapsFlag([sk('f06', 'not_declared'), sk('f11', 'not_applicable'), sk('f07', 'not_located'), { id: 'f02', status: 'PASS' }], 11).text,
    'Font features not declared and motion does not apply, so 2 checks did not run, and 1 found too little on this page. Fidelity covers the 11 that ran.');
  assert.equal(C.gapsFlag([sk('f13', 'not_declared')], 13).text, 'Aliases not declared, so 1 check did not run. Fidelity covers the 13 that ran.');
  assert.equal(C.gapsFlag([sk('f07', 'not_declared'), sk('f08', 'not_declared'), sk('f11', 'not_declared')], 9).text, 'Radius not declared, spacing not declared and motion not declared, so 3 checks did not run. Fidelity covers the 9 that ran.');
  assert.equal(C.gapsFlag([sk('f07', 'not_located'), sk('f08', 'not_located')], 12).text, '2 checks found too little on this page. Fidelity covers the 12 that ran.');
  assert.equal(C.gapsFlag([{ id: 'f02', status: 'PASS' }], 14), null);
});
check('leaderboard note carries the baseline count', () => {
  assert.equal(`${C.leaderboardFlag(18).lead} ${C.leaderboardFlag(18).text}`, "Baseline differs from this page's leaderboard number: it runs 18 universal checks and leaves out Designesy's own checks, slop and originality.");
});
check('first finding: the first failure, else the first that needs work, else none', () => {
  const s = (id, status) => ({ id, status });
  assert.equal(C.firstFindingOf([s('f01', 'WARN'), s('f02', 'PASS'), s('f10', 'FAIL')]).id, 'f10');
  assert.equal(C.firstFindingOf([s('f01', 'PASS'), s('f03', 'WARN')]).id, 'f03');
  assert.equal(C.firstFindingOf([s('f01', 'PASS')]), null);
});
check('ratios never round across a band (4.48 is not 4.5) and the fix names the ratio the pair needs', () => {
  assert.equal(C.fmtRatio(4.48, T), '4.48');
  assert.equal(C.fmtRatio(2.97, T), '2.97');
  assert.equal(C.fmtRatio(1.21, T), '1.2');
  const c = { id: 'f10', status: 'FAIL', declared: [{ path: 'colors.on', value: '#010102' }, { path: 'colors.bg', value: '#0A94FF' }], shipped: [{ path: 'colors.on', value: '#36A7FF', where: ['--on'] }, { path: 'colors.bg', value: '#0A94FF', where: ['--bg'] }], evidence: { findings: [{ source: 'components.button-primary', ratio: 1.21, need: 4.5, declaredRatio: 6.65 }] } };
  const p = C.pairFinding(c, T);
  assert.equal(p.detail, "The shipped label color on button-primary takes the pair to 1.2 to 1. Your contract's own pair is 6.7 to 1. The check needs 4.5 to 1.");
  assert.equal(p.shipped.where, '--on on --bg');
  assert.deepEqual(p.parts.map((x) => x.length > 0), [true, true, true]);
  assert.equal(p.parts[1], 'button-primary');
  const large = C.pairFinding({ ...c, evidence: { findings: [{ source: 'components.hero', ratio: 2.4, need: 3, declaredRatio: 2.4 }] }, shipped: c.declared }, T);
  assert.equal(large.detail, "The shipped label and fill on hero take the pair to 2.4 to 1. Your contract's own pair is 2.4 to 1. The check needs 3 to 1.");
});
check('weight and criterion lines (A-CP-6)', () => {
  assert.equal(C.fidelityWeight('Typography', 18), 'Typography, 18 of 100 in the fidelity score, shared by the scored checks in its category');
  assert.equal(C.baselineWeight('Accessibility', 15, 57, false), 'Accessibility, 15 of 57 in the static score');
  assert.equal(C.baselineWeight('Responsive', 3, 57, true), 'Responsive, left out of the static score');
  assert.equal(C.fidelityCriterion('Derived from v06', '9.9.9'), 'Derived from v06 · engine 9.9.9');
  assert.equal(C.baselineCriterion(':focus-visible declared in CSS', 'v9.9.9'), ':focus-visible declared in CSS · baseline rules v9.9.9');
});
check('list sub-lines, filters and their announcements ("Not scored", R31-04)', () => {
  assert.equal(C.fidelitySub(14, 9, false), '14 checks · 9 scored · each reads a field of your contract');
  assert.equal(C.fidelitySub(14, 1, true, 3), '14 checks · 1 scored · at least 3 are needed for a score');
  assert.equal(C.baselineSub(18, 16), '18 universal checks · 16 scored · they read no contract');
  assert.equal(C.filterSaid('needs', 3), 'Showing 3 checks that need work.');
  assert.equal(C.filterSaid('needs', 1), 'Showing 1 check that needs work.');
  assert.equal(C.filterSaid('notrun', 5), 'Showing 5 checks that were not scored.');
  assert.equal(C.filterSaid('passed', 2), 'Showing 2 checks that passed.');
  assert.equal(C.filterSaid('all', 14), 'Showing all 14 checks.');
  assert.equal(C.showPassing(1), 'Show 1 passing check');
  assert.equal(C.showMore(9), 'Show 9 more checks');
});
check('why fidelity has no score (W7) from coverage', () => {
  const cov = { declared: 5, located: 0, byMap: 0, byName: 0, byValue: 0, groups: { colors: { declared: 3, located: 0, shippedCompared: 2 }, spacing: { declared: 2, located: 0, shippedCompared: 0 } } };
  assert.equal(C.whyLine(cov), 'Located 0 of 5 declared tokens. This page shows 2 colors and no spacing values the engine can compare.');
});
check('empty runs (W8, W9): titles, the stylesheet counts, the actions', () => {
  assert.equal(C.emptyRun('empty_shell', {}).title, 'This page builds itself in the browser');
  assert.equal(C.emptyRun('no_css', { stylesheetsTotal: 1, stylesheetsFetched: 0 }).reason, 'The engine found the page but no CSS it could read (1 stylesheet linked, 0 fetched). No score is reported for either number.');
  // The engine reads inline <style> blocks as well as linked stylesheets, so
  // the advice names both; `<style>` renders as code.
  assert.deepEqual(C.emptyRun('no_css', {}).todo, ['Score a page whose HTML carries its styles, in a linked stylesheet or a `<style>` block.', 'If your styles load with JavaScript, score a page your server renders with its CSS in place.']);
  assert.equal(C.emptyRun('site_unreachable', { detail: 'Could not read x.' }).reason, 'Could not read x.');
  assert.equal(C.emptyRun('site_unreachable', {}).action, 'Try again');
  assert.equal(C.contractOk('Studio', 16), 'Your contract was read and is valid: Studio, 16 tokens. It is still in the form above.');
});
check('receipt: digests in groups of 8, the copied text, the file name', () => {
  assert.equal(C.groups8('0123456789abcdef01'), '01234567 89abcdef 01');
  const l = (s, g, k, n) => ({ score: s, grade: g, scored: k, total: n });
  const text = C.receiptText({ site: 'https://a.com/', name: 'Acme', format: 'DESIGN.md', contractDigest: 'a'.repeat(64), verdictDigest: 'b'.repeat(64), fidelity: l(70, 'C', 9, 14), baseline: l(100, 'A', 16, 18), coverage: { declared: 10, located: 8, byMap: 1, byName: 2, byValue: 5, groups: {} }, failing: [{ id: 'f10', title: 'Your primary action pair meets contrast on shipped values', value: '1.2 to 1' }, { id: 'v03', title: 'Interactive elements show focus-visible rings' }], engineVersion: '9.9.9', contractVersion: 'v9.9.9', linter: { package: '@google/design.md', version: '0.4.0', errors: 0, warnings: 1 }, retrievedAt: '2026-10-15T00:16:50.566Z' });
  assert.equal(text, ['Designesy contract check', 'Site: https://a.com/', 'Your contract: Acme (DESIGN.md), sha256 aaaaaaaa...aaaa', 'Contract fidelity: 70.0 /100 (C), 9 of 14 checks scored', 'Baseline: 100.0 /100 (A), 16 of 18 checks scored', 'Coverage: 8 of 10 declared tokens located (5 by value, 3 by name)', 'Failing: f10 Your primary action pair meets contrast on shipped values, 1.2 to 1; v03 Interactive elements show focus-visible rings', 'Verdict digest: bbbbbbbb...bbbb', 'Engine: 9.9.9, baseline rules v9.9.9, linter @google/design.md 0.4.0', 'Read at: 2026-10-15T00:16:50Z'].join('\n'));
  assert.equal(C.downloadName('www.acme.com/pricing', new Date(2026, 9, 14, 20, 5)), 'designesy-acme.com-20261014-2005.json');
  assert.equal(C.failingLine([]), 'Failing: none');
  assert.equal(`${C.REVIEW_LINE.lead} ${C.REVIEW_LINE.link}`, 'Want a person to walk your team through this? The Review →');
  assert.equal(C.REVIEW_LINE.href, '/pricing/review');
  assert.equal(C.failingValue({ id: 'f10', status: 'FAIL', evidence: { findings: [{ ratio: 2.44 }] } }, T), '2.4 to 1');
  assert.equal(C.failingValue({ id: 'f03', status: 'FAIL' }, T), undefined);
  assert.ok(C.shareNote('pasted').startsWith('No share link for this result. You pasted your contract'));
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

