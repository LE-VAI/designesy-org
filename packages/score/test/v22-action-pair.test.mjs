/**
 * v22 measures the primary action pair a contract declares.
 *
 * Before identity v1, v22 took the better of --paper or --ink on --signal. That
 * reading can pass while the label the button actually paints fails: the old
 * designesy.org painted --paper-on-signal (white) on its blue, and a blue as
 * light as Azure #0A94FF gives white only 3.14:1 while --paper (near-black)
 * gives 6.65:1. A contract that names its primary action (--action, the fill;
 * --on-action, the label) is now measured on exactly that pair. Without both
 * tokens the old reading stands, so a site that declares neither scores as
 * before.
 *
 * Contract scope: v22 is a contract-only check.
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromParts } from '../dist/engine.js';

const HTML = `<!doctype html><html lang="en"><head><title>Fixture</title>
<meta name="description" content="v22 fixture."></head><body><main><h1>Fixture</h1>
<p>Body copy.</p></main></body></html>`;

async function v22(css) {
  const r = await scoreFromParts({ html: HTML, css, scope: 'contract', offline: true });
  const c = r.checks.find((x) => x.id === 'v22');
  assert.ok(c, 'v22 absent from the result');
  return c;
}

const BASE = '--paper: #010102; --ink: #f5f5f7; --signal: #0A94FF;';

describe('v22: the declared --action / --on-action pair is the pair measured', () => {
  it('PASSes ink on Azure at 6.65:1, following var(--signal) for the fill', async () => {
    const c = await v22(`:root { ${BASE} --action: var(--signal); --on-action: #010102; }`);
    assert.equal(c.status, 'PASS');
    assert.equal(c.detail, '--on-action on --action = 6.65:1 (≥ 4.5:1 AA)');
  });

  it('WARNs a white label on Azure at 3.14:1, although --paper on --signal would pass at 6.65:1', async () => {
    const c = await v22(`:root { ${BASE} --action: #0A94FF; --on-action: #ffffff; }`);
    assert.equal(c.status, 'WARN');
    assert.equal(c.detail, '--on-action on --action = 3.14:1 (passes 3:1 large-text, fails 4.5:1 body)');
  });

  it('FAILs a label under 3:1 on its fill', async () => {
    const c = await v22(`:root { ${BASE} --action: #0A94FF; --on-action: #36A7FF; }`);
    assert.equal(c.status, 'FAIL');
    assert.match(c.detail, /^--on-action on --action = 1\.\d\d:1 \(below 3:1, illegible\)$/);
  });

  it('SKIPs, rather than falling back, when the declared pair cannot be resolved', async () => {
    const c = await v22(`:root { ${BASE} --action: var(--missing); --on-action: #010102; }`);
    assert.equal(c.status, 'SKIP');
    assert.match(c.detail, /unresolvable to RGB$/);
  });
});

describe('v22: without both pair tokens the old reading stands', () => {
  it('takes the better of --paper or --ink on --signal when no pair is declared', async () => {
    const c = await v22(`:root { ${BASE} }`);
    assert.equal(c.status, 'PASS');
    assert.equal(c.detail, '--paper on --signal = 6.65:1 (≥ 4.5:1 AA)');
  });

  it('ignores --action without --on-action', async () => {
    const c = await v22(`:root { ${BASE} --action: #0A94FF; }`);
    assert.equal(c.detail, '--paper on --signal = 6.65:1 (≥ 4.5:1 AA)');
  });

  it('still WARNs the old mid-contrast signal exactly as before', async () => {
    const c = await v22(':root { --paper: #ffffff; --ink: #ffffff; --signal: #e26b2c; }');
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /^--paper on --signal = 3\.\d\d:1/);
  });
});
