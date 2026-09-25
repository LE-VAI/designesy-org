#!/usr/bin/env node
/**
 * cross-engine agreement gate — drift and monitor must measure the same artifact.
 *
 * WHY THIS EXISTS
 * /api/drift and /api/monitor both publish checks with the SAME IDs (d01-d12);
 * monitor's own route header describes itself as re-running "the 12 drift
 * checks". They are therefore two views of ONE contract and must agree about any
 * given page.
 *
 * They did not. Measured 2026-09-25 on the site's own CSS: 9 of 12 checks
 * disagreed, and the cause was that monitor held a VERBATIM COPY of drift's
 * PRE-FIX code — six documented drift fixes had never been ported. The published
 * consequence, measured offline across real cohort sites:
 *
 *   radix-ui.com   d07: drift 2 PASS   / monitor 18 FAIL
 *                  d08: drift 7 PASS   / monitor 149 FAIL
 *   vercel.com     d07: drift 17 FAIL  / monitor 31 FAIL
 *                  d08: drift 8 PASS   / monitor 239 FAIL
 *
 * Those readings were published on /contracts/monitor and through an MCP tool:
 * the engine reported fabricated design drift about other people's sites.
 *
 * The structural fix was to give both routes ONE implementation
 * (app/lib/drift-checks.ts). This gate defends that decision, because the
 * failure mode is silent — two copies agree at the moment they are written and
 * diverge only when one is later fixed.
 *
 * WHAT IT ASSERTS, AND WHY THESE SHAPES
 *   1. Both routes resolve their checks from runDriftChecks (no local list).
 *   2. Neither route re-defines a check function or an extraction helper.
 *   3. The shared module exports all twelve checks and the entry point, and the
 *      entry point actually CALLS each one — a check defined but not called
 *      would silently stop running.
 *
 * These are source-level clauses, deliberately: the defect is structural (two
 * copies), so the assertion has to be about structure rather than about any
 * single output. A fixture-based version comparing the two routes' live
 * responses would be stronger, but it needs the network, and a network-dependent
 * gate is one that gets deleted the first time it flakes.
 *
 * THE CLAUSE THAT COULD NOT FAIL — guarded, per this lane's record:
 *   * every scan reads a file it asserts exists first, so deleting a route
 *     fails the gate instead of passing vacuously;
 *   * the "dN is called" clause matches inside the runDriftChecks function BODY,
 *     not the file, so a definition or a comment cannot satisfy it;
 *   * a minimum-count clause fails if fewer than twelve calls are found.
 *
 * Mutation-tested: removing a check from runDriftChecks exits 1; restoring a
 * local extractor definition in monitor exits 1.
 *
 * Usage:  node scripts/check-cross-engine-agreement.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const DRIFT = path.join(APP, 'app', 'api', 'drift', 'route.ts');
const MONITOR = path.join(APP, 'app', 'api', 'monitor', 'route.ts');
const SHARED = path.join(APP, 'app', 'lib', 'drift-checks.ts');

const CHECK_IDS = ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08', 'd09', 'd10', 'd11', 'd12'];

/**
 * The EXPORTED name of each check function.
 *
 * Written in full rather than derived as `check${id.toUpperCase()}`. That
 * derivation yields `checkD07`, and a `\b`-anchored search for `checkD07` does
 * NOT match the real export `checkD07BorderRadius` — the `\b` requires a word
 * boundary where the name actually continues. The first version of this gate did
 * exactly that, and the mutation harness caught it: re-defining
 * checkD07BorderRadius in monitor passed the gate while re-defining
 * extractValuesByProperty (a full name) failed it.
 *
 * A clause that silently cannot fire is worse than no clause, because it
 * advertises coverage it does not have. Spelling the names out removes the
 * derivation the bug lived in.
 */
const CHECK_FNS = [
  'checkD01TokenRegistry',
  'checkD02FabricatedTokens',
  'checkD03InlineColors',
  'checkD04SpacingVariance',
  'checkD05ColorVariance',
  'checkD06FontFamily',
  'checkD07BorderRadius',
  'checkD08ShadowVariance',
  'checkD09TransitionVariance',
  'checkD10ZIndex',
  'checkD11UndeclaredRatio',
  'checkD12AliasChains',
];

/**
 * Names that must NOT be re-defined in a route. Both engines share one
 * implementation of each; a second definition is the divergence itself.
 */
