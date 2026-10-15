#!/usr/bin/env node
/**
 * Sibling contract locks: a published sibling contract's served text cannot
 * change while its version stands still, and every version past 0.1.0 has its
 * line in /changelog.
 *
 * WHY THIS EXISTS (2026-10-13)
 * The home page says every contract change is versioned and dated, with the
 * checks it touched and the reason for it, in the public changelog. Any
 * edit to a published contract's served text is at
 * least a patch bump with a dated /changelog line, even when no rule, threshold
 * or weight moves. scripts/check-contract-lock.js held that for the
 * design-system contract only. The ten siblings in app/lib/*-contract.ts (a11y,
 * compare, components, drift, guardrails, monitor, motion, readiness, report,
 * tokens) had no lock: an audit found commits after the last version change in
 * seven of them, and /changelog named almost none of their versions.
 *
 * HOW
 * scripts/sibling-contracts.lock.json records, per contract, {id, version,
 * value, source}:
 *
 *   value   sha256 of the canonical evaluated export (the object the
 *           /contracts/<slug>.json route serves), with `version` and `updated`
 *           left out. Canonical form, loader and hash are the design-system
 *           gate's own, required from scripts/check-contract-lock.js.
 *   source  sha256 of the module source with the top-level `version:` and
 *           `updated:` values blanked, reprinted by the TypeScript printer
 *           with comments removed. Whitespace, comments and quote style do not
 *           move it; an edit to any authored text does.
 *
 * Two hashes, because a sibling can serve text it does not author: components
 * reads designSystemContract, report reads ENGINE_CHECK_COUNT, tokens reads
 * CONTRACT_VERSION. When the design-system contract or the engine moves, the
 * sibling's value moves with no edit to the sibling, and that change is
 * versioned where it was made. When the source moves and the value holds, the
 * edit was a refactor. Only both moving together is an authored change to
 * served text:
 *
 *   same version, value and source moved   FAIL  bump the version, add the /changelog line
 *   same version, value moved only         PASS  inherited from an import; refresh the lock
 *   same version, source moved only        PASS  a refactor; refresh the lock
 *   version moved, lock did not            FAIL  run `npm run update-sibling-contract-locks`
 *   version went down                      FAIL
 *   contract with no lock entry            FAIL
 *   lock entry with no contract            FAIL
 *   version above 0.1.0, no /changelog     FAIL  add an entry whose version is '<slug> v<x.y.z>'
 *
 * Refresh after a pass-with-note, so the next authored edit is measured from
 * a current lock and does not collect an old inherited move with it.
 *
 * No git history is read, for the reasons the design-system gate gives: CI
 * checks out one commit, and the lock makes each commit self-describing.
 *
 * THE REFRESH WILL NOT LAUNDER A CHANGE
 * `--update` refuses to record a value and source move under the same version,
 * and refuses a version that moves down. It writes nothing unless every
 * contract can be recorded. `--rehash` re-records only when SCHEME or EXCLUDED
 * in this file changed.
 *
 * A CLAUSE THAT CANNOT FAIL PROVES NOTHING
 * Every run builds canaries from each contract's real source: a changed string
 * moves both hashes; a comment-free reprint, and an edit to `version` and
 * `updated`, hold both; and for each local module a contract imports, a change
 * in that module moves the value and holds the source. A contract that imports
 * a module with no canary below fails the gate, so a new import gets a decision
 * here. The changelog parse must find entries, or the gate fails.
 *
 * Usage (from apps/site):
 *   node scripts/check-sibling-contract-locks.js          the gate; exit 1 on drift
 *   npm run update-sibling-contract-locks                 refresh after a bump, or after a pass-with-note
 *   npm run update-sibling-contract-locks -- --rehash     after changing SCHEME or EXCLUDED
 */

const fs = require('node:fs');
const path = require('node:path');
const { SITE, sha256, canonical, typescript, evaluateModule, semver, compareVersions } = require('./check-contract-lock');

