#!/usr/bin/env node
/**
 * retired literals, every package: no retired brand colour ships from any
 * package this repo publishes.
 *
 * WHY THIS EXISTS
 * apps/site/scripts/check-retired-literals.js keeps the retired palette out of
 * the site. The packages ship on their own (npm, PyPI, the GitHub Action, the
 * MCP registry), and nothing read them: a retired hex in a package's README,
 * a default in a CLI or a colour in an icon would publish with no gate in the
 * way. The owner put the gate on every package, with one list (brand ledger
 * D44, D46).
 *
 * THE LIST
 * Not written here. Both this gate and the site gate read
 * apps/site/scripts/retired-literals.json through
 * apps/site/scripts/lib/retired-literals.js, and run its self-test vectors
 * before scanning. designesy/score-action reads the same file at a pinned
 * commit.
 *
 * WHAT IT READS
 * What each package publishes, derived from its own manifest rather than
 * written down here, so a package that adds a shipped file is covered by the
 * same change:
 *   - npm packages (packages/* with package.json, and the repo root package):
 *     package.json, README*, LICENSE*, main, bin and every `files` entry. An
 *     entry under dist/ is built, not committed, so the gate reads the
 *     tsconfig rootDir it is compiled from (and dist/ too when it exists).
 *   - the Python package (packages/* with pyproject.toml): the hatch sdist
 *     include list, the wheel packages and force-include files, the readme and
 *     license files.
 *   - the GitHub Action in this repo: action.yml and action/ (its dist bundle
 *     is committed and is what runs).
 * Not node_modules, not tests, not the packages' own scripts/: none of them
 * publish. Every packages/* directory must resolve to one of the shapes above;
 * one that does not fails the gate rather than going unread.
 *
 * THE ALLOWLIST
 * Explicit, per file and per line, each with its reason: a fixture that
 * proves a gate fails, an adoption_history line, a changelog line. An entry
 * that no longer matches anything fails the gate, so the list cannot outlive
 * the lines it excuses. It is empty: on the day it landed no package shipped
 * a retired literal.
 *
 * GUARDING THE GUARD
 * Every run also proves, per package, that a retired literal added to a file
 * the package ships is blocked. A package that reads no files, or whose files
 * would let a literal through, fails the run.
 *
 * Usage:  node scripts/check-retired-literals-packages.js [--json]
 *         node scripts/check-retired-literals-packages.js --self-test
 * Exits 1 on any finding outside the allowlist, a stale allowlist entry, a
 * package whose shipped files cannot be resolved, or a failed proof.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildPatterns, selfTest, matchLine, loadList } = require(
  path.join(ROOT, 'apps', 'site', 'scripts', 'lib', 'retired-literals.js'),
);

/**
 * Lines allowed to carry a retired literal. `file` is repo-relative with
 * forward slashes; `includes` must appear on the line itself.
 */
const ALLOWLIST = [];

/**
 * Files outside a package directory that publish with it. server.json and
 * glama.json describe the MCP package to the MCP registry and Glama.
 */
const EXTRA = {
  'packages/designesy-mcp': ['server.json', 'glama.json'],
};

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', '.next']);
const GLOB = /[*?[\]{}!]/;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

/** The directory a dist/ path is compiled from, read from tsconfig rootDir. */
function sourceOfDist(absPath) {
  const parts = rel(absPath).split('/');
  const i = parts.indexOf('dist');
  if (i === -1) return null;
  const pkgDir = path.join(ROOT, ...parts.slice(0, i));
  const tsconfig = path.join(pkgDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfig)) return null;
  const m = fs.readFileSync(tsconfig, 'utf8').match(/"rootDir"\s*:\s*"([^"]+)"/);
  const src = path.join(pkgDir, m ? m[1] : 'src');
  return fs.existsSync(src) ? src : null;
}

/**
 * Resolves one declared shipped path to files on disk. A path that is
 * missing and is not a build output is a declaration the gate cannot read,
 * which fails the run.
 */
function resolveEntry(base, entry, unit) {
  const clean = entry.replace(/^\.\//, '').replace(/\/$/, '');
  if (GLOB.test(clean)) {
    unit.unresolved.push(`${entry}: globs are not resolved by this gate; list the path plainly or extend resolveEntry()`);
    return;
  }
  const abs = path.join(base, clean);
  const add = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, unit.files);
    else unit.files.push(p);
  };
  const src = sourceOfDist(abs);
  if (fs.existsSync(abs)) add(abs);
  if (src) {
    add(src);
    unit.roots.add(`${rel(src)} (compiled to dist/)`);
    if (fs.existsSync(abs)) unit.roots.add(rel(abs));
    return;
  }
  if (!fs.existsSync(abs)) {
    unit.unresolved.push(`${entry}: declared as shipped, but neither present nor a dist/ build output with a tsconfig rootDir`);
    return;
  }
  unit.roots.add(rel(abs));
}

