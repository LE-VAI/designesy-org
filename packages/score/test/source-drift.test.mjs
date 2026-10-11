/**
 * Source drift — the two 44-check engines must not diverge silently.
 *
 * route.ts (the site and the MCP endpoint) and engine.ts (the npm CLI) are two
 * hand-maintained copies of one engine. This suite fails when a change lands in
 * one copy only. Known divergences are pinned in
 * fixtures/source-drift-baseline.json; see scripts/source-drift.mjs for the
 * comparison and the reasoning.
 *
 * The canonicaliser is tested first, in both directions. A canonical form that
 * collapsed everything to the same string would make every unit "identical" and
 * this suite would pass while comparing nothing. That is the failure mode a
 * drift gate is most likely to have, so it is asserted directly rather than
 * assumed.
 *
 * Zero runtime dependencies. typescript is already a devDependency (the build).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  ROUTE,
  ENGINE,
  BASELINE,
  unitsOf,
  loadUnits,
  loadBaseline,
  findings,
  exportedSurface,
} from '../scripts/source-drift.mjs';

const canon = (src) => unitsOf(src).get('fn:f');

describe('source drift — canonical form', () => {
  it('treats formatting-only differences as identical', () => {
    const pairs = [
      ['function f(x) { if (x) { return 1; } return 2; }', 'function f(x) {\n  if (x) return 1;\n  return 2;\n}'],
      ["function f() { return 'a'; }", 'function f() { return "a"; }'],
      ['function f() { return [1, 2, 3]; }', 'function f() { return [\n  1,\n  2,\n  3,\n]; }'],
      ['function f(a, b) { return (a + b); }', 'function f(a, b) { return a + b; }'],
      ['function f(x) { return x.map((y) => y * 2); }', 'function f(x) { return x.map((y) => { return y * 2; }); }'],
      ['function f(x: string): number { return (x as any).length; }', 'function f(x) { return x.length; }'],
      ['export function f() { return 1; } // trailing', '/* lead */ function f() { return 1; }'],
      ['function f() { return 1; }\r\n', 'function f() { return 1; }\n'],
      ['function f(x) { for (const y of x) { g(y); } }', 'function f(x) { for (const y of x) g(y); }'],
      ['function f(x) { if (x) { a(); } else { if (!x) b(); } }', 'function f(x) { if (x) a(); else if (!x) b(); }'],
    ];
    for (const [a, b] of pairs) {
      assert.equal(canon(a), canon(b), `these should canonicalise identically:\n  ${a}\n  ${b}`);
    }
  });

  it('treats behavioural differences as different', () => {
    // One mutation per pair — each is a kind of one-sided fix this gate exists to catch.
    const pairs = [
      ['function f(s) { return /[a-z]/.test(s); }', 'function f(s) { return /[a-y]/.test(s); }'],
      ['function f(x) { return x > 2; }', 'function f(x) { return x >= 2; }'],
      ['function f(x) { return x && y; }', 'function f(x) { return x && !y; }'],
      ["function f() { return 'a'; }", "function f() { return 'b'; }"],
      ['function f() { return 2; }', 'function f() { return 3; }'],
      ['function f(a, b) { return (a + b) * 2; }', 'function f(a, b) { return a + b * 2; }'],
      ['function f(x) { if (x && ok) a(); }', 'function f(x) { if (x) a(); }'],
      ['function f(x) { x++; }', 'function f(x) { x--; }'],
      ['function f() { let a = 1; return a; }', 'function f() { const a = 1; return a; }'],
      ['function f(x) { for (const k of x) { if (k) break; g(k); } }', 'function f(x) { for (const k of x) { g(k); if (k) break; } }'],
      ['function f(t) { return `a${t}b`; }', 'function f(t) { return `a${t}c`; }'],
    ];
    for (const [a, b] of pairs) {
      assert.notEqual(canon(a), canon(b), `these must NOT canonicalise identically:\n  ${a}\n  ${b}`);
    }
  });

  it('extracts slop blocks by their // S<n>. comment', () => {
    const src = [
      'async function scoreFromParts(html) {',
      '  const slopFindings = [];',
      '  // S1. First',
      '  { if (/a/.test(html)) slopFindings.push(1); }',
      '  // S2. Second',
      '  { if (/b/.test(html)) slopFindings.push(2); }',
      '}',
    ].join('\n');
    const u = unitsOf(src);
    assert.ok(u.has('slop:S1') && u.has('slop:S2'), 'slop blocks were not extracted');
    assert.notEqual(u.get('slop:S1'), u.get('slop:S2'));
  });
});

