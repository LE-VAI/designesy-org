#!/usr/bin/env node
/**
 * Contract lock: the design-system contract's content cannot change while its
 * version stands still.
 *
 * WHY THIS EXISTS (2026-10-10)
 * A brand test branch changed token values and role text in
 * app/lib/design-system-contract.ts (the --signal family, --activation, the
 * grade-D hue, the shimmer stops, the elevation tints, the focus ring) while
 * `version` stayed 0.4.3, and every version gate passed:
 *
 *   * check-contract-version.js looks for hardcoded copies of the version;
 *   * check-catalog-version-binding.js checks the catalog reads the version
 *     from the module its export serves;
 *   * check-readme-facts.js checks the READMEs state the current version;
 *   * check-contract-drift.js checks every :root token is named in the contract.
 *
 * Each asks whether the version is QUOTED consistently. None asks whether the
 * content under that version is still the content that version named. Main
 * deploys to production on merge and /contracts/design-system.json serves this
 * object, so a value change under an unchanged version republishes the same
 * number with different values: an agent pinned to that version is handed a
 * different contract and has no field that tells it so.
 *
 * HOW
 * scripts/design-system-contract.lock.json records the contract version and a
 * sha256 of a canonical serialisation of the contract's normative content. This
 * gate evaluates the module (transpiled with the repo's TypeScript, so it hashes
 * the same object the JSON route serves), recomputes the hash and compares:
 *
 *   same version, same hash          PASS
 *   same version, different hash     FAIL  values changed: bump the version
 *   version moved, lock did not      FAIL  run `npm run update-contract-lock`
 *
 * No git history is read. CI checks out a single commit, and a base-branch diff
 * needs a different base on pull_request and push events. The lock makes each
 * commit self-describing instead, and in review the lock's diff shows a version
 * and a hash moving together.
 *
 * WHAT THE HASH COVERS
 * Every top-level section of `designSystemContract` EXCEPT the metadata listed
 * in EXCLUDED below, each with its reason. It is a deny-list on purpose: a
 * section added later is covered until someone argues, here in code, that it is
 * metadata. Inside a covered section everything counts: token names, values,
 * roles, rules, notes.
 *
 * Canonical form: the evaluated object with keys sorted at every depth and
 * array order kept, serialised as JSON. Whitespace, comments, quote style, line
 * endings, key order and how a string is split across source lines do not move
 * the hash. A changed value, role or rule does, and so does reordering an array
 * (order is content in lists such as `verification`).
 *
 * THE REFRESH WILL NOT LAUNDER A CHANGE
 * `--update` refuses to re-record the same version with a different hash, and
 * refuses a version that does not move up. Its fix for "values changed" is
 * always a bump, never a new hash under the old number. `--rehash` re-records
 * the current version only when the hash DEFINITION changed (SCHEME or
 * EXCLUDED), which is an edit to this file and visible in review.
 *
 * A CLAUSE THAT CANNOT FAIL PROVES NOTHING
 * Every run also feeds the hash canaries built from the real source: a changed
 * token value and a changed role must move it; the module reprinted without
 * comments, and edits to excluded metadata, must not. If any canary misbehaves
 * the gate fails, so a parse that silently hashes nothing cannot pass.
 *
 * Usage (from apps/site):
 *   node scripts/check-contract-lock.js                    the gate; exit 1 on drift
 *   npm run update-contract-lock                           refresh after a version bump
 *   npm run update-contract-lock -- --rehash               after changing SCHEME or EXCLUDED
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SITE = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(SITE, 'app', 'lib', 'design-system-contract.ts');
const LOCK_PATH = path.join(__dirname, 'design-system-contract.lock.json');
const REFRESH = 'npm run update-contract-lock';

/**
 * Raise SCHEME whenever canonical() or digest() changes how the hash is
 * computed. A lock written under another scheme cannot be compared, and
 * `--rehash` is the only way to re-record it.
 */
const SCHEME = 1;

