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
 * 1.13.8 added three more, re-derived on 2026-10-10:
 *   7. designesy_tokens_score counted a WARN as 0 where designesy_motion_score,
 *      the score engine and the npm validator count it 0.5 (owner decision
 *      2026-10-10: warnings count half everywhere).
 *   8. The tokens validator read a DTCG alias such as {space.16} as a literal
 *      with no unit (a WARN in t08 and t10), skipped $root tokens, and did not
 *      read the 2025.10 dimension form { value, unit }.
 *   9. The site's own /export/dtcg held CSS, not DTCG: 7 $values were var()
 *      (interaction.focus_ring = var(--signal-light), the four font stacks),
 *      and the 5 radii were "6px" strings, not { value, unit } objects.
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
 *   tokens-warn-half     a WARN counts half, and the result, the tool
 *                        description and the contract all state it, as the
 *                        motion tool does
 *   tokens-alias         a dimension alias is checked by the value it resolves
 *                        to, an alias may name a $root token, $root tokens are
 *                        counted, and { value, unit } dimensions are read
 *   export-dtcg          every $value /export/dtcg serves is a DTCG value (no
 *                        var(), dimensions and shadow lengths as { value, unit },
 *                        font stacks as family names, aliases that resolve to a
 *                        token of their type), and the server's own tokens
 *                        validator gives it 0 WARN and 0 FAIL
 *   monitor-m09          m09 reports the contract version designesy_score reads
 *   compare-rounding     every number in a compare result has at most two decimals
 *   tool-definitions     every description and the server instructions fit in
 *                        2,048 characters (Claude Code truncates there), open
 *                        with what the tool does then "Use this when", name a
 *                        sibling to use instead, hold no agent directive, and
 *                        state the engine rate limits the routes enforce and
 *                        the document sizes the site renders; every parameter
 *                        carries an example and a tool without parameters takes
 *                        {"type":"object","additionalProperties":false}; the
 *                        ten scoring tools, and only they, declare an
 *                        outputSchema; and descriptions, input and output
 *                        schemas, instructions and the contract keys equal the
 *                        golden the PyPI server is held to
 *                        (packages/designesy-mcp/test/fixtures/tool-definitions.json)
 *   structured-output    each scoring tool, driven through the real engine
 *                        routes on the fixture site, returns structuredContent
 *                        that equals its text block and passes its outputSchema
 *                        (with the SDK's own validator), and each failure kind
 *                        (HTTP 400, 429, 502, 504, a network error, a refused
 *                        address, a 403, a 404, a reply that is not JSON)
 *                        returns isError, no structuredContent, and the right
 *                        retryable answer in both the field and the text
 *
 * TOOL DEFINITIONS (added for designesy-mcp 1.13.9)
 * The 2026-10-11 quality pass re-read every description against its handler.
 * Three said what the code does not do: designesy_tokens_score named a
 * $description check that none of t01-t10 runs, designesy_monitor_score listed
 * "schedule registered" although nothing is scheduled (m01 passes on every
 * call and the caller keeps the history), and the tokens and motion tools said
 * "provide exactly one" of url and the inline file while the code quietly
 * prefers the inline file. tool-definitions holds each fact to the code that
 * decides it; --write-definitions regenerates the golden from this checkout.
 * --app <dir> runs the same checks against another checkout's apps/site, which
 * is how the failing verdicts on main were recorded. --measure <url> fetches a
 * live page once and prints what guardrails and drift report about it (the
 * before/after numbers for designesy.org); it is a measurement, not a gate.
 *
 * Usage:  node scripts/check-mcp-accuracy.js [--json] [--app <dir>] [--measure <url>] [--write-definitions]
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

// The golden both MCP servers' tool definitions are held to. It sits with the
// PyPI package's fixtures, outside apps/site, so a Vercel build that uploads
// only apps/site reports the comparison NOT EVALUATED instead of failing.
const PYPI_FIXTURES = path.join(__dirname, '..', '..', '..', 'packages', 'designesy-mcp', 'test', 'fixtures');
const DEFINITIONS = path.join(PYPI_FIXTURES, 'tool-definitions.json');
// Claude Code truncates each tool description and each server's instructions
// at 2,048 characters (https://code.claude.com/docs/en/mcp).
const DESCRIPTION_LIMIT = 2048;
const SCORING_TOOLS = [
  'designesy_score', 'designesy_tokens_score', 'designesy_a11y_score', 'designesy_motion_score',
  'designesy_drift_score', 'designesy_readiness_score', 'designesy_guardrails',
  'designesy_monitor_score', 'designesy_compare', 'designesy_report',
];
// The engine route each page tool calls, for the stated rate limits.
const ENGINE_ROUTES = {
  designesy_score: 'app/api/score/route.ts',
  designesy_drift_score: 'app/api/drift/route.ts',
  designesy_readiness_score: 'app/api/readiness/route.ts',
  designesy_guardrails: 'app/api/guardrails/route.ts',
  designesy_monitor_score: 'app/api/monitor/route.ts',
  designesy_compare: 'app/api/compare/route.ts',
  designesy_report: 'app/api/report/route.ts',
};

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

async function tokensWarnHalf() {
  const findings = [];
  const h = siteHarness();
  const fx = FIXTURES.tokensWarnHalf;
  const { payload, config } = await h.callTool('designesy_tokens_score', { dtcg_file: JSON.stringify(fx.file) });
  const statuses = (payload.checks || []).map((c) => `${c.id}:${c.status}`).join(' ');
  if (payload.warn_count !== 1 || payload.score !== fx.expectScore) {
    findings.push({ id: 'tokens-warn-half:score', why: `${payload.pass_count} PASS, ${payload.warn_count} WARN and ${payload.skip_count} SKIP scored ${payload.score} (${statuses}); a WARN counts half, so the score is ${fx.expectScore}.` });
  }
  const RULE = 'PASS=1, WARN=0.5, FAIL=0';
  if (typeof payload.scoring !== 'string' || !payload.scoring.startsWith(`${RULE}; SKIP is not scored.`)) {
    findings.push({ id: 'tokens-warn-half:scoring', why: `The result states ${JSON.stringify(payload.scoring)}; the rule is ${RULE}, SKIP not scored.` });
  }
  if (!config.description.includes(`Score: ${RULE}, SKIP is not scored`)) {
    findings.push({ id: 'tokens-warn-half:description', why: 'The tool description does not state PASS=1, WARN=0.5, FAIL=0, SKIP is not scored.' });
  }
  const motion = h.tools.get('designesy_motion_score');
  if (!motion || !motion.config.description.includes(RULE)) {
    findings.push({ id: 'tokens-warn-half:motion', why: `designesy_motion_score no longer states ${RULE}, so the two tools' rules cannot be compared.` });
  }
  const contract = h.load('app/lib/tokens-contract.ts').tokensContract;
  if (!contract.verification.scoring.includes(`${RULE};`)) {
    findings.push({ id: 'tokens-warn-half:contract', why: `The tokens contract (v${contract.version}) states: ${contract.verification.scoring}` });
  }
  return { findings, measured: `score ${payload.score} (${statuses})` };
}

async function tokensAlias() {
  const findings = [];
  const h = siteHarness();
  const fx = FIXTURES.tokensAlias;
  const { payload } = await h.callTool('designesy_tokens_score', { dtcg_file: JSON.stringify(fx.file) });
  const check = (id) => (payload.checks || []).find((c) => c.id === id) || { status: 'missing', detail: '' };
  for (const id of ['t08', 't10']) {
    if (check(id).status !== 'PASS') {
      findings.push({ id: `tokens-alias:${id}`, why: `${id} is ${check(id).status} on a file whose every dimension alias resolves to a valid dimension: ${check(id).detail}` });
    }
  }
  if (payload.total_tokens !== fx.expectTotalTokens) {
    findings.push({ id: 'tokens-alias:root', why: `The validator counts ${payload.total_tokens} token(s); the file has ${fx.expectTotalTokens}, two of them $root tokens.` });
  }
  if (!check('t08').detail.startsWith(`All ${fx.expectDimensions} dimension token(s)`)) {
    findings.push({ id: 'tokens-alias:dimensions', why: `t08 reads ${JSON.stringify(check('t08').detail)}; the file has ${fx.expectDimensions} dimension tokens ({ value, unit } and $root included).` });
  }
  if (payload.warn_count !== 0 || payload.fail_count !== 0) {
    findings.push({ id: 'tokens-alias:verdict', why: `${payload.warn_count} WARN and ${payload.fail_count} FAIL on a conformant file.` });
  }
  return { findings, measured: `${payload.total_tokens} tokens, t08 ${check('t08').status}, t10 ${check('t10').status}` };
}

async function exportDtcg() {
  const findings = [];
  const h = siteHarness();
  const doc = await (await h.load('app/export/dtcg/route.ts').GET()).json();
  const push = (id, why) => findings.push({ id: `export-dtcg:${id}`, why });
  const tokens = dtcgTokens(doc);
  const byPath = new Map(tokens.map((t) => [t.path, t.token]));
  const isAlias = (v) => typeof v === 'string' && /^\{[^{}]+\}$/.test(v);
  const isDimension = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === 'unit,value'
    && typeof v.value === 'number' && (v.unit === 'px' || v.unit === 'rem');
  const isColor = (v) => !!v && typeof v === 'object' && typeof v.colorSpace === 'string' && Array.isArray(v.components);

  const withVar = tokens.filter((t) => JSON.stringify(t.token.$value).includes('var('));
  if (withVar.length) push('var', `${withVar.length} $value(s) hold a CSS var(), e.g. ${withVar.slice(0, 3).map((t) => `${t.path}=${JSON.stringify(t.token.$value)}`).join(', ')}.`);
  const dims = tokens.filter((t) => t.token.$type === 'dimension');
  const badDims = dims.filter((t) => !isDimension(t.token.$value));
  if (badDims.length) push('dimension', `${badDims.length}/${dims.length} dimension token(s) are not { value, unit: px | rem }, e.g. ${badDims.slice(0, 3).map((t) => `${t.path}=${JSON.stringify(t.token.$value)}`).join(', ')}.`);
  for (const t of tokens.filter((x) => x.token.$type === 'shadow')) {
    for (const layer of [].concat(t.token.$value)) {
      const bad = ['offsetX', 'offsetY', 'blur', 'spread'].filter((f) => !isDimension(layer && layer[f]));
      if (bad.length) push(`shadow-length:${t.path}`, `${t.path} has ${bad.map((f) => `${f}=${JSON.stringify(layer && layer[f])}`).join(', ')}, not { value, unit }.`);
      if (!isColor(layer && layer.color)) push(`shadow-color:${t.path}`, `${t.path} has color ${JSON.stringify(layer && layer.color)}, not a structured color.`);
    }
  }
  for (const t of tokens.filter((x) => x.token.$type === 'fontFamily')) {
    const v = t.token.$value;
    const names = (typeof v === 'string' && !isAlias(v)) || (Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'string' && !/[(),]/.test(n)));
    if (!names && !isAlias(v)) push(`font-family:${t.path}`, `${t.path} is ${JSON.stringify(v)}, not a family name, an array of them, or an alias.`);
  }
  for (const t of tokens.filter((x) => x.token.$type === 'color' && !isAlias(x.token.$value))) {
    if (!isColor(t.token.$value)) push(`color:${t.path}`, `${t.path} is ${JSON.stringify(t.token.$value)}, not a structured color.`);
  }
  for (const t of tokens.filter((x) => isAlias(x.token.$value))) {
    const target = byPath.get(t.token.$value.slice(1, -1));
    if (!target) push(`alias-dangles:${t.path}`, `${t.path} aliases ${t.token.$value}, which is not a token in the file.`);
    else if (target.$type !== t.token.$type) push(`alias-type:${t.path}`, `${t.path} is typed ${t.token.$type} but aliases ${t.token.$value}, typed ${target.$type}.`);
  }
  const v = (await h.callTool('designesy_tokens_score', { dtcg_file: JSON.stringify(doc) })).payload;
  const flagged = (v.checks || []).filter((c) => c.status === 'WARN' || c.status === 'FAIL');
  if (flagged.length) push('validator', `The server's own tokens validator flags the export: ${flagged.map((c) => `${c.id} ${c.status} (${c.detail})`).join('; ')}.`);
  const aliases = tokens.filter((t) => isAlias(t.token.$value)).length;
  return { findings, measured: `${tokens.length} tokens, ${withVar.length} var(), ${badDims.length} non-object dimension(s), ${aliases} alias(es), validator ${v.score} (${v.warn_count} WARN, ${v.fail_count} FAIL)` };
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

// ── Tool definitions ──────────────────────────────────────────────────────────

/** JSON with keys sorted, so two objects compare by content, not key order. */
function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * The JSON Schema the SDK advertises for a registered schema: it reads the
 * schema's StandardJSONSchemaV1 export with the draft-2020-12 target, and for
 * an input schema adds type "object" when the root has none. $schema is left
 * out of the comparison (zod writes it, a hand-written schema does not).
 */
function advertised(schema, io) {
  const json = schema['~standard'].jsonSchema[io]({ target: 'draft-2020-12' });
  const { $schema: _dialect, ...rest } = json;
  return io === 'input' && rest.type === undefined ? { type: 'object', ...rest } : rest;
}

/** Everything a client reads about the tools, as this checkout's route registers it. */
function renderedDefinitions(h) {
  const options = h.mcpOptions();
  const defs = h.load('app/lib/mcp-tool-definitions.ts');
  const out = {
    about: 'Tool-definition facts both MCP servers state alike. Generated from apps/site by node scripts/check-mcp-accuracy.js --write-definitions; checked there, by scripts/check-mcp-tool-parity.js, and by the PyPI suite (test/test_tool_definitions.py).',
    instructions: options.instructions,
    no_parameter_input_schema: defs.NO_PARAMETER_INPUT_SCHEMA,
    contract_keys: Object.keys(h.load('app/lib/design-system-contract.ts').designSystemContract),
    descriptions: {},
    input_schemas: {},
    output_schemas: {},
  };
  for (const [name, { config }] of h.tools) {
    out.descriptions[name] = config.description;
    out.input_schemas[name] = config.inputSchema ? advertised(config.inputSchema, 'input') : null;
    if (config.outputSchema) out.output_schemas[name] = advertised(config.outputSchema, 'output');
  }
  return out;
}

/** The size, in characters, of what each document tool returns, rendered from this checkout. */
async function documentSizes(h) {
  const ref = h.load('app/lib/mcp-reference.ts');
  const text = async (file) => (await h.load(file).GET()).text();
  const size = (v) => JSON.stringify(v, null, 2).length;
  const base = 'https://www.designesy.org';
  return {
    designesy_llms_txt: size(ref.publishedText(`${base}/llms.txt`, 'text/plain', await text('app/llms.txt/route.ts'))),
    designesy_llms_full_txt: size(ref.publishedText(`${base}/llms-full.txt`, 'text/plain', await text('app/llms-full.txt/route.ts'))),
    designesy_skill_md: size(ref.publishedText(`${base}/contracts/skill`, 'text/markdown', await text('app/contracts/skill/route.ts'))),
    designesy_agent_json: size(ref.publishedJson(`${base}/.well-known/agent.json`, JSON.parse(await text('app/.well-known/agent.json/route.ts')))),
  };
}

const commaNumber = (s) => Number(s.replace(/,/g, ''));

async function toolDefinitions() {
  const findings = [];
  const push = (id, why) => findings.push({ id: `tool-definitions:${id}`, why });
  const h = siteHarness();
  const r = renderedDefinitions(h);
  const { isAgentDirective } = h.load('app/lib/mcp-reference.ts');
  const names = Object.keys(r.descriptions);

  // Length: Claude Code shows 2,048 characters of each.
  if (typeof r.instructions !== 'string' || r.instructions.length === 0) push('instructions-missing', 'The route passes no instructions to createMcpHandler.');
  else if (r.instructions.length > DESCRIPTION_LIMIT) push('instructions-length', `The server instructions run to ${r.instructions.length} characters; Claude Code truncates at ${DESCRIPTION_LIMIT}.`);
  const lengths = [];
  for (const name of names) {
    const d = r.descriptions[name];
    lengths.push(d.length);
    if (d.length > DESCRIPTION_LIMIT) push(`length:${name}`, `${name}'s description runs to ${d.length} characters; Claude Code truncates at ${DESCRIPTION_LIMIT}.`);
    // Structure: what it does, then "Use this when", then a sibling to use instead.
    const firstStop = d.indexOf('. ');
    if (firstStop < 0 || !d.startsWith('Use this when ', firstStop + 2)) push(`structure:${name}`, `${name}'s second sentence does not start "Use this when".`);
    if (!/When not to use: [^.]*designesy_\w+/.test(d)) push(`siblings:${name}`, `${name}'s description names no sibling tool under "When not to use".`);
    // Neutral reference text (Software Directory Policy 2F).
    if (isAgentDirective(d)) push(`directive:${name}`, `${name}'s description matches AGENT_DIRECTIVE_PATTERN_SOURCES.`);
    if (/\byou must\b|\balways call\b|\bignore\b/i.test(d)) push(`imperative:${name}`, `${name}'s description addresses the assistant with an order.`);
    if (/RESEND_API_KEY/.test(d)) push(`env-name:${name}`, `${name}'s description names an environment variable; say "a configured Resend key".`);
  }
  if (isAgentDirective(r.instructions || '')) push('directive:instructions', 'The server instructions match AGENT_DIRECTIVE_PATTERN_SOURCES.');

  // Parameters: an example on each; the recommended schema for none.
  for (const name of names) {
    const schema = r.input_schemas[name];
    const props = (schema && schema.properties) || {};
    if (Object.keys(props).length === 0) {
      if (canonicalJson(schema) !== canonicalJson({ type: 'object', additionalProperties: false })) {
        push(`no-parameters:${name}`, `${name} takes no parameters but advertises ${JSON.stringify(schema)}, not {"type":"object","additionalProperties":false}.`);
      }
      continue;
    }
    for (const [p, ps] of Object.entries(props)) {
      if (typeof ps.description !== 'string' || !/for example/.test(ps.description)) push(`parameter-example:${name}.${p}`, `${name}.${p} has no description with "for example".`);
    }
  }
  const contract = r.input_schemas.designesy_contract.properties;
  if (canonicalJson(contract.sections.items.enum) !== canonicalJson(r.contract_keys) || canonicalJson(contract.section.enum) !== canonicalJson(r.contract_keys)) {
    push('contract-enum', 'designesy_contract\'s section and sections enums are not the contract\'s top-level keys.');
  }

  // Output schemas: the ten scoring tools, and only they.
  const withOutput = Object.keys(r.output_schemas).sort();
  if (canonicalJson(withOutput) !== canonicalJson([...SCORING_TOOLS].sort())) push('output-schema-set', `These tools declare an outputSchema: ${withOutput.join(', ')}; expected ${SCORING_TOOLS.join(', ')}.`);
  for (const name of withOutput) {
    const o = r.output_schemas[name];
    if (o.type !== 'object' || o.additionalProperties !== true) push(`output-schema-open:${name}`, `${name}'s outputSchema is not an object schema that allows additional properties.`);
    if (!/output schema/.test(r.descriptions[name])) push(`output-schema-named:${name}`, `${name}'s description does not point at its output schema.`);
  }

  // Rate limits: the number a description states is the one its route enforces.
  const mw = fs.readFileSync(path.join(APP, 'middleware.ts'), 'utf8');
  for (const [name, file] of Object.entries(ENGINE_ROUTES)) {
    const src = fs.readFileSync(path.join(APP, file), 'utf8');
    const limit = Number((/const RATE_LIMIT = (\d+)/.exec(src) || [])[1]);
    const stated = /engine allows (\d+) \w+ an hour per address/.exec(r.descriptions[name]);
    if (!limit) push(`rate-limit-unread:${name}`, `${file} has no readable RATE_LIMIT.`);
    else if (!stated || Number(stated[1]) !== limit) push(`rate-limit:${name}`, `${name}'s description states ${stated ? stated[1] : 'no'} an hour; ${file} enforces ${limit} an hour.`);
    const edge = new RegExp(`pattern: '${path.posix.dirname(file.replace(/^app/, '')).replace(/\//g, '\\/')}', [^\\n]*fixedWindow\\((\\d+), '([^']+)'\\)`).exec(mw);
    if (edge && edge[2] === '1 h' && Number(edge[1]) !== limit) push(`rate-limit-edge:${name}`, `middleware.ts allows ${edge[1]} an hour for ${file}; the route enforces ${limit}.`);
  }

  // Document sizes: each "about N characters" is within 20% of what the tool returns.
  const sizes = await documentSizes(h);
  for (const [name, measured] of Object.entries(sizes)) {
    const own = /about ([\d,]+) characters/.exec(r.descriptions[name]);
    if (!own) push(`size-missing:${name}`, `${name}'s description states no size.`);
    else if (Math.abs(commaNumber(own[1]) - measured) > measured * 0.2) push(`size:${name}`, `${name} says about ${own[1]} characters; it returns ${measured}.`);
  }
  for (const name of names) {
    for (const m of r.descriptions[name].matchAll(/(designesy_\w+) \(about ([\d,]+) characters\)/g)) {
      const measured = sizes[m[1]];
      if (measured === undefined || Math.abs(commaNumber(m[2]) - measured) > measured * 0.2) push(`size-cited:${name}`, `${name} says ${m[1]} is about ${m[2]} characters; it returns ${measured}.`);
    }
  }

  // The golden the PyPI server is held to.
  let golden = null;
  if (fs.existsSync(DEFINITIONS)) golden = JSON.parse(fs.readFileSync(DEFINITIONS, 'utf8'));
  else if (process.env.VERCEL !== '1') push('golden-missing', `${DEFINITIONS} is missing; run this gate with --write-definitions from a full checkout.`);
  if (golden) {
    for (const key of ['instructions', 'no_parameter_input_schema', 'contract_keys']) {
      if (canonicalJson(golden[key]) !== canonicalJson(r[key])) push(`golden:${key}`, `${key} differs from tool-definitions.json; change both servers, then run --write-definitions.`);
    }
    for (const key of ['descriptions', 'input_schemas', 'output_schemas']) {
      const want = golden[key] || {};
      for (const name of new Set([...Object.keys(want), ...Object.keys(r[key])])) {
        if (canonicalJson(want[name]) !== canonicalJson(r[key][name])) push(`golden:${key}:${name}`, `${name}'s ${key.replace(/s$/, '').replace('_', ' ')} differs from tool-definitions.json; change both servers, then run --write-definitions.`);
      }
    }
  }
  return {
    findings,
    measured: `${names.length} descriptions, longest ${Math.max(...lengths)} chars; instructions ${r.instructions ? r.instructions.length : 0} chars; ${withOutput.length} output schemas; documents ${Object.entries(sizes).map(([n, v]) => `${n.replace('designesy_', '')} ${v}`).join(', ')}${golden ? '' : '; golden NOT EVALUATED'}`,
  };
}

// ── Structured output ─────────────────────────────────────────────────────────

async function structuredOutput() {
  const findings = [];
  const push = (id, why) => findings.push({ id: `structured-output:${id}`, why });
  const s = FIXTURES.site;
  const origin = new URL(s.url).origin;
  const conformantLottie = JSON.parse(fs.readFileSync(path.join(PYPI_FIXTURES, 'motion', 'conformant.json'), 'utf8'));
  const files = {
    [`${origin}/tokens.json`]: FIXTURES.tokensAlias.file,
    [`${origin}/hero.json`]: conformantLottie,
  };
  const engines = {
    '/api/score': 'app/api/score/route.ts',
    '/api/drift': 'app/api/drift/route.ts',
    '/api/readiness': 'app/api/readiness/route.ts',
    '/api/guardrails': 'app/api/guardrails/route.ts',
    '/api/monitor': 'app/api/monitor/route.ts',
    '/api/compare': 'app/api/compare/route.ts',
    '/api/report': 'app/api/report/route.ts',
  };
  let override = null;
  const pages = {
    [s.url]: s.html,
    ...s.stylesheets,
    [`${origin}/.well-known/agent.json`]: s.agentJson,
    [FIXTURES.compare.urlB]: FIXTURES.compare.htmlB,
    ...files,
  };
  // The engines are the real route modules, so a tool call runs the same code
  // the deployment does, on the fixture site, with no network.
  const h = createHarness({
    app: APP,
    pages,
    api: async (url, init) => {
      if (override) {
        const answer = await override(url, init);
        if (answer !== undefined) return answer;
      }
      const u = new URL(url);
      if (u.origin === 'https://www.designesy.org' && engines[u.pathname]) {
        return h.load(engines[u.pathname]).POST(new Request(url, { method: 'POST', headers: (init && init.headers) || {}, body: init && init.body }));
      }
      // The URL guard's own refusal, for an address it blocks.
      if (u.hostname === '127.0.0.1') throw new Error(`SSRF guard: blocked URL ${url}`);
      if (u.pathname === '/locked.json') return new Response('denied', { status: 403, statusText: 'Forbidden' });
      return undefined;
    },
  });
  Object.assign(pages, servedContracts(h));

  const ok = [
    ['designesy_score', { url: s.url }],
    ['designesy_score', { url: s.url, scope: 'contract' }],
    ['designesy_score', { url: s.url, format: 'canonical' }],
    ['designesy_score', { url: s.url, format: 'google' }],
    ['designesy_score', { url: s.url, format: 'review' }],
    ['designesy_score', { url: 'https://missing.test/' }],
    ['designesy_tokens_score', { dtcg_file: JSON.stringify(FIXTURES.tokensAlias.file) }],
    ['designesy_tokens_score', { url: `${origin}/tokens.json` }],
    ['designesy_a11y_score', { url: s.url }],
    ['designesy_motion_score', { lottie_file: JSON.stringify(conformantLottie) }],
    ['designesy_motion_score', { url: `${origin}/hero.json` }],
    ['designesy_drift_score', { url: s.url }],
    ['designesy_readiness_score', { url: s.url }],
    ['designesy_guardrails', { url: s.url }],
    ['designesy_guardrails', { url: s.url, parts: ['designMd', 'tokens'] }],
    ['designesy_monitor_score', { url: s.url }],
    ['designesy_compare', { urlA: s.url, urlB: FIXTURES.compare.urlB }],
    ['designesy_report', { url: s.url }],
    ['designesy_report', { url: s.url, detail: 'summary' }],
  ];
  let passed = 0;
  let snapshot = null;
  for (const [name, args] of ok) {
    const label = `${name} ${JSON.stringify(args).slice(0, 60)}`;
    const { result } = await h.callTool(name, args);
    if (result.isError) {
      push(`is-error:${label}`, `${label} returned an error: ${result.content[0].text.slice(0, 200)}`);
      continue;
    }
    const sc = result.structuredContent;
    if (!sc || typeof sc !== 'object' || Array.isArray(sc)) {
      push(`missing:${label}`, `${label} returned no structuredContent object; the SDK refuses a success without one when the tool has an outputSchema.`);
      continue;
    }
    const text = result.content[0].text;
    if (args.format === 'review') {
      if (sc.format !== 'review' || sc.markdown !== text) push(`review:${label}`, `${label}: structuredContent is not { format: "review", markdown } holding the text block.`);
    } else if (canonicalJson(JSON.parse(text)) !== canonicalJson(sc)) {
      push(`text-differs:${label}`, `${label}: the text block and structuredContent are not the same JSON.`);
    }
    const v = await h.tools.get(name).config.outputSchema['~standard'].validate(sc);
    if (v.issues) push(`schema:${label}`, `${label} does not match its outputSchema: ${v.issues.map((i) => i.message).join('; ').slice(0, 300)}`);
    else passed++;
    if (name === 'designesy_monitor_score') snapshot = sc.currentSnapshot;
  }
  // A second monitor run, with the first as history.
  if (snapshot) {
    const { result } = await h.callTool('designesy_monitor_score', { url: s.url, history: [snapshot] });
    const v = result.structuredContent && await h.tools.get('designesy_monitor_score').config.outputSchema['~standard'].validate(result.structuredContent);
    if (result.isError || !v || v.issues) push('monitor-history', `designesy_monitor_score with history did not return a valid structuredContent: ${result.content[0].text.slice(0, 200)}`);
    else passed++;
  }

  // Failures: isError, no structuredContent, and the retryable answer in the field and the text.
  const drift = (body, status, headers = {}) => (url) => (url.endsWith('/api/drift') ? new Response(JSON.stringify(body), { status, headers }) : undefined);
  const failures = [
    ['engine 400 (a private address)', 'designesy_drift_score', { url: 'http://127.0.0.1/' }, null, false, /Correct the input/],
    ['engine 502 (page could not be fetched)', 'designesy_drift_score', { url: 'https://missing.test/' }, null, true, /check the URL with the user/],
    ['engine 429 with Retry-After', 'designesy_drift_score', { url: s.url }, drift({ ok: false, error: 'Rate limit exceeded. Maximum 50 drift scans per hour.' }, 429, { 'retry-after': '37' }), true, /Wait 37 seconds/],
    ['engine 504', 'designesy_drift_score', { url: s.url }, drift({ error: 'FUNCTION_INVOCATION_TIMEOUT' }, 504), true, /failed or timed out/],
    ['engine unreachable', 'designesy_drift_score', { url: s.url }, (url) => { if (url.endsWith('/api/drift')) throw new TypeError('fetch failed'); return undefined; }, true, /Could not reach the drift engine/],
    ['score 400', 'designesy_score', { url: 'http://127.0.0.1/' }, null, false, /HTTP 400/],
    ['report on an unreadable page', 'designesy_report', { url: 'https://missing.test/' }, null, true, /check the URL with the user/],
    ['tokens file on a refused address', 'designesy_tokens_score', { url: 'http://127.0.0.1/tokens.json' }, null, false, /not a public http\(s\) URL/],
    ['tokens file behind a login', 'designesy_tokens_score', { url: `${origin}/locked.json` }, null, false, /needs a login[^.]*dtcg_file/],
    ['tokens file that is not JSON', 'designesy_tokens_score', { url: s.url }, null, false, /did not return JSON/],
    ['motion file missing', 'designesy_motion_score', { url: `${origin}/nothing.json` }, null, false, /HTTP 404/],
    ['a11y config that is not JSON', 'designesy_a11y_score', { url: s.url, config: '{nope' }, null, false, /Invalid JSON in config/],
  ];
  for (const [what, name, args, answer, retryable, says] of failures) {
    override = answer;
    const { result, payload } = await h.callTool(name, args);
    override = null;
    const problems = [];
    if (result.isError !== true) problems.push('isError is not true');
    if (result.structuredContent !== undefined) problems.push('it carries structuredContent');
    if (!payload || payload.retryable !== retryable) problems.push(`retryable is ${payload && payload.retryable}, expected ${retryable}`);
    const err = (payload && payload.error) || '';
    if (!err.includes(`Retryable: ${retryable ? 'yes, once' : 'no'}.`)) problems.push('the text does not state the retryable answer');
    if (!says.test(err)) problems.push(`the text does not match ${says}`);
    if (problems.length) push(`failure:${what}`, `${what} (${name}): ${problems.join('; ')}. Text: ${err.slice(0, 200)}`);
    else passed++;
  }

  // The classifier matches the guard's own words, so a reworded guard cannot slip past it.
  const guard = fs.readFileSync(path.join(APP, 'app', 'lib', 'url-guard.ts'), 'utf8');
  for (const words of ['SSRF guard: blocked URL', 'SSRF guard: blocked DNS resolution', 'has no public address', 'SSRF guard: fetch timeout']) {
    if (!guard.includes(words)) push(`guard-words:${words}`, `app/lib/url-guard.ts no longer says "${words}", which the MCP route's fileFetchFailure classifies.`);
  }
  return { findings, measured: `${passed} result(s) checked: ${ok.length + 1} successes against their outputSchema, ${failures.length} failures` };
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
  ['tokens-warn-half', tokensWarnHalf],
  ['tokens-alias', tokensAlias],
  ['export-dtcg', exportDtcg],
  ['guardrails-dtcg', guardrailsDtcg],
  ['monitor-m09', monitorM09],
  ['compare-rounding', compareRounding],
  ['tool-definitions', toolDefinitions],
  ['structured-output', structuredOutput],
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

  if (argv.includes('--write-definitions')) {
    fs.writeFileSync(DEFINITIONS, `${JSON.stringify(renderedDefinitions(siteHarness()), null, 2)}
`);
    console.log(`mcp-accuracy: wrote ${DEFINITIONS}`);
    return;
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