const SHARED_SYMBOLS = [
  'extractValuesByProperty',
  'extractRootTokens',
  'extractVarRefs',
  'extractVarChains',
  'uniqueValues',
  'cleanCssForValueCounting',
  'extractHardcodedColors',
  'extractHardcodedSpacing',
  'resolveFamilyToken',
  ...CHECK_FNS,
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const findings = [];

// ── Guard the guard: all three sources must exist ────────────────────────────
const sources = { drift: DRIFT, monitor: MONITOR, shared: SHARED };
const missing = Object.entries(sources).filter(([, p]) => !fs.existsSync(p));
if (missing.length) {
  findings.push({
    id: 'expected-source-missing',
    why: `These files do not exist: ${missing.map(([k, p]) => `${k} (${path.relative(APP, p)})`).join(', ')}. An agreement check over missing files passes for the wrong reason.`,
    fix: 'Update the paths at the top of this script to match where the routes and the shared module live.',
  });
}

if (findings.length === 0) {
  const code = Object.fromEntries(
    Object.entries(sources).map(([k, p]) => [k, stripComments(fs.readFileSync(p, 'utf8'))]),
  );

  // ── 1. Both routes call the shared entry point ─────────────────────────────
  for (const [label, file, text] of [['drift', DRIFT, code.drift], ['monitor', MONITOR, code.monitor]]) {
    if (!/runDriftChecks\s*\(/.test(text)) {
      findings.push({
        id: `${label}-does-not-call-shared-checks`,
        why: `The ${label} route does not call runDriftChecks, so it is resolving drift checks from somewhere other than app/lib/drift-checks.ts. Two implementations of d01-d12 is precisely how these two engines came to disagree about 9 of 12 checks on the same page.`,
        fix: `Call runDriftChecks(css, tokens, varRefs) in ${path.relative(APP, file)} and delete any local checks array.`,
      });
    }
  }

  // ── 2. Neither route re-defines a shared symbol ────────────────────────────
  for (const [label, file, text] of [['drift', DRIFT, code.drift], ['monitor', MONITOR, code.monitor]]) {
    for (const sym of SHARED_SYMBOLS) {
      // `function NAME(` or `const NAME =` in the route = a second copy.
      const redef = new RegExp(`\\b(?:function|const)\\s+${sym}\\b\\s*[=(]`);
      if (redef.test(text)) {
        findings.push({
          id: `${label}-redefines-${sym}`,
          why: `The ${label} route defines its own ${sym}. Both engines must use the single implementation in app/lib/drift-checks.ts — a second copy agrees when written and diverges the first time only one side is fixed, which is the defect that made this engine report 149 distinct box-shadows where drift reported 7.`,
          fix: `Delete the local ${sym} and import it from '../../lib/drift-checks'.`,
        });
      }
    }
  }

  // ── 3. The shared module exports all twelve and calls each one ─────────────
  for (const name of CHECK_FNS) {
    if (!new RegExp(`export\\s+function\\s+${name}\\s*\\(`).test(code.shared)) {
      findings.push({
        id: `shared-missing-${name}`,
        why: `app/lib/drift-checks.ts does not export ${name}, so one of the twelve published drift checks no longer exists in the shared module.`,
        fix: `Restore the ${name} export in app/lib/drift-checks.ts.`,
      });
    }
  }

  // The entry point must actually INVOKE them — a definition alone can be dead.
  const entry = code.shared.match(/export\s+function\s+runDriftChecks\s*\([\s\S]*?\n\}/);
  if (!entry) {
    findings.push({
      id: 'shared-entry-point-missing',
      why: 'app/lib/drift-checks.ts has no runDriftChecks function, so neither route can be running the shared checks.',
      fix: 'Restore runDriftChecks() in app/lib/drift-checks.ts.',
    });
  } else {
    const body = entry[0];
    const called = CHECK_FNS.filter((name) => new RegExp(`${name}\\s*\\(`).test(body));
    if (called.length < CHECK_FNS.length) {
      const absent = CHECK_FNS.filter((name) => !called.includes(name));
      findings.push({
        id: 'shared-entry-point-skips-checks',
        why: `runDriftChecks calls only ${called.length} of ${CHECK_FNS.length} checks — missing: ${absent.join(', ')}. A check that is defined but never called is a check that silently stopped running, and both engines would report the same (wrong) result, so the agreement gate above this one would still pass.`,
        fix: 'Add the missing check(s) to the array returned by runDriftChecks in app/lib/drift-checks.ts.',
      });
    }
  }
}

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify({ ok: findings.length === 0, checked: Object.values(sources).map((p) => path.relative(APP, p)), findings }, null, 2));
} else if (findings.length === 0) {
  console.log(`cross-engine-agreement: OK — both routes resolve all ${CHECK_IDS.length} drift checks from one shared implementation`);
} else {
  console.error(`cross-engine-agreement: ${findings.length} finding(s)\n`);
  for (const f of findings) {
    console.error(`  [${f.id}]`);
    console.error(`    why: ${f.why}`);
    console.error(`    fix: ${f.fix}\n`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
