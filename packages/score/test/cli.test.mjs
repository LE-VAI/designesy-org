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
import { execFileSync } from 'node:child_process';
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

  it('outputs valid JSON with --json --format canonical', () => {
    const r = runCli('example.com', '--format', 'canonical', '--json', '--quiet');
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.schemaVersion, '1.0');
    assert.equal(typeof parsed.summary.score, 'number');
    assert.match(parsed.summary.grade || '', /^[A-F]$/);
  });
});