const LIB = path.join(SITE, 'app', 'lib');
const CHANGELOG_PATH = path.join(SITE, 'app', 'changelog', 'page.tsx');
const LOCK_PATH = path.join(__dirname, 'sibling-contracts.lock.json');
const REFRESH = 'npm run update-sibling-contract-locks';
const TAG = '[sibling-contract-locks]';

/** The design-system contract has its own lock (check-contract-lock.js). */
const NOT_A_SIBLING = new Set(['design-system-contract.ts']);

/** Raise SCHEME whenever the value or source hash changes how it is computed. */
const SCHEME = 1;

/** Top-level keys both hashes leave out. Each needs a reason a reviewer can test. */
const EXCLUDED = [
  { key: 'version', why: 'The number the hashes are bound to; the lock records it beside them.' },
  { key: 'updated', why: 'A date stamp. It moves with every bump and states no rule.' },
];
const EXCLUDED_KEYS = new Set(EXCLUDED.map((e) => e.key));

/**
 * A change in an imported module that must reach the importing contract's
 * value. Keyed by the imported file's name. A sibling that imports a local
 * module missing here fails the gate until someone adds one.
 */
const DEPENDENCY_CANARIES = {
  'design-system-contract.ts': {
    what: 'the design-system contract version',
    pattern: /(\n\s*version:\s*')\d+\.\d+\.\d+(')/,
    replace: (_m, a, b) => a + '9.9.9' + b,
  },
  'check-definitions.ts': {
    what: 'the engine check count',
    pattern: /(export const ENGINE_CHECK_COUNT = CHECKS\.length)(;)/,
    replace: (_m, a, b) => a + ' + 1' + b,
  },
};

// ── Discovery ──────────────────────────────────────────────────────────────

/** Unwrap `x as const`, `x satisfies T` and parentheses down to the literal. */
function unwrap(t, node) {
  while (node && (t.isAsExpression(node) || t.isParenthesizedExpression(node) || (t.isSatisfiesExpression && t.isSatisfiesExpression(node)))) {
    node = node.expression;
  }
  return node;
}

function propName(t, p) {
  return p.name && (t.isIdentifier(p.name) || t.isStringLiteral(p.name)) ? p.name.text : null;
}

/**
 * The contract export in a module: the one exported const whose name ends in
 * `Contract` and whose initializer is an object literal. Returns its name and
 * the literal, or throws.
 */
function contractExport(src, file) {
  const t = typescript();
  const sf = t.createSourceFile(file, src, t.ScriptTarget.Latest, true, t.ScriptKind.TS);
  const found = [];
  for (const st of sf.statements) {
    if (!t.isVariableStatement(st)) continue;
    if (!(st.modifiers || []).some((m) => m.kind === t.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) {
      if (!t.isIdentifier(d.name) || !/Contract$/.test(d.name.text)) continue;
      const lit = unwrap(t, d.initializer);
      if (lit && t.isObjectLiteralExpression(lit)) found.push({ name: d.name.text, literal: lit });
    }
  }
  if (found.length !== 1) {
    throw new Error(
      path.basename(file) + ' exports ' + found.length + ' object constants named *Contract; the gate needs exactly one',
    );
  }
  return { sf, ...found[0] };
}

/** Local modules (./x) the contract imports, as file names. */
function localImports(src, file) {
  const t = typescript();
  const sf = t.createSourceFile(file, src, t.ScriptTarget.Latest, true, t.ScriptKind.TS);
  const out = [];
  for (const st of sf.statements) {
    if (!t.isImportDeclaration(st) || !t.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.importClause && st.importClause.isTypeOnly) continue;
    const spec = st.moduleSpecifier.text;
    if (spec.startsWith('./') || spec.startsWith('../')) out.push(path.basename(spec) + '.ts');
  }
  return out;
}

function siblingFiles() {
  return fs
    .readdirSync(LIB)
    .filter((f) => /-contract\.ts$/.test(f) && !NOT_A_SIBLING.has(f))
    .sort();
}

// ── The two hashes ─────────────────────────────────────────────────────────

/** Source text with the top-level `version` and `updated` values replaced by ''. */
function blankExcluded(src, file) {
  const t = typescript();
  const { sf, literal } = contractExport(src, file);
  const spans = [];
  for (const p of literal.properties) {
    if (t.isPropertyAssignment(p) && EXCLUDED_KEYS.has(propName(t, p))) {
      spans.push([p.initializer.getStart(sf), p.initializer.end]);
    }
  }
  spans.sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e] of spans) out = out.slice(0, s) + "''" + out.slice(e);
  return out;
}