function alwaysShipped(dir) {
  // npm publishes these whatever `files` says.
  return fs.readdirSync(dir).filter((n) => /^(readme|license|licence)(\..*)?$/i.test(n));
}

function npmUnit(dir, label) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const unit = { name: label || pkg.name, dir: rel(dir) || '.', files: [], roots: new Set(), unresolved: [] };
  const entries = ['package.json', ...alwaysShipped(dir)];
  if (typeof pkg.main === 'string') entries.push(pkg.main);
  if (typeof pkg.bin === 'string') entries.push(pkg.bin);
  else if (pkg.bin) entries.push(...Object.values(pkg.bin));
  if (Array.isArray(pkg.files)) entries.push(...pkg.files);
  else unit.unresolved.push('package.json has no `files` list, so npm would publish the whole directory; declare `files` or extend npmUnit()');
  for (const e of new Set(entries)) resolveEntry(dir, e, unit);
  return unit;
}

/** The quoted strings of a TOML array value `key = [ ... ]` inside a section. */
function tomlArray(section, key) {
  const m = section.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
}

function tomlSections(text) {
  const out = {};
  let name = '';
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (h) { name = h[1].trim(); out[name] = ''; continue; }
    out[name] = (out[name] || '') + line + '\n';
  }
  return out;
}

function pythonUnit(dir) {
  const text = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8');
  const sec = tomlSections(text);
  const project = sec.project || '';
  const nameM = project.match(/^name\s*=\s*"([^"]+)"/m);
  const unit = { name: `${nameM ? nameM[1] : path.basename(dir)} (PyPI)`, dir: rel(dir), files: [], roots: new Set(), unresolved: [] };
  const entries = ['pyproject.toml'];
  const readme = project.match(/^readme\s*=\s*"([^"]+)"/m);
  if (readme) entries.push(readme[1]);
  entries.push(...(tomlArray(project, 'license-files') || []));
  const sdist = tomlArray(sec['tool.hatch.build.targets.sdist'] || '', 'include');
  if (!sdist) unit.unresolved.push('pyproject.toml has no [tool.hatch.build.targets.sdist] include list, so the gate cannot tell what this package ships; extend pythonUnit()');
  entries.push(...(sdist || []));
  entries.push(...(tomlArray(sec['tool.hatch.build.targets.wheel'] || '', 'packages') || []));
  const force = sec['tool.hatch.build.targets.wheel.force-include'] || '';
  entries.push(...[...force.matchAll(/^"([^"]+)"\s*=/gm)].map((m) => m[1]));
  for (const e of new Set(entries)) resolveEntry(dir, e, unit);
  return unit;
}

function discoverUnits() {
  const units = [];
  const pkgRoot = path.join(ROOT, 'packages');
  for (const name of fs.readdirSync(pkgRoot).sort()) {
    const dir = path.join(pkgRoot, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    let unit;
    if (fs.existsSync(path.join(dir, 'package.json'))) unit = npmUnit(dir);
    else if (fs.existsSync(path.join(dir, 'pyproject.toml'))) unit = pythonUnit(dir);
    else {
      unit = { name: `packages/${name}`, dir: `packages/${name}`, files: [], roots: new Set(), unresolved: [] };
      unit.unresolved.push('no package.json or pyproject.toml, so the gate cannot tell what it ships; extend discoverUnits()');
    }
    for (const extra of EXTRA[rel(dir)] || []) resolveEntry(ROOT, extra, unit);
    units.push(unit);
  }
  units.push(npmUnit(ROOT, 'designesy-score (repo root package)'));
  const action = { name: 'GitHub Action (action.yml, action/)', dir: 'action', files: [], roots: new Set(), unresolved: [] };
  resolveEntry(ROOT, 'action.yml', action);
  resolveEntry(ROOT, 'action', action);
  units.push(action);
  return units;
}

/** Text content of a file, or null for a binary one (a NUL byte). */
function readText(file) {
  const buf = fs.readFileSync(file);
  return buf.includes(0) ? null : buf.toString('utf8');
}

function scanText(file, text, unit, patterns) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of matchLine(line, patterns)) {
      findings.push({ unit: unit.name, file, line: i + 1, ...m, text: line.trim().slice(0, 160) });
    }
  });
  return findings;
}

