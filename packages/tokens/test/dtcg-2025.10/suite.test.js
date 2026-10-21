/**
 * @designesy/tokens: the official DTCG 2025.10 format test suite.
 *
 * Run:  npm test
 * (Requires `npm run build` first; the pretest hook does it.)
 *
 * format/ is the Design Tokens Community Group's conformance suite, copied
 * unmodified from design-tokens/community-group at commit 882ebd6 (source and
 * licence in ./LICENSE.md). format/manifest.json lists PositiveEvaluationTest
 * fixtures, which a conforming validator accepts, and NegativeEvaluationTest
 * fixtures, which it rejects. Here "accepts" means validateTokens() returns
 * valid: true, that is, no check FAILs.
 *
 * KNOWN GAPS
 * known-gaps.json lists the fixtures the validator gets wrong today, measured
 * by running every fixture through this build:
 *   positiveRejected  positive fixtures it rejects
 *   negativeAccepted  negative fixtures it accepts
 * This file fails when
 *   - a fixture that is not listed gets the wrong verdict (a regression),
 *   - a listed fixture now gets the right verdict (delete its id, so the
 *     lists only shrink), or
 *   - a listed id is not a manifest id of that kind (a typo would excuse
 *     nothing and go unnoticed).
 *
 * UPDATING THE SUITE
 * Replace format/ with the same directory from a newer upstream commit, update
 * the commit in LICENSE.md and the counts below, run npm test, and edit
 * known-gaps.json until it names exactly the ids the failures print.
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

// Counts in format/manifest.json at 882ebd6. Pinned so a fixture lost while
// copying or updating the suite fails here instead of shrinking the test.
const SIDES = [
  { type: 'PositiveEvaluationTest', count: 93, gapsKey: 'positiveRejected', valid: true, verdict: 'accepted', wrong: 'rejected' },
  { type: 'NegativeEvaluationTest', count: 127, gapsKey: 'negativeAccepted', valid: false, verdict: 'rejected', wrong: 'accepted' },
];

function explain({ test, result }) {
  const fails = result.checks.filter((c) => c.status === 'FAIL');
  const why = fails.length > 0 ? fails.map((c) => `${c.id}: ${c.detail}`).join('; ') : 'no check FAILs';
  return `  ${test.id} (${test.input})\n    purpose: ${test.purpose}\n    validator: ${why}`;
}

describe('DTCG 2025.10 format suite manifest', () => {
  it('every test id is unique', () => {
    const ids = manifest.tests.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
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

    it(`known-gaps.json ${side.gapsKey}: ${gaps.length} distinct ids, each a ${side.type}`, () => {
      assert.equal(gapSet.size, gaps.length, `${side.gapsKey} lists an id twice`);
      const unknown = gaps.filter((id) => !byId.has(id));
      assert.deepEqual(unknown, [], `${side.gapsKey} names ids that are not ${side.type} ids in format/manifest.json: ${unknown.join(', ')}`);
    });

    it(`every fixture not in ${side.gapsKey} is ${side.verdict}`, () => {
      const regressions = sideRuns.filter((r) => r.result.valid !== side.valid && !gapSet.has(r.test.id));
      assert.deepEqual(
        regressions.map((r) => r.test.id),
        [],
        `${regressions.length} ${side.type} fixture(s) ${side.wrong} that are not in known-gaps.json ${side.gapsKey}:\n${regressions.map(explain).join('\n')}`,
      );
    });

    it(`all ${gaps.length} ids in ${side.gapsKey} are still ${side.wrong} (the list only shrinks)`, () => {
      const fixed = gaps.filter((id) => byId.has(id) && byId.get(id).result.valid === side.valid);
      assert.deepEqual(
        fixed,
        [],
        `now ${side.verdict}, so delete from known-gaps.json ${side.gapsKey}: ${fixed.join(', ')}`,
      );
    });
  });
}
