/**
 * @designesy/lab-builder — test suite.
 *
 * Run:  npm test
 *
 * Uses Node's built-in test runner (node:test). No dependencies, matching the
 * package's own zero-dependency rule. Everything runs against a temp directory
 * and cleans up after itself, so `npm test` never touches the working tree.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LAB_ANATOMY,
  slugify,
  kebabToTitle,
  scaffoldLab,
  listLabs,
  verifyLab,
} from '../src/index.js';

let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'lab-builder-test-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

// ── slugify ───────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    assert.equal(slugify('Signal Garden'), 'signal-garden');
  });

  it('collapses runs of separators', () => {
    assert.equal(slugify('Signal   Garden -- Two'), 'signal-garden-two');
  });

  it('strips leading and trailing separators', () => {
    assert.equal(slugify('  --Signal Garden--  '), 'signal-garden');
  });

  it('drops punctuation that cannot survive a directory name', () => {
    assert.equal(slugify('Field Zero: A Study!'), 'field-zero-a-study');
  });
});

// ── kebabToTitle ──────────────────────────────────────────────────────

describe('kebabToTitle', () => {
  it('title-cases a kebab slug', () => {
    assert.equal(kebabToTitle('signal-garden'), 'Signal Garden');
  });

  it('passes a single word through capitalized', () => {
    assert.equal(kebabToTitle('poise'), 'Poise');
  });
});

// ── scaffoldLab ───────────────────────────────────────────────────────

describe('scaffoldLab', () => {
  let result;

  before(async () => {
    result = await scaffoldLab({
      name: 'Test Lab',
      thesis: 'A thesis the scaffold should carry into THESIS.md.',
      dir: join(root, 'scaffold'),
    });
  });

  it('returns the lab path and slug', () => {
    assert.equal(result.slug, 'test-lab');
    assert.ok(result.path.endsWith('test-lab'));
  });

  it('writes every file in LAB_ANATOMY plus index.html', () => {
    const anatomyFiles = LAB_ANATOMY.map((a) => a.split(' ')[0]);
    for (const f of anatomyFiles) {
      assert.ok(result.files.includes(f), `missing ${f}`);
    }
    assert.ok(result.files.includes('index.html'));
  });

  it('carries the thesis into THESIS.md', async () => {
    const text = await readFile(join(result.path, 'THESIS.md'), 'utf8');
    assert.ok(text.includes('A thesis the scaffold should carry into THESIS.md.'));
  });

  it('does NOT write tokens.json unless asked', async () => {
    await assert.rejects(
      readFile(join(result.path, 'tokens.json'), 'utf8'),
      /ENOENT/,
    );
  });

  it('honours an explicit --slug over the derived one', async () => {
    const r = await scaffoldLab({
      name: 'Ignored Name',
      thesis: 'x',
      slug: 'explicit-slug',
      dir: join(root, 'slug-override'),
    });
    assert.equal(r.slug, 'explicit-slug');
  });

  it('writes tokens.json when withTokens is set', async () => {
    const r = await scaffoldLab({
      name: 'Token Lab',
      thesis: 'x',
      dir: join(root, 'with-tokens'),
      withTokens: true,
    });
    assert.ok(r.files.includes('tokens.json'));
    const raw = await readFile(join(r.path, 'tokens.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed, 'object');
  });
});

// ── verifyLab ─────────────────────────────────────────────────────────

describe('verifyLab', () => {
  it('reports ok for every artifact a fresh scaffold wrote', async () => {
    const r = await scaffoldLab({
      name: 'Verify Me',
      thesis: 'x',
      dir: join(root, 'verify'),
    });
    const report = await verifyLab(r.path);
    const missing = report.filter((x) => x.status !== 'ok');
    assert.deepEqual(missing, [], `unexpected missing: ${JSON.stringify(missing)}`);
  });

  it('reports missing for an artifact that was removed', async () => {
    const r = await scaffoldLab({
      name: 'Verify Missing',
      thesis: 'x',
      dir: join(root, 'verify-missing'),
    });
    await rm(join(r.path, 'PRINCIPLE.md'));
    const report = await verifyLab(r.path);
    const principle = report.find((x) => x.artifact === 'PRINCIPLE.md');
    assert.equal(principle.status, 'missing');
  });

  it('reports every artifact missing for an empty directory', async () => {
    const empty = join(root, 'empty-lab');
    await mkdir(empty, { recursive: true });
    const report = await verifyLab(empty);
    // The clause that could not fail: an empty dir must not read as complete.
    assert.ok(report.length > 0);
    assert.equal(report.filter((x) => x.status === 'ok').length, 0);
  });
});

// ── listLabs ──────────────────────────────────────────────────────────

describe('listLabs', () => {
  it('lists a scaffolded lab', async () => {
    const dir = join(root, 'list');
    await scaffoldLab({ name: 'Listed Lab', thesis: 'x', dir });
    const labs = await listLabs(dir);
    assert.equal(labs.length, 1);
    assert.equal(labs[0].slug, 'listed-lab');
    assert.equal(labs[0].name, 'Listed Lab');
  });

  it('ignores a directory with no THESIS.md', async () => {
    const dir = join(root, 'list-ignore');
    await mkdir(join(dir, 'not-a-lab'), { recursive: true });
    await writeFile(join(dir, 'not-a-lab', 'README.md'), 'x', 'utf8');
    const labs = await listLabs(dir);
    assert.deepEqual(labs, []);
  });

  it('returns an empty list for a directory that does not exist', async () => {
    const labs = await listLabs(join(root, 'does-not-exist'));
    assert.deepEqual(labs, []);
  });
});

// ── LAB_ANATOMY ───────────────────────────────────────────────────────

describe('LAB_ANATOMY', () => {
  it('is non-empty and every entry names a file', () => {
    assert.ok(LAB_ANATOMY.length >= 10);
    for (const a of LAB_ANATOMY) {
      assert.match(a, /^\S+\.(md|html)\b/, `not a filename: ${a}`);
    }
  });

  it('has no duplicate artifact names', () => {
    const files = LAB_ANATOMY.map((a) => a.split(' ')[0]);
    assert.equal(new Set(files).size, files.length);
  });
});