function classify(findings) {
  const used = new Set();
  const blocked = [];
  const allowed = [];
  for (const f of findings) {
    const idx = ALLOWLIST.findIndex((a) => a.file === f.file && f.text.includes(a.includes));
    if (idx === -1) blocked.push(f);
    else {
      used.add(idx);
      allowed.push({ ...f, reason: ALLOWLIST[idx].reason });
    }
  }
  const stale = ALLOWLIST.filter((a, i) => !used.has(i));
  return { blocked, allowed, stale };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const list = loadList();
  const patterns = buildPatterns(list);
  const tag = 'retired-literals (packages)';

  if (args.includes('--self-test')) process.exit(selfTest(patterns, list, tag) ? 0 : 1);
  if (!selfTest(patterns, list, tag)) process.exit(1);

  const units = discoverUnits();
  const seen = new Set();
  const findings = [];
  const proofFailures = [];
  for (const unit of units) {
    unit.read = 0;
    unit.binary = 0;
    let probe = null;
    for (const abs of unit.files) {
      const file = rel(abs);
      if (seen.has(file)) continue; // read once, under the first package that ships it
      seen.add(file);
      const text = readText(abs);
      if (text === null) { unit.binary++; continue; }
      unit.read++;
      if (!probe) probe = { file, text };
      findings.push(...scanText(file, text, unit, patterns));
    }
    // The proof: one retired literal added to a file this package ships must
    // be blocked, attributed to this package.
    if (!probe) {
      proofFailures.push(`${unit.name}: no text file read, so nothing it ships is checked`);
    } else {
      const injected = `${probe.text}\n/* injected by the proof */ color: #${list.hex[0].hex.toUpperCase()};`;
      const { blocked } = classify(scanText(probe.file, injected, unit, patterns));
      if (!blocked.some((f) => f.unit === unit.name && f.text.startsWith('/* injected by the proof */'))) {
        proofFailures.push(`${unit.name}: a literal injected into ${probe.file} was not blocked`);
      }
      unit.probe = probe.file;
    }
  }

  const { blocked, allowed, stale } = classify(findings);
  const unresolved = units.flatMap((u) => u.unresolved.map((r) => `${u.name}: ${r}`));
  const ok = !blocked.length && !stale.length && !unresolved.length && !proofFailures.length;

  const counts = (unitName) => {
    const c = Object.fromEntries(patterns.map((p) => [p.label, 0]));
    for (const f of findings) if (f.unit === unitName) c[f.retired]++;
    return c;
  };

  if (asJson) {
    console.log(JSON.stringify({
      ok,
      units: units.map((u) => ({ name: u.name, dir: u.dir, roots: [...u.roots], filesRead: u.read, binarySkipped: u.binary, proofFile: u.probe || null, counts: counts(u.name) })),
      blocked, allowed, stale, unresolved, proofFailures,
    }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  const filesRead = units.reduce((n, u) => n + u.read, 0);
  console.log(`${tag}: ${units.length} packages, ${filesRead} files read, ${blocked.length} blocked, ${allowed.length} allowlisted, ${stale.length} stale allowlist entries`);
  for (const u of units) {
    const c = counts(u.name);
    const hits = Object.entries(c).filter(([, n]) => n).map(([l, n]) => `${l} ${n}`);
    console.log(`  ${u.name.padEnd(42)} ${String(u.read).padStart(4)} files  ${hits.length ? hits.join(', ') : 'every retired literal 0'}`);
    console.log(`    reads: ${[...u.roots].join(', ')}`);
  }
  console.log(`  proof: ${units.length - proofFailures.length}/${units.length} packages block a literal injected into a file they ship`);
  for (const f of blocked) console.log(`  BLOCKED ${f.file}:${f.line}  ${f.literal}  (${f.why})  [${f.unit}]`);
  for (const f of allowed) console.log(`  allowed ${f.file}:${f.line}  ${f.literal}`);
  for (const a of stale) console.log(`  STALE allowlist entry: ${a.file} "${a.includes}"`);
  for (const r of unresolved) console.log(`  UNRESOLVED ${r}`);
  for (const r of proofFailures) console.log(`  PROOF FAILED ${r}`);
  process.exit(ok ? 0 : 1);
}

main();
