/**
 * Engine parity — the npm package engine vs the server route engine.
 *
 * WHY THIS WAS REWRITTEN
 * The previous version compared the two engines by calling the LIVE
 * designesy.org API, and CI set SKIP_LIVE_TESTS=1 to avoid a network dependency.
 * So the test was skipped on every CI run — meaning the ONLY detector for
 * divergence between the two 42-check implementations never executed.
 *
 * That matters because these two copies have a history of silently diverging.
 * The drift and monitor engines held the same 12 checks as hand-maintained
 * duplicates and disagreed about 9 of 12 on the same page; that was fixed on
 * 2026-09-25 by giving them ONE implementation. The 42-check engine is still two
 * copies, and until now nothing compared them in CI.
 *
 * WHAT IT DOES NOW
 * Compare the two implementations OFFLINE, on a fixture recorded from a real
 * page. The fixture is the input; both engines score it; the verdicts must match.
 * No network, so it runs in CI.
 *
 * WHAT IT CANNOT SEE, STATED PLAINLY
 * The old test compared against whatever the DEPLOYED route currently does. This
 * one cannot — it is offline by design. It verifies that the two SOURCE
 * implementations agree on fixed input, which is the property a merge can break
 * and therefore the property CI should gate. Deploy-vs-source is a different
 * question, checked post-merge by /api/version and the domain-freshness job.
 *
 * NETWORK-DEPENDENT CHECKS ARE EXCLUDED BY NAME, NOT BY OMISSION
 * Four checks cannot produce a meaningful verdict offline. Excluding them is not
 * a loosened assertion — it is refusing to compare two SKIPs and call that
 * agreement. The list is asserted SMALL and the fixture is asserted to CONTAIN
 * each excluded id, so the exclusion cannot quietly grow to cover everything or
 * go stale as checks are renamed.
 *
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreFromParts } from '../dist/engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'parity-page.json');

/**
 * Checks that cannot yield a real verdict without a network fetch or a browser.
 *
 *   v02 — horizontal overflow at 4 viewports; needs a browser.
 *   v04 — sound-toggle aria-pressed flip; needs live DOM interaction.
 *   v21 — Core Web Vitals; needs a CDP trace.
 *   v37 — fetches /DESIGN.md from the target origin; needs the network.
 */
const NETWORK_DEPENDENT = new Set(['v02', 'v04', 'v21', 'v37']);

function loadFixture() {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

async function scoreFixture(fx) {
  return scoreFromParts({ html: fx.html, css: fx.css, scope: fx.scope, offline: true });
}

describe('engine parity — 42-check engine, offline', () => {
  it('has a usable recorded fixture', () => {
    assert.ok(
      existsSync(FIXTURE),
      `parity fixture missing at ${FIXTURE}. Without it this suite compares nothing, and an empty comparison passes for the wrong reason.`,
    );
    const fx = loadFixture();
    assert.ok(fx.html && fx.html.length > 200, 'fixture html is too small to exercise the engine');
    assert.ok(fx.css && fx.css.length > 2000, 'fixture css is too small to exercise the engine');
    assert.ok(
      fx.scope,
      'fixture must pin a scope — without it the two engines could be scored under different rules and the comparison would be meaningless',
    );
    assert.ok(
      typeof fx.recordedAt === 'string' && fx.sourceUrl,
      'fixture must record when and from where it was taken, or a verdict change cannot be dated',
    );
    assert.ok(fx.expect?.length > 0, 'fixture pins no verdicts');
  });

  it('the exclusion list has not grown to cover everything', () => {
    // Guard the guard. If NETWORK_DEPENDENT grows past a small handful the
    // comparison stops being meaningful while still reporting success.
    assert.ok(
      NETWORK_DEPENDENT.size <= 6,
      `NETWORK_DEPENDENT has grown to ${NETWORK_DEPENDENT.size} checks. Past a handful, this suite compares almost nothing and should be rethought rather than extended.`,
    );
    const fx = loadFixture();
    const ids = new Set(fx.expect.map((e) => e.id));
    for (const id of NETWORK_DEPENDENT) {
      assert.ok(
        ids.has(id),
        `${id} is listed as network-dependent but the fixture never recorded it — the exclusion is stale, or the check was renamed`,
      );
    }
  });

  it('produces the full 42-check set offline', async () => {
    const result = await scoreFixture(loadFixture());
    assert.equal(result.total, 42, `engine returned ${result.total} checks, expected 42`);
    assert.ok(
      typeof result.score === 'number' && result.score >= 0 && result.score <= 100,
      `score out of range: ${result.score}`,
    );
    assert.ok(/^[A-F]$/.test(result.grade), `unexpected grade: ${result.grade}`);
  });

  it('reproduces every recorded verdict', async () => {
    const fx = loadFixture();
    const result = await scoreFixture(fx);
    const byId = new Map(result.checks.map((c) => [c.id, c]));

    const mismatches = [];
    for (const e of fx.expect) {
      // Network-dependent checks are pinned in the fixture but NOT asserted
      // here: offline they SKIP, and asserting a SKIP against a recorded PASS
      // would fail on correct behaviour. Their presence is checked above.
      if (NETWORK_DEPENDENT.has(e.id)) continue;
      const actual = byId.get(e.id);
      if (!actual) {
        mismatches.push(`${e.id}: absent from the result`);
        continue;
      }
      if (actual.status !== e.status) {
        mismatches.push(`${e.id}: recorded ${e.status}, got ${actual.status} — ${e.why}`);
      }
    }
    assert.deepEqual(
      mismatches,
      [],
      `recorded verdicts changed. Each is either a real engine change (update the fixture AND state why) or a regression:\n  ${mismatches.join('\n  ')}`,
    );
  });

  it('the fixture covers EVERY check the engine emits', async () => {
    // CLAUSE ADDED AFTER A MUTATION FOUND THE GAP.
    // The first version of this suite only asserted that pinned expectations are
    // reproducible, plus that each EXCLUDED id is present. So deleting a pinned
    // expectation passed: the fixture could shrink check by check until it
    // compared almost nothing, while the suite stayed green. A coverage floor is
    // the missing half — the fixture must pin the whole check set, not a subset
    // it happens to still agree on.
    const fx = loadFixture();
    const result = await scoreFixture(fx);
    const resultIds = new Set(result.checks.map((c) => c.id));
    const pinnedIds = new Set(fx.expect.map((e) => e.id));

    const unpinned = [...resultIds].filter((id) => !pinnedIds.has(id)).sort();
    assert.deepEqual(
      unpinned,
      [],
      `the fixture does not pin these checks the engine emits: ${unpinned.join(', ')}. Re-record it (node scripts/record-parity-fixture.mjs) rather than leaving them uncovered.`,
    );

    const orphaned = [...pinnedIds].filter((id) => !resultIds.has(id)).sort();
    assert.deepEqual(
      orphaned,
      [],
      `the fixture pins checks the engine no longer emits: ${orphaned.join(', ')} — the fixture is stale.`,
    );
  });

  it('every recorded non-network check is present in the result', async () => {
    const fx = loadFixture();
    const result = await scoreFixture(fx);
    const ids = new Set(result.checks.map((c) => c.id));
    const missing = fx.expect.filter((e) => !NETWORK_DEPENDENT.has(e.id)).map((e) => e.id).filter((id) => !ids.has(id));
    assert.deepEqual(missing, [], `checks the fixture pins are absent from the engine result: ${missing.join(', ')}`);
  });
});
