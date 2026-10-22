/**
 * @designesy/tokens: the official DTCG 2025.10 format test suite.
 *
 * Run:  npm test
 * (Requires `npm run build` first; the pretest hook does it.)
 *
 * format/ is the Design Tokens Community Group's conformance suite, copied
 * unmodified from design-tokens/community-group at the commit SUITE_COMMIT
 * names below (source and licence in ./LICENSE.md). format/manifest.json lists
 * PositiveEvaluationTest fixtures, which a conforming validator accepts, and
 * NegativeEvaluationTest fixtures, which it rejects. Here "accepts" means
 * validateTokens() returns valid: true, that is, no check FAILs.
 *
 * KNOWN GAPS
 * known-gaps.json lists the fixtures the validator gets wrong today, measured
 * by running every fixture through this build:
 *   positiveRejected  positive fixtures it rejects
 *   negativeAccepted  negative fixtures it accepts
 * Each list must equal the measured set exactly, in manifest order. This file
 * fails when
 *   - a fixture that is not listed gets the wrong verdict,
 *   - a listed fixture now gets the right verdict (delete its id),
 *   - a listed id is not a manifest id of that kind, or is listed twice (a
 *     typo would excuse nothing and go unnoticed), or
 *   - a list is not in manifest order.
 * This does not stop the lists from growing: a change that breaks a fixture
 * passes if it also adds that id to known-gaps.json. It does make every new gap
 * an explicit edit to known-gaps.json that shows up in review, and it keeps the
 * file equal to what the validator does. Manifest order makes the file a
 * function of the measurement alone, so a re-measured file differs from the old
 * one only where a verdict changed.
 *
 * VERDICTS, NOT REASONS
 * Only the verdict is compared, not the checks that produced it, and some
 * negative fixtures are rejected for a reason unrelated to what they test. t06
 * reports every token-level $ref as dangling: resolveRef() splits a reference
 * on '.', so it looks up a JSON Pointer such as "#/colors/blue/$value" as one
 * key. As measured when this file was written, 18 negative fixtures fail t06
 * and nothing else. 15 of them have a token-level $ref (14
 * references/json-pointer-*.json and references/ref-and-value-both-present.json)
 * and are rejected whatever the pointer says. The other 3 use curly-brace
 * references that resolve to no token (reference-nonexistent,
 * reference-to-wrong-subvalue, reference-with-spaces). 6 more json-pointer-*
 * fixtures fail t06 and t14 (t14 checks the token's own $value, which a $ref
 * token does not have). The positive reference-json-pointer-basic and
 * reference-json-pointer-subproperty fail the same way, which is why they are
 * in positiveRejected.
 * Failing check ids are not recorded per fixture. An id cannot tell a pointer
 * t06 cannot read from one that points nowhere (reference-json-pointer-basic
 * and reference-json-pointer-nonexistent both fail t06 alone), and matching the
 * detail text would break on any rewording. If pointer resolution changes, the
 * fixtures whose verdict changes fail here; the ones still rejected are not
 * re-examined.
 *
 * UPDATING THE SUITE
 * Replace format/ with the same directory from a newer upstream commit. Set
 * SUITE_COMMIT and the counts in SIDES below, and the two mentions of the
 * commit in LICENSE.md (a test checks that it names SUITE_COMMIT twice). Run
 * npm test, edit known-gaps.json until it names exactly the ids the failures
 * print, and recount the fixtures named under VERDICTS, NOT REASONS.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTokens } from '../../dist/validator.js';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'));
}

const manifest = readJson('./format/manifest.json');
const knownGaps = readJson('./known-gaps.json');

const runs = manifest.tests.map((test) => ({
  test,
  result: validateTokens(readJson(`./format/${test.input}`), test.input),
}));

// The upstream commit format/ was copied from.
const SUITE_COMMIT = '882ebd6716abef9a46d8ef5fb12e82009d6cee2e';

// Counts in format/manifest.json at SUITE_COMMIT. Pinned so a fixture lost
// while copying or updating the suite fails here instead of shrinking the test.
const SIDES = [
  { type: 'PositiveEvaluationTest', count: 93, gapsKey: 'positiveRejected', valid: true, verdict: 'accepted', wrong: 'rejected' },
  { type: 'NegativeEvaluationTest', count: 127, gapsKey: 'negativeAccepted', valid: false, verdict: 'rejected', wrong: 'accepted' },
];

function explain({ test, result }) {
  const fails = result.checks.filter((c) => c.status === 'FAIL');
  const why = fails.length > 0 ? fails.map((c) => `${c.id}: ${c.detail}`).join('; ') : 'no check FAILs';
  return `  ${test.id} (${test.input})\n    purpose: ${test.purpose}\n    validator: ${why}`;
}

describe(`DTCG 2025.10 format suite manifest at ${SUITE_COMMIT.slice(0, 7)}`, () => {
  it('every test id is unique', () => {
    const ids = manifest.tests.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  const total = SIDES.reduce((n, s) => n + s.count, 0);
  it(`every test is a ${SIDES.map((s) => s.type).join(' or ')}, ${total} in all`, () => {
    const other = manifest.tests.filter((t) => !SIDES.some((s) => s.type === t.type));
    assert.deepEqual(
      other.map((t) => `${t.id}: ${t.type}`),
      [],
      'tests of a type this file does not run (add it to SIDES or say why it is skipped)',
    );
    assert.equal(manifest.tests.length, total);
  });

  it('LICENSE.md names SUITE_COMMIT twice (the pinned commit and the tree URL)', () => {
    const licence = readFileSync(new URL('./LICENSE.md', import.meta.url), 'utf-8');
    const mentions = licence.split(SUITE_COMMIT).length - 1;
    assert.equal(
      mentions,
      2,
      `LICENSE.md names ${SUITE_COMMIT} ${mentions} time(s); it belongs in the pinned-commit line and in the tree URL`,
    );
  });

  it('known-gaps.json has exactly the two lists', () => {
    assert.deepEqual(Object.keys(knownGaps).sort(), SIDES.map((s) => s.gapsKey).sort());
  });
});

for (const side of SIDES) {
  const sideRuns = runs.filter((r) => r.test.type === side.type);
  const byId = new Map(sideRuns.map((r) => [r.test.id, r]));
  const gaps = knownGaps[side.gapsKey] ?? [];
  const gapSet = new Set(gaps);

  describe(`${side.type} fixtures (${side.count}, every one should be ${side.verdict})`, () => {
    it(`manifest lists ${side.count}`, () => {
      assert.equal(sideRuns.length, side.count);
    });

    it(`known-gaps.json ${side.gapsKey}: ${gapSet.size} distinct ids, none listed twice, each a ${side.type}`, () => {
      assert.equal(gapSet.size, gaps.length, `${side.gapsKey} lists an id twice`);
      const unknown = gaps.filter((id) => !byId.has(id));
      assert.deepEqual(unknown, [], `${side.gapsKey} names ids that are not ${side.type} ids in format/manifest.json: ${unknown.join(', ')}`);
    });

    it(`known-gaps.json ${side.gapsKey} is in manifest order`, () => {
      const inOrder = sideRuns.map((r) => r.test.id).filter((id) => gapSet.has(id));
      assert.deepEqual(
        [...gapSet].filter((id) => byId.has(id)),
        inOrder,
        `list ${side.gapsKey} in format/manifest.json order:\n${JSON.stringify(inOrder, null, 2)}`,
      );
    });

    it(`every fixture not in ${side.gapsKey} is ${side.verdict}`, () => {
      const regressions = sideRuns.filter((r) => r.result.valid !== side.valid && !gapSet.has(r.test.id));
      assert.deepEqual(
        regressions.map((r) => r.test.id),
        [],
        `${regressions.length} ${side.type} fixture(s) ${side.wrong} that are not in known-gaps.json ${side.gapsKey}:\n${regressions.map(explain).join('\n')}`,
      );
    });

    it(`all ${gaps.length} ids in ${side.gapsKey} are still ${side.wrong}`, () => {
      const fixed = gaps.filter((id) => byId.has(id) && byId.get(id).result.valid === side.valid);
      assert.deepEqual(
        fixed,
        [],
        `now ${side.verdict}, so delete from known-gaps.json ${side.gapsKey}: ${fixed.join(', ')}`,
      );
    });
  });
}
