#!/usr/bin/env node
/**
 * catalog version binding — every package in the open catalog must READ its
 * version from the module its machine export serves.
 *
 * WHY THIS EXISTS
 * app/lib/open-index.ts is the single source for /open, /open.json, /llms.txt,
 * /llms-full.txt and /.well-known/agent.json. Its own `ingest` block instructs
 * agents that "version fields" are "authority boundaries: do not invent
 * unversioned rules" — so a version field here is not decoration, it is the
 * field an agent is told to trust. It is the worst possible place in the repo
 * for a stale literal.
 *
 * Two were already stale, both machine-readable, both live on 2026-09-30:
 *   * designesy.design-system read `0.4.0` while design-system-contract.ts and
 *     /contracts/design-system.json both served `0.4.1`;
 *   * acoustic-tokens read `0.1.1` while acoustic-tokens.ts and
 *     /acoustic-tokens.json both served `0.2.0`.
 *
 * An agent following the ingest protocol was handed the wrong version as the
 * boundary for the contract it was about to build against.
 *
 * WHY NOTHING CAUGHT IT
 *   * check-contract-drift.js compares globals.css :root against the contract's
 *     `token:` entries. It never reads open-index.ts.
 *   * check-contract-version.js matches the CURRENT contract version in its
 *     `v`-prefixed display form (`v0.4.1`). The stale values were the PREVIOUS
 *     version in bare semver form (`'0.4.0'`), which that pattern cannot match.
 *     Its baseline ratchet exists to grandfather legacy literals, so even a
 *     matching one would have passed as grandfathered.
 *   * No workflow referenced open-index.ts at all.
 *
 * WHAT IT ASSERTS
 * For every catalog entry carrying a machine export, the route that serves that
 * export hands a named symbol to Response.json()/negotiatedResponse(), and this
 * gate requires the catalog's `version:` for that entry to be exactly
 * `<that symbol>.version`.
 *
 * The mapping is DERIVED, not listed: the entry's `machine_path` locates the
 * route, the route names the symbol, and the assertion is that the catalog reads
 * the same symbol. There is no table here to fall out of date, and a new package
 * added to the catalog is covered the moment it points at a route.
 *
 * GUARDS AGAINST A CLAUSE THAT CANNOT FAIL
 *   * Every route file is asserted to exist first, so a renamed or deleted route
 *     fails the gate rather than being skipped.
 *   * A minimum-count clause fails if fewer than eight bound entries are found,
 *     so a parse that silently matches nothing cannot pass.
 *   * The symbol a version reads from must be imported by open-index.ts, so a
 *     same-named local or a typo cannot satisfy the clause.
 *   * Entries with `machine_url: null` are exempt for a STATED reason: a tool or
 *     review page has no machine export, so there is no second artifact for its
 *     version to disagree with. The exemption is by absence of a machine export,
 *     not by an allowlist that could hide a real one.
 *   * `--self-test` feeds each clause an input built to break it and exits
 *     non-zero if any clause lets it through.
 *
 * Usage:  node scripts/check-catalog-version-binding.js [--json] [--self-test]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const SITE = path.resolve(__dirname, '..');
const APP = path.join(SITE, 'app');
const CATALOG_PATH = path.join(APP, 'lib', 'open-index.ts');

const MIN_BOUND_ENTRIES = 8;

/** The `packages: [ ... ]` array body from the catalog source. */
function packagesBody(src) {
  const start = src.indexOf('packages: [');
  if (start < 0) return null;
  // Entries are objects at four-space indent; the array closes at two.
  const end = src.indexOf('\n  ],', start);
  if (end < 0) return null;
  return src.slice(start + 'packages: ['.length, end);
}

/**
 * Parse each package entry into id / version expression / machine_path.
 *
 * Line endings are normalized first: this repo's Windows checkout is CRLF, and a
 * pattern anchored on `\n` alone silently matches nothing there -- which is the
 * "gate that cannot fail" shape the minimum-count clause below also guards.
 */
function parseEntries(body) {
  const entries = [];
  const normalized = body.replace(/\r\n/g, '\n');
  for (const chunk of normalized.split(/\n    \},?\n|\n    \{\n/)) {
    const id = chunk.match(/id:\s*'([^']+)'/);
    if (!id) continue;
    const version = chunk.match(/\n\s+version:\s*([^,\n]+),/);
    const machinePath = chunk.match(/machine_path:\s*(null|'([^']*)')/);
    if (!version || !machinePath) continue;
    entries.push({
      id: id[1],
      versionExpr: version[1].trim(),
      machinePath: machinePath[1] === 'null' ? null : machinePath[2],
    });
  }
  return entries;
}

/** The root symbol a machine-export route hands to its response builder. */
function routeSymbol(routeSrc) {
  const m = routeSrc.match(
    /(?:Response\.json|negotiatedResponse)\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/,
  );
  return m ? m[1] : null;
}

