/**
 * @designesy/tokens — test suite for 20-check DTCG validator.
 *
 * Run:  npm test
 * (Requires `npm run build` first — tests import from dist/)
 *
 * Uses Node's built-in test runner (node:test). No dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTokens, validateTokenString } from '../dist/validator.js';

const validJson = JSON.parse(
  readFileSync(new URL('./fixtures/valid-tokens.json', import.meta.url), 'utf-8'),
);
const invalidJson = JSON.parse(
  readFileSync(new URL('./fixtures/invalid-tokens.json', import.meta.url), 'utf-8'),
);

function getCheck(result, id) {
  return result.checks.find((c) => c.id === id);
}

// ── Valid fixture ──────────────────────────────────────────────────────

describe('valid-tokens.json', () => {
  const result = validateTokens(validJson, 'valid-tokens.json');

  it('should have 20 checks', () => {
    assert.equal(result.total, 20);
  });

  it('should have 0 FAILs', () => {
    assert.equal(result.fail, 0, `Unexpected FAILs: ${result.checks.filter((c) => c.status === 'FAIL').map((c) => c.id).join(', ')}`);
  });

  it('should score at least 90 (A)', () => {
    assert.ok(result.score >= 90, `Score ${result.score} < 90`);
  });

  it('t01: all tokens have $type → PASS', () => {
    assert.equal(getCheck(result, 't01').status, 'PASS');
  });

  it('t02: all tokens have $value → PASS', () => {
    assert.equal(getCheck(result, 't02').status, 'PASS');
  });

  it('t03: semantic tokens have $description → PASS', () => {
    assert.equal(getCheck(result, 't03').status, 'PASS');
  });

  it('t04: color tokens use OKLCH → PASS', () => {
    assert.equal(getCheck(result, 't04').status, 'PASS');
  });

  it('t06: aliases resolve → PASS', () => {
    assert.equal(getCheck(result, 't06').status, 'PASS');
  });

  it('t07: $schema present → PASS', () => {
    assert.equal(getCheck(result, 't07').status, 'PASS');
  });

  it('t08: structural validation → PASS', () => {
    assert.equal(getCheck(result, 't08').status, 'PASS');
  });

  it('t10: dimensions are px/rem → PASS', () => {
    assert.equal(getCheck(result, 't10').status, 'PASS');
  });

  it('t11: all $type names valid → PASS', () => {
    assert.equal(getCheck(result, 't11').status, 'PASS');
  });

  it('t12: no names starting with $ → PASS', () => {
    assert.equal(getCheck(result, 't12').status, 'PASS');
  });

  it('t13: no names with {, }, . → PASS', () => {
    assert.equal(getCheck(result, 't13').status, 'PASS');
  });

  it('t14: primitive values match types → PASS', () => {
    assert.equal(getCheck(result, 't14').status, 'PASS');
  });

  it('t15: color values well-formed → PASS', () => {
    assert.equal(getCheck(result, 't15').status, 'PASS');
  });

  it('t16: composite types valid → PASS', () => {
    assert.equal(getCheck(result, 't16').status, 'PASS');
  });

  it('t17: $value alias syntax valid → PASS', () => {
    assert.equal(getCheck(result, 't17').status, 'PASS');
  });

  it('t18: alias types compatible → PASS', () => {
    assert.equal(getCheck(result, 't18').status, 'PASS');
  });

  it('t19: no circular refs → PASS', () => {
    assert.equal(getCheck(result, 't19').status, 'PASS');
  });

  it('t20: $deprecated values valid → PASS', () => {
    assert.equal(getCheck(result, 't20').status, 'PASS');
  });
});

// ── Invalid fixture ────────────────────────────────────────────────────

describe('invalid-tokens.json', () => {
  const result = validateTokens(invalidJson, 'invalid-tokens.json');

  it('should have at least 1 FAIL', () => {
    assert.ok(result.fail > 0, 'Expected at least 1 FAIL');
  });

  it('should not be valid', () => {
    assert.equal(result.valid, false);
  });

  it('t01: missing type → FAIL', () => {
    assert.equal(getCheck(result, 't01').status, 'FAIL');
  });

  it('t02: missing value → FAIL', () => {
    assert.equal(getCheck(result, 't02').status, 'FAIL');
  });

  it('t06: dangling alias → FAIL', () => {
    assert.equal(getCheck(result, 't06').status, 'FAIL');
  });

  it('t08: unknown $-property → FAIL', () => {
    assert.equal(getCheck(result, 't08').status, 'FAIL');
  });

  it('t10: invalid dimension unit (vw) → FAIL', () => {
    assert.equal(getCheck(result, 't10').status, 'FAIL');
  });

  it('t11: invalid type name (colour) → FAIL', () => {
    assert.equal(getCheck(result, 't11').status, 'FAIL');
  });

  it('t12: name starting with $ → FAIL', () => {
    assert.equal(getCheck(result, 't12').status, 'FAIL');
  });

  it('t13: name with forbidden chars → FAIL', () => {
    assert.equal(getCheck(result, 't13').status, 'FAIL');
  });

  it('t14: primitive value mismatch → FAIL', () => {
    assert.equal(getCheck(result, 't14').status, 'FAIL');
  });

  it('t15: malformed color → FAIL', () => {
    assert.equal(getCheck(result, 't15').status, 'FAIL');
  });

  it('t16: missing composite child → FAIL', () => {
    assert.equal(getCheck(result, 't16').status, 'FAIL');
  });

  it('t18: alias type mismatch → FAIL', () => {
    assert.equal(getCheck(result, 't18').status, 'FAIL');
  });

  it('t19: circular reference → FAIL', () => {
    assert.equal(getCheck(result, 't19').status, 'FAIL');
  });

  it('t20: invalid $deprecated → FAIL', () => {
    assert.equal(getCheck(result, 't20').status, 'FAIL');
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('validateTokenString with invalid JSON returns error', () => {
    const result = validateTokenString('not json at all');
    assert.ok('error' in result);
  });

  it('validateTokenString with valid JSON returns result', () => {
    const result = validateTokenString('{"$schema":"x","t":{"$type":"string","$value":"hi","$description":"d"}}');
    assert.ok(!('error' in result));
    assert.equal(result.total, 20);
  });

  it('empty object produces 0 tokens but still 20 checks', () => {
    const result = validateTokens({});
    assert.equal(result.tokensCount, 0);
    assert.equal(result.total, 20);
  });

  it('valid: true when no FAILs', () => {
    const result = validateTokens(validJson);
    assert.equal(result.valid, true);
  });

  it('valid: false when FAILs present', () => {
    const result = validateTokens(invalidJson);
    assert.equal(result.valid, false);
  });
});