/**
 * Engine parity test — compares the npm package engine (dist/engine.js) against
 * the live server engine (designesy.org/api/score). Both should produce
 * identical scores for the same URL because the npm engine was extracted from
 * the server route.ts.
 *
 * This test hits the live designesy.org API. Gate with SKIP_LIVE_TESTS=1 to skip.
 *
 * Zero dependencies: node:test + node:assert/strict + node:https only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreUrl } from '../dist/engine.js';
import { request as httpsRequest } from 'node:https';

const SKIP_LIVE = process.env.SKIP_LIVE_TESTS === '1';
const API_URL = 'https://www.designesy.org/api/score';

/**
 * Score a URL via the live server API.
 * Returns the same shape as scoreUrl from the npm engine.
 */
function scoreViaServer(targetUrl, scope) {
  const body = JSON.stringify({ url: targetUrl, scope });
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);
    const req = httpsRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API request timed out')); });
    req.write(body);
    req.end();
  });
}

describe('Engine parity — npm engine vs live server', { skip: SKIP_LIVE }, () => {
  // Use a stable, well-known URL for parity comparison.
  // example.com is ideal: it rarely changes, has minimal CSS, and both engines
  // will produce the same set of PASS/FAIL/SKIP results.
  const TEST_URL = 'https://example.com';
  const TEST_SCOPE = 'universal';

  it('produces the same score as the live server API (within drift tolerance)', async () => {
    const [npmResult, serverResult] = await Promise.all([
      scoreUrl(TEST_URL, { scope: TEST_SCOPE }),
      scoreViaServer(TEST_URL, TEST_SCOPE),
    ]);

    // Score should match within tolerance. The npm engine is extracted from
    // the server route.ts — minor scoring drift (±5 points) is expected when
    // the server has newer check logic that hasn't been synced to the npm
    // package yet. The parity test catches STRUCTURAL drift (different check
    // IDs, different counts, different grades) via the other tests in this
    // suite. Score drift > 5 points means the engines have diverged enough
    // to require a sync.
    const npmScore = Math.round(npmResult.score * 10) / 10;
    const serverScore = Math.round(serverResult.score * 10) / 10;
    const delta = Math.abs(npmScore - serverScore);
    assert.ok(
      delta <= 5.0,
      `Score drift exceeds tolerance: npm=${npmScore}, server=${serverScore} (delta=${delta.toFixed(1)}) — sync the npm engine with the server route.ts`,
    );
  });

  it('produces the same grade as the live server API', async () => {
    const [npmResult, serverResult] = await Promise.all([
      scoreUrl(TEST_URL, { scope: TEST_SCOPE }),
      scoreViaServer(TEST_URL, TEST_SCOPE),
    ]);

    assert.equal(
      npmResult.grade,
      serverResult.grade,
      `Grade mismatch: npm=${npmResult.grade}, server=${serverResult.grade}`,
    );
  });

  it('produces the same number of checks', async () => {
    const [npmResult, serverResult] = await Promise.all([
      scoreUrl(TEST_URL, { scope: TEST_SCOPE }),
      scoreViaServer(TEST_URL, TEST_SCOPE),
    ]);

    const npmChecks = npmResult.checks?.length ?? 0;
    const serverChecks = serverResult.checks?.length ?? 0;
    assert.equal(
      npmChecks,
      serverChecks,
      `Check count mismatch: npm=${npmChecks}, server=${serverChecks}`,
    );
  });

  it('produces matching check IDs', async () => {
    const [npmResult, serverResult] = await Promise.all([
      scoreUrl(TEST_URL, { scope: TEST_SCOPE }),
      scoreViaServer(TEST_URL, TEST_SCOPE),
    ]);

    const npmIds = (npmResult.checks || []).map(c => c.id).sort();
    const serverIds = (serverResult.checks || []).map(c => c.id).sort();
    assert.deepEqual(
      npmIds,
      serverIds,
      'Check ID sets should match between npm and server engines',
    );
  });
});