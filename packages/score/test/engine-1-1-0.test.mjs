/**
 * Engine 1.1.0 baseline fixes, pinned check by check.
 *
 * The calibration corpus pins each fix's verdict on a realistic page. This file
 * pins the edges of each rule, and asserts the detail as well as the status
 * where the status alone could be right for the wrong reason (v05 PASSes on a
 * reduce block too, so the opt-in fixtures assert which branch passed them).
 *
 * Every case labelled "old verdict" read differently under engine 1.0.0.
 *
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromParts } from '../dist/engine.js';

const HTML_WITH_FIELD = `<!doctype html><html lang="en"><head><title>Fixture</title>
<meta name="description" content="Engine 1.1.0 fixture."></head><body><main><h1>Fixture</h1>
<label for="e">Email address</label><input id="e" name="email" type="email">
</main></body></html>`;

const HTML_NO_FIELD = `<!doctype html><html lang="en"><head><title>Fixture</title>
<meta name="description" content="Engine 1.1.0 fixture."></head><body><main><h1>Fixture</h1>
<p>Body copy with no form.</p></main></body></html>`;

async function check(id, { html = HTML_WITH_FIELD, css = '', scope = 'universal' } = {}) {
  const result = await scoreFromParts({ html, css, scope, offline: true });
  const c = result.checks.find((x) => x.id === id);
  assert.ok(c, `${id} absent from the result`);
  return c;
}

describe('v05: motion gated behind prefers-reduced-motion: no-preference', () => {
  const gated = (body) => `@media (prefers-reduced-motion: no-preference) { ${body} }`;

  it('PASSes an animation declared only under no-preference (old verdict: WARN)', async () => {
    const c = await check('v05', { css: gated('.hero { animation: rise 400ms ease-out both; }') });
    assert.equal(c.status, 'PASS');
    assert.match(c.detail, /^motion is opt-in/);
  });

  it('PASSes a transition that names its duration through a token (old verdict: WARN)', async () => {
    const c = await check('v05', { css: gated('a { transition: color var(--duration-quick) ease-out; }') });
    assert.equal(c.status, 'PASS');
    assert.match(c.detail, /^motion is opt-in/);
  });

  it('PASSes smooth scrolling and view transitions gated the same way (old verdict: WARN)', async () => {
    for (const body of ['html { scroll-behavior: smooth; }', '@view-transition { navigation: auto; }']) {
      const c = await check('v05', { css: gated(body) });
      assert.equal(c.status, 'PASS', body);
    }
  });

  it('WARNs an empty no-preference block', async () => {
    const c = await check('v05', { css: gated('') });
    assert.equal(c.status, 'WARN');
  });

  it('WARNs a no-preference block that only switches motion off (the inverted kill switch)', async () => {
    const offOnly = [
      '* { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }',
      '* { animation: none !important; transition: none !important; }',
      'html { scroll-behavior: auto; }',
      '* { transition-duration: 0s; }',
    ];
    for (const body of offOnly) {
      const c = await check('v05', { css: gated(body) });
      assert.equal(c.status, 'WARN', body);
    }
  });

  it('WARNs a no-preference block that declares no motion property', async () => {
    const c = await check('v05', { css: gated('.card { color: red; transform: translateY(4px); }') });
    assert.equal(c.status, 'WARN');
  });

  it('ignores an opt-in block that is commented out', async () => {
    const c = await check('v05', { css: `/* ${gated('.hero { animation: rise 400ms; }')} */` });
    assert.equal(c.status, 'WARN');
    assert.match(c.detail, /^missing prefers-reduced-motion/);
  });

  it('keeps the reduce branch and its detail unchanged', async () => {
    const c = await check('v05', { css: '@media (prefers-reduced-motion: reduce) { * { animation: none; } }' });
    assert.equal(c.status, 'PASS');
    assert.equal(c.detail, 'prefers-reduced-motion: reduce block declares rules');
  });
});

describe('v27: a page with no field to zoom into', () => {
  it('SKIPs a page with no form field and no input rule (old verdict: WARN)', async () => {
    const c = await check('v27', { html: HTML_NO_FIELD });
    assert.equal(c.status, 'SKIP');
  });

  it('SKIPs fields that take no typed text (old verdict: WARN)', async () => {
    for (const type of ['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color']) {
      const html = HTML_NO_FIELD.replace('<p>', `<input type="${type}" name="x"><p>`);
      const c = await check('v27', { html });
      assert.equal(c.status, 'SKIP', `type=${type}`);
    }
  });

  it('ignores an input that only appears inside a script', async () => {
    const html = HTML_NO_FIELD.replace('<p>', '<script>const t = "<input type=\\"text\\">";</script><p>');
    const c = await check('v27', { html });
    assert.equal(c.status, 'SKIP');
  });

  it('still WARNs when a text field exists and no floor is declared', async () => {
    const cases = [
      HTML_WITH_FIELD,
      HTML_NO_FIELD.replace('<p>', '<input name="q"><p>'),
      HTML_NO_FIELD.replace('<p>', '<input data-type="hidden" name="q"><p>'),
      HTML_NO_FIELD.replace('<p>', '<textarea></textarea><p>'),
      HTML_NO_FIELD.replace('<p>', '<select><option>a</option></select><p>'),
    ];
    for (const html of cases) {
      const c = await check('v27', { html });
      assert.equal(c.status, 'WARN', html.slice(html.indexOf('<main>'), html.indexOf('</main>')));
    }
  });

  it('keeps the CSS verdicts on a page with no field', async () => {
    assert.equal((await check('v27', { html: HTML_NO_FIELD, css: 'input { font-size: 13px; }' })).status, 'FAIL');
    assert.equal((await check('v27', { html: HTML_NO_FIELD, css: 'input { font-size: 1rem; }' })).status, 'PASS');
  });
});

describe('v14 and v18: Designesy Cadence taste moves to Tier 2', () => {
  const NO_CADENCE = 'body { font-size: 16px; }';

  it('SKIPs their absence under scope=universal (old verdict: WARN)', async () => {
    for (const id of ['v14', 'v18']) {
      const c = await check(id, { css: NO_CADENCE });
      assert.equal(c.status, 'SKIP', id);
      assert.match(c.detail, /skipped: scope=universal/, id);
    }
  });

  it('SKIPs a partial text-wrap adoption under scope=universal (old verdict: WARN)', async () => {
    const c = await check('v18', { css: 'h1 { text-wrap: balance; }' });
    assert.equal(c.status, 'SKIP');
  });

  it('still WARNs their absence under scope=contract', async () => {
    for (const id of ['v14', 'v18']) {
      const c = await check(id, { css: NO_CADENCE, scope: 'contract' });
      assert.equal(c.status, 'WARN', id);
    }
  });

  it('still PASSes them under scope=universal when the rules are present', async () => {
    const css = [
      ':root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }',
      'body { font-size: 1rem; line-height: 1.55; }',
      'h1 { text-wrap: balance; } p { text-wrap: pretty; }',
      '.n { font-variant-numeric: tabular-nums; }',
    ].join('\n');
    for (const id of ['v14', 'v18']) {
      assert.equal((await check(id, { css })).status, 'PASS', id);
    }
  });
});
