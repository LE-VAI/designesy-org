#!/usr/bin/env node
/**
 * analytics redaction gate — the site's analytics never receive a query string
 * or a fragment.
 *
 * WHY THIS EXISTS
 * /score?url=… carries the address a visitor scores. On 2026-10-11 the live
 * site's analytics beacons were captured in a headless browser (each one was
 * recorded and then aborted, so nothing was sent) for
 * /score?url=https://example.com/private-staging?token=abc#frag:
 *
 *   Web Analytics page view   "o":    "https://www.designesy.org/score?url=https://example.com/private-staging?token=abc#frag"
 *   Speed Insights, each vital "href": the same full address
 *
 * So a private or staging address typed into the score box left the visitor's
 * browser for the analytics store. Seven other routes carry a visitor-entered
 * address the same way (/drift, /readiness, /compare, /guardrails, /monitor,
 * /report, /score/report).
 *
 * The fix is one `beforeSend` hook, redactAnalyticsEvent in
 * app/lib/analytics-url.ts, passed to BOTH <Analytics> and <SpeedInsights>.
 * This gate holds both halves of it:
 *
 *   1. BEHAVIOUR — the hook itself is loaded with Node's type stripping and run
 *      against a table of addresses, so the gate tests the code that ships, not
 *      a copy of it.
 *   2. WIRING — every <Analytics> and <SpeedInsights> element under app/ passes
 *      that hook. A correct function that nothing calls protects nobody, and a
 *      second mount added later without the hook would send the address again.
 *
 * THE CLAUSE THAT COULD NOT FAIL
 * This lane's source gates have each shipped once with a clause that passed on
 * broken code: a pattern satisfied by a comment, or matched across an element
 * boundary. So the wiring clause reads comment-stripped source and scopes each
 * match to ONE opening tag (a bounded run that cannot cross a `>`), and the
 * gate fails if it finds no mount at all instead of passing on an empty set.
 * Both clauses were mutation-tested: deleting the hook from either element, and
 * making the hook return its input unchanged, each exit non-zero.
 *
 * Usage:  node scripts/check-analytics-redaction.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// analytics-url.ts carries ESM syntax in a package with no "type" field, so Node
// reparses it as a module and says so on stderr. That note is expected here
// (the same idiom as check-palette-excerpts.js).
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) =>
  String(warning).includes('Module type of') ? undefined : emitWarning.call(process, warning, ...rest);

const APP = path.join(__dirname, '..');
const APP_DIR = path.join(APP, 'app');
const LIB = path.join(APP_DIR, 'lib', 'analytics-url.ts');
const HOOK = 'redactAnalyticsEvent';

/** [input, expected] — what each reported address must become. */
const CASES = [
  ['https://www.designesy.org/score?url=https://example.com', 'https://www.designesy.org/score'],
  [
    'https://www.designesy.org/score?url=https://example.com/private-staging?token=abc#frag',
    'https://www.designesy.org/score',
  ],
  ['https://www.designesy.org/drift?url=staging.example.com&scope=contract', 'https://www.designesy.org/drift'],
  ['https://www.designesy.org/docs#install', 'https://www.designesy.org/docs'],
  ['https://www.designesy.org/pricing/review', 'https://www.designesy.org/pricing/review'],
  ['https://www.designesy.org/', 'https://www.designesy.org/'],
  ['https://www.designesy.org/frameworks/react', 'https://www.designesy.org/frameworks/react'],
  ['/score?url=example.com', '/score'],
  ['https://www.designesy.org/?', 'https://www.designesy.org/'],
  ['', ''],
];

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function behaviourFindings() {
  const findings = [];
  let lib;
  try {
    lib = await import(pathToFileURL(LIB).href);
  } catch (e) {
    return [
      {
        id: 'hook-loads',
        why: `Could not load app/lib/analytics-url.ts with Node's type stripping (${e.code || e.message}), so the redaction cannot be checked.`,
        fix: 'Run on Node 22.18 or later, and keep analytics-url.ts free of imports and of syntax that type stripping cannot erase.',
      },
    ];
  }
  if (typeof lib[HOOK] !== 'function') {
    return [{ id: 'hook-exported', why: `app/lib/analytics-url.ts does not export ${HOOK}.`, fix: `Export ${HOOK} from app/lib/analytics-url.ts.` }];
  }
  for (const [input, expected] of CASES) {
    const event = { type: 'pageview', url: input, route: '/score' };
    let got;
    try {
      got = lib[HOOK](event);
    } catch (e) {
      got = { url: `threw: ${e.message}` };
    }
    if (!got || got.url !== expected) {
      findings.push({
        id: 'hook-strips-query-and-fragment',
        why: `${HOOK}({ url: ${JSON.stringify(input)} }) returned url ${JSON.stringify(got && got.url)}; expected ${JSON.stringify(expected)}. Anything after "?" or "#" can be the address a visitor scored.`,
        fix: 'Cut the reported url at the first "?" or "#" and keep the path.',
      });
    } else if (got.type !== event.type || got.route !== event.route) {
      findings.push({
        id: 'hook-keeps-other-fields',
        why: `${HOOK} dropped or changed fields other than url (type, route). Speed Insights reads route; Web Analytics reads type.`,
        fix: 'Spread the event and replace url only.',
      });
    }
  }
  return findings;
}

function wiringFindings() {
  const findings = [];
  const mounts = [];
  for (const file of sourceFiles(APP_DIR)) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    // One opening tag per match: [^>]* cannot run past the tag's own `>`.
    for (const m of code.matchAll(/<(Analytics|SpeedInsights)\b([^>]*)>/g)) {
      mounts.push({ file: path.relative(APP, file), name: m[1], attrs: m[2] });
    }
  }
  for (const name of ['Analytics', 'SpeedInsights']) {
    if (!mounts.some((m) => m.name === name)) {
      findings.push({
        id: `${name}-mounted`,
        why: `No <${name}> element was found under app/. Either it was removed (then delete this gate's clause on purpose) or it moved somewhere this gate cannot see, where it would report unredacted addresses.`,
        fix: `Mount <${name} beforeSend={${HOOK}} /> in app/lib/site-analytics.tsx, or update this gate in the same commit that removes it.`,
      });
    }
  }
  const hookAttr = new RegExp(`\\bbeforeSend=\\{${HOOK}\\}`);
  for (const m of mounts) {
    if (!hookAttr.test(m.attrs)) {
      findings.push({
        id: `${m.name}-uses-hook`,
        why: `<${m.name}> in ${m.file} does not pass beforeSend={${HOOK}}, so it reports the full address, query string included.`,
        fix: `Pass beforeSend={${HOOK}} (from app/lib/analytics-url.ts) to that element.`,
      });
    }
  }
  return { findings, mounts };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const behaviour = await behaviourFindings();
  const { findings: wiring, mounts } = wiringFindings();
  const findings = [...behaviour, ...wiring];

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, cases: CASES.length, mounts, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(
      `analytics-redaction: OK — ${CASES.length} address case(s) redacted; ${mounts.length} mount(s) pass beforeSend={${HOOK}} (${mounts.map((m) => `${m.name} in ${m.file}`).join(', ')})`,
    );
  } else {
    console.error(`analytics-redaction: ${findings.length} finding(s)\n`);
    for (const f of findings) {
      console.error(`  [${f.id}]`);
      console.error(`    why: ${f.why}`);
      console.error(`    fix: ${f.fix}\n`);
    }
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

main();
