#!/usr/bin/env node
/**
 * check-count-literal gate — assert every hardcoded "N checks" claim in source
 * agrees with the check registry.
 *
 * WHY THIS EXISTS
 * The engine's check count appears as a literal "42" in ~115 places across 43
 * files: page metadata descriptions, OG tags, JSX prose, MCP tool descriptions,
 * contract contracts. The registry defines the truth (ENGINE_CHECK_COUNT in
 * app/lib/check-definitions.ts, derived from CHECKS.length).
 *
 * When a check is added, all 115 go stale at once and nothing notices. That
 * exact failure already happened once in this repo and is documented in
 * check-definitions.ts: the /score/report surface hardcoded "40" while the
 * engine reported 39, and a comment there records it.
 *
 * A stale count is not cosmetic on this product. The whole proposition is that
 * the numbers are checkable; a count that disagrees with the registry is the
 * site failing its own premise. It is also the exact class of defect this lane
 * has spent a session removing — a number typed where it could be derived.
 *
 * WHY A GATE BEFORE A MIGRATION
 * Rewriting 115 prose strings to template literals is a large, risky diff, and
 * the source text contains 22 OTHER occurrences of "42" that are not check
 * counts (a "42% of committed React" statistic, SVG coordinates x2="15.42", a
 * 42ms stagger constant, hallmark gate numbers 42-43). A blind replace would
 * corrupt all of them.
 *
 * This gate makes drift impossible to ship (the build fails) at zero risk to
 * the copy, and lets the migration proceed file by file on its own schedule.
 * Coverage first, refactor second — the same order used for the count-up and
 * d02 fixes this session.
 *
 * SCOPE
 * Scans JSX/TS source for `<N> (automated )?check(s)` and `<N> verification
 * checks` where N is a bare number, and requires N === ENGINE_CHECK_COUNT.
 * Only the registry's OWN count is asserted; a file legitimately citing another
 * engine's count (drift 12, readiness 10, guardrails 6) is unaffected because
 * the pattern requires the number to be immediately followed by "check(s)" or
 * "verification".
 *
 * Usage:  node scripts/check-count-literal.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const REGISTRY = path.join(APP, 'app', 'lib', 'check-definitions.ts');
const SCAN_ROOTS = [path.join(APP, 'app'), path.join(APP, 'scripts')];

/** Read ENGINE_CHECK_COUNT from the registry without compiling TypeScript. */
/** Read the scored-check count (excludes MANUAL) from the registry. */
function readScoredCheckCount() {
  const src = fs.readFileSync(REGISTRY, 'utf8');
  const xIds = new Set(src.match(/\{ id: 'x\d+'/g) || []);
  const total = readEngineCheckCount();
  // The three x01-x03 checks are the MANUAL/browser-only additions on this
  // registry. Deriving "total minus manual" here mirrors
  // ENGINE_SCORED_CHECK_COUNT; if the manual set changes, the gate compares the
  // wrong pair and fails loudly rather than passing quietly.
  return total === null ? null : total - xIds.size;
}

function readEngineCheckCount() {
  const src = fs.readFileSync(REGISTRY, 'utf8');
  // Count the CHECKS array entries. Check IDs are NOT all v-prefixed: the
  // registry carries 39 `v*` (the numbered contract checks) plus 3 `x*` (the
  // later Cadence additions, x01-x03), which together make the public 42. A
  // first version of this gate matched only `v\d+`, read 39, and then reported
  // all 131 correct "42 checks" claims as stale — a gate whose own instrument
  // was wrong, flagging correct copy, which is the exact defect class this lane
  // has spent a session removing. Match either prefix.
  const ids = new Set(src.match(/\{ id: '[a-z]\d+'/g) || []);
  if (ids.size === 0) return null;
  return ids.size;
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'public']);

/**
 * Files that legitimately record a HISTORICAL count and must not be "corrected".
 *
 * A changelog that says "Engine expanded from 36 to 40 checks" is a dated
 * record of what was true then; rewriting it to 42 would make the history
 * false. Same for the /blog scoring write-ups, which describe a specific
 * scoring run against a 40-check contract at the time.
 *
 * This is a real distinction with a real cost if lost: the receipt is the
 * product's premise, and a receipt that gets edited to match today's number is
 * no longer a receipt. Exempted narrowly and by name, so a NEW file with a
 * stale live claim is still caught.
 */
const HISTORICAL_ALLOWLIST = [
  /^app[\\/]changelog[\\/]page\.tsx$/,
  /^app[\\/]blog[\\/].*$/,
  /^app[\\/]state-of-compliance[\\/]page\.tsx$/,  // comment documenting its own CHECKS array
  /^scripts[\\/]prose-lint\.js$/,                // quotes the bug it was built to catch
  /^app[\\/]leaderboard[\\/]seed\.ts$/,          // dated re-score provenance header
  /^app[\\/]api[\\/]leaderboard/,                // dated batch provenance
];

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      yield full;
    }
  }
}

