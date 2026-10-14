/**
 * Engine 1.4.0, pinned rule by rule: v46, type sizes come from the scale.
 *
 * v16 asks for rem; it cannot tell a rem on the type scale from one between
 * steps. v46 reads the scale from the page's own :root type tokens and judges
 * static sizes against it. Deliberate fluid type (clamp/min/max with a viewport
 * or container unit) is accepted as written; only its lower bound is held to
 * the floor (the smallest type token). These tests pin the edges, and assert
 * the evidence where a status alone could be right for the wrong reason.
 *
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromParts } from '../dist/engine.js';

const HTML = `<!doctype html><html lang="en"><head><title>Fixture</title>
<meta name="description" content="Engine 1.4.0 fixture."></head><body><main><h1>Fixture</h1>
<p>Body copy.</p></main></body></html>`;

async function check(css) {
  const c = (await scoreFromParts({ html: HTML, css, scope: 'universal', offline: true })).checks.find((x) => x.id === 'v46');
  assert.ok(c, 'v46 absent from the result');
  return c;
}

// A Major Third scale (x1.25) on a 16px root: 12.8, 16, 20, 25, 31.25, 39.06 px.
const SCALE = ':root { --text-label: 0.8rem; --text-body: 1rem; --text-lead: 1.25rem; --text-h3: 1.563rem; --text-h2: 1.953rem; --text-h1: 2.441rem; --text-muted: #6b6b73; }';

describe('v46: type sizes come from the scale', () => {
  it('PASSes token sizes, on-scale literals and deliberate fluid type', async () => {
    const c = await check(`${SCALE} p { font-size: var(--text-body); } h2 { font-size: var(--text-h2); }
      .lede { font-size: 1.25rem; } .hero { font-size: clamp(2rem, 1.45rem + 2.9vw, 4.25rem); }
      .note { font-size: 0.875em; } .inherit { font-size: inherit; }`);
    assert.equal(c.status, 'PASS');
    assert.equal(c.category, 'cadence');
    assert.match(c.detail, /ratio 1\.250/);
  });

  it('accepts a fluid clamp whose endpoints sit between steps: fluid type is a deliberate move', async () => {
    const c = await check(`${SCALE} .title { font-size: clamp(2rem, 1.45rem + 2.9vw, 4.25rem); } .sub { font-size: min(3.6rem, 8cqi); }`);
    assert.equal(c.status, 'PASS');
  });

  it('WARNs a static size between steps, and names the nearest step', async () => {
    const c = await check(`${SCALE} .principle p { font-size: 0.9375rem; }`);
    assert.equal(c.status, 'WARN');
    const [f] = c.evidence.findings;
    assert.deepEqual(f, { selector: '.principle p', value: '0.9375rem', px: 15, issue: 'off the scale', nearest: 16 });
  });

  it('WARNs a static size below the smallest type token', async () => {
    const c = await check(`${SCALE} .badge { font-size: 0.6875rem; }`);
    assert.equal(c.status, 'WARN');
    assert.equal(c.evidence.findings[0].issue, 'below the floor');
    assert.equal(c.evidence.findings[0].nearest, 12.8);
  });

  it('holds a fluid size\'s lower bound to the floor: clamp() first argument, max() largest static argument', async () => {
    const low = await check(`${SCALE} .log { font-size: clamp(.6rem, 100cqi / 32, .72rem); }`);
    assert.equal(low.status, 'WARN');
    assert.deepEqual(low.evidence.findings[0], { selector: '.log', value: 'clamp(.6rem, 100cqi / 32, .72rem)', px: 9.6, issue: 'fluid minimum below the floor', nearest: 12.8 });
    const ok = await check(`${SCALE} .cap { font-size: max(0.8rem, 1.2vw); }`);
    assert.equal(ok.status, 'PASS');
  });

  it('resolves a var() alias through the token table before judging', async () => {
    const off = await check(`${SCALE.replace('}', ' --badge-fs: 0.6875rem; }')} .badge { font-size: var(--badge-fs); }`);
    assert.equal(off.status, 'WARN');
    assert.equal(off.evidence.findings[0].value, 'var(--badge-fs)');
  });

  it('never counts a colour token named --text-* as a type size', async () => {
    const c = await check(':root { --text-body: 1rem; --text-muted: #6b6b73; --text-primary: #111; } p { font-size: 1rem; }');
    assert.equal(c.status, 'SKIP');                                  // one type token is not a scale
    assert.match(c.detail, /fewer than 3 type-size tokens/);
  });

  it('reads a non-geometric scale (Tailwind-style) from the tokens themselves', async () => {
    const tw = ':root { --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem; --text-lg: 1.125rem; --text-xl: 1.25rem; --text-2xl: 1.5rem; --text-3xl: 1.875rem; }';
    const on = await check(`${tw} .a { font-size: 0.875rem; } .b { font-size: 1.875rem; }`);
    assert.equal(on.status, 'PASS');
    const off = await check(`${tw} .c { font-size: 1.7rem; }`);
    assert.equal(off.status, 'WARN');
  });

  it('reports one finding per rule when a bundle repeats it across @media copies', async () => {
    const c = await check(`${SCALE} .badge { font-size: .6875rem; } @media (min-width: 40rem) { .badge { font-size: .6875rem; } }`);
    assert.equal(c.evidence.findings.length, 1);
  });

  it('SKIPs a page with no type-size tokens', async () => {
    const c = await check(':root { --paper: #fff; } p { font-size: 15px; }');
    assert.equal(c.status, 'SKIP');
  });
});