describe('source drift — route.ts vs engine.ts', () => {
  it('reads both engines and the baseline', () => {
    for (const p of [ROUTE, ENGINE, BASELINE]) {
      assert.ok(existsSync(p), `${p} is missing. A drift check over a missing file passes for the wrong reason.`);
    }
  });

  it('compares a real volume of code, not a handful of units', () => {
    // Floors guard the extraction itself. If a refactor renames the orchestrators
    // or the `// S<n>.` convention, units vanish from BOTH sides and a naive gate
    // would go green while comparing nothing.
    const { route, engine } = loadUnits();
    const shared = [...route.keys()].filter((k) => engine.has(k));
    assert.ok(shared.length >= 80, `only ${shared.length} units are shared between the engines (expected 80+). The extraction has broken or the engines were restructured; fix scripts/source-drift.mjs before trusting this suite.`);
    for (let i = 1; i <= 12; i++) {
      assert.ok(route.has(`slop:S${i}`), `route.ts: slop block S${i} not found (expected a "// S${i}." comment above it)`);
      assert.ok(engine.has(`slop:S${i}`), `engine.ts: slop block S${i} not found (expected a "// S${i}." comment above it)`);
    }
    const checks = shared.filter((k) => k.startsWith('fn:check'));
    assert.ok(checks.length >= 35, `only ${checks.length} check functions are compared (expected 35+)`);
    const tiny = shared.filter((k) => route.get(k).length < 20);
    assert.deepEqual(tiny, [], `these units canonicalised to almost nothing, so comparing them proves nothing: ${tiny.join(', ')}`);
  });

  it('every baseline entry says what kind of divergence it is and why', () => {
    const { divergent = {} } = loadBaseline();
    for (const [k, v] of Object.entries(divergent)) {
      assert.ok(['intentional', 'debt'].includes(v.kind), `${k}: kind must be "intentional" or "debt", got ${JSON.stringify(v.kind)}`);
      assert.ok(typeof v.why === 'string' && v.why.length >= 30, `${k}: write a why (at least a sentence) saying what differs and whether it is deliberate`);
      assert.match(v.route, /^[0-9a-f]{16}$/, `${k}: route hash is malformed`);
      assert.match(v.engine, /^[0-9a-f]{16}$/, `${k}: engine hash is malformed`);
      assert.notEqual(v.route, v.engine, `${k}: a baselined divergence with equal hashes is not a divergence`);
    }
  });

  it('the engines agree everywhere the baseline does not say otherwise', () => {
    const f = findings();
    assert.deepEqual(f, [], `\n  ${f.join('\n  ')}\n`);
  });

  it('compares the score arithmetic and the call to it in both orchestrators', () => {
    const { route, engine } = loadUnits();
    for (const k of ['fn:scoreArithmetic', 'call:scoreArithmetic']) {
      assert.ok(route.has(k), `route.ts: ${k} not found`);
      assert.ok(engine.has(k), `engine.ts: ${k} not found`);
      assert.equal(route.get(k), engine.get(k), `${k} differs between the engines`);
    }
  });

  it('fails when one engine reverts to its own accessibility floor (mutation on the real source)', () => {
    // The divergence this guard was added for: until engine 1.2.0 the npm
    // engine capped at 70 on ANY accessibility FAIL while the site capped only
    // under 60%. Re-introduce it in engine.ts, in two ways, and require a finding.
    const baseline = loadBaseline();
    const routeUnits = unitsOf(readFileSync(ROUTE, 'utf8'), 'route.ts');
    const src = readFileSync(ENGINE, 'utf8');

    const threshold = src.replace('a11yScored > 0 && a11yPct < 60', 'a11yScored > 0 && a11yPct < 100');
    assert.notEqual(threshold, src, 'the floor condition was not found in engine.ts; update this mutation');
    const f1 = findings({ route: routeUnits, engine: unitsOf(threshold, 'engine.ts') }, baseline);
    assert.ok(f1.some((l) => l.startsWith('fn:scoreArithmetic differs')), `a changed floor in engine.ts was not reported:\n  ${f1.join('\n  ')}`);

    // An engine that stops calling the shared step and floors inline instead.
    const bypass = src.replace(
      /scoreArithmetic\(checks, slopTotal, originalityPoints\);/,
      "scoreArithmetic(checks.filter((c) => c.category !== 'accessibility'), slopTotal, originalityPoints);",
    );
    assert.notEqual(bypass, src, 'the call to scoreArithmetic was not found in engine.ts; update this mutation');
    const f2 = findings({ route: routeUnits, engine: unitsOf(bypass, 'engine.ts') }, baseline);
    assert.ok(f2.some((l) => l.startsWith('call:scoreArithmetic differs')), `a changed call in engine.ts was not reported:\n  ${f2.join('\n  ')}`);

    const removed = src.replace(/= scoreArithmetic\(/, '= scoreArithmeticLocal(');
    const f3 = findings({ route: routeUnits, engine: unitsOf(removed, 'engine.ts') }, baseline);
    assert.ok(f3.some((l) => l.startsWith('call:scoreArithmetic exists only in route.ts')), `a missing call in engine.ts was not reported:\n  ${f3.join('\n  ')}`);
  });

  it('detects a one-sided edit (mutation check on the live sources)', () => {
    // Guard the guard: take the real units, change ONE side of one matching unit
    // and of one baselined unit, and require findings for both.
    const units = loadUnits();
    const baseline = loadBaseline();
    const matching = [...units.route.keys()].find(
      (k) => units.engine.has(k) && !baseline.divergent[k] && k.startsWith('fn:check'),
    );
    const known = Object.keys(baseline.divergent)[0];
    assert.ok(matching && known, 'need one matching and one baselined unit to mutate');

    const engine = new Map(units.engine);
    engine.set(matching, engine.get(matching) + 'MUTATED');
    engine.set(known, engine.get(known) + 'MUTATED');
    const f = findings({ route: units.route, engine }, baseline);
    assert.ok(f.some((l) => l.startsWith(`${matching} differs`)), `a one-sided edit to ${matching} was not reported`);
    assert.ok(f.some((l) => l.startsWith(`${known} changed in engine.ts only`)), `a one-sided edit to baselined ${known} was not reported`);
  });
});

// The published package's .d.ts is a promise to consumers, and the body
// comparison above cannot see it: `canonical()` drops the `export` keyword by
// design (a route and a package legitimately differ on it), so a function and
// the same function prefixed with `export` compare as identical. The first test
// below proves that blind spot is real rather than assumed, so this suite is not
// guarding an imaginary failure.
describe('source drift — the package public API surface', () => {
  const surface = () => exportedSurface(readFileSync(ENGINE, 'utf8'));

  it('control: an export change is invisible to the body comparison', () => {
    const bare = unitsOf('function f(x) { return x + 1; }', 'a.ts').get('fn:f');
    const exported = unitsOf('export function f(x) { return x + 1; }', 'b.ts').get('fn:f');
    assert.equal(
      bare,
      exported,
      'these now differ, so `export` IS visible to the body comparison and the rest of this suite is redundant',
    );
  });

  it('parses a non-empty surface and includes the documented entry point', () => {
    const s = surface();
    assert.ok(s.fn.length > 0, 'no exported functions parsed — the parser is broken, not the package');
    assert.ok(s.fn.includes('scoreUrl'), 'scoreUrl is the documented entry point and must stay exported');
    for (const [kind, names] of Object.entries(s)) {
      assert.deepEqual(names, [...names].sort(), `${kind} exports must be sorted so a diff is readable`);
    }
  });

  it('the surface matches the pinned expectation', () => {
    // Pinned deliberately. A published package's exports are a promise, so an
    // addition or removal is a release decision that should appear in the diff —
    // not something to discover from an npm consumer. Update this list in the
    // same commit as an intentional surface change.
    const EXPECTED = {
      fn: [
        'deriveVerdict', 'emitCanonical', 'emitDesignesy', 'emitGoogle', 'emitReview',
        'isValidUrl', 'normalizeInputUrl', 'scoreFromParts', 'scoreUrl', 'statusToSeverity',
      ],
      const: ['CONTRACT_VERSION'],
      // CheckEvidence: engine 1.2.0, the evidence v44 and v45 attach to their results.
      type: ['CheckEvidence', 'CheckResult', 'PageOutcome', 'ScorePartsInput', 'ScoreResult', 'ScoreScope'],
    };
    const actual = surface();
    const added = {};
    const removed = {};
    for (const kind of Object.keys(EXPECTED)) {
      const now = actual[kind] || [];
      added[kind] = now.filter((n) => !EXPECTED[kind].includes(n));
      removed[kind] = EXPECTED[kind].filter((n) => !now.includes(n));
    }
    const report = Object.keys(EXPECTED)
      .filter((k) => added[k].length || removed[k].length)
      .map((k) => `  ${k}: +[${added[k].join(', ')}] -[${removed[k].join(', ')}]`)
      .join('\n');
    assert.equal(
      report,
      '',
      `the package's public surface changed:\n${report}\n`
        + 'If intentional, update EXPECTED in the same commit and note it in the release notes.',
    );
  });
});
