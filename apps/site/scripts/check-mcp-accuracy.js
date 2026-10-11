#!/usr/bin/env node
/**
 * mcp-accuracy gate — each MCP tool returns what its description promises, and
 * two tools never disagree about the same page.
 *
 * WHY THIS EXISTS
 * The hosted MCP server (1.13.6) was re-tested tool by tool on 2026-10-10 and
 * returned six things its own text or its sibling tools contradicted:
 *   1. designesy_a11y_score promised checks[{id, name, status}] and returned
 *      {id, status}: the route read `name` from contract checks that carry the
 *      name under `item`.
 *   2. On www.designesy.org designesy_guardrails documented "158 fabricated
 *      tokens" while designesy_drift_score's d02 said "No fabricated tokens".
 *      guardrails counted every var() name missing from a :root block; d02
 *      counts a property referenced with no fallback and declared nowhere.
 *   3. designesy_tokens_score scored a SKIP as a zero (9 PASS + 1 SKIP = 90)
 *      while designesy_motion_score states "SKIP is not scored".
 *   4. designesy_guardrails emitted a DTCG file with a $schema the site's own
 *      /export/dtcg does not use, aliases written {--css-var}, and bare hex
 *      colors, which the server's own tokens validator marks down.
 *   5. designesy_monitor_score m09 reported "Contract version 0.1.7", the
 *      catalog's version read from agent.json, not the design contract version
 *      designesy_score reports.
 *   6. designesy_compare printed a score delta of 15.400000000000006.
 * Each was visible only in a live call, so nothing before a deploy could see it.
 *
 * WHAT IT DOES
 * scripts/lib/route-harness.js loads the real route modules under Node with the
 * network stubbed, and this gate drives them with the made-up site in
 * scripts/fixtures/mcp-accuracy.json:
 *   a11y-names          every check carries the a11y contract's own name for its id
 *   fabricated-agreement guardrails and drift d02 name the same fabricated
 *                        tokens, and they are the fixture's three true positives
 *   tokens-skip          a SKIP is left out of the tokens score, and the result
 *                        and the contract both say so
 *   guardrails-dtcg      the emitted token file uses the export's $schema, DTCG
 *                        {group.token} aliases that resolve, structured colors,
 *                        only DTCG types, loses no declaration, and passes the
 *                        server's own tokens validator with zero FAIL
 *   monitor-m09          m09 reports the contract version designesy_score reads
 *   compare-rounding     every number in a compare result has at most two decimals
 *
 * --app <dir> runs the same checks against another checkout's apps/site, which
 * is how the failing verdicts on main were recorded. --measure <url> fetches a
 * live page once and prints what guardrails and drift report about it (the
 * before/after numbers for designesy.org); it is a measurement, not a gate.
 *
 * Usage:  node scripts/check-mcp-accuracy.js [--json] [--app <dir>] [--measure <url>]
 * Exits 1 on any finding, so it can gate CI.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./lib/route-harness');

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APP = path.resolve(arg('--app') || path.join(__dirname, '..'));
const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mcp-accuracy.json'), 'utf8'));

// The 13 types DTCG 2025.10 defines (Format Module §8 and §9).
const DTCG_TYPES = new Set([
  'color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number',
  'strokeStyle', 'border', 'transition', 'shadow', 'gradient', 'typography',
]);
// Root properties the 2025.10 format schema permits on a document.
const DTCG_ROOT_PROPS = new Set(['$schema', '$type', '$description', '$extensions', '$extends', '$deprecated', '$root']);

/** The machine exports a deployment serves, read from this checkout's modules. */
function servedContracts(h) {
  return {
    'https://www.designesy.org/contracts/a11y.json': h.load('app/lib/a11y-contract.ts').a11yContract,
    'https://www.designesy.org/contracts/tokens.json': h.load('app/lib/tokens-contract.ts').tokensContract,
  };
}

/** A harness serving the fixture site (and, optionally, the compare page and score API). */
function siteHarness(extra = {}) {
  const s = FIXTURES.site;
  const origin = new URL(s.url).origin;
  const pages = {
    [s.url]: s.html,
    ...s.stylesheets,
    [`${origin}/.well-known/agent.json`]: s.agentJson,
    [FIXTURES.compare.urlB]: FIXTURES.compare.htmlB,
    ...(extra.pages || {}),
  };
  const api = (url, init) => {
    if (url === 'https://www.designesy.org/api/score' && init && init.body) {
      return FIXTURES.compare.scores[JSON.parse(init.body).url];
    }
    return undefined;
  };
  const h = createHarness({ app: APP, pages, api });
  Object.assign(pages, servedContracts(h));
  return h;
}

