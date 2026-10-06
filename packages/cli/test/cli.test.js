// Run after `npm run build`: these drive the built bin, the file npm ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(PKG, 'dist', 'index.js');
const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

const run = (bin, ...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

test('version prints the package version', () => {
  const r = run(BIN, 'version');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), `designesy ${pkg.version}`);
});

test('help exits 0 and names both commands', () => {
  const r = run(BIN, 'help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /tokens <url\|file>/);
  assert.match(r.stdout, /score <url>/);
});

test('an unknown command exits 2', () => {
  assert.equal(run(BIN, 'nope').status, 2);
});

test('score and tokens reach the installed engines', () => {
  for (const cmd of ['score', 'tokens']) {
    const r = run(BIN, cmd, '--help');
    assert.equal(r.status, 0, `${cmd} --help: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /Could not find/);
  }
});

// A consumer project laid out the way npm installs it: the CLI under
// node_modules/@designesy/cli, a fake engine hoisted beside it, and
// optionally a second one nested inside the CLI (a version conflict).
// Each fake engine has the real packages' exports shape and prints its name.
function project({ nested }) {
  const root = mkdtempSync(join(tmpdir(), 'designesy-cli-'));
  const cli = join(root, 'node_modules', '@designesy', 'cli');
  mkdirSync(join(cli, 'dist'), { recursive: true });
  cpSync(BIN, join(cli, 'dist', 'index.js'));
  writeFileSync(join(cli, 'package.json'), JSON.stringify({ name: '@designesy/cli', version: pkg.version, type: 'module' }));
  const engine = (dir, label) => {
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: '@designesy/score', type: 'module',
      exports: { '.': { types: './dist/engine.d.ts', import: './dist/engine.js' } },
    }));
    writeFileSync(join(dir, 'dist', 'engine.js'), 'export {};\n');
    writeFileSync(join(dir, 'dist', 'cli.js'), `console.log(${JSON.stringify(label)});\n`);
  };
  engine(join(root, 'node_modules', '@designesy', 'score'), 'hoisted');
  if (nested) engine(join(cli, 'node_modules', '@designesy', 'score'), 'nested');
  return { root, bin: join(cli, 'dist', 'index.js') };
}

test('score runs the hoisted engine when that is the only copy', (t) => {
  const p = project({ nested: false });
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  const r = run(p.bin, 'score');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'hoisted');
});

test('score runs the CLI\'s own nested engine over a conflicting hoisted one', (t) => {
  const p = project({ nested: true });
  t.after(() => rmSync(p.root, { recursive: true, force: true }));
  const r = run(p.bin, 'score');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'nested');
});