function sourceHash(src, file) {
  const t = typescript();
  const printed = t
    .createPrinter({ removeComments: true, newLine: t.NewLineKind.LineFeed })
    .printFile(t.createSourceFile(file, blankExcluded(src, file), t.ScriptTarget.Latest, true, t.ScriptKind.TS));
  return sha256(printed);
}

function valueHash(contract) {
  const covered = {};
  for (const k of Object.keys(contract)) if (!EXCLUDED_KEYS.has(k)) covered[k] = contract[k];
  return sha256(canonical(covered));
}

/**
 * Measure one sibling from source text. `io` reads its imports (the working
 * tree by default; the audit passes a git reader, the canaries an overlay).
 */
function measure(src, file, io) {
  const { name } = contractExport(src, file);
  const contract = evaluateModule(src, file, name, io);
  if (!contract || typeof contract !== 'object') throw new Error(path.basename(file) + ' does not export ' + name);
  return { id: contract.id, version: contract.version, value: valueHash(contract), source: sourceHash(src, file) };
}

// ── Canaries ───────────────────────────────────────────────────────────────

const DISK = { read: (p) => fs.readFileSync(p, 'utf8'), exists: (p) => fs.existsSync(p) };

/** A reader that serves `overrides` (path -> text) before the disk. */
function overlay(overrides) {
  return {
    read: (p) => (overrides.has(p) ? overrides.get(p) : DISK.read(p)),
    exists: (p) => overrides.has(p) || DISK.exists(p),
  };
}

/** Append ' canary' to the first string in the contract outside version and updated. */
function mutateFirstString(src, file) {
  const t = typescript();
  const { sf, literal } = contractExport(src, file);
  let hit = null;
  const visit = (n) => {
    if (hit) return;
    if (t.isStringLiteral(n) || t.isNoSubstitutionTemplateLiteral(n)) {
      const parent = n.parent;
      const isKey = parent && t.isPropertyAssignment(parent) && parent.name === n;
      if (!isKey) hit = n;
    }
    t.forEachChild(n, visit);
  };
  for (const p of literal.properties) {
    if (t.isPropertyAssignment(p) && EXCLUDED_KEYS.has(propName(t, p))) continue;
    if (t.isPropertyAssignment(p)) visit(p.initializer);
    if (hit) break;
  }
  if (!hit) return null;
  const end = hit.end - 1; // before the closing quote
  return src.slice(0, end) + ' canary' + src.slice(end);
}

