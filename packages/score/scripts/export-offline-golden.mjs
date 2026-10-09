#!/usr/bin/env node
/**
 * Export the TypeScript engine's verdicts as the golden for the Python offline
 * engine's parity test.
 *
 * WHY THIS EXISTS
 * The PyPI MCP server (packages/designesy-mcp) falls back to a Python port of
 * this engine when the live API is unreachable. Until this gate nothing
 * compared the two: measured on this golden when it was introduced, the port
 * disagreed with this engine on 23 of its 26 checks, so its offline scores
 * disagreed with the site's and nothing failed. The Python test
 * cannot import this engine, so this script runs it on fixed inputs and writes
 * every verdict to a committed JSON file the Python test reads.
 *
 * WHAT IT RUNS
 * Every input goes through scoreFromParts (the same entry point the calibration
 * corpus uses, offline: true), under scope=contract AND scope=universal, so the
 * scope filter is compared both ways:
 *   - corpus/*   every offline fixture in test/fixtures/corpus.mjs
 *   - parity-page  the real page recorded in test/fixtures/parity-page.json.
 *     Its html and css are not copied (they are 325 KB); the golden names the
 *     file and its sha256, and the Python test reads it from there.
 *   - edge/*     small inputs written to reach check branches the corpus does
 *     not, and the JavaScript-specific parsing a port can get wrong (parseFloat
 *     prefixes, hex parseInt, toFixed ties, non-ASCII whitespace and case).
 *     The v05 / v27 / v14 / v18 inputs are the ones test/engine-1-1-0.test.mjs
 *     pins. No expected verdict is written here: the engine produces them all.
 *   - auto/*     scope omitted, so autoDetectScope decides from the subject URL.
 *
 * Usage (after `npm run build`):
 *   node scripts/export-offline-golden.mjs            # writes the golden
 *   node scripts/export-offline-golden.mjs --check    # fails if it is stale
 *
 * CI runs --check, so a change to this engine that moves a verdict fails until
 * the golden is regenerated, and the regenerated golden then fails the Python
 * parity test until the port follows. That pair is the drift gate.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { scoreFromParts, CONTRACT_VERSION } from '../dist/engine.js';
import { FIXTURES } from '../test/fixtures/corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const OUT = join(REPO, 'packages', 'designesy-mcp', 'test', 'fixtures', 'offline-engine-golden.json');
const PARITY_REL = 'packages/score/test/fixtures/parity-page.json';
const CHECK_DEFS = join(REPO, 'apps', 'site', 'app', 'lib', 'check-definitions.ts');

/**
 * The live engine's version, read from the constant every live result reports.
 * Read, not restated: a second copy here is the shape that drifts.
 */
function liveEngineVersion() {
  const src = readFileSync(CHECK_DEFS, 'utf8');
  const m = /export const ENGINE_VERSION = '(\d+\.\d+\.\d+)';/.exec(src);
  if (!m) throw new Error(`ENGINE_VERSION not found in ${CHECK_DEFS}`);
  return m[1];
}

// ── Edge inputs ──────────────────────────────────────────────────────────────

const HTML_WITH_FIELD = `<!doctype html><html lang="en"><head><title>Fixture</title>
<meta name="description" content="Engine 1.1.0 fixture."></head><body><main><h1>Fixture</h1>
<label for="e">Email address</label><input id="e" name="email" type="email">
</main></body></html>`;

const HTML_NO_FIELD = `<!doctype html><html lang="en"><head><title>Fixture</title>
<meta name="description" content="Engine 1.1.0 fixture."></head><body><main><h1>Fixture</h1>
<p>Body copy with no form.</p></main></body></html>`;

const HTML_BARE = '<html><body><div>No title, no description, no landmark, no heading.</div></body></html>';

const gated = (body) => `@media (prefers-reduced-motion: no-preference) { ${body} }`;
const withField = (snippet) => HTML_NO_FIELD.replace('<p>', `${snippet}<p>`);

const FULL_CADENCE = [
  ':root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }',
  'body { font-size: 1rem; line-height: 1.55; }',
  'h1 { text-wrap: balance; } p { text-wrap: pretty; }',
  '.n { font-variant-numeric: tabular-nums; }',
].join('\n');

