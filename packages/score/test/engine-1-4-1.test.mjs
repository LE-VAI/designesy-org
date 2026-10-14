/**
 * Engine 1.4.1, pinned rule by rule.
 *
 *   - v27 counts a font size only in a rule whose own selector names a field
 *     keyword (input, textarea, select, .field). Its literal scan found a
 *     keyword and then the next rule body, and `[^{]*` ran across a closing
 *     brace, so the word "select" in `user-select: none` carried into the next
 *     rule. Class names that name a field (.search-input) still count.
 *   - v37 is named "DESIGN.md spec-layer validation (DESIGN.md format lint)";
 *     its remediation keeps every @google/design.md install and run command.
 *
 * The rule tests fail on the 1.4.0 build; the controls (marked) pass on both.
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromParts } from '../dist/engine.js';

const page = (body) =>
  `<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main>${body}</main></body></html>`;
const FIELD = page('<label for="e">Email address</label><input id="e" type="email">');

async function check(id, html, css) {
  const r = await scoreFromParts({ html, css, offline: true, scope: 'universal' });
  const c = r.checks.find((x) => x.id === id);
  assert.ok(c, `${id} missing from the result`);
  return c;
}

describe('v27: a font size counts only in a rule that styles a field', () => {
  it('user-select in one rule does not make the next rule a field rule', async () => {
    // 1.4.0: FAIL "1 input(s) below 16px floor: 12px (12px)", from .chip-label.
    const c = await check('v27', FIELD, '.chip { user-select: none; } .chip-label { font-size: 12px; } input { font-size: 1rem; }');
    assert.equal(c.status, 'PASS');
    assert.equal(c.detail, 'input font-size floor detected');
  });

  it('minified, with the -webkit- prefix: the bleed reads no field rule (WARN, not FAIL)', async () => {
    // 1.4.0: FAIL "1 input(s) below 16px floor: 12px (12px)".
    const c = await check('v27', FIELD, '.a{-webkit-user-select:none;user-select:none}.b{font-size:12px}');
    assert.equal(c.status, 'WARN');
  });

  it('a keyword in a declaration value does not carry into the next rule', async () => {
    // zeroheight.com shape. 1.4.0: FAIL "1 input(s) below 16px floor: 11px (11px)".
    const c = await check('v27', FIELD, '.a{--x:var(--selecta)}.kicker{font-size:11px}');
    assert.equal(c.status, 'WARN');
  });

  it('the floor keyword must sit in the floor rule\'s own selector', async () => {
    // 1.4.0: PASS, "input" in a custom property's value carried across the brace.
    const c = await check('v27', FIELD, '.a{--fields:input,textarea}.b{font-size:1rem}');
    assert.equal(c.status, 'WARN');
  });

  it('control: a class that names a field (.search-input) is still a 16px floor', async () => {
    const c = await check('v27', FIELD, '.globalnav-searchfield-input { font-size: 16px; }');
    assert.equal(c.status, 'PASS');
  });

  it('control: a class that names a field (.editableTextarea) below 16px still FAILs', async () => {
    const c = await check('v27', FIELD, '._8fVXdW_editableTextarea { font-size: 14px; }');
    assert.equal(c.status, 'FAIL');
  });

  it('control: a real select element below 16px still FAILs', async () => {
    const c = await check('v27', FIELD, 'select { font-size: 14px; }');
    assert.equal(c.status, 'FAIL');
    assert.equal(c.detail, '1 input(s) below 16px floor: 14px (14px)');
  });

  it('control: the Carbon number input at 0.875rem still FAILs', async () => {
    const c = await check('v27', FIELD, '.cds--number input[type=number] { font-size: 0.875rem; }');
    assert.equal(c.status, 'FAIL');
    assert.equal(c.detail, '1 input(s) below 16px floor: 0.875rem (14px)');
  });

  it('control: a real field rule right after a bleed is still found', async () => {
    const c = await check('v27', FIELD, '.a { user-select: none; } input { color: red; font-size: 13px; }');
    assert.equal(c.status, 'FAIL');
    assert.equal(c.detail, '1 input(s) below 16px floor: 13px (13px)');
  });

  it('control: grouped and minified floors still PASS', async () => {
    assert.equal((await check('v27', FIELD, 'input,textarea,select{font-size:16px}')).status, 'PASS');
    assert.equal((await check('v27', FIELD, 'form input { font-size: 1rem; }')).status, 'PASS');
    assert.equal((await check('v27', FIELD, '@media (max-width: 600px) { input { font-size: 1rem; } }')).status, 'PASS');
  });

  it('control: the exact .field and .input classes still count', async () => {
    assert.equal((await check('v27', FIELD, '.search .input { font-size: 12px; }')).status, 'FAIL');
    assert.equal((await check('v27', FIELD, '.field { font-size: 0.75rem; }')).status, 'FAIL');
  });
});

describe('v37: named for the DESIGN.md format', () => {
  it('the check name is the format, not the package', async () => {
    const c = await check('v37', FIELD, '');
    assert.equal(c.item, 'DESIGN.md spec-layer validation (DESIGN.md format lint)');
  });

  it('the remediation names the format, and keeps the install and run commands', async () => {
    const c = await check('v37', FIELD, '');
    assert.equal(typeof c.remediation, 'string');
    assert.match(c.remediation, /The DESIGN\.md format's linter \(v0\.4\.0, Apache-2\.0\) validates the file:/);
    assert.doesNotMatch(c.remediation, /Google's @google\/design\.md CLI/);
    assert.match(c.remediation, /npm install -g @google\/design\.md\./);
    assert.match(c.remediation, /npx @google\/design\.md lint DESIGN\.md\./);
    assert.match(c.remediation, /npx @google\/design\.md export --format dtcg DESIGN\.md\./);
  });
});
