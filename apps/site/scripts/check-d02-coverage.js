#!/usr/bin/env node
/**
 * d02-coverage gate — assert the fabricated-token check scans BOTH surfaces a
 * var() reference can live on.
 *
 * WHY THIS EXISTS
 * d02's job is catching references to custom properties that are never
 * declared. It scanned stylesheets and <style> blocks. It did not scan
 * `style="..."` attributes, which is precisely what React's `style={{}}` prop
 * renders to — so any token referenced from a component style object was
 * invisible to the check.
 *
 * That is how --surface-1 survived: a code block's background was set to
 * var(--surface-1) in a style object, the token was never declared, the
 * declaration was invalid, and the panel rendered transparent. d02 reported
 * PASS the entire time.
 *
 * The gap was proven by injecting two fabricated tokens into a style attribute
 * on the live page: d02 stayed PASS with an unchanged reference count. The
 * check was structurally incapable of failing on that input.
 *
 * WHY A SOURCE-LEVEL GATE RATHER THAN A BEHAVIOURAL TEST
 * Proving coverage behaviourally needs a target site that both serves
 * attribute-level var() refs AND carries an undeclared one — which production
 * does not, by definition, once the defect is fixed. The invariant that must
 * hold is simpler and checkable statically: the reference list fed to d02 must
 * be built from more than one extraction source.
 *
 * Usage:  node scripts/check-d02-coverage.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const SRC = path.join(APP, 'app', 'api', 'drift', 'route.ts');
// The twelve checks and their invocations moved to the shared module on
// 2026-09-25 so /api/drift and /api/monitor run ONE implementation. Clauses that
// assert an INVOCATION therefore have to look where the invocations now live,
// while clauses about the route's own varRefs assembly stay on the route.
const SHARED = path.join(APP, 'app', 'lib', 'drift-checks.ts');

/** Strip comments so an assertion cannot be satisfied by prose ABOUT the rule. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CLAUSES = [
  {
    id: 'varrefs-built-from-multiple-surfaces',
    // The defect was a single-source extraction. Require the varRefs
    // initialiser to combine more than one extractVarRefs call, or to be built
    // from an array literal of references.
    test: (code) => {
      const m = code.match(/const\s+varRefs\s*=\s*([^\n]*)/);
      if (!m) return false;
      const rhs = m[1];
      const calls = (rhs.match(/extractVarRefs\s*\(/g) || []).length;
      return calls >= 2;
    },
    why: 'varRefs is built from a single extractVarRefs() call, so d02/d11 only see one surface. Attribute-level var() refs (React style objects) are invisible and d02 can never fail on them.',
    fix: 'Combine extractVarRefs(allCss) with extractVarRefs(attributeCss) — see the note above the varRefs declaration.',
  },
  {
    id: 'style-attributes-are-collected',
    // The HTML must actually be read for style="..." values, not just <style>.
    test: (code) =>
      /match\(\s*\/\s*\\sstyle=/i.test(code) ||
      /style="\(\[\^"\]\*\)"/i.test(code) ||
      /style=\\\\?"/i.test(code) && /style="([^"]*)"/i.test(code),
    why: 'The route never extracts style="..." attribute values from the HTML, so React style-object tokens stay invisible regardless of how the reference list is assembled.',
    fix: 'Collect attribute CSS from html, e.g. html.match(/\\sstyle="([^"]*)"/gi).join(\';\'), and feed it to extractVarRefs.',
  },
  {
    id: 'd02-still-runs',
    // Guard against someone "fixing" coverage by removing the check.
    //
    // This clause was initially satisfied by a COMMENT mentioning the function
    // — stripComments removes block and line comments, but the `// removed for
    // test` replacement left the call text intact in a position the regex still
    // matched. A clause that passes with the check deleted is worthless, so it
    // requires the call to appear inside an actual call list, which comments
    // cannot satisfy.
    //
    // MOVED 2026-09-25 to the shared module, and the move is itself the point:
    // the check now runs from app/lib/drift-checks.ts, so asserting it in the
    // route would fail on correct code AND — worse — a route-local assertion
    // could no longer tell whether the shared list still calls it. `sources`
    // selects which file this clause inspects.
    sources: 'shared',
    test: (code) => {
      // The shared module's canonical entry point lists every check.
      const fn = code.match(/export\s+function\s+runDriftChecks\s*\([\s\S]*?\n\}/);
      if (!fn) return false;
      return /checkD02FabricatedTokens\s*\(/.test(fn[0]);
    },
    why: 'd02 is not invoked from the shared checks list — coverage cannot be asserted for a check that does not run.',
    fix: 'Restore the checkD02FabricatedTokens(tokens, varRefs) entry in runDriftChecks() in app/lib/drift-checks.ts.',
  },
  {
    id: 'drift-runs-the-shared-checks',
    // The route must CALL the shared implementation rather than re-listing
    // checks locally. Without this, both engines could drift back into
    // hand-maintained copies, which is the defect the extraction removed.
    test: (code) => /runDriftChecks\s*\(\s*allCss\s*,\s*tokens\s*,\s*varRefs\s*\)/.test(code),
    why: 'drift route does not call runDriftChecks(allCss, tokens, varRefs), so it is running its own check list again. Two implementations of d01-d12 is how the two engines came to disagree about 9 of 12 checks on the same page.',
    fix: 'Replace any local checks array with runDriftChecks(allCss, tokens, varRefs) — and pass varRefs explicitly so the attribute-scanned references survive.',
  },
  {
    id: 'monitor-runs-the-shared-checks',
    sources: 'monitor',
    // The sibling route is the half that was wrong; assert it cannot go back.
    // Monitor is checked here rather than in its own gate because the pairing is
    // the invariant: these two routes must resolve their checks from one place.
    test: (code) => /runDriftChecks\s*\(\s*allCss\s*,\s*tokens\s*,\s*varRefs\s*\)/.test(code),
    why: 'monitor route does not call runDriftChecks, so it is running a separate copy of the drift checks. Its copy was drift\'s PRE-FIX code: it reported 149 distinct box-shadow values on radix-ui.com where drift reported 7, and published that reading on /contracts/monitor.',
    fix: 'Call runDriftChecks(allCss, tokens, varRefs) instead of a local checks array.',
  },
];

/** Which file each clause inspects. Defaults to the drift route. */
const SOURCES = {
  route: SRC,
  shared: SHARED,
  monitor: path.join(APP, 'app', 'api', 'monitor', 'route.ts'),
};

function main() {
  const asJson = process.argv.includes('--json');

  const missing = Object.values(SOURCES).filter((p) => !fs.existsSync(p));
  if (missing.length) {
    const msg = `d02-coverage: source not found — ${missing.join(', ')}`;
    if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(msg);
    process.exit(1);
  }

  const loaded = Object.fromEntries(
    Object.entries(SOURCES).map(([k, p]) => [k, stripComments(fs.readFileSync(p, 'utf8'))]),
  );
  const findings = [];

  for (const clause of CLAUSES) {
    let pass = false;
    try {
      pass = Boolean(clause.test(loaded[clause.sources ?? 'route']));
    } catch {
      pass = false;
    }
    if (!pass) findings.push({ id: clause.id, why: clause.why, fix: clause.fix });
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, checked: Object.values(SOURCES), findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`d02-coverage: OK — ${CLAUSES.length} clause(s) hold across ${Object.keys(SOURCES).length} source file(s)`);
  } else {
    console.error(`d02-coverage: ${findings.length} finding(s)\n`);
    for (const f of findings) {
      console.error(`  [${f.id}]`);
      console.error(`    why: ${f.why}`);
      console.error(`    fix: ${f.fix}\n`);
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
