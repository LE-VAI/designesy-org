#!/usr/bin/env node
/**
 * Guard: the READMEs state the engine's real check count, category count and
 * contract version.
 *
 * Why (2026-10-08): the code already has single sources of truth --
 * ENGINE_CHECK_COUNT (lib/check-definitions.ts) and CONTRACT_VERSION
 * (lib/design-system-contract.ts) -- and check-contract-version.js keeps the
 * current version from being hardcoded inside app/. But nothing read the
 * READMEs, so they kept stale facts: both READMEs gave a check count two
 * below the engine's, the repo README headed a section with contract v0.4.0
 * while the engine ran v0.4.2, and the PyPI README listed one category fewer
 * than CATEGORY_WEIGHTS.
 * Glama and other listings copy these files, so a stale README is a stale
 * public listing.
 *
 * Every expected value is READ FROM SOURCE, never hardcoded here, so the guard
 * re-targets itself on a bump. Patterns are deliberately narrow -- they match
 * claims about THIS engine ("N-check design contract", "N deterministic
 * checks", "across 14 weighted categories", "contract v0.4.2") and not other
 * tools' counts (the 12-check drift radar, the 11-check a11y framework).
 *
 * EXEMPTIONS NEED A REASON, as in check-contract-version.js. "added in vX"
 * marks history and is always allowed.
 */

const fs = require('node:fs');
const path = require('node:path');

const SITE = path.join(__dirname, '..');
const REPO = path.join(SITE, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8');

const contractSrc = read(path.join(SITE, 'app', 'lib', 'design-system-contract.ts'));
const versionMatch = contractSrc.match(/\n\s*version:\s*'([^']+)'/);
const checksSrc = read(path.join(SITE, 'app', 'lib', 'check-definitions.ts'));
// One CHECKS entry per line, each opening with `{ id:` (ids are not all v-prefixed).
const checkIds = checksSrc.match(/^\s*\{\s*id:\s*'/gm) || [];
const weights = checksSrc.match(/export const CATEGORY_WEIGHTS[^{]*\{([^}]*)\}/);
if (!versionMatch || checkIds.length === 0 || !weights) {
  console.error('[readme-facts] could not read version, checks or categories from source');
  process.exit(2);
}
const VERSION = versionMatch[1];
const CHECKS = checkIds.length;
const CATEGORIES = (weights[1].match(/\b[a-z]+\s*:\s*\d+/g) || []).length;

// The GitHub Action's metadata is what the Marketplace listing shows, so it is
// held to the same facts as the READMEs.
//
// Two shipped texts joined the list on 2026-10-08, after both were found
// stating a check count two below the engine's and no gate read either file:
// action/dist/index.js writes the PR comment and job summary footer, and
// app/export/designmd/route.ts is the DESIGN.md served at /DESIGN.md. Both now
// derive the number, so these rules hold the line if a literal comes back.
const FILES = [
  'README.md',
  path.join('packages', 'designesy-mcp', 'README.md'),
  'action.yml',
  path.join('action', 'action.yml'),
  path.join('action', 'README.md'),
  path.join('action', 'dist', 'index.js'),
  path.join('apps', 'site', 'app', 'export', 'designmd', 'route.ts'),
  // The one-line listing every MCP registry and directory copies (2026-10-11):
  // server.json, which the official registry publishes, and the Server Card
  // builder, which check-mcp-tool-parity.js holds to the same words.
  'server.json',
  path.join('apps', 'site', 'app', 'lib', 'mcp-server-card.ts'),
  // The npm packages' READMEs and descriptions (2026-10-11): cli/README.md and
  // the root package.json stated check counts four and two below the engine's,
  // because no gate read them.
  path.join('cli', 'README.md'),
  'package.json',
  path.join('packages', 'score', 'README.md'),
  path.join('packages', 'score', 'package.json'),
  path.join('packages', 'cli', 'README.md'),
  path.join('packages', 'cli', 'package.json'),
  path.join('packages', 'vai-motion', 'README.md'),
  // The PyPI summary carries the listing line.
  path.join('packages', 'designesy-mcp', 'pyproject.toml'),
];

const RULES = [
  { what: 'check count', expect: CHECKS, re: /\b(\d+)-check (?:design|contract|verification|deterministic|engine|audit|scoring)/gi },
  // The Action's footer separates its fields with a middle dot ("N-check · format: google").
  { what: 'check count', expect: CHECKS, re: /\b(\d+)-check ·/g },
  // The DESIGN.md export's Verification list ("- **Checks:** N").
  { what: 'check count', expect: CHECKS, re: /\*\*Checks:\*\*\s*(\d+)\b/g },
  // (?<!\+ ) skips sub-counts such as "16 UX copy principles + 4 verification checks".
  { what: 'check count', expect: CHECKS, re: /(?<!\+ )\b(\d+) (?:deterministic|verification) checks\b/gi },
  { what: 'check count', expect: CHECKS, re: /\b(\d+) checks across \d+ weighted categories/gi },
  { what: 'category count', expect: CATEGORIES, re: /\bacross (\d+) weighted categories/gi },
  { what: 'contract version', expect: VERSION, re: /\bcontract v(\d+\.\d+\.\d+)\b/gi },
  { what: 'contract version', expect: VERSION, re: /\bv(\d+\.\d+\.\d+) design-system contract\b/gi },
  { what: 'contract version', expect: VERSION, re: /^#+\s*Contract v(\d+\.\d+\.\d+)/gim },
];

const LINE_EXEMPTIONS = [
  {
    file: /^README\.md$/,
    line: /\*\*\[Lyse\]/,
    why: "Lyse's own check count (a different tool) in the related-tools list.",
  },
];

const findings = [];
for (const rel of FILES) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) continue;
  const relPosix = rel.split(path.sep).join('/');
  read(abs).split(/\r?\n/).forEach((line, i) => {
    if (/added in v\d/i.test(line)) return;
    if (LINE_EXEMPTIONS.some((x) => x.file.test(relPosix) && x.line.test(line))) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        const got = rule.what === 'contract version' ? m[1] : Number(m[1]);
        if (got !== rule.expect) {
          findings.push(`${relPosix}:${i + 1}: ${rule.what} says ${got}, source says ${rule.expect}  | ${line.trim().slice(0, 110)}`);
        }
      }
    }
  });
}

if (findings.length) {
  console.error(`[readme-facts] ${findings.length} README claim(s) disagree with the engine source (checks ${CHECKS}, categories ${CATEGORIES}, contract v${VERSION}):`);
  for (const f of findings) console.error('  ' + f);
  console.error('Fix the README, or add a LINE_EXEMPTIONS entry WITH a reason if the line is history.');
  process.exit(1);
}
console.log(`[readme-facts] OK: READMEs agree with source (checks ${CHECKS}, categories ${CATEGORIES}, contract v${VERSION}).`);
