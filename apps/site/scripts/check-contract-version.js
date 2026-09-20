#!/usr/bin/env node
/**
 * Guard: no new hardcoded contract versions.
 *
 * The contract version was written by hand in 65 files, 145 times, beside a
 * CONTRACT_VERSION constant that four other files used. One bump of
 * `designSystemContract.version` and the two disagree -- and the machine-readable
 * copies in /api/score's payloads are the ones a client may gate on, so a caller
 * would be told the engine scored against a contract it no longer uses.
 *
 * Those were collapsed onto the constant on 2026-09-20. This exists so they do
 * not come back, because the failure is invisible: a hardcoded "v0.4.0" is
 * correct today and silently wrong on the day of a bump.
 *
 * THE VERSION IS READ FROM THE CONTRACT, not hardcoded here. An earlier version
 * of this guard matched a generic version pattern and reported 304 findings,
 * because that also matches "Cuelume v0.2.2", "v0.1.1" and every other unrelated
 * number in the codebase. A guard that fires 304 times is a guard nobody reads --
 * the same cry-wolf shape this repo keeps hitting. Reading the live value means
 * the check is about exactly ONE string, and it re-targets itself on a bump: when
 * the contract moves to 0.5.0 this flags hardcoded v0.5.0 and stops complaining
 * about v0.4.0, which by then is history.
 *
 * EXEMPTIONS NEED A REASON. Four occurrences describe OTHER SOFTWARE and must
 * never track our contract: `@google/design.md` is a third-party npm package
 * (three places) and `designesy-core.v0.4.0` is a Lottie-spec reference.
 * Historical statements are also allowed -- a changelog records what a version
 * WAS, and rewriting it to the current version would falsify history.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..', 'app');
const CONTRACT_SRC = path.join(APP, 'lib', 'design-system-contract.ts');

// Read `version: '0.4.0'` out of the contract module's SOURCE. Importing the
// module is not an option: this script runs under plain node and the file is
// TypeScript.
const contractRaw = fs.readFileSync(CONTRACT_SRC, 'utf8');
const literal = contractRaw.match(/\n\s*version:\s*'([^']+)'/);
if (!literal) {
  console.error(
    '[contract-version] could not read `version:` from design-system-contract.ts',
  );
  process.exit(2);
}
const VERSION = new RegExp('\\bv' + literal[1].replace(/\./g, '\\.') + '\\b');

// Files that are historical records in their entirety.
const HISTORICAL_FILES = new Set(['changelog/page.tsx']);

// Per-line exemptions, each with a reason. An entry without a reason should not
// be added; the reason is what a future reader uses to judge whether it applies.
const LINE_EXEMPTIONS = [
  {
    file: /^api\/(score|mcp)\/route\.ts$/,
    line: /@google\/design\.md|designesy-core\.|Lottie/,
    why: 'Names another package version (@google/design.md, Lottie spec).',
  },
  {
    file: /^benchmarks\/page\.tsx$/,
    line: /@google\/design\.md|npmjs\.com/,
    why: '@google/design.md package listing.',
  },
  {
    file: /^lib\/(drift|tokens)-contract\.ts$/,
    line: /@google\/design\.md|live_export/,
    why: 'Package reference, or a past export snapshot rather than a live claim.',
  },
  {
    file: /^methodology\/page\.tsx$/,
    line: /was not neutral|v0\.3\.0/,
    why: 'Historical statement about the v0.3.0 -> v0.4.0 release.',
  },
  {
    file: /^lib\/design-system-contract\.ts$/,
    line: /version:\s*'|adopted_in|v0\./,
    why: 'This file IS the source of truth; its prose records contract history.',
  },
  {
    file: /^(api\/score|api\/leaderboard|leaderboard\/seed)/,
    line: /^\s*\/\//,
    why: 'Comment recording which contract a past re-score or release used.',
  },
  {
    file: /^frameworks\/\[slug\]\/page\.tsx$/,
    line: /Scored 20/,
    why: 'States the contract a dated evaluation was run against.',
  },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * BASELINE RATCHET.
 *
 * A first pass migrated the machine-readable payloads and the JSX text nodes.
 * About 91 literals remain, mostly presentation strings in ~40 files, and a
 * blind mass-edit across 40 files is exactly the kind of change that has broken
 * this repo twice today. So the remaining ones are GRANDFATHERED rather than
 * left blocking CI:
 *
 *   - a NEW hardcoded literal fails the build;
 *   - the legacy set may only shrink. If the count grows, the guard fails and
 *     names what was added.
 *
 * The baseline is keyed by "file:line:text" so a line that MOVES is treated as
 * new -- which is the point: it forces a look rather than a silent pass.
 */
const BASELINE_PATH = path.join(__dirname, 'contract-version-baseline.json');
const baseline = fs.existsSync(BASELINE_PATH)
  ? new Set(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')))
  : null;

const findings = [];
for (const f of walk(APP)) {
  const rel = path.relative(APP, f).replace(/\\/g, '/');
  if (HISTORICAL_FILES.has(rel)) continue;

  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!VERSION.test(lines[i])) continue;
    const exempt = LINE_EXEMPTIONS.some(
      (e) => e.file.test(rel) && e.line.test(lines[i]),
    );
    if (exempt) continue;
    findings.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 130) });
  }
}

const shown = 'v' + literal[1];

/**
 * Keyed on file + TEXT, deliberately NOT on the line number.
 *
 * The first version included `x.line`, on the theory that a moved line deserves
 * a fresh look. In practice that made the guard cry wolf on every routine edit:
 * inserting 18 AgentActions controls shifted lines in 14 files and produced 14
 * "NEW hardcoded literal" reports, none of which were new. A guard that fires on
 * unrelated edits trains people to ignore it -- the failure mode this whole
 * session kept hitting.
 *
 * File + text still catches what matters: a genuinely new literal has new text,
 * and copying a grandfathered literal into another file has a new file. What it
 * no longer catches is a line that merely moved, which is not a finding.
 */
const key = (x) => x.file + ':' + x.text;

if (findings.length === 0) {
  console.log('[contract-version] OK - no hardcoded ' + shown + ' outside exemptions');
  process.exit(0);
}

// No baseline yet: write it, so the first run grandfathers the current set.
if (baseline === null) {
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify(findings.map(key).sort(), null, 1),
    'utf8',
  );
  console.log(
    '[contract-version] baseline written with ' +
      findings.length +
      ' grandfathered literal(s) -- new ones will now fail.',
  );
  process.exit(0);
}

const added = findings.filter((x) => !baseline.has(key(x)));

if (added.length === 0) {
  const remaining = findings.length;
  const drained = [...baseline].filter((k) => !findings.some((x) => key(x) === k)).length;
  console.log(
    '[contract-version] OK - no NEW hardcoded ' +
      shown +
      '. ' +
      remaining +
      ' grandfathered remain' +
      (drained ? ', ' + drained + ' migrated since the baseline' : '') +
      '.',
  );
  process.exit(0);
}

console.log('[contract-version] ' + added.length + ' NEW hardcoded ' + shown + ' literal(s):');
for (const x of added) {
  console.log('  ' + x.file + ':' + x.line);
  console.log('     ' + x.text);
}
console.log('');
console.log('Use CONTRACT_VERSION from app/lib/design-system-contract.ts instead.');
console.log('If this line names OTHER software or a past release, add an exemption');
console.log('with a reason at the top of scripts/check-contract-version.js.');
process.exit(1);
