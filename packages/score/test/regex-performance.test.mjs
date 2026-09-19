/**
 * Regex performance regression guard.
 *
 * WHY THIS EXISTS
 * A single pattern in the anti-slop scan —
 *   /[^{]*\{[^}]*background-clip\s*:\s*text[^}]*\}/gi
 * — used an UNBOUNDED, UNANCHORED `[^{]*`, so the regex engine retried it from
 * every character position across the entire stylesheet. On github.com's 3.2 MB
 * of CSS that one pattern took 56 SECONDS. A cold score went from 2.4s to 55s,
 * which stalled the weekly re-score at 26/30 and made large sites look
 * unscoreable. Measured 2026-09-19 in Node 24.
 *
 * The shape is easy to reintroduce: `[^{]*` reads as "the selector part" and
 * looks harmless. It only misbehaves at scale, and only on inputs large enough
 * that nobody notices until a real site hits it.
 *
 * WHAT THIS TEST DOES
 * It does NOT grep the source for suspicious patterns — that would only catch
 * the exact shape already known. It measures the engine's behavior on a large
 * synthetic stylesheet and fails if scoring exceeds a wall-clock budget. Any
 * future pattern that backtracks catastrophically trips it, whatever it looks
 * like.
 *
 * The budget is deliberately loose (10s for a 2 MB sheet, where a healthy
 * engine takes well under 1s). This is a backstop against exponential
 * blow-ups, not a performance benchmark — a tight threshold would flake on a
 * loaded CI runner and train people to ignore it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromParts } from '../dist/engine.js';

/**
 * Build a stylesheet that reproduces the shape which actually triggers the bug.
 *
 * FIRST ATTEMPT WAS WRONG and is recorded here because the mistake is
 * instructive: a fixture of many SHORT rules (`.cls-1 { ... }`) passed against
 * the buggy pattern — 246ms, no failure. It measured nothing. The trigger is not
 * rule count or stylesheet size; it is the length of UNBROKEN brace-free runs.
 *
 * Measured 2026-09-19 on the real buggy pattern:
 *   800 rules x 100-byte selectors, 87 KB   ->     7 ms   (no trigger)
 *    20 rules x 43,000-byte selectors, 840 KB -> 13,883 ms  (triggered)
 * github.com's real CSS has 43 KB brace-free runs and cost 56 s.
 *
 * So the fixture must contain long brace-free spans. `clips` controls how many
 * `background-clip: text` targets appear, since each target forces a fresh scan
 * of everything before it.
 */
function bigStylesheet({ longRuns = 20, runBytes = 43000, clips = 12 } = {}) {
  let out = ':root { --paper: #010102; --ink: #f5f5f7; font-size: 16px; }\n';
  // Long brace-free selector runs — the actual trigger.
  for (let i = 0; i < longRuns; i++) {
    out += 'a'.repeat(runBytes) + `{color:#010102;line-height:1.5}\n`;
  }
  // Targets spread through the sheet. Each one re-scans the preceding text.
  for (let c = 0; c < clips; c++) {
    out += `.c${c}{background-clip:text;-webkit-background-clip:text}\n`;
  }
  // A little ordinary CSS so the other checks have something to read.
  for (let i = 0; i < 200; i++) {
    out += `.x${i}{padding:8px;margin:4px;border-radius:6px}\n`;
  }
  return out;
}

const HTML = `<!doctype html><html lang="en"><head>
<title>Regression fixture</title>
<meta name="description" content="A large synthetic stylesheet for the regex backtracking guard.">
</head><body><main><h1>Fixture</h1><p>Body text for the fixture, long enough to be a real paragraph.</p></main></body></html>`;

describe('regex backtracking guard', () => {
  it('scores a long-brace-free-run stylesheet without catastrophic backtracking', async () => {
    const css = bigStylesheet();
    assert.ok(css.length > 800_000, `fixture too small: ${css.length} bytes`);

    const t0 = Date.now();
    const result = await scoreFromParts({
      html: HTML,
      css,
      subject: 'https://regression.test/',
      scope: 'universal',
      offline: true,
    });
    const elapsed = Date.now() - t0;

    // The engine is expected well under 1s here. 10s is the exponential-blowup
    // backstop: a reintroduced unbounded quantifier does not slow this down by
    // 2x, it multiplies it by 50-1000x, so the gap between healthy and broken
    // is enormous and the threshold does not need to be tight.
    assert.ok(
      elapsed < 10_000,
      `scoring a long-run stylesheet took ${elapsed}ms — that is catastrophic backtracking, not normal slowness. ` +
        `A healthy run is under 1s. Look for an unbounded quantifier (e.g. [^{]*) in a regex over \`css\`; ` +
        `anchor it to a rule boundary (?:^|}) or bound the repetition.`,
    );

    // The score must still be produced — a timeout that returns early would
    // otherwise pass this test while producing nothing.
    assert.equal(result.checks.length, 42, 'the engine must still run all 42 checks');
    assert.equal(typeof result.score, 'number');
  });

  it('stays fast on a sheet dominated by long brace-free runs', async () => {
    // The first attempt at this test compared two sizes by RATIO and passed on
    // the buggy engine — ratio thresholds are fragile because both sides are
    // noisy. An absolute per-size budget is unambiguous: either the engine
    // handles long runs quickly or it does not.
    //
    // Measured on the real buggy pattern: 840 KB of long runs = 13,850 ms.
    // Fixed: 30 ms. The gap is ~450x, so a 5s threshold cannot flake into
    // either a false pass or a false failure.
    const css = bigStylesheet({ longRuns: 20, runBytes: 43000, clips: 12 });
    const t0 = Date.now();
    await scoreFromParts({ html: HTML, css, subject: 'https://regression.test/', scope: 'universal', offline: true });
    const elapsed = Date.now() - t0;
    assert.ok(
      elapsed < 5000,
      `a ${(css.length / 1024).toFixed(0)} KB sheet of long brace-free runs took ${elapsed}ms ` +
        `(healthy is ~30ms, the historical bug was ~13,850ms). ` +
        `This is catastrophic backtracking — find the unbounded quantifier over \`css\` and anchor or bound it.`,
    );
  });
});