/** Top-level keys the hash leaves out. Each needs a reason a reviewer can test. */
const EXCLUDED = [
  { key: 'version', why: 'The number the hash is bound to; the lock records it beside the hash.' },
  { key: 'id', why: 'Identity: the lock records it and this gate fails if it differs.' },
  { key: 'name', why: 'Display name of the contract, not a rule.' },
  { key: 'status', why: 'Lifecycle state (public, deprecated); it changes how the contract is offered, not what it says.' },
  { key: 'public_url', why: 'Address of the human page.' },
  { key: 'full_contract_url', why: 'Address of the human page section.' },
  { key: 'machine_url', why: 'Address of the machine export.' },
  { key: 'updated', why: 'A date stamp. It moves with edits and states no rule.' },
  { key: 'schema_hints', why: 'Describes what each section holds, for parsers; the sections themselves are hashed.' },
  { key: 'provenance', why: 'Where rules came from (labs, ingests, citations). A corrected source link changes no rule.' },
  { key: 'adoption_history', why: 'The record of past versions. A bump adds an entry by design, and correcting history changes no rule.' },
  { key: 'promotion_candidates', why: 'Rules proposed for a future version, not adopted ones.' },
  {
    key: 'verification_checks',
    why:
      'Mirrors the engine registry (lib/check-definitions) and is versioned by its own engine_version; ' +
      'engine releases ship without a contract bump, and the engine registry and offline golden gates hold that surface.',
  },
];
const EXCLUDED_KEYS = new Set(EXCLUDED.map((e) => e.key));

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** JSON with object keys sorted at every depth. Array order is content and kept. */
function canonical(v) {
  if (v === null || typeof v !== 'object') {
    const s = JSON.stringify(v);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(v)) {
    return '[' + v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : canonical(x))).join(',') + ']';
  }
  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined && typeof v[k] !== 'function')
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

/** The hash of the covered sections, plus one hash per section for diagnostics. */
function digest(contract) {
  const covered = {};
  for (const k of Object.keys(contract)) if (!EXCLUDED_KEYS.has(k)) covered[k] = contract[k];
  const sections = {};
  for (const k of Object.keys(covered).sort()) sections[k] = sha256(canonical(covered[k]));
  return { sha256: sha256(canonical(covered)), sections };
}

let ts;
function typescript() {
  if (ts) return ts;
  try {
    ts = require('typescript');
  } catch (e) {
    fail(
      2,
      'typescript could not be loaded (' + (e.code || e.message) + '), so the contract module cannot be evaluated.',
      ['Install apps/site\'s dependencies (npm ci); next build needs typescript too.'],
    );
  }
  return ts;
}

/**
 * Evaluate the contract module from SOURCE TEXT and return designSystemContract.
 * Local imports (./x, ../x) are transpiled and evaluated the same way; a package
 * import fails loudly, because a contract that reads values from elsewhere needs
 * a decision here about whether those values are normative.
 */
function evaluate(src) {
  const t = typescript();
  const cache = new Map();
  function load(file, code) {
    const out = t.transpileModule(code, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { module: t.ModuleKind.CommonJS, target: t.ScriptTarget.ES2020 },
    });
    if (out.diagnostics && out.diagnostics.length) {
      const msg = t.flattenDiagnosticMessageText(out.diagnostics[0].messageText, '\n');
      throw new Error(path.relative(SITE, file) + ': ' + msg);
    }
    const mod = { exports: {} };
    const req = (spec) => {
      if (!spec.startsWith('./') && !spec.startsWith('../')) {
        throw new Error(
          path.relative(SITE, file) + ' imports \'' + spec + '\'. Only local modules are evaluated; ' +
            'decide whether what it supplies is normative and extend scripts/check-contract-lock.js.',
        );
      }
      const base = path.resolve(path.dirname(file), spec);
      const target = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find((p) => fs.existsSync(p));
      if (!target) throw new Error(path.relative(SITE, file) + ' imports ' + spec + ', which does not resolve');
      if (!cache.has(target)) cache.set(target, load(target, fs.readFileSync(target, 'utf8')));
      return cache.get(target);
    };
    new Function('exports', 'require', 'module', out.outputText)(mod.exports, req, mod);
    return mod.exports;
  }
  const contract = load(CONTRACT_PATH, src).designSystemContract;
  if (!contract || typeof contract !== 'object') {
    throw new Error('app/lib/design-system-contract.ts does not export designSystemContract');
  }
  return contract;
}

function measure(src) {
  const contract = evaluate(src);
  return { id: contract.id, version: contract.version, ...digest(contract) };
}

/** [major, minor, patch] or null. */
function semver(v) {
  const m = typeof v === 'string' && v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}
