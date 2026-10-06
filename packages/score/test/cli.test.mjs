/**
 * CLI integration tests — spawns the actual CLI binary and asserts on
 * exit codes, stdout, and stderr. Uses execFileSync for synchronous capture.
 *
 * These tests hit real URLs and may take a few seconds. Gate with
 * SKIP_LIVE_TESTS=1 to skip network-dependent tests.
 *
 * Zero dependencies: node:test + node:assert/strict + node:child_process only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', 'dist', 'cli.js');
const SKIP_LIVE = process.env.SKIP_LIVE_TESTS === '1';

/**
 * Run the CLI with given args, return { status, stdout, stderr }.
 * execFileSync throws on non-zero exit — we catch and extract the fields.
 */
function runCli(...args) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: 'utf8',
      timeout: 30000,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

/** Like runCli, but keeps stderr on success too (execFileSync drops it). */
function spawnCli(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', timeout: 60000 });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('CLI — argument validation', () => {
  it('exits 2 when no URL is provided', () => {
    const r = runCli();
    assert.equal(r.status, 2);
    assert.match(r.stderr, /url is required/i);
  });

  it('exits 2 for invalid URL', () => {
    const r = runCli('not-a-valid-url');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /invalid url/i);
  });

  it('exits 2 for unknown --format value', () => {
    const r = runCli('example.com', '--format', 'xml');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /format must be one of/i);
  });

  it('exits 2 for invalid --min-grade', () => {
    const r = runCli('example.com', '--min-grade', 'X');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /min-grade must be one of/i);
  });

  it('exits 0 for --help', () => {
    const r = runCli('--help');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /designesy-score/i);
    assert.match(r.stdout, /usage/i);
  });
});

describe('CLI — scoring (live network)', { skip: SKIP_LIVE }, () => {
  it('scores example.com and exits 0 with default gate', () => {
    const r = runCli('example.com', '--quiet');
    // --quiet means no output on success (gate is disabled by default)
    assert.equal(r.status, 0);
  });

  it('exits 1 when --min-score is above the actual score', () => {
    // example.com typically scores ~68 — set the bar at 90
    const r = runCli('example.com', '--min-score', '90', '--quiet');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /quality gate failed/i);
  });

  // No --quiet: progress and the gate verdict print on a normal run, and they
  // must land on stderr. The --quiet tests below cannot see this; 0.5.0 put
  // both lines on stdout around the JSON and every one of them still passed.
  it('--json without --quiet writes only JSON to stdout', () => {
    for (const extra of [[], ['--format', 'canonical'], ['--format', 'google']]) {
      const r = spawnCli('example.com', '--json', ...extra);
      assert.equal(r.status, 0, r.stderr);
      assert.doesNotThrow(() => JSON.parse(r.stdout), `stdout for ${extra.join(' ') || 'default'} is not pure JSON`);
      assert.match(r.stderr, /Scoring https:\/\/example\.com\//);
      assert.match(r.stderr, /Quality gate passed/);
    }
  });

  // A linter missing from THIS runtime says nothing about the site, so v37
  // must not cost the site points: MANUAL (weight 0), never WARN. This package
  // ships without @google/design.md, so a site that serves /DESIGN.md takes
  // that branch here.
  it('v37 is MANUAL, not WARN, when the DESIGN.md linter is unavailable', () => {
    const r = spawnCli('https://www.designesy.org/', '--json');
    assert.equal(r.status, 0, r.stderr);
    const v37 = JSON.parse(r.stdout).checks.find((c) => c.id === 'v37');
    assert.ok(v37, 'v37 missing from the result');
    if (/linter unavailable/.test(v37.detail)) assert.equal(v37.status, 'MANUAL', v37.detail);
    else assert.match(v37.detail, /linted|not publicly served/, `v37 took an unexpected branch: ${v37.detail}`);
  });

  it('outputs valid JSON with --json --format canonical', () => {
    const r = runCli('example.com', '--format', 'canonical', '--json', '--quiet');
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.schemaVersion, '1.0');
    assert.equal(typeof parsed.summary.score, 'number');
    assert.match(parsed.summary.grade || '', /^[A-F]$/);
  });
});