/** Findings for one parsed catalog, against the real tree. Returns a list. */
function findingsFor(src) {
  const findings = [];
  const body = packagesBody(src);
  if (body === null) {
    return [{ id: 'packages-array-not-found', detail: 'could not locate the packages array in open-index.ts' }];
  }
  const entries = parseEntries(body);
  if (entries.length === 0) {
    return [{ id: 'no-entries-parsed', detail: 'parsed zero package entries from the catalog' }];
  }

  // Symbols open-index.ts actually imports.
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'[^']+';/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) imported.add(name);
    }
  }

  let bound = 0;
  for (const e of entries) {
    if (e.machinePath === null) continue; // no machine export -> no artifact to disagree with
    bound++;

    const routePath = path.join(APP, ...e.machinePath.split('/').filter(Boolean), 'route.ts');
    if (!fs.existsSync(routePath)) {
      findings.push({
        id: 'route-missing',
        detail: `${e.id}: machine_path ${e.machinePath} has no route.ts at ${path.relative(SITE, routePath)}`,
      });
      continue;
    }

    const sym = routeSymbol(fs.readFileSync(routePath, 'utf8'));
    if (!sym) {
      findings.push({
        id: 'route-symbol-not-found',
        detail: `${e.id}: ${path.relative(SITE, routePath)} names no symbol for Response.json()/negotiatedResponse()`,
      });
      continue;
    }

    const root = sym.split('.')[0];
    if (!imported.has(root)) {
      findings.push({
        id: 'symbol-not-imported',
        detail: `${e.id}: route serves \`${sym}\` but open-index.ts does not import \`${root}\``,
      });
      continue;
    }

    if (e.versionExpr !== `${sym}.version`) {
      findings.push({
        id: 'version-not-bound',
        detail:
          `${e.id}: catalog version is \`${e.versionExpr}\` but its machine export ` +
          `(${e.machinePath}) serves \`${sym}\` — expected \`${sym}.version\``,
      });
    }
  }

  if (bound < MIN_BOUND_ENTRIES) {
    findings.push({
      id: 'too-few-bound-entries',
      detail: `only ${bound} entr(ies) with a machine export were checked; expected at least ${MIN_BOUND_ENTRIES}`,
    });
  }
  return findings;
}

/** Feed each clause an input built to break it. */
function selfTest() {
  const real = fs.readFileSync(CATALOG_PATH, 'utf8');
  const cases = [];

  const withLiteral = real.replace(
    /version:\s*designSystemContract\.version,/,
    "version: '0.4.0',",
  );
  cases.push(['a restated literal is caught', withLiteral, 'version-not-bound']);

  const otherSymbol = real.replace(
    /version:\s*acousticTokens\.version,/,
    'version: tokensContract.version,',
  );
  cases.push(['reading a DIFFERENT module is caught', otherSymbol, 'version-not-bound']);

  const missingRoute = real.replace(
    /machine_path:\s*'\/contracts\/a11y\.json',/,
    "machine_path: '/contracts/nope.json',",
  );
  cases.push(['a machine_path with no route is caught', missingRoute, 'route-missing']);

  // Every entry stripped of its machine export: well-formed, but nothing left to
  // bind, which is what the minimum-count clause exists to catch.
  const noExports = real.replace(/machine_path:\s*'\/[^']*',/g, 'machine_path: null,');
  cases.push(['a catalog with no machine exports is caught', noExports, 'too-few-bound-entries']);

  let failed = 0;
  for (const [name, src, expected] of cases) {
    const findings = findingsFor(src);
    const hit = findings.some((f) => f.id === expected);
    if (!hit) {
      console.error(`  [self-test] FAIL — ${name}: expected a \`${expected}\` finding, got none`);
      failed++;
    } else {
      console.log(`  [self-test] ok — ${name}`);
    }
  }

  // The unmodified source must pass, or the cases above prove nothing.
  const clean = findingsFor(real);
  if (clean.length > 0) {
    console.error(`  [self-test] FAIL — the real catalog reports ${clean.length} finding(s)`);
    failed++;
  } else {
    console.log('  [self-test] ok — the real catalog is clean');
  }

  return failed;
}

function main() {
  const asJson = process.argv.includes('--json');
  const runSelfTest = process.argv.includes('--self-test');

  if (!fs.existsSync(CATALOG_PATH)) {
    const msg = `catalog-version-binding: catalog not found at ${CATALOG_PATH}`;
    if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(msg);
    process.exit(1);
  }

  if (runSelfTest) {
    const failed = selfTest();
    if (asJson) console.log(JSON.stringify({ ok: failed === 0, failed }, null, 2));
    else if (failed === 0) console.log('catalog-version-binding: self-test OK — every clause fires');
    else console.error(`catalog-version-binding: self-test FAILED — ${failed} clause(s) let a break through`);
    process.exit(failed === 0 ? 0 : 1);
  }

  const findings = findingsFor(fs.readFileSync(CATALOG_PATH, 'utf8'));

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(
      'catalog-version-binding: OK — every catalog entry with a machine export reads its version from the module that export serves',
    );
  } else {
    console.error(`catalog-version-binding: ${findings.length} finding(s)\n`);
    for (const f of findings) {
      console.error(`  [${f.id}]`);
      console.error(`    ${f.detail}\n`);
    }
    console.error(
      'Read the version from the module the export serves, e.g. `version: designSystemContract.version`.',
    );
    console.error('Never restate a version as a literal in the catalog.');
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
