#!/usr/bin/env node
/**
 * gate parity — the CI gate list must equal the `npm run build` gate list.
 *
 * WHY THIS EXISTS
 * On 2026-09-25 the `Build site` CI job ran five of the twelve gates that
 * `npm run build` chains, while its own comment claimed it mirrored the build
 * script "step for step". The seven missing ones ran only when Vercel built for
 * production — after merge, on main, with no PR-level signal.
 *
 * That is not a cosmetic drift. Among the seven were:
 *   * check-use-client-first — the guard for the directive-ordering defect that
 *     returned 500 on every route on 2026-09-24, and
 *   * check-count-up-seed — whose regression is invisible to tsc, lint AND the
 *     prerender (it exists only in the hydration-to-observer window).
 *
 * So a PR could merge green with either defect present. "Vercel will catch it"
 * is not a substitute: by the time Vercel builds, the commit is already on main.
 *
 * WHY A PARITY CHECK RATHER THAN JUST ADDING THE MISSING STEPS
 * Adding the seven steps fixes today. The lists are maintained in two files —
 * apps/site/package.json (which Vercel runs) and .github/workflows/ci.yml (which
 * PRs run) — so the NEXT gate added to one and not the other reintroduces the
 * same silent gap. This asserts the two are equal, in both directions:
 *
 *   * a gate in the build script but not in CI  -> PRs do not run it (the bug)
 *   * a gate in CI but not in the build script   -> CI tests something Vercel
 *                                                   does not, so green CI
 *                                                   overstates deploy safety
 *
 * Ordering is deliberately NOT asserted. A reordered step is not a defect, and a
 * gate that fails on harmless refactors is a gate someone deletes.
 *
 * MAINTENANCE
 * Adding a gate means adding it to BOTH lists in the same commit. That is the
 * point — the failure mode being prevented is a change that touches one file.
 *
 * Usage:  node scripts/check-gate-parity.js [--json]
 * Exits 1 on any divergence, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const PKG = path.join(APP, 'package.json');
const CI = path.join(APP, '..', '..', '.github', 'workflows', 'ci.yml');

/** Gate filenames referenced as `node scripts/<name>.js` in a string. */
function gatesIn(text) {
  return [...text.matchAll(/node scripts\/([\w-]+\.js)/g)].map((m) => m[1]);
}

function unique(list) {
  return [...new Set(list)].sort();
}

function main() {
  const asJson = process.argv.includes('--json');

  const missing = [];
  if (!fs.existsSync(PKG)) missing.push(PKG);
  if (!fs.existsSync(CI)) missing.push(CI);
  if (missing.length) {
    const msg = `gate-parity: file not found — ${missing.join(', ')}`;
    if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(msg);
    process.exit(1);
  }

  const buildScript = JSON.parse(fs.readFileSync(PKG, 'utf8')).scripts.build || '';
  const ciText = fs.readFileSync(CI, 'utf8');

  const inBuild = unique(gatesIn(buildScript));
  const inCi = unique(gatesIn(ciText));

  // `check-gate-parity.js` is CI-only BY DESIGN: it cannot enumerate itself from
  // the build script's perspective without a chicken-and-egg, and Vercel has no
  // second list to compare against. Excluded explicitly rather than silently.
  const CI_ONLY = new Set(['check-gate-parity.js']);

  const onlyInBuild = inBuild.filter((g) => !inCi.includes(g));
  const onlyInCi = inCi.filter((g) => !inBuild.includes(g) && !CI_ONLY.has(g));

  const findings = [];
  if (onlyInBuild.length) {
    findings.push({
      id: 'gate-missing-from-ci',
      why: `These gates are chained by \`npm run build\` (so Vercel runs them) but are not invoked by the CI workflow, so a pull request can merge without them: ${onlyInBuild.join(', ')}`,
      fix: 'Add a step for each to the "Build site" job in .github/workflows/ci.yml. A gate only Vercel runs is a gate that fires after the merge, not before it.',
    });
  }
  if (onlyInCi.length) {
    findings.push({
      id: 'gate-missing-from-build',
      why: `These gates are invoked by CI but NOT chained by \`npm run build\`, so green CI overstates what the deploy actually verifies: ${onlyInCi.join(', ')}`,
      fix: 'Either add the gate to the build script in apps/site/package.json, or remove the CI step if it is deliberately CI-only — and if so, add it to CI_ONLY in this script with the reason.',
    });
  }

  // Guard the guard: if the extraction ever matches nothing, the parity check
  // would pass vacuously — the exact "gate that cannot fail" shape this lane has
  // shipped three times. Require a plausible number of gates on both sides.
  if (inBuild.length < 5 || inCi.length < 5) {
    findings.push({
      id: 'extraction-suspiciously-empty',
      why: `Extracted only ${inBuild.length} gate(s) from the build script and ${inCi.length} from CI. The parity comparison is only meaningful if both lists were actually read — a near-empty extraction passes vacuously.`,
      fix: 'Check that the build script still chains gates as `node scripts/<name>.js` and that the CI workflow still invokes them the same way. If the invocation form changed, update gatesIn() in this script.',
    });
  }

  if (asJson) {
    console.log(
      JSON.stringify({ ok: findings.length === 0, inBuild, inCi, findings }, null, 2),
    );
  } else if (findings.length === 0) {
    console.log(`gate-parity: OK — ${inBuild.length} gate(s) in both the build script and CI`);
  } else {
    console.error(`gate-parity: ${findings.length} finding(s)\n`);
    for (const f of findings) {
      console.error(`  [${f.id}]`);
      console.error(`    why: ${f.why}`);
      console.error(`    fix: ${f.fix}\n`);
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
