/**
 * Engine 1.5.1, pinned rule by rule.
 *
 *   - v46 reads the size inside the `font` shorthand. 1.4.0 read only
 *     `font-size`, so designesy.org's own hero console, sized through
 *     `font: 500 0.66rem/1 var(--mono)`, sat at 10.56px under its 12.8px floor
 *     and v46 never saw it.
 *
 * The rule tests fail on the 1.4.1 build; the controls (marked) pass on both.
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromParts } from '../dist/engine.js';

const HTML = '<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><p>Text</p></main></body></html>';
const SCALE = ':root { --text-label: 0.8rem; --text-body: 1rem; --text-lead: 1.25rem; --text-h3: 1.563rem; --text-h2: 1.953rem; --mono: ui-monospace, monospace; }\n';

async function v46(css) {
  const r = await scoreFromParts({ html: HTML, css: SCALE + css, offline: true, scope: 'universal' });
  const c = r.checks.find((x) => x.id === 'v46');
  assert.ok(c, 'v46 missing from the result');
  return c;
}
const values = (c) => (c.evidence?.findings ?? []).map((f) => `${f.value} ${f.issue}`);

describe('v46: the font shorthand carries a size', () => {
  it('a weight, a sub-floor size, a line height and a family: the size is judged', async () => {
    const c = await v46('.vc-label { font: 500 0.66rem/1 var(--mono); }');
    assert.equal(c.status, 'WARN');
    assert.deepEqual(values(c), ['0.66rem below the floor']);
    assert.equal(c.evidence.findings[0].selector, '.vc-label');
  });

  it('style and weight keywords ahead of an off-scale px size, spaced slash', async () => {
    const c = await v46('h4 { font: italic bold 15px / 1.4 Georgia, serif; }');
    assert.equal(c.status, 'WARN');
    assert.deepEqual(values(c), ['15px off the scale']);
  });

  it('a shorthand and a longhand in one sheet are both counted', async () => {
    const c = await v46('.a { font: 600 0.6rem sans-serif; } .b { font-size: 0.6875rem; }');
    assert.deepEqual(values(c).sort(), ['0.6875rem below the floor', '0.6rem below the floor']);
  });

  it('fluid type in the shorthand is held only at its lower bound', async () => {
    const c = await v46('.t { font: 400 clamp(0.6rem, 2vw, 1rem)/1.2 serif; }');
    assert.equal(c.status, 'WARN');
    assert.deepEqual(values(c), ['clamp(0.6rem, 2vw, 1rem) fluid minimum below the floor']);
  });
});

describe('v46 controls (pass on 1.4.1 and 1.5.1)', () => {
  it('control: a shorthand sized by a type token passes', async () => {
    const c = await v46('.a { font: 500 var(--text-label)/1 var(--mono); } p { font-size: var(--text-body); } .l { font-size: 1.25rem; }');
    assert.equal(c.status, 'PASS');
  });

  it('control: system and CSS-wide keywords set no measurable size', async () => {
    const c = await v46('button { font: inherit; } .m { font: menu; } .s { font: caption; } p { font-size: 1rem; }');
    assert.equal(c.status, 'PASS');
  });

  it('control: font-family, font-weight and a custom property named --x-font are not the shorthand', async () => {
    const c = await v46(':root { --icon-font: 10px sans-serif; } .a { font-family: 10px; font-weight: 700; } p { font-size: 1rem; }');
    assert.equal(c.status, 'PASS');
  });

  it('control: an @supports (font: …) condition swallows no rule after it, and --x-font-size is still read', async () => {
    const c = await v46('@supports (font: -apple-system-body) and (appearance: none) { .x { font-size: 0.6rem; } } .y { --chip-font-size: 0.7rem; } p { font-size: 1rem; }');
    assert.deepEqual(values(c).sort(), ['0.6rem below the floor', '0.7rem below the floor']);
  });

  it('control: a relative shorthand size (em, keyword) is not judged', async () => {
    const c = await v46('small { font: 600 0.8em/1 sans-serif; } .k { font: bold smaller serif; } p { font-size: 1rem; }');
    assert.equal(c.status, 'PASS');
  });
});
