/**
 * The review format's findings table keeps each finding in its own cells.
 *
 * A check detail carries text read from the scored page (a button label, a
 * selector). emitReview escaped the pipes in it but not the backslashes, so a
 * detail holding `\|` came out as `\\|`: an escaped backslash followed by a
 * live cell separator, and the row gained a column. Backslashes are escaped
 * first now. The site's copy of emitReview (apps/site/app/api/score/route.ts)
 * is held identical to this one by scripts/source-drift.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromParts, emitReview } from '../dist/engine.js';

/** Pipes a GFM table reads as cell separators: not escaped by an odd backslash run. */
function liveSeparators(row) {
  let n = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] !== '|') continue;
    let slashes = 0;
    for (let j = i - 1; j >= 0 && row[j] === '\\'; j--) slashes++;
    if (slashes % 2 === 0) n++;
  }
  return n;
}

const HTML = `<!doctype html><html lang="en"><head><title>Fixture</title></head>
<body><main><h1>Fixture</h1><p>A paragraph of body text.</p></main></body></html>`;

describe('emitReview cell escaping', () => {
  it('keeps a detail holding backslashes and pipes inside its cell', async () => {
    const result = await scoreFromParts({ html: HTML, css: 'body{color:#000}', subject: 'https://example.test/', scope: 'universal', offline: true });
    const target = result.checks.find((c) => c.status === 'WARN' || c.status === 'FAIL');
    assert.ok(target, 'the fixture must produce at least one finding row');
    target.detail = 'label a\\|b, pattern x\\d+\\|y, plain e|f';
    target.remediation = 'try g\\|h';

    const review = emitReview('https://example.test/', result);
    const row = review.split('\n').find((line) => line.includes('label a'));
    assert.ok(row, 'the edited finding must appear in the table');
    // | # | Severity | Domain | Location | Before | After | Why |  -> 8 separators
    assert.equal(liveSeparators(row), 8, `row split into extra cells: ${row}`);
    assert.ok(row.includes('label a\\\\\\|b'), `backslash then pipe must print as \\\\ then \\|: ${row}`);
  });
});
