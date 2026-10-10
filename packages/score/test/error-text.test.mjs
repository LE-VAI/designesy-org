/**
 * @designesy/score 0.7.1: a result never carries the runtime's file system,
 * and v37 runs under npx.
 *
 * Published 0.7.0 returned, under `npx @designesy/score`, a v37 detail that
 * echoed Node's error verbatim: "Cannot find package '@google/design.md'
 * imported from <path>", the full path of the npm cache under the Users folder
 * of the account that ran it. Two defects: the linter was not a dependency of
 * the package, so v37 could not run, and a caught error's text reached the
 * result with that path in it. The paths below are made up (Jane Doe).
 *
 * Zero test dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreFromParts } from '../dist/engine.js';
import { loadUnits } from '../scripts/source-drift.mjs';

/** A function as shipped: read from the built engine, since it is not exported. */
function shipped(name) {
  const src = readFileSync(new URL('../dist/engine.js', import.meta.url), 'utf8');
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found in dist/engine.js`);
  let depth = 0;
  let i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return new Function(`${src.slice(start, i + 1)}\nreturn ${name};`)();
}

const sanitizeErrorText = shipped('sanitizeErrorText');

describe('error text in a result', () => {
  it('replaces the npm cache path 0.7.0 echoed in v37, and keeps the clause that says what failed', () => {
    const raw = String.raw`/DESIGN.md fetched but linter unavailable: Cannot find package '@google/design.md' imported from C:\Users\Jane Doe\AppData\Local\npm-cache\_npx\1a2b3c4d\node_modules\@acme\cli\dist\engine.js. The @google/design.md package may not be installed in this runtime; run the full audit to resolve.`;
    assert.equal(
      sanitizeErrorText(raw),
      "/DESIGN.md fetched but linter unavailable: Cannot find package '@google/design.md' imported from a local path. The @google/design.md package may not be installed in this runtime; run the full audit to resolve.",
    );
  });

  it('replaces drive, UNC and POSIX paths, file:// URLs and npm cache segments', () => {
    const cases = [
      [String.raw`imported from C:/Users/jane/x.js, then`, 'imported from a local path, then'],
      [String.raw`open \\fileserver\share\jane\report.css failed`, 'open a local path failed'],
      ["Cannot find module '/home/runner/work/x/node_modules/y/index.js' imported from /Users/jane/.npm/_npx/abc/node_modules/@designesy/score/dist/engine.js", "Cannot find module 'a local path' imported from a local path"],
      ["ENOENT: no such file or directory, open '/var/task/node_modules/x/y.json'", "ENOENT: no such file or directory, open 'a local path'"],
      ['spawn node ENOENT at /tmp/abc/run.sh', 'spawn node ENOENT at a local path'],
      ['ERR_MODULE_NOT_FOUND at file:///C:/Users/jane/x/engine.js:12:5', 'ERR_MODULE_NOT_FOUND at a local file'],
      [String.raw`stale cache at ..\npm-cache\_npx\abc\x.js`, 'stale cache at the npm cache'],
    ];
    for (const [raw, clean] of cases) assert.equal(sanitizeErrorText(raw), clean, raw);
  });

  it('leaves URLs, site paths, selectors and ratios alone', () => {
    for (const text of [
      "Cannot find package '@google/design.md'",
      'fetched https://example.com/home/page and https://x.org/Users/jane; /DESIGN.md served',
      '.btn-danger:hover .label uses --danger #cf222e on #ffffff in :root at 4.53:1 (needs 4.5:1)',
      'data: 12px vs 3 rem; a:hover b:focus; url(data:image/svg+xml;utf8,<svg>)',
    ]) assert.equal(sanitizeErrorText(text), text);
  });

  it('runs on every check detail before the result is returned', async () => {
    // A detail that quotes page text (v39 quotes button labels) carries whatever the page holds.
    const html = String.raw`<!doctype html><html lang="en"><head><title>Fixture</title><meta name="description" content="Error text fixture."></head><body><main><h1>Fixture</h1><button>Saved to C:\Users\Jane Doe\out.txt.</button></main></body></html>`;
    const r = await scoreFromParts({ html, css: '', scope: 'universal', offline: true });
    const v39 = r.checks.find((c) => c.id === 'v39');
    assert.equal(v39.status, 'WARN');
    assert.match(v39.detail, /Saved to a local path\./);
    for (const c of r.checks) assert.doesNotMatch(c.detail ?? '', /Jane Doe|[A-Za-z]:\\Users/, c.id);
  });

  it('is one function in both engine copies, called by both orchestrators', () => {
    const { route, engine } = loadUnits();
    for (const k of ['fn:sanitizeErrorText', 'fn:sanitizeCheckDetails', 'call:sanitizeCheckDetails']) {
      assert.ok(route.has(k), `route.ts: ${k} not found`);
      assert.ok(engine.has(k), `engine.ts: ${k} not found`);
      assert.equal(route.get(k), engine.get(k), `${k} differs between the engines`);
    }
  });
});

describe('v37 can run where the package is installed', () => {
  it('declares @google/design.md as an optional dependency, at the version the site runs', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const site = JSON.parse(readFileSync(new URL('../../../apps/site/package.json', import.meta.url), 'utf8'));
    const want = site.dependencies?.['@google/design.md'];
    assert.ok(want, 'apps/site no longer depends on @google/design.md; update this test');
    assert.equal(pkg.optionalDependencies?.['@google/design.md'], want);
    assert.equal(pkg.dependencies?.['@google/design.md'], undefined, 'a required dependency would break installs that omit it');
  });

  it('loads the linter the way engine.ts imports it', async () => {
    const mod = await import('@google/design.md/linter');
    assert.equal(typeof mod.lint, 'function');
  });
});
