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
 * WHAT A REFERENCE NEEDS TO BE FABRICATED (added 2026-10-10)
 * The opposite failure: d02 and d12 FAILed designesy.org on 13 properties it
 * never fabricated. Of 29 undeclared names on the home page, 24 were always
 * referenced with a fallback, var(--x, 4px), and 5 were declared in style
 * attributes by React style objects; none was unguarded. So the routes now
 * pass the style attributes to runDriftChecks as declarations too, and d02
 * counts only a property referenced with no fallback and declared nowhere.
 * Two kinds of assertion hold that:
 *   - source clauses: both routes build attrCss with the shared
 *     extractStyleAttributeCss(html) and pass it as runDriftChecks' fourth
 *     argument;
 *   - behaviour: the pages in scripts/fixtures/drift-references.json are run
 *     through the shared checks, assembled the way /api/drift assembles them,
 *     and each must return its stated d02 and d12 verdicts. They include true
 *     positives (no fallback, declared nowhere) that must still FAIL, so the
 *     fix cannot pass by excusing everything. The checks are loaded with Node's
 *     type stripping; a Vercel build whose Node cannot strip types prints NOT
 *     EVALUATED instead of passing.
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
const FIXTURES = path.join(__dirname, 'fixtures', 'drift-references.json');

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
    // The reading moved to the shared module on 2026-10-10, so both routes
    // collect the attributes the same way; this clause asserts the route calls
    // it, and the next one that the shared function reads the attributes.
    test: (code) => /const\s+attrCss\s*=\s*extractStyleAttributeCss\s*\(\s*html\s*\)/.test(code),
    why: 'The route never extracts style="..." attribute values from the HTML, so React style-object tokens stay invisible regardless of how the reference list is assembled.',
    fix: 'Collect attribute CSS with const attrCss = extractStyleAttributeCss(html), imported from app/lib/drift-checks.ts, and feed it to extractVarRefs and runDriftChecks.',
  },
  {
    id: 'shared-reads-style-attributes',
    sources: 'shared',
    test: (code) => {
      const fn = code.match(/export\s+function\s+extractStyleAttributeCss\s*\([\s\S]*?\n\}/);
      return Boolean(fn) && fn[0].includes('\\sstyle="([^"]*)"');
    },
    why: 'extractStyleAttributeCss in app/lib/drift-checks.ts no longer reads style="..." attributes, so neither route sees the properties they declare or reference.',
    fix: 'Restore (html.match(/\\sstyle="([^"]*)"/gi) || []).join(\';\') as its body.',
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
    test: (code) => /runDriftChecks\s*\(\s*allCss\s*,\s*tokens\s*,\s*varRefs\s*,\s*attrCss\s*\)/.test(code),
    why: 'drift route does not call runDriftChecks(allCss, tokens, varRefs, attrCss), so it is running its own check list again, or not passing the style attributes that declare custom properties. Two implementations of d01-d12 is how the two engines came to disagree about 9 of 12 checks on the same page.',
    fix: 'Replace any local checks array with runDriftChecks(allCss, tokens, varRefs, attrCss) — and pass varRefs explicitly so the attribute-scanned references survive.',
  },
  {
    id: 'monitor-runs-the-shared-checks',
    sources: 'monitor',
    // The sibling route is the half that was wrong; assert it cannot go back.
    // Monitor is checked here rather than in its own gate because the pairing is
    // the invariant: these two routes must resolve their checks from one place.
    test: (code) => /runDriftChecks\s*\(\s*allCss\s*,\s*tokens\s*,\s*varRefs\s*,\s*attrCss\s*\)/.test(code),
    why: 'monitor route does not call runDriftChecks(allCss, tokens, varRefs, attrCss), so it is running a separate copy of the drift checks, or not passing the style attributes, and would disagree with drift about a property a style attribute declares. Its copy was drift\'s PRE-FIX code: it reported 149 distinct box-shadow values on radix-ui.com where drift reported 7, and published that reading on /contracts/monitor.',
    fix: 'Call runDriftChecks(allCss, tokens, varRefs, attrCss), with attrCss = extractStyleAttributeCss(html), instead of a local checks array.',
  },
];