const POISE_TAKT = [
  '@media (hover: hover) and (pointer: fine) { .b:hover { opacity: .9; } }',
  '.b:active { transform: scale(0.97); }',
  '@keyframes mark-breath { 0% { opacity: 1; } 100% { opacity: .6; } }',
  '.row { animation-delay: 80ms; transition: transform 200ms ease-out; border-radius: 8px; }',
  'a:focus-visible { outline: 2px solid; } a:focus { box-shadow: 0 0 0 2px; }',
].join('\n');

/** [name, html, css] */
const EDGE = [
  // v05 (engine 1.1.0): no-preference opt-in, and what does not count.
  ['v05-gated-animation', HTML_WITH_FIELD, gated('.hero { animation: rise 400ms ease-out both; }')],
  ['v05-gated-transition-token', HTML_WITH_FIELD, gated('a { transition: color var(--duration-quick) ease-out; }')],
  ['v05-gated-smooth-scroll', HTML_WITH_FIELD, gated('html { scroll-behavior: smooth; }')],
  ['v05-gated-view-transition', HTML_WITH_FIELD, gated('@view-transition { navigation: auto; }')],
  ['v05-gated-empty', HTML_WITH_FIELD, gated('')],
  ['v05-gated-off-durations', HTML_WITH_FIELD, gated('* { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }')],
  ['v05-gated-off-none', HTML_WITH_FIELD, gated('* { animation: none !important; transition: none !important; }')],
  ['v05-gated-scroll-auto', HTML_WITH_FIELD, gated('html { scroll-behavior: auto; }')],
  ['v05-gated-zero-seconds', HTML_WITH_FIELD, gated('* { transition-duration: 0s; }')],
  ['v05-gated-no-motion-property', HTML_WITH_FIELD, gated('.card { color: red; transform: translateY(4px); }')],
  ['v05-gated-commented-out', HTML_WITH_FIELD, `/* ${gated('.hero { animation: rise 400ms; }')} */`],
  ['v05-reduce-block', HTML_WITH_FIELD, '@media (prefers-reduced-motion: reduce) { * { animation: none; } }'],
  ['v05-reduce-empty', HTML_WITH_FIELD, '@media (prefers-reduced-motion: reduce) {   }'],
  ['v05-gated-crlf-uppercase', HTML_WITH_FIELD, '@MEDIA (PREFERS-REDUCED-MOTION: NO-PREFERENCE) {\r\n  .a { TRANSITION: opacity 1.5S; }\r\n}'],
  ['v05-gated-mixed-off-and-on', HTML_WITH_FIELD, gated('.a { transition: opacity 5ms, transform 300ms; }')],

  // v27 (engine 1.1.0): applicability comes from the markup.
  ['v27-no-field', HTML_NO_FIELD, ''],
  ...['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color'].map(
    (type) => [`v27-only-${type}-input`, withField(`<input type="${type}" name="x">`), ''],
  ),
  ['v27-input-inside-script', withField('<script>const t = "<input type=\\"text\\">";</script>'), ''],
  ['v27-text-field', HTML_WITH_FIELD, ''],
  ['v27-untyped-input', withField('<input name="q">'), ''],
  ['v27-data-type-hidden', withField('<input data-type="hidden" name="q">'), ''],
  ['v27-textarea', withField('<textarea></textarea>'), ''],
  ['v27-select', withField('<select><option>a</option></select>'), ''],
  ['v27-no-field-sub-16px-rule', HTML_NO_FIELD, 'input { font-size: 13px; }'],
  ['v27-no-field-floor', HTML_NO_FIELD, 'input { font-size: 1rem; }'],
  ['v27-rem-and-fractional-px', HTML_WITH_FIELD, 'input { font-size: 0.875rem; } textarea { font-size: 15.5px; }'],
  ['v27-grouped-floor', HTML_WITH_FIELD, 'input,textarea,select{font-size:16px}'],

  // v14 and v18 (engine 1.1.0, Tier 2): absent, partial, present.
  ['v14-v18-absent', HTML_WITH_FIELD, 'body { font-size: 16px; }'],
  ['v18-partial-text-wrap', HTML_WITH_FIELD, 'h1 { text-wrap: balance; }'],
  ['v14-v18-present', HTML_WITH_FIELD, FULL_CADENCE],

  // Tokens and colour: aliases, var() chains, rgb(), parseInt prefixes.
  ['tokens-alias-var-chain-rgb', HTML_WITH_FIELD, ':root { --base: rgb(250, 250, 250); --bg: var(--base); --text: #111; --accent: rgba(1, 51, 203, 0.9); --text-muted: #888; --text-dim: #ccc; }'],
  ['tokens-hex-parseint-prefix', HTML_WITH_FIELD, ':root { --paper: #12345g; --ink: #0a0; --signal: #FFF; }'],
  ['tokens-signal-unresolvable', HTML_WITH_FIELD, ':root { --paper: #fff; --ink: #000; --signal: oklch(0.5 0.2 260); }'],
  ['tokens-signal-mid-contrast', HTML_WITH_FIELD, ':root { --paper: #ffffff; --ink: #ffffff; --signal: #e26b2c; }'],
  ['tokens-signal-low-contrast', HTML_WITH_FIELD, ':root { --paper: #f0f0f0; --ink: #eeeeee; --signal: #cccccc; }'],
  ['tokens-paper-unresolvable', HTML_WITH_FIELD, ':root { --paper: hsl(0 0% 100%); --ink: #000; }'],
  ['tokens-no-paper-ink-for-signal', HTML_WITH_FIELD, ':root { --signal: #0133cb; }'],
  ['tokens-whitespace-trim', HTML_WITH_FIELD, ':root { --paper: #ffffff﻿; --ink: #111111; }'],
  ['tokens-media-root-stripped', HTML_WITH_FIELD, ':root { --paper: #fff; } @media (prefers-contrast: more) { :root { --paper: #000; } }'],
  ['tokens-last-prop-no-semicolon', HTML_WITH_FIELD, ':root{--paper:#fafafa;--ink:#101010\n}'],
  ['tokens-durations-all', HTML_WITH_FIELD, ':root { --duration: 200ms; --duration-quick: 120ms; --duration-fast: 180ms; --duration-medium: 280ms; --duration-slow: 420ms; }'],
  ['tokens-durations-three-via-alias', HTML_WITH_FIELD, ':root { --duration: 200ms; --duration-fast: 180ms; --motion-slow: 420ms; }'],
  ['tokens-negative-hex-channels', HTML_WITH_FIELD, ':root { --paper: #-f-f-f; --ink: #000; --signal: #fff; }'],

  // will-change, press scale, line-height, selection, x01-x03.
  ['will-change-minified-pair', HTML_WITH_FIELD, '.a{will-change:transform,opacity}'],
  ['will-change-uppercase', HTML_WITH_FIELD, '.a { will-change: Transform; }'],
  ['will-change-scroll-position', HTML_WITH_FIELD, '.a { will-change: transform; } .b { will-change: scroll-position; }'],
  ['press-active-below-floor', HTML_WITH_FIELD, '.x:active { transform: scale(0.9); }'],
  ['press-decorative-and-real', HTML_WITH_FIELD, '.icon { transform: scale(0.5); } .b:active { transform: scale(0.97); }'],
  ['press-decorative-only', HTML_WITH_FIELD, '.icon { transform: scale(0.5); } .dot { transform: scale(.25); }'],
  ['press-scale-zero-only', HTML_WITH_FIELD, '.ripple { transform: scale(0); }'],
  ['press-parsefloat-prefix', HTML_WITH_FIELD, '.b:active { transform: scale(0.9.5); } .c:active { transform: scale(.96); }'],
  ['press-keyframes-stripped', HTML_WITH_FIELD, '@keyframes pop { from { transform: scale(0.2); } } .b:active { transform: scale(0.985); }'],
  ['line-height-both-roles', HTML_WITH_FIELD, 'h1 { line-height: 1.1; } p { line-height: 1.5; }'],
  ['line-height-heading-only', HTML_WITH_FIELD, 'h2 { line-height: 1.08; }'],
  ['line-height-parsefloat-edges', HTML_WITH_FIELD, 'h1 { line-height: 1.; } body { line-height: .; } .title { line-height: 2; }'],
  ['selection-signal', HTML_WITH_FIELD, '::selection { background: var(--signal); }'],
  ['selection-custom-color-uppercase', HTML_WITH_FIELD, '::SELECTION { COLOR: #fff; }'],
  ['selection-empty-rule', HTML_WITH_FIELD, '::selection { text-shadow: none; }'],
  ['x01-x03-declared-wrong', HTML_WITH_FIELD, 'body { font-synthesis: weight; text-underline-position: left; text-decoration-skip-ink: all; }'],
  ['x01-x03-alternates', HTML_WITH_FIELD, 'body { font-synthesis: none; text-underline-position: under; text-decoration-skip-ink: none; }'],

  // Focus, Poise, Takt, Cadence, semantic HTML, rem scale, tabular-nums.
  ['focus-outline-stripped', HTML_WITH_FIELD, 'a:focus { outline: none; }'],
  ['poise-takt-present', withField('<button aria-label="Play" tabindex="0">Play</button>'), POISE_TAKT],
  ['semantic-html-bare', HTML_BARE, ''],
  ['semantic-html-two-h1', HTML_WITH_FIELD.replace('<h1>Fixture</h1>', '<h1>One</h1><h1>Two</h1>'), ''],
  ['rem-over-px', HTML_WITH_FIELD, 'h1 { font-size: 2rem; } p { font-size: 1rem; } small { font-size: 12px; }'],
  ['tabular-nums-eight', HTML_WITH_FIELD, Array.from({ length: 8 }, (_, i) => `.n${i} { font-variant-numeric: tabular-nums; }`).join('\n')],

  // JavaScript regex semantics: \s includes NBSP; /i does not fold dotless i.
  ['regex-nbsp-is-whitespace', HTML_WITH_FIELD, '.a { transition: all 200ms; }'],
  ['regex-dotless-i-not-folded', HTML_WITH_FIELD, '.a { transıtion: all 200ms; }'],
];

