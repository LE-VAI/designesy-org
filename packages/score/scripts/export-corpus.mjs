#!/usr/bin/env node
/**
 * Export the calibration corpus as a machine-readable artifact.
 *
 * WHY: the corpus is only evidence if someone else can consume it. A fixture
 * file inside a test directory is browsable; a versioned JSON document with the
 * engine version, the observed verdicts, and a digest is citable. This writes
 * that document.
 *
 * The export records OBSERVED results alongside the pinned expectations, so a
 * reader can see both what we claim and what the engine actually returned. A
 * corpus that published only its expectations would be an assertion; publishing
 * both lets a third party diff them.
 *
 * Usage:
 *   node scripts/export-corpus.mjs            # writes corpus.json, prints summary
 *   node scripts/export-corpus.mjs --check    # fails if the file is stale
 *
 * Wired into CI via --check so the published artifact cannot drift from the
 * fixtures it describes.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCorpus } from '../test/fixtures/run.mjs';
import { FIXTURES } from '../test/fixtures/corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'corpus.json');

/**
 * Version of the corpus itself — bump when fixtures are added, removed, or
 * re-pinned. Independent of the engine version: a corpus can grow while the
 * engine is unchanged, and conflating them would make it impossible to say
 * whether a verdict moved because the engine changed or the test did.
 *
 * 1.1.0 (2026-09-25) — added the font-family alias-resolution trio
 * (font-aliases-resolve-to-faces, -control-five-declared-directly,
 * -two-hop-chain), which pin the resolver defect that silently DROPPED every
 * aliased font declaration and PASSED pages whose typefaces were all reached
 * through tokens.
 */
const CORPUS_VERSION = '1.1.0';

/**
 * Engine version. Read from the server constant when reachable; the package
 * engine does not export one of its own yet, so this is pinned and asserted
 * against the fixtures' observed behavior. Kept explicit rather than omitted:
 * an unpinned version would make the artifact unattributable.
 */
const ENGINE_VERSION = '1.0.0';

async function build() {
  const rows = await runCorpus();

  const fixtures = rows.map(({ fixture, result, byId }) => ({
    name: fixture.name,
    referent: fixture.referent,
    scope: fixture.scope || 'universal',
    observed: {
      score: result.score,
      grade: result.grade,
      counts: {
        pass: result.pass,
        fail: result.fail,
        warn: result.warn,
        skip: result.skip,
        manual: result.manual,
        total: result.total,
      },
    },
    expectations: fixture.expect.map((e) => {
      const actual = byId.get(e.id);
      return {
        id: e.id,
        expected: e.status,
        observed: actual ? actual.status : null,
        matches: !!actual && actual.status === e.status,
        why: e.why,
      };
    }),
    scoreBetween: fixture.scoreBetween || null,
  }));

  // Digest over the observed verdict matrix only. Same construction as the
  // per-score receipt: verdicts, never timings. Two runs of the same corpus at
  // the same engine version must produce the same digest.
  const digest = createHash('sha256')
    .update(
      fixtures
        .map(
          (f) =>
            `${f.name}|${f.scope}|${f.observed.score}|` +
            f.expectations.map((e) => `${e.id}:${e.observed}`).join(','),
        )
        .join('\n'),
      'utf8',
    )
    .digest('hex');

  const totalChecks = fixtures.reduce((n, f) => n + f.expectations.length, 0);
  const matching = fixtures.reduce(
    (n, f) => n + f.expectations.filter((e) => e.matches).length,
    0,
  );

  return {
    corpus_version: CORPUS_VERSION,
    engine_version: ENGINE_VERSION,
    fixtures: fixtures.length,
    pinned_checks: totalChecks,
    pinned_checks_matching: matching,
    digest,
    note:
      'Known-answer fixtures for the Designesy scoring engine. Each fixture pins expected ' +
      'verdicts for named checks, and `observed` records what the engine actually returned. ' +
      'A mismatch between expected and observed means the engine changed behavior for a known ' +
      'input — either a regression, or an intentional change whose pin was not yet updated. ' +
      'Fixtures whose name starts with "broken-" are deliberately defective pages; they exist ' +
      'so the corpus can catch a check that stopped detecting something, which a corpus of ' +
      'well-formed pages alone cannot do.',
    fixtures_detail: fixtures,
  };
}

const checkMode = process.argv.includes('--check');
const doc = await build();
const serialized = JSON.stringify(doc, null, 2) + '\n';

if (checkMode) {
  if (!existsSync(OUT)) {
    console.error('corpus.json is missing — run: node scripts/export-corpus.mjs');
    process.exit(1);
  }
  const current = readFileSync(OUT, 'utf8');
  if (current !== serialized) {
    console.error(
      'corpus.json is STALE — the fixtures changed but the published artifact did not.\n' +
        'Run: node scripts/export-corpus.mjs',
    );
    process.exit(1);
  }
  console.log(`corpus.json is current (${doc.fixtures} fixtures, digest ${doc.digest.slice(0, 16)}…)`);
  process.exit(0);
}

writeFileSync(OUT, serialized, 'utf8');
console.log(
  `wrote corpus.json — ${doc.fixtures} fixtures, ${doc.pinned_checks} pinned verdicts, ` +
    `${doc.pinned_checks_matching} matching, digest ${doc.digest.slice(0, 16)}…`,
);
if (doc.pinned_checks_matching !== doc.pinned_checks) {
  console.error(
    `WARNING: ${doc.pinned_checks - doc.pinned_checks_matching} pinned verdict(s) do not match — the corpus is not clean.`,
  );
  process.exit(1);
}
