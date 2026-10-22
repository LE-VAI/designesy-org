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
 * THE COPY
 * A test hashes every file under format/ the way git does (line endings as LF)
 * and compares the list with FORMAT_DIGEST, so a fixture that is removed,
 * replaced or edited fails here even when the counts still match. Two more
 * tests check that no two manifest tests share an input and that the inputs
 * are exactly the files under format/ besides manifest.json.
 *
 * UPDATING THE SUITE
 * Replace format/ with the same directory from a newer upstream commit. Set
 * SUITE_COMMIT, FORMAT_DIGEST and the counts in SIDES below, and the commit in
 * the pinned-commit line and the tree URL of LICENSE.md (a test checks both).
 * FORMAT_DIGEST is the sha256 of the lines "<blob id> <path under format/>",
 * one per file, sorted bytewise, each ending in a newline. From upstream:
 *   git ls-tree -r <commit> test-suite/tests/2025.10/format \
 *     | awk '{print $3, substr($4, 33)}' | LC_ALL=C sort | sha256sum
 * Run npm test, edit known-gaps.json until it names exactly the ids the
 * failures print, and recount the fixtures named under VERDICTS, NOT REASONS.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// sha256 of the sorted "<blob id> <path>" lines for format/ at SUITE_COMMIT
// (see THE COPY and UPDATING THE SUITE above).
const FORMAT_DIGEST = 'd6933c41ac61e57837bfb99904b0ccc1682da9f8ecbfec4a8b3f03521ede5db6';

// Every file under format/ as "<git blob id> <path relative to format/>",
// sorted. The blob id is computed from the content with CRLF read as LF, as
// git stores it, so a checkout with Windows line endings hashes the same.
function formatBlobs() {
  const lines = [];
  (function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${rel}/`);
      } else {
        const lf = Buffer.from(readFileSync(join(dir, entry.name)).toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
        const blob = createHash('sha1').update(`blob ${lf.length}\0`).update(lf).digest('hex');
        lines.push(`${blob} ${rel}`);
      }
    }
  })(fileURLToPath(new URL('./format/', import.meta.url)), '');
  return lines.sort();
}

const blobs = formatBlobs();

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

  it('no two tests share an input file', () => {
    const shared = manifest.tests.filter((t, i) => manifest.tests.findIndex((u) => u.input === t.input) !== i);
    assert.deepEqual(shared.map((t) => `${t.id}: ${t.input}`), [], 'tests whose input an earlier test already uses');
  });

  it('the inputs are exactly the files under format/ besides manifest.json', () => {
    const files = blobs.map((line) => line.slice(line.indexOf(' ') + 1)).filter((p) => p !== 'manifest.json').sort();
    assert.deepEqual([...new Set(manifest.tests.map((t) => t.input))].sort(), files);
  });

  it(`format/ is the upstream copy at ${SUITE_COMMIT.slice(0, 7)}: its file list hashes to FORMAT_DIGEST`, () => {
    const digest = createHash('sha256').update(blobs.map((line) => `${line}\n`).join('')).digest('hex');
    assert.equal(
      digest,
      FORMAT_DIGEST,
      `format/ (${blobs.length} files) differs from the copy FORMAT_DIGEST records. Compare git ls-files -s of format/ with git ls-tree -r ${SUITE_COMMIT} test-suite/tests/2025.10/format upstream.`,
    );
  });

  it('LICENSE.md names SUITE_COMMIT, and no other commit, in the pinned-commit line and in the tree URL line', () => {
    const lines = readFileSync(new URL('./LICENSE.md', import.meta.url), 'utf-8').split(/\r?\n/);
    // A commit is any run of 7 or more hex digits that no other hex digit
    // borders. A short hash counts, and so does a hash right after a letter or
    // an underscore, such as the g0000000 in a git describe name.
    const commits = (line) => line.match(/(?<![0-9a-f])[0-9a-f]{7,}(?![0-9a-f])/gi) ?? [];
    // Both places are found ignoring case, so a second "Pinned at commit" line,
    // or a second tree URL spelled GitHub.com, counts as a second place.
    const pinned = /pinned\s+at\s+commit/i;
    const treeUrl = /github\.com\/design-tokens\/community-group\/tree\//i;
    // Each place must be one line that names SUITE_COMMIT once, in the
    // backticks or as the URL's commit segment, and names no other commit. A
    // place that is missing, repeated or names another commit fails, wherever
    // else the file names SUITE_COMMIT.
    const places = {
      pinnedCommitLine: lines
        .filter((l) => pinned.test(l))
        .map((l) => ({ backticked: l.match(/pinned\s+at\s+commit\s+`([^`]*)`/i)?.[1] ?? null, commits: commits(l) })),
      treeUrlLine: lines
        .filter((l) => treeUrl.test(l))
        .map((l) => ({ urlCommits: l.split(treeUrl).slice(1).map((s) => s.split(/[/\s]/)[0]), commits: commits(l) })),
    };
    assert.deepEqual(
      places,
      {
        pinnedCommitLine: [{ backticked: SUITE_COMMIT, commits: [SUITE_COMMIT] }],
        treeUrlLine: [{ urlCommits: [SUITE_COMMIT], commits: [SUITE_COMMIT] }],
      },
      `LICENSE.md must have one pinned-commit line and one tree URL line, each naming ${SUITE_COMMIT} once and no other commit`,
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

    // Counts the listed ids that are manifest ids of this kind: the ones it checks.
    it(`all ${[...gapSet].filter((id) => byId.has(id)).length} ids in ${side.gapsKey} are still ${side.wrong}`, () => {
      const fixed = [...gapSet].filter((id) => byId.has(id) && byId.get(id).result.valid === side.valid);
      assert.deepEqual(
        fixed,
        [],
        `now ${side.verdict}, so delete from known-gaps.json ${side.gapsKey}: ${fixed.join(', ')}`,
      );
    });
  });
}
