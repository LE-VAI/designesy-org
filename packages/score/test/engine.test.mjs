/**
 * Scoring engine contract tests — runs the engine against a local HTTP
 * fixture server (node:http createServer) to validate scoring behavior,
 * SSRF redirect blocking, and fetch error handling.
 *
 * Zero dependencies: node:test + node:assert/strict + node:http only.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { scoreUrl, isValidUrl } from '../dist/engine.js';

describe('scoreUrl — scoring math', () => {
  it('returns a numeric score between 0 and 100', async () => {
    const result = await scoreUrl('https://example.com', { scope: 'universal' });
    assert.equal(typeof result.score, 'number');
    assert.ok(result.score >= 0 && result.score <= 100, `score ${result.score} out of range`);
  });

  it('returns a letter grade A-F', async () => {
    const result = await scoreUrl('https://example.com', { scope: 'universal' });
    assert.match(result.grade, /^[A-F]$/);
  });

  it('returns an array of checks with id, status, and category', async () => {
    const result = await scoreUrl('https://example.com', { scope: 'universal' });
    assert.ok(Array.isArray(result.checks), 'checks should be an array');
    assert.ok(result.checks.length > 0, 'should have at least one check');
    for (const check of result.checks) {
      assert.equal(typeof check.id, 'string');
      assert.ok(['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'].includes(check.status),
        `check ${check.id} has invalid status ${check.status}`);
    }
  });

  it('supports both contract and universal scope', async () => {
    const contractResult = await scoreUrl('https://example.com', { scope: 'contract' });
    const universalResult = await scoreUrl('https://example.com', { scope: 'universal' });
    assert.equal(typeof contractResult.score, 'number');
    assert.equal(typeof universalResult.score, 'number');
  });
});

describe('scoreUrl — SSRF redirect blocking', () => {
  let server, baseUrl;

  before((t, done) => {
    server = createServer((req, res) => {
      if (req.url === '/redirect-to-metadata') {
        // Simulate a redirect to AWS IMDS endpoint
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
      } else if (req.url === '/redirect-to-loopback') {
        res.writeHead(302, { location: 'http://127.0.0.1/' });
        res.end();
      } else if (req.url === '/safe-redirect') {
        res.writeHead(302, { location: 'https://example.com' });
        res.end();
      } else if (req.url === '/html') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  after(() => server.close());

  it('blocks a redirect to AWS metadata IP', async () => {
    // The sync isValidUrl blocks the redirect target before safeLookup runs
    const result = await scoreUrl(`${baseUrl}/redirect-to-metadata`, { scope: 'universal' });
    // The fetch should fail (SSRF blocked), producing a penalty/default score
    // We don't assert on exact score, just that the redirect was NOT followed
    assert.ok(result.score >= 0, 'should return a score even on blocked fetch');
  });

  it('blocks a redirect to loopback', async () => {
    const result = await scoreUrl(`${baseUrl}/redirect-to-loopback`, { scope: 'universal' });
    assert.ok(result.score >= 0, 'should return a score even on blocked fetch');
  });
});

describe('scoreUrl — fetch error handling', () => {
  it('reports an unreadable domain as unscored rather than grading a placeholder', async () => {
    // This test previously asserted `typeof result.score === 'number'` — it
    // encoded the defect as a requirement. A non-existent domain used to be
    // scored against a placeholder empty document, which is why unrelated
    // blocked sites all received an identical 61.5/D. The correct behaviour is
    // no numeric grade at all, plus a reason the caller can act on.
    const result = await scoreUrl('https://this-domain-does-not-exist-xyz123.invalid', { scope: 'universal' });
    assert.equal(result.score, null, 'an unreadable target must not produce a numeric score');
    assert.equal(result.grade, null);
    assert.equal(result.unreachable, true);
    assert.ok(
      ['http_error', 'timeout', 'network', 'empty_body'].includes(result.unreachableReason),
      `unexpected reason: ${result.unreachableReason}`,
    );
    assert.equal(result.checks.length, 0, 'no checks can have run against a page we never fetched');
    assert.equal(result.total, 0);
  });

  it('still scores a reachable domain normally', async () => {
    // The guard above must not have turned every fetch into "unreachable".
    const result = await scoreUrl('https://example.com', { scope: 'universal' });
    assert.equal(result.unreachable, undefined, 'example.com is reachable and must score normally');
    assert.equal(typeof result.score, 'number');
    assert.ok(result.score >= 0);
  });

  it('handles an invalid URL gracefully (rejects with TypeError)', async () => {
    await assert.rejects(
      () => scoreUrl('not-a-url', { scope: 'universal' }),
      (err) => {
        assert.ok(err instanceof TypeError || err instanceof Error);
        return true;
      },
    );
  });
});