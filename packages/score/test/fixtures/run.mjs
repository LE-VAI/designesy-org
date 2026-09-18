/**
 * Corpus runner — scores every fixture offline and reports the actual verdicts.
 *
 * Run directly (`node test/fixtures/run.mjs`) to print the observed matrix.
 * Imported by corpus.test.mjs, which asserts the pinned expectations.
 *
 * This is intentionally a thin harness. It must call the SAME engine entry
 * point the production path uses (scoreFromParts), or the corpus would verify
 * a copy rather than the shipped behavior.
 */
import { scoreFromParts } from '../../dist/engine.js';
import { FIXTURES } from './corpus.mjs';

/** Score every fixture offline and return the observed results. */
export async function runCorpus() {
  const rows = [];
  for (const fx of FIXTURES) {
    // fetchOnly fixtures exercise scoreUrl's fetch path, which needs the
    // network. The offline matrix skips them; they are asserted in
    // corpus.test.mjs instead, where a real unreachable host is used.
    if (fx.fetchOnly) continue;
    const result = await scoreFromParts({
      html: fx.html,
      css: fx.css,
      // Scope is explicit per fixture — see the note in corpus.mjs. Letting it
      // default would grade these as external sites and silently change the
      // verdicts the fixtures pin.
      scope: fx.scope || 'universal',
      offline: true,
    });
    const byId = new Map(result.checks.map((c) => [c.id, c]));
    rows.push({ fixture: fx, result, byId });
  }
  return rows;
}

/** Print the observed matrix: per-fixture score plus every pinned check's status. */
export async function printMatrix() {
  const rows = await runCorpus();
  let mismatches = 0;
  for (const { fixture, result, byId } of rows) {
    console.log(`\n${fixture.name}  —  ${result.score} ${result.grade}`);
    console.log(`  ${fixture.referent}`);
    console.log(
      `  p/f/w/s/m = ${result.pass}/${result.fail}/${result.warn}/${result.skip}/${result.manual} of ${result.total}`,
    );
    for (const e of fixture.expect) {
      const actual = byId.get(e.id);
      const got = actual ? actual.status : '(absent)';
      const ok = got === e.status;
      if (!ok) mismatches++;
      console.log(`    ${ok ? 'ok  ' : 'DIFF'} ${e.id} expected=${e.status} actual=${got}`);
      if (!ok) console.log(`           why pinned: ${e.why}`);
    }
    if (fixture.scoreBetween) {
      const [lo, hi] = fixture.scoreBetween;
      const inRange = result.score >= lo && result.score <= hi;
      if (!inRange) mismatches++;
      console.log(`    ${inRange ? 'ok  ' : 'DIFF'} score in [${lo}, ${hi}] actual=${result.score}`);
    }
  }
  console.log(`\n${mismatches} expectation mismatch(es) across ${rows.length} fixtures.`);
  return mismatches;
}

// Direct invocation prints the matrix and exits non-zero on mismatch.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  printMatrix().then((n) => process.exit(n > 0 ? 1 : 0));
}