/**
 * Find `<N> checks` / `<N> verification` claims where the claim is a LITERAL
 * number. Skips template-literal interpolations (`${...} checks`) by requiring
 * a digit immediately before the word.
 */
const CLAIM_RE = /\b(\d{1,3})[\s-]+(?:automated[\s-]+)?(?:checks?|verification)\b/gi;

function main() {
  const asJson = process.argv.includes('--json');

  const expected = readEngineCheckCount();
  const scoredExpected = readScoredCheckCount();
  if (expected === null) {
    const msg = `check-count-literal: could not read the registry at ${REGISTRY}`;
    if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(msg);
    process.exit(1);
  }

  const findings = [];
  let scanned = 0;
  let agreeing = 0;

  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const rel = path.relative(APP, file);
      // The registry itself defines the number and is the source of truth.
      if (path.resolve(file) === path.resolve(REGISTRY)) continue;
      // Comments in the migration's own scripts may quote the old value.
      if (/check-count-literal\.js$/.test(file)) continue;
      // Historical records are exempt — see HISTORICAL_ALLOWLIST.
      if (HISTORICAL_ALLOWLIST.some((re) => re.test(rel))) continue;
      scanned++;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // "N of N checks" cites the SCORED count, not the registry total: the
        // engine excludes MANUAL checks from its denominator, so that phrase
        // describes what was actually measured. Correct usage — see
        // ENGINE_SCORED_CHECK_COUNT in check-definitions.ts. A gate that flagged
        // it would push copy toward overstating what was measured, which is the
        // exact failure the two exports exist to prevent.
        //
        // Exempt only when BOTH numbers equal the scored count. An earlier
        // version exempted any N-of-N shape, and mutation testing showed that
        // let "41 of 41 checks" through unexamined — the exemption was too
        // broad, silently blessing a wrong pair because it happened to be
        // written in the right pattern. Exempt the correct value, not the shape.
        const ofMatch = line.match(/\b(\d{1,3})\s+of\s+(\d{1,3})\s+checks?\b/i);
        if (ofMatch) {
          const both = parseInt(ofMatch[1], 10) === scoredExpected && parseInt(ofMatch[2], 10) === scoredExpected;
          if (both) continue;
        }
        CLAIM_RE.lastIndex = 0;
        let m;
        while ((m = CLAIM_RE.exec(line)) !== null) {
          const n = parseInt(m[1], 10);
          // A claim is only about THIS registry when it names our count shape.
          // Numbers belonging to sibling engines (drift 12, readiness 10,
          // guardrails 6) also match `N checks`, so only flag values that are
          // close to the registry size but wrong — a claim of "6 checks" is a
          // different engine, not a stale total.
          const near = Math.abs(n - expected) <= 6;
          if (!near) continue;
          if (n === expected) {
            agreeing++;
            continue;
          }
          findings.push({
            file: rel,
            line: i + 1,
            found: n,
            expected,
            text: line.trim().slice(0, 120),
          });
        }
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, expected, scanned, agreeing, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`check-count-literal: OK — ${agreeing} literal claim(s) agree with the registry (${expected} total / ${scoredExpected} scored, ${scanned} files scanned)`);
  } else {
    console.error(`check-count-literal: ${findings.length} stale claim(s) — the registry says ${expected}\n`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  says "${f.found} checks", registry says ${f.expected}`);
      console.error(`      ${f.text}`);
    }
    console.error(`\n  Fix: derive the number (ENGINE_CHECK_COUNT from app/lib/check-definitions.ts)`);
    console.error(`  or update the literal. Do not change the registry to match copy.`);
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