/** Which file each clause inspects. Defaults to the drift route. */
const SOURCES = {
  route: SRC,
  shared: SHARED,
  monitor: path.join(APP, 'app', 'api', 'monitor', 'route.ts'),
};

/**
 * Run each fixture page through the shared checks the way /api/drift does and
 * compare the d02/d12 verdicts. Returns { findings, evaluated, reason, cases }.
 */
async function behaviourFindings() {
  const findings = [];
  let lib;
  try {
    lib = await import(require('node:url').pathToFileURL(SHARED).href);
  } catch (e) {
    if (process.env.VERCEL === '1') {
      return { findings, evaluated: false, reason: `this Node cannot load drift-checks.ts (${e.code || e.message})` };
    }
    findings.push({
      id: 'fixtures-lib-unloadable',
      why: `Could not load app/lib/drift-checks.ts with Node's type stripping (${e.code || e.message}), so the reference fixtures cannot run.`,
      fix: 'Run on Node 22.18 or later, and keep drift-checks.ts free of imports and of syntax that type stripping cannot erase.',
    });
    return { findings, evaluated: false, reason: 'library unloadable' };
  }
  const { cases } = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const ROOT = ':root{--a:1px;--b:2px;--c:3px;--d:4px;--e:5px}';
  const styleTags = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  for (const c of cases) {
    // The route's assembly: <style> bodies and linked sheets, then the <style>
    // tags again (allCss), then the style attributes.
    const html = c.html;
    const css = [...[...html.matchAll(styleTags)].map((m) => m[1]), c.css.replace('ROOT', ROOT)].join('\n');
    const allCss = css + (html.match(styleTags)?.join('\n') || '');
    const tokens = lib.extractRootTokens(allCss);
    const attrCss = lib.extractStyleAttributeCss(html);
    const varRefs = [...lib.extractVarRefs(allCss), ...lib.extractVarRefs(attrCss)];
    const got = Object.fromEntries(lib.runDriftChecks(allCss, tokens, varRefs, attrCss).map((r) => [r.id, r]));
    for (const [id, status] of Object.entries(c.expect)) {
      if (got[id]?.status !== status) {
        findings.push({
          id: `fixture:${c.name}:${id}`,
          why: `On the fixture "${c.name}", ${id} returned ${got[id]?.status} (${got[id]?.detail}), expected ${status}.`,
          fix: 'Fix the check in app/lib/drift-checks.ts, or the fixture in scripts/fixtures/drift-references.json if the expected verdict is wrong.',
        });
      }
    }
    for (const [id, text] of Object.entries(c.detail || {})) {
      if (!String(got[id]?.detail).includes(text)) {
        findings.push({
          id: `fixture:${c.name}:${id}:detail`,
          why: `On the fixture "${c.name}", ${id} said "${got[id]?.detail}", which does not contain "${text}".`,
          fix: 'Fix the detail in app/lib/drift-checks.ts, or the fixture if the expected text is wrong.',
        });
      }
    }
  }
  // The fixtures must include a true positive that FAILs d02, or the fix could
  // pass by excusing every reference.
  if (!cases.some((c) => c.expect.d02 === 'FAIL')) {
    findings.push({
      id: 'fixtures-without-true-positive',
      why: 'No fixture expects d02 to FAIL, so these fixtures cannot tell a working check from one that excuses every reference.',
      fix: 'Keep a fixture whose properties are referenced with no fallback and declared nowhere, expecting FAIL.',
    });
  }
  return { findings, evaluated: true, cases: cases.length };
}

async function main() {
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

  const behaviour = await behaviourFindings();
  findings.push(...behaviour.findings);

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, checked: Object.values(SOURCES), fixtures: { evaluated: behaviour.evaluated, cases: behaviour.cases ?? 0, reason: behaviour.reason }, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`d02-coverage: OK — ${CLAUSES.length} clause(s) hold across ${Object.keys(SOURCES).length} source file(s)`);
    if (behaviour.evaluated) {
      console.log(`d02-coverage: OK — ${behaviour.cases} fixture page(s) return their stated d02 and d12 verdicts, true positives included`);
    } else {
      console.log(`d02-coverage: [NOT EVALUATED] reference fixtures: ${behaviour.reason}`);
    }
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

main().catch((e) => {
  console.error(`d02-coverage: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