/** Every token in a DTCG document: { path, token }, $root tokens included. */
function dtcgTokens(doc) {
  const out = [];
  const walk = (node, at) => {
    for (const [k, v] of Object.entries(node)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (k.startsWith('$') && k !== '$root') continue;
      const p = [...at, k];
      if (Object.prototype.hasOwnProperty.call(v, '$value')) out.push({ path: p.join('.'), token: v });
      else walk(v, p);
    }
  };
  walk(doc, []);
  return out;
}

/** The leading count in a d02 detail ("3 undeclared ...") or 0 for a PASS. */
function d02Names(check) {
  if (check.status === 'PASS') return [];
  const m = check.detail.match(/no fallback: ([^(;]*?)(?:\.\.\.)?(?: \(|;)/);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
}

// ── The checks ────────────────────────────────────────────────────────────────

async function a11yNames() {
  const findings = [];
  const h = siteHarness();
  const contract = h.load('app/lib/a11y-contract.ts').a11yContract;
  const items = new Map(contract.verification.checks.map((c) => [c.id, c.item]));
  const { payload, config } = await h.callTool('designesy_a11y_score', { url: FIXTURES.site.url });
  const checks = (payload && payload.checks) || [];
  if (checks.length !== items.size) {
    findings.push({ id: 'a11y-names:count', why: `designesy_a11y_score returned ${checks.length} checks; the a11y contract has ${items.size}.` });
  }
  for (const c of checks) {
    const keys = Object.keys(c).sort().join(',');
    if (keys !== 'id,name,status') {
      findings.push({ id: `a11y-names:shape:${c.id}`, why: `${c.id} has the keys {${keys}}; the description promises {id, name, status}.` });
    }
    if (c.name !== items.get(c.id)) {
      findings.push({ id: `a11y-names:name:${c.id}`, why: `${c.id} is named ${JSON.stringify(c.name)}; the a11y contract names it ${JSON.stringify(items.get(c.id))}.` });
    }
  }
  if (!/checks\[\{id \(a01-a11\), name, status/.test(config.description)) {
    findings.push({ id: 'a11y-names:description', why: 'The tool description no longer states the checks[{id, name, status}] shape this gate holds it to.' });
  }
  return { findings, measured: `${checks.length} checks` };
}

async function fabricatedAgreement() {
  const findings = [];
  const h = siteHarness();
  const url = FIXTURES.site.url;
  const g = await h.post('app/api/guardrails/route.ts', { url });
  const d = await h.post('app/api/drift/route.ts', { url });
  const fab = g.body.bundle && g.body.bundle.antiPatterns && g.body.bundle.antiPatterns.fabricatedTokens;
  const d02 = (d.body.checks || []).find((c) => c.id === 'd02');
  const fromDrift = d02 ? d02Names(d02) : null;
  const expected = FIXTURES.site.expectFabricated;
  const fromGuardrails = fab ? fab.examples : null;
  if (!fab || !d02 || fromDrift === null) {
    findings.push({ id: 'fabricated:unreadable', why: `Could not read guardrails fabricatedTokens (${JSON.stringify(fab)}) or drift d02 (${JSON.stringify(d02)}).` });
    return { findings };
  }
  if (fab.count !== fromDrift.length || JSON.stringify(fromGuardrails) !== JSON.stringify(fromDrift)) {
    findings.push({
      id: 'fabricated:disagree',
      why: `On the same page guardrails documents ${fab.count} fabricated token(s) ${JSON.stringify(fromGuardrails)} and drift d02 names ${fromDrift.length} ${JSON.stringify(fromDrift)} (${d02.status}).`,
    });
  }
  if (JSON.stringify(fromDrift) !== JSON.stringify(expected)) {
    findings.push({ id: 'fabricated:drift-definition', why: `drift d02 names ${JSON.stringify(fromDrift)}; the fixture's true positives are ${JSON.stringify(expected)}.` });
  }
  const g05 = (g.body.checks || []).find((c) => c.id === 'g05');
  if (!g05 || !g05.detail.includes(`${fab.count} fabricated tokens`)) {
    findings.push({ id: 'fabricated:g05', why: `g05 does not report the same count: ${g05 && g05.detail}` });
  }
  return { findings, measured: `guardrails ${fab.count}, d02 ${fromDrift.length} (${d02.status})` };
}

async function tokensSkip() {
  const findings = [];
  const h = siteHarness();
  const { payload, config } = await h.callTool('designesy_tokens_score', { dtcg_file: JSON.stringify(FIXTURES.tokensSkip.file) });
  const statuses = (payload.checks || []).map((c) => `${c.id}:${c.status}`).join(' ');
  if (payload.score !== FIXTURES.tokensSkip.expectScore) {
    findings.push({ id: 'tokens-skip:score', why: `9 PASS and 1 SKIP scored ${payload.score} (${statuses}); a SKIP is not scored, so the score is ${FIXTURES.tokensSkip.expectScore}.` });
  }
  if (payload.skip_count !== 1) {
    findings.push({ id: 'tokens-skip:skip_count', why: `The result reports skip_count ${JSON.stringify(payload.skip_count)}; it has one SKIP.` });
  }
  if (typeof payload.scoring !== 'string' || !/SKIP is not scored/.test(payload.scoring)) {
    findings.push({ id: 'tokens-skip:scoring', why: `The result states no scoring rule that leaves SKIP out (scoring: ${JSON.stringify(payload.scoring)}).` });
  }
  if (!/SKIP is not scored/.test(config.description)) {
    findings.push({ id: 'tokens-skip:description', why: 'The tool description does not state that SKIP is not scored.' });
  }
  const contract = h.load('app/lib/tokens-contract.ts').tokensContract;
  if (!/SKIP is not scored/.test(contract.verification.scoring)) {
    findings.push({ id: 'tokens-skip:contract', why: `The tokens contract states a different rule: ${contract.verification.scoring}` });
  }
  // The contract states what the site's own export scores; measure it.
  const exported = await (await h.load('app/export/dtcg/route.ts').GET()).json();
  const ex = (await h.callTool('designesy_tokens_score', { dtcg_file: JSON.stringify(exported) })).payload;
  const claim = String((contract.relationship_to_core || {}).live_export || '');
  if (!claim.includes(`scores ${ex.score} `)) {
    findings.push({ id: 'tokens-skip:export-claim', why: `/export/dtcg scores ${ex.score} (${ex.pass_count} PASS, ${ex.warn_count} WARN, ${ex.fail_count} FAIL, ${ex.skip_count} SKIP), but the tokens contract says: ${claim}` });
  }
  return { findings, measured: `score ${payload.score} (${statuses}); /export/dtcg ${ex.score}` };
}

async function guardrailsDtcg() {
  const findings = [];
  const h = siteHarness();
  const g = await h.post('app/api/guardrails/route.ts', { url: FIXTURES.site.url });
  const doc = g.body.bundle.tokens;
  const exported = await (await h.load('app/export/dtcg/route.ts').GET()).json();
  const push = (id, why) => findings.push({ id: `guardrails-dtcg:${id}`, why });

  if (doc.$schema !== exported.$schema) push('schema', `$schema is ${JSON.stringify(doc.$schema)}; the site's /export/dtcg uses ${JSON.stringify(exported.$schema)}.`);
  const extraRoot = Object.keys(doc).filter((k) => k.startsWith('$') && !DTCG_ROOT_PROPS.has(k));
  if (extraRoot.length) push('root-props', `The document root carries ${extraRoot.join(', ')}, which the 2025.10 format does not define.`);

  const tokens = dtcgTokens(doc);
  const byPath = new Map(tokens.map((t) => [t.path, t.token]));
  const cssAliases = JSON.stringify(doc).match(/"\{--[^"]*\}"/g) || [];
  if (cssAliases.length) push('css-aliases', `${cssAliases.length} alias(es) are written as CSS variables, e.g. ${cssAliases.slice(0, 3).join(', ')}; DTCG aliases are {group.token} paths.`);
  const bareHex = tokens.filter((t) => typeof t.token.$value === 'string' && /^#[0-9a-f]{3,8}$/i.test(t.token.$value));
  if (bareHex.length) push('bare-hex', `${bareHex.length} token(s) have a bare hex $value, e.g. ${bareHex.slice(0, 3).map((t) => `${t.path}=${t.token.$value}`).join(', ')}.`);
  const badTypes = tokens.filter((t) => !DTCG_TYPES.has(t.token.$type));
  if (badTypes.length) push('types', `${badTypes.length} token(s) have a $type DTCG 2025.10 does not define, e.g. ${badTypes.slice(0, 3).map((t) => `${t.path}:${t.token.$type}`).join(', ')}.`);
  const colorStrings = tokens.filter((t) => t.token.$type === 'color' && typeof t.token.$value === 'string' && !/^\{[^{}]+\}$/.test(t.token.$value));
  if (colorStrings.length) push('color-strings', `${colorStrings.length} color token(s) hold a CSS string, not a {colorSpace, components} value, e.g. ${colorStrings.slice(0, 3).map((t) => `${t.path}=${t.token.$value}`).join(', ')}.`);
  for (const t of tokens) {
    const v = t.token.$value;
    if (typeof v !== 'string' || !/^\{[^{}]+\}$/.test(v)) continue;
    const target = byPath.get(v.slice(1, -1));
    if (!target) push(`alias-dangles:${t.path}`, `${t.path} aliases ${v}, which is not a token in the file.`);
    else if (target.$type !== t.token.$type) push(`alias-type:${t.path}`, `${t.path} is typed ${t.token.$type} but aliases ${v}, typed ${target.$type}.`);
  }
  const unconverted = ((doc.$extensions || {}).designesy || {}).css || {};
  const kept = tokens.length + Object.keys(unconverted).length;
  if (kept !== g.body.tokensExtracted) push('lost', `${g.body.tokensExtracted} :root properties were extracted, but the file keeps ${tokens.length} token(s) and ${Object.keys(unconverted).length} unconverted value(s).`);

  const v = await h.callTool('designesy_tokens_score', { dtcg_file: JSON.stringify(doc) });
  const failed = (v.payload.checks || []).filter((c) => c.status === 'FAIL');
  if (failed.length) push('validator', `The server's own tokens validator FAILs the emitted file on ${failed.map((c) => `${c.id} (${c.detail})`).join('; ')}.`);
  return { findings, measured: `${tokens.length} tokens, ${Object.keys(unconverted).length} unconverted, validator ${v.payload.score} (${v.payload.fail_count} FAIL)` };
}

async function monitorM09() {
  const findings = [];
  const h = siteHarness();
  const version = h.load('app/lib/design-system-contract.ts').CONTRACT_VERSION;
  const m = await h.post('app/api/monitor/route.ts', { url: FIXTURES.site.url });
  const m09 = (m.body.monitorChecks || []).find((c) => c.id === 'm09');
  if (!m09) {
    findings.push({ id: 'monitor-m09:missing', why: `The monitor result has no m09 (${JSON.stringify(m.body).slice(0, 200)}).` });
    return { findings };
  }
  if (!m09.detail.includes(version) || m09.detail.includes(FIXTURES.site.agentJson.version)) {
    findings.push({ id: 'monitor-m09:version', why: `m09 says "${m09.detail}"; designesy_score reports the design contract version ${version}, and the page's agent.json version is ${FIXTURES.site.agentJson.version}.` });
  }
  return { findings, measured: m09.detail };
}

async function compareRounding() {
  const findings = [];
  const h = siteHarness();
  const c = await h.post('app/api/compare/route.ts', { urlA: FIXTURES.site.url, urlB: FIXTURES.compare.urlB });
  const loose = [];
  const visit = (v, at) => {
    // Judged by the printed form, which is what a reader sees: 15.400000000000006
    // is within 1e-12 of 15.4 but prints fifteen decimals.
    if (typeof v === 'number' && /\.\d{3,}|e-/i.test(String(v))) loose.push(`${at}=${v}`);
    else if (typeof v === 'string' && /\d\.\d{3,}/.test(v)) loose.push(`${at}="${v}"`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, `${at}.${k}`);
  };
  visit(c.body, '$');
  if (loose.length) findings.push({ id: 'compare-rounding:loose', why: `Unrounded numbers in the compare result: ${loose.slice(0, 4).join('; ')}.` });
  const delta = c.body.scoreDelta && c.body.scoreDelta.delta;
  if (delta !== FIXTURES.compare.expectDelta) findings.push({ id: 'compare-rounding:delta', why: `scoreDelta.delta is ${delta}; 100 - 84.6 is ${FIXTURES.compare.expectDelta}.` });
  return { findings, measured: `delta ${delta}` };
}

// ── --measure: one live page through guardrails and drift ─────────────────────

async function measure(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  const html = await (await fetch(url, { headers })).text();
  const pages = { [url]: html };
  const linkRe = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = new URL(m[1], url).href;
    pages[href] = await (await fetch(href, { headers })).text();
  }
  const h = createHarness({ app: APP, pages });
  Object.assign(pages, servedContracts(h));
  const g = await h.post('app/api/guardrails/route.ts', { url });
  const d = await h.post('app/api/drift/route.ts', { url });
  const doc = g.body.bundle.tokens;
  const tokens = dtcgTokens(doc);
  const v = await h.callTool('designesy_tokens_score', { dtcg_file: JSON.stringify(doc) });
  const d02 = d.body.checks.find((c) => c.id === 'd02');
  return {
    url,
    app: APP,
    stylesheets: Object.keys(pages).length - 3,
    guardrails: {
      // The full result as the MCP tool returns it (JSON.stringify(value, null, 2)).
      chars: JSON.stringify(g.body, null, 2).length,
      tokensExtracted: g.body.tokensExtracted,
      g05: g.body.checks.find((c) => c.id === 'g05').detail,
      fabricatedTokens: g.body.bundle.antiPatterns.fabricatedTokens.count,
      dtcg: {
        $schema: doc.$schema,
        tokens: tokens.length,
        // A $value that is exactly one {--name}, and any $value holding {-- at all.
        cssVariableAliases: tokens.filter((t) => typeof t.token.$value === 'string' && /^\{--[\w-]+\}$/.test(t.token.$value)).length,
        valuesWithCssVariables: tokens.filter((t) => typeof t.token.$value === 'string' && t.token.$value.includes('{--')).length,
        bareHexValues: tokens.filter((t) => typeof t.token.$value === 'string' && /^#[0-9a-f]{3,8}$/i.test(t.token.$value)).length,
        nonDtcgTypes: tokens.filter((t) => !DTCG_TYPES.has(t.token.$type)).length,
        unconverted: Object.keys(((doc.$extensions || {}).designesy || {}).css || {}).length,
        validator: { score: v.payload.score, pass: v.payload.pass_count, warn: v.payload.warn_count, fail: v.payload.fail_count, checks: v.payload.checks.map((c) => `${c.id} ${c.status}: ${c.detail}`) },
      },
    },
    drift: { tokensExtracted: d.body.tokensExtracted, d02: `${d02.status}: ${d02.detail}` },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CHECKS = [
  ['a11y-names', a11yNames],
  ['fabricated-agreement', fabricatedAgreement],
  ['tokens-skip', tokensSkip],
  ['guardrails-dtcg', guardrailsDtcg],
  ['monitor-m09', monitorM09],
  ['compare-rounding', compareRounding],
];

async function main() {
  const asJson = argv.includes('--json');
  try {
    require.resolve('typescript', { paths: [APP, __dirname] });
  } catch (e) {
    if (process.env.VERCEL === '1') {
      console.log(`mcp-accuracy: [NOT EVALUATED] typescript is not installed in this Vercel build (${e.code || e.message})`);
      process.exit(0);
    }
    console.error(`mcp-accuracy: typescript could not be loaded from ${APP}; install apps/site's dev dependencies (npm ci).`);
    process.exit(1);
  }

  const target = arg('--measure');
  if (target) {
    console.log(JSON.stringify(await measure(target), null, 2));
    return;
  }

  const results = [];
  for (const [name, run] of CHECKS) {
    try {
      results.push({ name, ...(await run()) });
    } catch (e) {
      results.push({ name, findings: [{ id: `${name}:threw`, why: `The check threw: ${e && e.message ? e.message : e}` }] });
    }
  }
  const findings = results.flatMap((r) => r.findings);
  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, app: APP, results }, null, 2));
  } else {
    for (const r of results) {
      const verdict = r.findings.length === 0 ? 'OK  ' : 'FAIL';
      console.log(`mcp-accuracy: ${verdict} ${r.name}${r.measured ? ` (${r.measured})` : ''}`);
      for (const f of r.findings) console.log(`    [${f.id}] ${f.why}`);
    }
    console.log(findings.length === 0 ? `mcp-accuracy: OK, ${CHECKS.length} check(s) hold` : `mcp-accuracy: ${findings.length} finding(s)`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`mcp-accuracy: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
