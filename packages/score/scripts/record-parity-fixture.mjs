#!/usr/bin/env node
/**
 * Record the parity fixture from a live page.
 *
 * WHY THIS IS A SCRIPT AND NOT A ONE-OFF COMMAND
 * test/parity.test.mjs compares the two 42-check implementations offline, and it
 * refuses to pass if the fixture stops pinning every check the engine emits. So
 * re-recording is a maintenance step someone will need, and an instruction that
 * says "re-record it" without a script is an instruction that gets done by hand
 * and done wrong.
 *
 * WHAT IT WRITES
 * test/fixtures/parity-page.json — the page's html and css verbatim, plus the
 * verdict the engine produced from them at record time, one entry per check.
 *
 * The `why` on each pin states whether the check is reproducible offline or
 * needs the network/browser, so the exclusion list in the test cannot go stale
 * unnoticed.
 *
 * Usage:
 *   node scripts/record-parity-fixture.mjs                 # designesy.org homepage
 *   node scripts/record-parity-fixture.mjs https://example.com
 *
 * This is the ONE place in this package that needs the network, and it is
 * deliberately a manual script rather than part of `npm test`.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreFromParts } from '../dist/engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test', 'fixtures', 'parity-page.json');

const url = process.argv[2] || 'https://www.designesy.org/';
const scope = 'universal';

/** Must match NETWORK_DEPENDENT in test/parity.test.mjs. */
const NETWORK_DEPENDENT = new Set(['v02', 'v04', 'v21', 'v37']);

console.log(`Recording parity fixture from ${url} ...`);

const html = await (await fetch(url, { redirect: 'follow' })).text();
const hrefs = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');

let fetched = 0;
for (const h of hrefs.slice(0, 6)) {
  try {
    const r = await fetch(new URL(h, url).href);
    if (r.ok) {
      css += '\n' + (await r.text());
      fetched++;
    }
  } catch {
    /* a missing stylesheet just means less css to exercise */
  }
}

if (css.length < 2000) {
  console.error(`Only ${css.length} bytes of CSS collected — too little to exercise the engine. Aborting rather than writing a fixture that proves nothing.`);
  process.exit(1);
}

const result = await scoreFromParts({ html, css, scope, offline: true });

const expect = result.checks.map((c) => ({
  id: c.id,
  status: c.status,
  why: NETWORK_DEPENDENT.has(c.id)
    ? 'Needs the network or a browser; pinned so the exclusion list cannot go stale, not asserted offline.'
    : `Recorded from ${url} on the offline path; reproducible from this fixture.`,
}));

const fx = {
  sourceUrl: url,
  recordedAt: new Date().toISOString(),
  scope,
  note: `Recorded from ${url} so the parity suite can compare the two 42-check implementations OFFLINE. html and css are verbatim; expect[] is what the package engine produced from them at record time. Re-record with scripts/record-parity-fixture.mjs and STATE WHY whenever a verdict legitimately changes.`,
  html,
  css,
  expect,
  recordedScore: result.score,
  recordedGrade: result.grade,
};

writeFileSync(OUT, JSON.stringify(fx, null, 1));

console.log(`wrote ${OUT}`);
console.log(`  checks pinned : ${expect.length}`);
console.log(`  recorded score: ${result.score} ${result.grade}`);
console.log(`  html bytes    : ${html.length}`);
console.log(`  css bytes     : ${css.length} (from ${fetched} linked stylesheet(s))`);
console.log(`  fixture bytes : ${JSON.stringify(fx).length}`);
console.log('');
console.log('Next: run `SKIP_LIVE_TESTS=1 node --test test/parity.test.mjs` and confirm it passes.');
