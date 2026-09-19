/**
 * Calibration corpus test — asserts pinned verdicts for every fixture.
 *
 * Runs fully offline. No network, no live API, so it is safe in CI and does not
 * depend on designesy.org being up or on any third-party site's availability.
 *
 * What a failure here means: a check changed behavior for a known input. That
 * is either a regression (fix the check) or an intentional change (update the
 * pin AND its `why`). It is never correct to update a pin without stating why
 * the new verdict is right — an unexplained pin is how a corpus quietly becomes
 * a change-detector that agrees with whatever the engine now does.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCorpus } from './fixtures/run.mjs';
import { FIXTURES } from './fixtures/corpus.mjs';

describe('calibration corpus — known-answer fixtures', () => {
  it('has at least one deliberately-broken fixture', () => {
    // Guards the corpus's own value. A corpus of only well-formed pages proves
    // the engine can say PASS; it cannot catch a check that stopped detecting.
    const broken = FIXTURES.filter((f) => f.name.startsWith('broken-'));
    assert.ok(
      broken.length >= 3,
      `expected >= 3 broken fixtures, found ${broken.length} — a corpus with no negative cases cannot catch detection regressions`,
    );
  });

  it('every fixture states what it stands in for and why each verdict is expected', () => {
    for (const f of FIXTURES) {
      assert.ok(f.referent && f.referent.length > 20, `${f.name}: missing or too-short referent`);
      // fetchOnly fixtures carry expectUnreachable instead of pinned verdicts —
      // they assert a whole-result shape, not individual check statuses.
      if (f.fetchOnly) {
        assert.ok(f.expectUnreachable && f.expectUnreachable.why && f.expectUnreachable.why.length > 20,
          `${f.name}: fetch-only fixture must state why it is expected`);
        continue;
      }
      assert.ok(f.expect.length > 0, `${f.name}: pins no verdicts`);
      for (const e of f.expect) {
        assert.ok(e.why && e.why.length > 20, `${f.name}/${e.id}: expectation has no stated reason`);
      }
    }
  });

  it('every fixture scores offline and produces the full check set', async () => {
    const offlineCount = FIXTURES.filter((f) => !f.fetchOnly).length;
    const rows = await runCorpus();
    assert.equal(rows.length, offlineCount, 'a fixture failed to score');
    for (const { fixture, result } of rows) {
      assert.equal(result.total, 42, `${fixture.name}: expected 42 checks, got ${result.total}`);
      assert.ok(
        typeof result.score === 'number' && result.score >= 0 && result.score <= 100,
        `${fixture.name}: score out of range (${result.score})`,
      );
    }
  });

  it('reproduces every pinned verdict', async () => {
    const rows = await runCorpus();
    const failures = [];
    for (const { fixture, byId } of rows) {
      for (const e of fixture.expect) {
        const actual = byId.get(e.id);
        if (!actual) {
          failures.push(`${fixture.name}: check ${e.id} absent from the result`);
          continue;
        }
        if (actual.status !== e.status) {
          failures.push(
            `${fixture.name}: ${e.id} expected ${e.status}, got ${actual.status}\n` +
              `      pinned because: ${e.why}\n` +
              `      engine detail:  ${actual.detail}`,
          );
        }
      }
    }
    assert.equal(
      failures.length,
      0,
      `pinned verdicts did not reproduce:\n  - ${failures.join('\n  - ')}\n\n` +
        'Fix the check if the new behavior is wrong; if the change was intentional, ' +
        'update the pin AND its `why` to state why the new verdict is correct.',
    );
  });

  it('keeps each score inside its declared bounds', async () => {
    const rows = await runCorpus();
    const failures = [];
    for (const { fixture, result } of rows) {
      if (!fixture.scoreBetween) continue;
      const [lo, hi] = fixture.scoreBetween;
      if (result.score < lo || result.score > hi) {
        failures.push(`${fixture.name}: score ${result.score} outside [${lo}, ${hi}]`);
      }
    }
    assert.equal(failures.length, 0, `score bounds violated:\n  - ${failures.join('\n  - ')}`);
  });

  it('separates well-formed from broken fixtures by score', async () => {
    // The corpus's headline claim: the engine ranks a conforming page above a
    // broken one. If this inverts, the engine is not measuring what it says.
    const rows = await runCorpus();
    const good = rows.find((r) => r.fixture.name === 'good-baseline');
    const empty = rows.find((r) => r.fixture.name === 'edge-empty-page');
    const noTokens = rows.find((r) => r.fixture.name === 'broken-no-tokens');
    assert.ok(good && empty && noTokens, 'baseline fixtures missing');
    assert.ok(
      good.result.score > empty.result.score,
      `good-baseline (${good.result.score}) must outscore edge-empty-page (${empty.result.score})`,
    );
    assert.ok(
      good.result.score > noTokens.result.score,
      `good-baseline (${good.result.score}) must outscore broken-no-tokens (${noTokens.result.score})`,
    );
  });
});

/**
 * Fetch-path fixtures — the unreachable-target case.
 *
 * Separate from the offline matrix above because these need a real host. What
 * they protect: the engine must never produce a numeric grade for a page it did
 * not read. That defect shipped once — blocked sites were scored 61.5/D against
 * a placeholder document — so it gets a permanent guard rather than a one-time
 * verification.
 */
describe('unreachable targets are never graded', () => {
  it('returns no score for a domain that does not resolve', async () => {
    const { scoreUrl } = await import('../dist/engine.js');
    const r = await scoreUrl('https://designesy-nonexistent-probe-xyz987.invalid', { scope: 'universal' });
    assert.equal(r.score, null, 'a target we cannot read must not receive a numeric score');
    assert.equal(r.grade, null);
    assert.equal(r.unreachable, true);
    assert.ok(
      ['http_error', 'timeout', 'network', 'empty_body'].includes(r.unreachableReason),
      `unexpected reason: ${r.unreachableReason}`,
    );
    assert.equal(r.checks.length, 0, 'no check can have run against an unfetched page');
    assert.ok(typeof r.unreachableDetail === 'string' && r.unreachableDetail.length > 20, 'the result must explain why');
    assert.ok(Array.isArray(r.attemptedUrls) && r.attemptedUrls.length > 0, 'the result must list what was tried');
  });

  it('still grades a reachable page, so the guard is not blanket', async () => {
    const { scoreUrl } = await import('../dist/engine.js');
    const r = await scoreUrl('https://example.com', { scope: 'universal' });
    assert.equal(r.unreachable, undefined, 'example.com is reachable; the unreachable guard must not fire');
    assert.equal(typeof r.score, 'number');
  });
});