/** Scope auto-detection: [name, subject]. Scored on the v14-v18-absent input. */
const AUTO_SUBJECTS = [
  ['auto-www-designesy', 'https://www.designesy.org/'],
  ['auto-apex-designesy-path', 'https://designesy.org/score?x=1'],
  ['auto-uppercase-host', 'HTTPS://WWW.DESIGNESY.ORG/'],
  ['auto-subdomain', 'https://labs.designesy.org/'],
  ['auto-lookalike-host', 'https://designesy.org.example.com/'],
  ['auto-external', 'https://example.com/'],
  ['auto-no-scheme', 'designesy.org'],
  ['auto-bad-port', 'https://designesy.org:99999/'],
];

// ── Run ──────────────────────────────────────────────────────────────────────

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function run(html, css, scope, subject) {
  const result = await scoreFromParts({ html, css, scope, subject, offline: true });
  return {
    scope: scope ?? null,
    subject: subject ?? null,
    effective_scope: result.scope,
    tokens_extracted: result.tokensExtracted,
    checks: result.checks.map((c) => ({ id: c.id, item: c.item, category: c.category, status: c.status, detail: c.detail })),
  };
}

async function bothScopes(html, css) {
  return [await run(html, css, 'contract'), await run(html, css, 'universal')];
}