function canaries(file, src, real) {
  const t = typescript();
  const label = path.basename(file);
  const problems = [];
  const cases = [];

  const changed = mutateFirstString(src, file);
  if (changed === null) problems.push(label + ': no string found to build the changed-string canary');
  else cases.push({ name: 'a changed string moves both hashes', src: changed, value: true, source: true });

  cases.push({
    name: 'a comment-free reprint holds both hashes',
    src: t
      .createPrinter({ removeComments: true, newLine: t.NewLineKind.LineFeed })
      .printFile(t.createSourceFile(file, src, t.ScriptTarget.Latest, true, t.ScriptKind.TS)),
    value: false,
    source: false,
  });

  const meta = src
    .replace(/(\n\s*version:\s*')\d+\.\d+\.\d+(')/, '$19.9.9$2')
    .replace(/(\n\s*updated:\s*')[^']*(')/, '$11970-01-01$2');
  if (meta === src) problems.push(label + ': version and updated were not found to build the metadata canary');
  else cases.push({ name: 'an edit to version and updated holds both hashes', src: meta, value: false, source: false });

  for (const dep of localImports(src, file)) {
    const c = DEPENDENCY_CANARIES[dep];
    if (!c) {
      problems.push(
        label + ' imports ' + dep + ', which has no entry in DEPENDENCY_CANARIES. Add one that changes a value ' +
          'the contract reads, so the gate can show an inherited change moves the value and not the source.',
      );
      continue;
    }
    const depPath = path.join(LIB, dep);
    const depSrc = DISK.read(depPath);
    if (!c.pattern.test(depSrc)) {
      problems.push(label + ': the ' + dep + ' canary pattern matched nothing, so it could not be built');
      continue;
    }
    cases.push({
      name: 'a change to ' + c.what + ' (' + dep + ') moves the value and holds the source',
      src,
      io: overlay(new Map([[depPath, depSrc.replace(c.pattern, c.replace)]])),
      value: true,
      source: false,
    });
  }

  const passed = [];
  for (const c of cases) {
    let m;
    try {
      m = measure(c.src, file, c.io || DISK);
    } catch (e) {
      problems.push(label + ': ' + c.name + ': the canary source did not evaluate (' + e.message + ')');
      continue;
    }
    const v = m.value !== real.value;
    const s = m.source !== real.source;
    if (v !== c.value || s !== c.source) {
      problems.push(
        label + ': ' + c.name + ': it did not (value ' + (v ? 'moved' : 'held') + ', source ' + (s ? 'moved' : 'held') + ')',
      );
    } else passed.push(c.name);
  }
  return { problems, passed };
}

// ── Changelog ──────────────────────────────────────────────────────────────

/** The `version` strings of the CHANGELOG array in app/changelog/page.tsx. */
function changelogVersions(src) {
  const t = typescript();
  const sf = t.createSourceFile('page.tsx', src, t.ScriptTarget.Latest, true, t.ScriptKind.TSX);
  let arr = null;
  for (const st of sf.statements) {
    if (!t.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (t.isIdentifier(d.name) && d.name.text === 'CHANGELOG') arr = unwrap(t, d.initializer);
    }
  }
  if (!arr || !t.isArrayLiteralExpression(arr)) throw new Error('app/changelog/page.tsx has no CHANGELOG array literal');
  const versions = new Set();
  for (const el of arr.elements) {
    if (!t.isObjectLiteralExpression(el)) continue;
    for (const p of el.properties) {
      if (t.isPropertyAssignment(p) && propName(t, p) === 'version' &&
          (t.isStringLiteral(p.initializer) || t.isNoSubstitutionTemplateLiteral(p.initializer))) {
        versions.add(p.initializer.text);
      }
    }
  }
  if (versions.size === 0) throw new Error('the CHANGELOG array in app/changelog/page.tsx yielded no version strings');
  return versions;
}

// ── Lock file ──────────────────────────────────────────────────────────────

function readLock() {
  if (!fs.existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  } catch (e) {
    fail(2, 'scripts/sibling-contracts.lock.json is not valid JSON (' + e.message + ').', [
      'Restore it from main, raise the version of any contract whose text changed, then run: ' + REFRESH,
    ]);
  }
}

function writeLock(entries) {
  const lock = {
    $comment:
      'Written by `' + REFRESH + '` in apps/site. Do not edit by hand: scripts/check-sibling-contract-locks.js ' +
      'says what each hash covers. A value and source change goes with a new version.',
    scheme: SCHEME,
    excluded: EXCLUDED.map((e) => e.key).sort(),
    contracts: [...entries]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({ id: e.id, version: e.version, value: e.value, source: e.source })),
  };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');
}

function definitionChanged(lock) {
  const was = Array.isArray(lock.excluded) ? [...lock.excluded].sort().join(',') : '';
  const is = EXCLUDED.map((e) => e.key).sort().join(',');
  return lock.scheme !== SCHEME || was !== is;
}

function fail(code, headline, lines = []) {
  console.error(TAG + ' FAIL - ' + headline);
  for (const l of lines) console.error('  ' + l);
  process.exit(code);
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const update = process.argv.includes('--update');
  const rehash = process.argv.includes('--rehash');
  if (rehash && !update) fail(2, '--rehash only applies with --update.');

  const now = [];
  const canaryProblems = [];
  let canaryCount = 0;
  for (const f of siblingFiles()) {
    const file = path.join(LIB, f);
    const src = fs.readFileSync(file, 'utf8');
    let m;
    try {
      m = measure(src, file, DISK);
    } catch (e) {
      fail(2, 'could not evaluate app/lib/' + f + ': ' + e.message);
    }
    if (!semver(m.version)) fail(1, f + ': the version \'' + m.version + '\' is not MAJOR.MINOR.PATCH, so it cannot be ordered.');
    const c = canaries(file, src, m);
    canaryProblems.push(...c.problems);
    canaryCount += c.passed.length;
    now.push({ ...m, slug: f.replace(/-contract\.ts$/, ''), file: f });
  }
  if (canaryProblems.length) {
    fail(1, 'the hash canaries failed, so this gate cannot show it would catch a change:', canaryProblems);
  }

  const lock = readLock();
  const locked = new Map(((lock && lock.contracts) || []).map((e) => [e.id, e]));
  const short = (h) => String(h).slice(0, 12);

  if (update) {
    if (lock && definitionChanged(lock) && !rehash) {
      fail(1, 'the hash definition in this script changed (SCHEME or EXCLUDED) since the lock was written.', [
        'Run: ' + REFRESH + ' -- --rehash',
      ]);
    }
    if (rehash && (!lock || !definitionChanged(lock))) {
      fail(1, '--rehash is for a change to SCHEME or EXCLUDED in this script, and neither changed.');
    }
    const refused = [];
    const report = [];
    for (const n of now) {
      const was = locked.get(n.id);
      if (!was) {
        report.push(n.id + ' ' + n.version + ' recorded (new entry)');
        continue;
      }
      const order = semver(was.version) ? compareVersions(n.version, was.version) : 1;
      if (order < 0) {
        refused.push(n.file + ': the version moved down from ' + was.version + ' to ' + n.version + '.');
        continue;
      }
      if (rehash) {
        report.push(n.id + ' ' + n.version + ' re-hashed under scheme ' + SCHEME);
        continue;
      }
      const v = was.value !== n.value;
      const s = was.source !== n.source;
      if (order === 0 && v && s) {
        refused.push(
          n.file + ': value and source changed under the same version ' + n.version + '. Raise `version` and ' +
            '`updated` in app/lib/' + n.file + ', add its /changelog entry (\'' + n.slug + ' v<x.y.z>\'), then run ' + REFRESH + ' again.',
        );
        continue;
      }
      if (order === 0 && !v && !s) continue;
      report.push(
        n.id + ' ' + (order === 0 ? n.version : was.version + ' -> ' + n.version) +
          (v ? ' value ' + short(n.value) : '') + (s ? ' source ' + short(n.source) : '') +
          (order === 0 ? (v ? ' (inherited value change)' : ' (refactor)') : ''),
      );
    }
    const ids = new Set(now.map((n) => n.id));
    for (const id of locked.keys()) if (!ids.has(id)) report.push(id + ' dropped: no app/lib/*-contract.ts declares it');
    if (refused.length) fail(1, 'the lock was not rewritten:', refused);
    writeLock(now);
    console.log(TAG + (report.length ? ' lock updated:' : ' the lock is already current (' + now.length + ' contracts)'));
    for (const r of report) console.log('  ' + r);
    return;
  }

  // ── The gate ────────────────────────────────────────────────────────────
  if (lock === null) fail(1, 'scripts/sibling-contracts.lock.json is missing.', ['Create it from apps/site: ' + REFRESH]);
  if (definitionChanged(lock)) {
    fail(1, 'the hash definition in this script changed (SCHEME or EXCLUDED) since the lock was written.', [
      'Run from apps/site: ' + REFRESH + ' -- --rehash',
    ]);
  }

  let changelog;
  try {
    changelog = changelogVersions(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
  } catch (e) {
    fail(2, 'could not read the changelog entries: ' + e.message);
  }

  const failures = [];
  const notes = [];
  const ok = [];
  for (const n of now) {
    const was = locked.get(n.id);
    const where = 'app/lib/' + n.file;
    if (!was) {
      failures.push(n.id + ' (' + where + ') has no lock entry. Run from apps/site: ' + REFRESH);
    } else if (was.version !== n.version) {
      if (!semver(was.version) || compareVersions(n.version, was.version) < 0) {
        failures.push(n.id + ': the version moved from ' + was.version + ' to ' + n.version + '; a contract version only moves up.');
      } else {
        failures.push(n.id + ': the version moved from ' + was.version + ' to ' + n.version + ' but the lock was not updated. Run: ' + REFRESH);
      }
    } else {
      const v = was.value !== n.value;
      const s = was.source !== n.source;
      if (v && s) {
        failures.push(
          n.id + ' ' + n.version + ': the served text changed (value ' + short(was.value) + ' -> ' + short(n.value) +
            ', source ' + short(was.source) + ' -> ' + short(n.source) + ') and the version did not. Raise `version` and ' +
            '`updated` in ' + where + ', add a dated /changelog entry \'' + n.slug + ' v<x.y.z>\' that says what changed, ' +
            'then run ' + REFRESH + '.',
        );
      } else if (v) {
        notes.push(n.id + ' ' + n.version + ': the value moved and the source did not, so the change came from an import. Refresh: ' + REFRESH);
      } else if (s) {
        notes.push(n.id + ' ' + n.version + ': the source moved and the value did not (a refactor). Refresh: ' + REFRESH);
      } else ok.push(n.id + ' ' + n.version);
    }
    if (compareVersions(n.version, '0.1.0') > 0 && !changelog.has(n.slug + ' v' + n.version)) {
      failures.push(
        n.id + ' ' + n.version + ' has no /changelog entry. Add one to CHANGELOG in app/changelog/page.tsx with ' +
          'version \'' + n.slug + ' v' + n.version + '\', dated the day the version shipped.',
      );
    }
  }
  const ids = new Set(now.map((n) => n.id));
  for (const id of locked.keys()) {
    if (!ids.has(id)) failures.push(id + ' is in the lock but no app/lib/*-contract.ts declares it. Run: ' + REFRESH);
  }

  for (const note of notes) console.log(TAG + ' note - ' + note);
  if (failures.length) fail(1, failures.length + ' finding' + (failures.length === 1 ? '' : 's') + ':', failures);

  console.log(
    TAG + ' OK - ' + now.length + ' sibling contracts match their lock (' + now.map((n) => n.slug + ' ' + n.version).join(', ') +
      '); every version past 0.1.0 has its /changelog entry; ' + canaryCount + ' canaries held (a changed string moves ' +
      'value and source, a comment-free reprint and version/updated edits hold both, an inherited change moves the value only)',
  );
}

if (require.main === module) main();

module.exports = { measure, sourceHash, valueHash, contractExport, localImports, changelogVersions, siblingFiles, LIB };