function compareVersions(a, b) {
  const x = semver(a);
  const y = semver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

function fail(code, headline, lines = []) {
  console.error('[contract-lock] FAIL - ' + headline);
  for (const l of lines) console.error('  ' + l);
  process.exit(code);
}

/** Section names whose hash moved between the lock and now. */
function changedSections(lockSections, nowSections) {
  const out = [];
  const names = new Set([...Object.keys(lockSections || {}), ...Object.keys(nowSections)]);
  for (const n of [...names].sort()) {
    const was = lockSections ? lockSections[n] : undefined;
    const is = nowSections[n];
    if (was === is) continue;
    out.push(was === undefined ? n + ' (added)' : is === undefined ? n + ' (removed)' : n);
  }
  return out;
}

/**
 * Canaries: inputs built from the real source to prove the hash moves when it
 * must and holds when it must. Returns a list of failures.
 */
function canaries(src, real) {
  const t = typescript();
  const problems = [];
  const mutate = (name, re, fn) => {
    if (!re.test(src)) {
      problems.push(name + ': its pattern matched nothing in the source, so it could not be built');
      return null;
    }
    return src.replace(re, fn);
  };
  const tokenLine = /(\btoken:\s*'--[\w-]+',\s*value:\s*')([^']*)(',\s*role:\s*')([^']*)(')/;

  const cases = [
    {
      name: 'a changed token value moves the hash',
      src: mutate('value canary', tokenLine, (_m, a, value, b, role, c) => a + value + ' canary' + b + role + c),
      moves: true,
    },
    {
      name: 'a changed role moves the hash',
      src: mutate('role canary', tokenLine, (_m, a, value, b, role, c) => a + value + b + role + ' canary' + c),
      moves: true,
    },
    {
      name: 'the module reprinted without comments holds the hash',
      src: t
        .createPrinter({ removeComments: true, newLine: t.NewLineKind.LineFeed })
        .printFile(t.createSourceFile('contract.ts', src, t.ScriptTarget.Latest, true, t.ScriptKind.TS)),
      moves: false,
    },
    {
      name: 'an edit to excluded metadata (updated, adoption_history) holds the hash',
      src: (() => {
        const a = mutate('updated canary', /(\n\s*updated:\s*')[^']*(')/, (_m, p, q) => p + '1970-01-01' + q);
        return a && a.replace(/(adoption_history:\s*\[)/, "$1 { version: '0.0.0', date: '1970-01-01', summary: 'canary' },");
      })(),
      moves: false,
    },
  ];

  for (const c of cases) {
    if (c.src === null) continue;
    let h;
    try {
      h = measure(c.src).sha256;
    } catch (e) {
      problems.push(c.name + ': the canary source did not evaluate (' + e.message + ')');
      continue;
    }
    if ((h !== real) !== c.moves) problems.push(c.name + ': it did not');
  }
  return problems;
}

function writeLock(m) {
  const lock = {
    $comment:
      'Written by `' + REFRESH + '` in apps/site. Do not edit by hand: scripts/check-contract-lock.js ' +
      'says what the hash covers and excludes. A new hash goes with a new version.',
    contract: m.id,
    version: m.version,
    scheme: SCHEME,
    sha256: m.sha256,
    excluded: EXCLUDED.map((e) => e.key).sort(),
    sections: m.sections,
  };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf8');
}

function readLock() {
  if (!fs.existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  } catch (e) {
    fail(2, 'scripts/design-system-contract.lock.json is not valid JSON (' + e.message + ').', [
      'Restore it from main, raise the version if the contract changed, then run: ' + REFRESH,
    ]);
  }
}

function definitionChanged(lock) {
  const was = Array.isArray(lock.excluded) ? [...lock.excluded].sort().join(',') : '';
  const is = EXCLUDED.map((e) => e.key).sort().join(',');
  return lock.scheme !== SCHEME || was !== is;
}

function main() {
  const update = process.argv.includes('--update');
  const rehash = process.argv.includes('--rehash');
  if (rehash && !update) fail(2, '--rehash only applies with --update.');

  const src = fs.readFileSync(CONTRACT_PATH, 'utf8');
  let now;
  try {
    now = measure(src);
  } catch (e) {
    fail(2, 'could not evaluate the contract module: ' + e.message);
  }
  if (!semver(now.version)) {
    fail(1, 'the contract version \'' + now.version + '\' is not MAJOR.MINOR.PATCH, so it cannot be ordered.');
  }

  const problems = canaries(src, now.sha256);
  if (problems.length) {
    fail(1, 'the hash canaries failed, so this gate cannot show it would catch a change:', problems);
  }

  const lock = readLock();
  const short = (h) => String(h).slice(0, 12);
  const sectionCount = Object.keys(now.sections).length;

  if (update) {
    if (lock === null) {
      writeLock(now);
      console.log('[contract-lock] wrote the lock: ' + now.id + ' ' + now.version + ' sha256 ' + short(now.sha256));
      return;
    }
    if (lock.contract !== now.id) {
      fail(1, 'the lock belongs to ' + lock.contract + ' but the module declares ' + now.id + '.', [
        'A new contract id is a new contract; delete the lock on purpose and run ' + REFRESH + '.',
      ]);
    }
    if (rehash) {
      if (!definitionChanged(lock)) {
        fail(1, '--rehash is for a change to SCHEME or EXCLUDED in this script, and neither changed.', [
          'If the contract content changed, raise `version` in app/lib/design-system-contract.ts and run ' + REFRESH + '.',
        ]);
      }
      if (!semver(lock.version) || compareVersions(now.version, lock.version) < 0) {
        fail(1, 'the version moved down from ' + lock.version + ' to ' + now.version + '; a contract version only moves up.');
      }
      writeLock(now);
      console.log(
        '[contract-lock] re-hashed under scheme ' + SCHEME + ': ' + now.id + ' ' + now.version + ' sha256 ' + short(now.sha256),
      );
      return;
    }
    if (definitionChanged(lock)) {
      fail(1, 'the hash definition in this script changed (SCHEME or EXCLUDED) since the lock was written.', [
        'Run: ' + REFRESH + ' -- --rehash',
      ]);
    }
    const order = semver(lock.version) ? compareVersions(now.version, lock.version) : 1;
    if (order === 0) {
      if (lock.sha256 === now.sha256) {
        console.log('[contract-lock] the lock is already current: ' + now.version + ' sha256 ' + short(now.sha256));
        return;
      }
      fail(1, 'the contract content changed under the same version ' + now.version + ', so the lock was not rewritten.', [
        'Changed: ' + changedSections(lock.sections, now.sections).join(', '),
        'A changed value, role or rule is a new version. Raise `version` in app/lib/design-system-contract.ts,',
        'add its adoption_history entry, then run ' + REFRESH + ' again.',
      ]);
    }
    if (order < 0) {
      fail(1, 'the version moved down from ' + lock.version + ' to ' + now.version + '; a contract version only moves up.');
    }
    writeLock(now);
    const moved = changedSections(lock.sections, now.sections);
    console.log(
      '[contract-lock] lock updated: ' + lock.version + ' -> ' + now.version + ', sha256 ' + short(now.sha256) +
        (moved.length ? ' (changed: ' + moved.join(', ') + ')' : ' (no normative section changed)'),
    );
    return;
  }

  // ── The gate ────────────────────────────────────────────────────────────
  if (lock === null) {
    fail(1, 'scripts/design-system-contract.lock.json is missing.', ['Create it from apps/site: ' + REFRESH]);
  }
  if (lock.contract !== now.id) {
    fail(1, 'the lock belongs to ' + lock.contract + ' but the module declares ' + now.id + '.', [
      'A new contract id is a new contract; delete the lock on purpose and run ' + REFRESH + '.',
    ]);
  }
  if (definitionChanged(lock)) {
    fail(1, 'the hash definition in this script changed (SCHEME or EXCLUDED) since the lock was written.', [
      'Run from apps/site: ' + REFRESH + ' -- --rehash',
    ]);
  }
  if (lock.version !== now.version) {
    if (!semver(lock.version) || compareVersions(now.version, lock.version) < 0) {
      fail(1, 'the contract version moved from ' + lock.version + ' to ' + now.version + '; a contract version only moves up.');
    }
    const moved = changedSections(lock.sections, now.sections);
    fail(1, 'the contract version moved from ' + lock.version + ' to ' + now.version + ' but the lock was not updated.', [
      moved.length ? 'Changed since ' + lock.version + ': ' + moved.join(', ') : 'No normative section changed since ' + lock.version + '.',
      'Refresh the lock from apps/site: ' + REFRESH,
    ]);
  }
  if (lock.sha256 !== now.sha256) {
    fail(1, 'contract values changed: bump the version and update the lock.', [
      'version   ' + now.version + ' (unchanged; the lock records the same)',
      'locked    sha256 ' + short(lock.sha256),
      'now       sha256 ' + short(now.sha256),
      'changed:  ' + changedSections(lock.sections, now.sections).join(', '),
      '',
      'A published version names one content, and main publishes on merge. Raise `version` in',
      'app/lib/design-system-contract.ts, add its adoption_history entry, then run from apps/site:',
      '  ' + REFRESH,
    ]);
  }

  console.log(
    '[contract-lock] OK - ' + now.id + ' ' + now.version + ' matches its lock (sha256 ' + short(now.sha256) + ', ' +
      sectionCount + ' sections hashed, ' + EXCLUDED.length + ' metadata keys excluded; canaries: a changed value ' +
      'or role moves the hash, a comment-free reprint and excluded metadata do not)',
  );
}

main();