async function build() {
  const cases = [];

  for (const fx of FIXTURES) {
    // fetchOnly fixtures exercise scoreUrl's network path; they have no parts.
    if (fx.fetchOnly) continue;
    cases.push({ name: `corpus/${fx.name}`, html: fx.html, css: fx.css, runs: await bothScopes(fx.html, fx.css) });
  }

  const parity = JSON.parse(readFileSync(join(REPO, PARITY_REL), 'utf8'));
  cases.push({
    name: 'parity-page',
    input_ref: PARITY_REL,
    input_sha256: sha256(parity.html + '\u0000' + parity.css),
    runs: [
      ...(await bothScopes(parity.html, parity.css)),
      await run(parity.html, parity.css, undefined, parity.sourceUrl),
    ],
  });

  for (const [name, html, css] of EDGE) {
    cases.push({ name: `edge/${name}`, html, css, runs: await bothScopes(html, css) });
  }

  const [, autoHtml, autoCss] = EDGE.find(([n]) => n === 'v14-v18-absent');
  for (const [name, subject] of AUTO_SUBJECTS) {
    cases.push({ name: `auto/${name}`, html: autoHtml, css: autoCss, runs: [await run(autoHtml, autoCss, undefined, subject)] });
  }

  const checkIds = cases[0].runs[0].checks.map((c) => c.id);
  for (const c of cases) {
    for (const r of c.runs) {
      const ids = r.checks.map((x) => x.id).join(',');
      if (ids !== checkIds.join(',')) throw new Error(`${c.name}: check list differs from the first case`);
    }
  }

  // Digest over verdicts only, as export-corpus.mjs does: two runs of the same
  // engine on the same inputs must produce the same digest.
  const digest = sha256(
    cases
      .flatMap((c) => c.runs.map((r) => `${c.name}|${r.scope}|${r.subject}|${r.effective_scope}|` + r.checks.map((x) => `${x.id}:${x.status}`).join(',')))
      .join('\n'),
  );

  // Most runs repeat the same check results (a constant MANUAL, a common
  // WARN), so each distinct result is stored once under a key that carries its
  // id and status, and a run lists keys. A run then reads as its verdict row,
  // and the file stays small enough to review.
  const distinct = new Map();
  for (const c of cases) for (const r of c.runs) for (const x of r.checks) distinct.set(JSON.stringify(x), x);
  const ordered = [...distinct.values()].sort(
    (a, b) => checkIds.indexOf(a.id) - checkIds.indexOf(b.id) || a.status.localeCompare(b.status) || a.detail.localeCompare(b.detail) || a.item.localeCompare(b.item),
  );
  const records = {};
  const keyOf = new Map();
  const seen = {};
  for (const x of ordered) {
    const base = `${x.id}:${x.status}`;
    seen[base] = (seen[base] || 0) + 1;
    const key = `${base}:${seen[base]}`;
    records[key] = { item: x.item, category: x.category, detail: x.detail };
    keyOf.set(JSON.stringify(x), key);
  }
  const caseDetail = cases.map((c) => ({
    ...c,
    runs: c.runs.map((r) => ({ ...r, checks: r.checks.map((x) => keyOf.get(JSON.stringify(x))) })),
  }));

  return {
    $comment:
      'GENERATED by packages/score/scripts/export-offline-golden.mjs from the built TypeScript engine. ' +
      'Do not edit by hand: regenerate it. test/test_offline_engine_parity.py compares the Python offline ' +
      'engine against every run here, check by check. A run lists one record key per check, ' +
      '"<id>:<status>:<n>"; records holds each distinct result once.',
    engine_version: liveEngineVersion(),
    contract_version: CONTRACT_VERSION,
    check_ids: checkIds,
    cases: cases.length,
    runs: cases.reduce((n, c) => n + c.runs.length, 0),
    digest,
    records,
    case_detail: caseDetail,
  };
}

/**
 * One record per line and one run per line, so a moved verdict is a one-line
 * diff in review rather than a reflowed block.
 */
function serialize(doc) {
  const { records, case_detail, ...head } = doc;
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const recordJson = Object.entries(records).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  const caseJson = case_detail.map((c) => {
    const { runs, ...meta } = c;
    const runJson = runs.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
    return `  ${JSON.stringify(meta).replace(/}$/, '')},"runs": [\n${runJson}\n  ]}`;
  });
  return `${headJson},\n  "records": {\n${recordJson}\n  },\n  "case_detail": [\n${caseJson.join(',\n')}\n  ]\n}\n`;
}

const checkMode = process.argv.includes('--check');
const doc = await build();
const serialized = serialize(doc);
JSON.parse(serialized); // the hand-rolled layout must still be valid JSON

if (checkMode) {
  if (!existsSync(OUT)) {
    console.error('offline-engine-golden.json is missing. Run: node scripts/export-offline-golden.mjs');
    process.exit(1);
  }
  // Compared with line endings normalized: a CRLF checkout holds the same document.
  const current = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
  if (current !== serialized) {
    console.error(
      'offline-engine-golden.json is STALE: the TypeScript engine, its version, the corpus or the parity page changed\n' +
        'and the golden the Python offline engine is tested against did not.\n' +
        'Run: node scripts/export-offline-golden.mjs, then port the change into\n' +
        'packages/designesy-mcp/designesy_mcp_server.py until test/test_offline_engine_parity.py passes.',
    );
    process.exit(1);
  }
  console.log(`offline-engine-golden.json is current (${doc.cases} cases, ${doc.runs} runs, digest ${doc.digest.slice(0, 16)}…)`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialized, 'utf8');
console.log(`wrote ${OUT}: ${doc.cases} cases, ${doc.runs} runs, ${doc.check_ids.length} checks each, digest ${doc.digest.slice(0, 16)}…`);
