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
 *      the score engine and the npm validator count it 0.5 (warnings
 *      count half everywhere).
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
 *   a11y-scan           the WCAG 2.2 AA scan lists every tag it includes (axe-core tags
 *                        are not cumulative: wcag22aa alone ran one rule), each tag selects
 *                        at least one rule in the installed axe-core, and a page where no
 *                        rule applied is not scored (0/0 printed null and graded F)
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
 *   monitor-m01          m01 SKIPs a first run (no history: nothing is scheduled or
 *                        stored server-side) and is then not scored; PASSes with history
 *   monitor-m09          m09 reports the contract version designesy_score reads
 *   monitor-m02          m02 measures the gap since the newest supplied run
 *                        against the cadence (PASS within one window, WARN
 *                        within two, FAIL past two, SKIP with no history), an
 *                        unknown cadence is a 400, and every result's score
 *                        and counts match the checks it returns
 *   monitor-mail-off     with MONITOR_EMAIL_ENABLED unset or anything but "true",
 *                        a run that names an email and raises an alert sends
 *                        nothing and m10 says email alerts are off; with "true"
 *                        it sends one email in which a previous score that is
 *                        not a number shows as missing, and escapeHtml turns
 *                        each HTML-special character into an entity (Resend is
 *                        stubbed: nothing leaves the process)
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
  const h = createHarness({ app: APP, pages, api, stubs: extra.stubs });
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

async function monitorM01() {
  // m01 PASSed on every call ("Monitor run executed: the URL is being
  // watched") though the route schedules and stores nothing: the caller sends
  // the earlier runs. It must PASS only with history, and SKIP a first run,
  // which then is not scored.
  const findings = [];
  const h = siteHarness();
  const first = await h.post('app/api/monitor/route.ts', { url: FIXTURES.site.url });
  const m01First = (first.body.monitorChecks || []).find((c) => c.id === 'm01');
  if (!m01First || m01First.status !== 'SKIP') {
    findings.push({ id: 'monitor-m01:first-run', why: `With no history m01 is ${m01First ? `${m01First.status} ("${m01First.detail}")` : 'missing'}; nothing was supplied to compare against, so it must SKIP.` });
  }
  const scored = (first.body.monitorChecks || []).filter((c) => c.status !== 'SKIP');
  const points = scored.reduce((s, c) => s + (c.status === 'PASS' ? 1 : c.status === 'WARN' ? 0.5 : 0), 0);
  if (scored.length && first.body.score !== Math.round((points / scored.length) * 100)) {
    findings.push({ id: 'monitor-m01:skip-scored', why: `The first-run score ${first.body.score} counts the SKIP; over the ${scored.length} scored checks it is ${Math.round((points / scored.length) * 100)}.` });
  }
  const second = await h.post('app/api/monitor/route.ts', { url: FIXTURES.site.url, history: [first.body.currentSnapshot] });
  const m01Second = (second.body.monitorChecks || []).find((c) => c.id === 'm01');
  if (!m01Second || m01Second.status !== 'PASS') {
    findings.push({ id: 'monitor-m01:with-history', why: `With one earlier run m01 is ${m01Second ? m01Second.status : 'missing'}; it must PASS.` });
  }
  return { findings, measured: `first run m01 ${m01First && m01First.status} score ${first.body.score}; with history m01 ${m01Second && m01Second.status} score ${second.body.score}` };
}

async function monitorM02() {
  // m02 PASSed on every call ("This run is happening now"), which measured
  // nothing. It now ages the newest run the caller kept against the cadence.
  const findings = [];
  const h = siteHarness();
  const url = FIXTURES.site.url;
  const first = await h.post('app/api/monitor/route.ts', { url });
  const snap = first.body.currentSnapshot;
  const ago = (days) => ({ ...snap, timestamp: new Date(Date.now() - days * 86400000).toISOString() });
  const cases = [
    ['first run', {}, 'SKIP'],
    ['weekly, 3 days', { history: [ago(3)] }, 'PASS'],
    ['weekly, 10 days', { history: [ago(10)] }, 'WARN'],
    ['weekly, 20 days', { history: [ago(20)] }, 'FAIL'],
    ['daily, 3 days', { history: [ago(3)], cadence: 'daily' }, 'FAIL'],
    ['monthly, 20 days', { history: [ago(20)], cadence: 'monthly' }, 'PASS'],
    ['unreadable timestamp', { history: [{ ...snap, timestamp: 'yesterday' }] }, 'SKIP'],
  ];
  const seen = [];
  for (const [label, extra, want] of cases) {
    const r = await h.post('app/api/monitor/route.ts', { url, ...extra });
    const checks = r.body.monitorChecks || [];
    const m02 = checks.find((c) => c.id === 'm02');
    seen.push(`${label} ${m02 ? m02.status : 'missing'}`);
    if (!m02 || m02.status !== want) {
      findings.push({ id: `monitor-m02:${label.replace(/[^a-z0-9]+/gi, '-')}`, why: `${label}: m02 is ${m02 ? `${m02.status} ("${m02.detail}")` : 'missing'}; it must be ${want}.` });
    }
    const scored = checks.filter((c) => c.status !== 'SKIP');
    const points = scored.reduce((sum, c) => sum + (c.status === 'PASS' ? 1 : c.status === 'WARN' ? 0.5 : 0), 0);
    const want2 = scored.length ? Math.round((points / scored.length) * 100) : 0;
    const counts = ['PASS', 'WARN', 'FAIL'].map((st) => checks.filter((c) => c.status === st).length);
    if (r.body.score !== want2 || r.body.pass !== counts[0] || r.body.warn !== counts[1] || r.body.fail !== counts[2]) {
      findings.push({ id: `monitor-m02:tally-${label.replace(/[^a-z0-9]+/gi, '-')}`, why: `${label}: the result says score ${r.body.score} (${r.body.pass}/${r.body.warn}/${r.body.fail}); its checks give ${want2} (${counts.join('/')}).` });
    }
  }
  const bad = await h.post('app/api/monitor/route.ts', { url, history: [ago(1)], cadence: 'hourly' });
  if (bad.status !== 400) findings.push({ id: 'monitor-m02:cadence-400', why: `cadence "hourly" returned ${bad.status}; an unknown cadence must be a 400.` });
  return { findings, measured: seen.join('; ') };
}

async function monitorMailOff() {
  // /api/monitor sends no alert email unless MONITOR_EMAIL_ENABLED is exactly
  // "true", and escapes what the email's HTML interpolates. The Resend stub
  // records each message instead of sending it.
  const findings = [];
  const sent = [];
  const stubs = {
    resend: {
      Resend: class {
        constructor() {
          this.emails = { send: async (msg) => (sent.push(msg), { error: null }) };
        }
      },
    },
  };
  const saved = { MONITOR_EMAIL_ENABLED: process.env.MONITOR_EMAIL_ENABLED, RESEND_API_KEY: process.env.RESEND_API_KEY };
  const run = async (value, body) => {
    if (value === undefined) delete process.env.MONITOR_EMAIL_ENABLED;
    else process.env.MONITOR_EMAIL_ENABLED = value;
    process.env.RESEND_API_KEY = 'stub';
    try {
      return await siteHarness({ stubs }).post('app/api/monitor/route.ts', body);
    } finally {
      for (const [name, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[name];
        else process.env[name] = v;
      }
    }
  };
  const url = FIXTURES.site.url;
  const email = 'alerts@example.com';
  const snap = (await run(undefined, { url })).body.currentSnapshot;
  // A history that raises an alert, whose previous score is not a number.
  const history = [{ ...snap, score: snap.score + 200 }, { ...snap, score: '<img src=x>' }];
  const m10Of = (r) => (r.body.monitorChecks || []).find((c) => c.id === 'm10');
  const seen = [];
  for (const value of [undefined, '', '1', 'TRUE', 'yes']) {
    const label = value === undefined ? 'unset' : JSON.stringify(value);
    sent.length = 0;
    const r = await run(value, { url, email, history });
    const m10 = m10Of(r);
    seen.push(`${label} ${sent.length} sent`);
    if (!(r.body.alerts || []).length) {
      findings.push({ id: `monitor-mail-off:${label}:no-alert`, why: `Switch ${label}: the forged baseline raised no alert, so this case tested nothing.` });
    }
    if (sent.length) {
      findings.push({ id: `monitor-mail-off:${label}:sent`, why: `Switch ${label}: ${sent.length} email(s) sent to ${sent.map((m) => m.to).join(', ')}; with the switch not "true" nothing may be sent.` });
    }
    if (!r.body.emailAlert || r.body.emailAlert.off !== true) {
      findings.push({ id: `monitor-mail-off:${label}:emailAlert`, why: `Switch ${label}: emailAlert is ${JSON.stringify(r.body.emailAlert)}; it must say off.` });
    }
    if (!m10 || !/email alerts are off on this server, so no email was sent/.test(m10.detail)) {
      findings.push({ id: `monitor-mail-off:${label}:m10`, why: `Switch ${label}: m10 is ${m10 ? `"${m10.detail}"` : 'missing'}; it must say email alerts are off and no email was sent.` });
    }
  }
  sent.length = 0;
  const bare = await run(undefined, { url, history });
  const m10Bare = m10Of(bare);
  if (!m10Bare || !/email alerts are off on this server$/.test(m10Bare.detail)) {
    findings.push({ id: 'monitor-mail-off:no-email:m10', why: `With no email and the switch unset, m10 is ${m10Bare ? `"${m10Bare.detail}"` : 'missing'}; it must say email alerts are off, not invite an address.` });
  }
  sent.length = 0;
  const on = await run('true', { url, email, history });
  seen.push(`"true" ${sent.length} sent`);
  if (sent.length !== 1 || !on.body.emailAlert || on.body.emailAlert.delivered !== true) {
    findings.push({ id: 'monitor-mail-off:on:sent', why: `With the switch "true", ${sent.length} email(s) were sent and emailAlert is ${JSON.stringify(on.body.emailAlert)}; one email must go out.` });
  } else if (sent[0].to !== email || /<img/i.test(sent[0].html) || !sent[0].html.includes('Previous: no score recorded')) {
    findings.push({ id: 'monitor-mail-off:on:escaped', why: `With the switch "true", the email went to ${sent[0].to}, ${/<img/i.test(sent[0].html) ? 'carries the request\'s <img> markup' : 'does not say the previous score is missing'}.` });
  }
  const { escapeHtml } = siteHarness().load('app/lib/monitor-email.ts');
  const escaped = escapeHtml(`<a href="x">'&`);
  if (escaped !== '&lt;a href=&quot;x&quot;&gt;&#39;&amp;') {
    findings.push({ id: 'monitor-mail-off:escape', why: `escapeHtml gives ${JSON.stringify(escaped)}; each of < > " ' & must become an entity.` });
  }
  return { findings, measured: seen.join('; ') };
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
  // The links the routes read from engine 1.5.4: rel before href, or href before rel.
  const linkRe = /<link(?:[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']|[^>]*href=["']([^"']+)["'][^>]*rel=["']?stylesheet)/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = new URL(m[1] ?? m[2], url).href;
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

async function a11yScan() {
  const findings = [];
  const h = siteHarness();
  const five = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  const { payload } = await h.callTool('designesy_a11y_score', { url: FIXTURES.site.url });
  const script = (payload && payload.playwright_script) || '';
  if (JSON.stringify(payload && payload.tags) !== JSON.stringify(five)) {
    findings.push({ id: 'a11y-scan:tags', why: `The default scan lists ${JSON.stringify(payload && payload.tags)}; a WCAG 2.2 AA scan needs ${JSON.stringify(five)}.` });
  }
  if (!script.includes(`.withTags(${JSON.stringify(five)})`)) {
    findings.push({ id: 'a11y-scan:script', why: 'The generated script does not pass the five WCAG tags to AxeBuilder.withTags.' });
  }
  // Every tag must select a rule in the axe-core this site installs: a typo
  // ('wcag2a2a') selects nothing and the scan passes vacuously.
  let axe = null;
  try {
    axe = require(require.resolve('axe-core', { paths: [APP] }));
  } catch {
    findings.push({ id: 'a11y-scan:axe-core', why: 'axe-core is not installed in apps/site, so the tags cannot be checked against its rules.' });
  }
  if (axe) {
    for (const t of five) {
      if (axe.getRules([t]).length === 0) findings.push({ id: `a11y-scan:empty-tag:${t}`, why: `${t} selects no rule in axe-core ${axe.version}.` });
    }
  }
  // Run the script's own scoring lines: 0/0 must be "not scored", never F.
  const m = /(const applicable = [^\n]*\n[^\n]*const score = [^\n]*\n[^\n]*const grade = [^\n]*)\n/.exec(script);
  if (!m) {
    findings.push({ id: 'a11y-scan:guard', why: 'The generated script has no applicable === 0 guard before its score.' });
  } else {
    const grade = (passCount, failCount) => new Function('passCount', 'failCount', `${m[1]}\nreturn { score, grade };`)(passCount, failCount);
    const none = grade(0, 0);
    const some = grade(3, 1);
    if (none.score !== null || none.grade !== null) findings.push({ id: 'a11y-scan:zero', why: `0 passes and 0 violations scored ${none.score} (${none.grade}); it must be not scored.` });
    if (some.score !== 75 || some.grade !== 'C') findings.push({ id: 'a11y-scan:arith', why: `3 passes and 1 violation scored ${some.score} (${some.grade}); expected 75 (C).` });
  }
  // Run the generated script itself, with and without a config: its imports
  // and its config path must work as written (with a config it called
  // axe.configure() on an axe nothing defined, and threw on every run).
  const { runA11yScript } = await import(require('node:url').pathToFileURL(path.join(__dirname, 'lib', 'run-a11y-script.mjs')).href);
  const brand = { branding: { brand: 'designesy', application: 'designesy-a11y' }, rules: [{ id: 'region', enabled: false }] };
  for (const [label, args] of [['default', {}], ['config', { config: JSON.stringify(brand) }]]) {
    const { payload: p } = await h.callTool('designesy_a11y_score', { url: FIXTURES.site.url, ...args });
    let ran = null;
    try {
      ran = await runA11yScript((p && p.playwright_script) || '');
    } catch (e) {
      findings.push({ id: `a11y-scan:run:${label}`, why: `The generated script (${label}) threw when run: ${e && e.message ? e.message : e}` });
      continue;
    }
    if (ran.tests.length !== 1 || ran.goto[0] !== FIXTURES.site.url) {
      findings.push({ id: `a11y-scan:run:${label}:test`, why: `The script (${label}) registered ${ran.tests.length} test(s) and visited ${JSON.stringify(ran.goto)}.` });
    }
    if (!ran.output || ran.output.score !== 75 || ran.output.grade !== 'C') {
      findings.push({ id: `a11y-scan:run:${label}:output`, why: `The script (${label}) printed ${JSON.stringify(ran.output)}; 3 passes and 1 violation should print 75 (C).` });
    }
    if (label === 'config' && (!ran.axeSource || JSON.stringify(ran.configured) !== JSON.stringify(brand))) {
      findings.push({ id: 'a11y-scan:run:config:configure', why: `With a config, axe.configure() inside the page received ${JSON.stringify(ran.configured)}; it should receive ${JSON.stringify(brand)}.` });
    }
    if (label === 'default' && ran.axeSource) {
      findings.push({ id: 'a11y-scan:run:default:source', why: 'Without a config the script still replaces the axe-core source.' });
    }
  }
  // The url argument is embedded as a string literal: a quote, a backtick and
  // ${ in it must neither break the script nor run, and the script must
  // navigate to exactly that URL (it was spliced between single quotes).
  const hostile = 'https://example.com/a' + "'" + 'b' + '"' + 'c' + '`' + 'd' + '${globalThis.__a11yInjected = 1}' + "');globalThis.__a11yInjected = 2;('";
  const { payload: hp } = await h.callTool('designesy_a11y_score', { url: hostile });
  try {
    const ran = await runA11yScript((hp && hp.playwright_script) || '');
    if (ran.goto.length !== 1 || ran.goto[0] !== hostile) findings.push({ id: 'a11y-scan:url:goto', why: `With a hostile url the script navigated to ${JSON.stringify(ran.goto)}; it should navigate to exactly ${JSON.stringify(hostile)}.` });
    if (!ran.output || ran.output.url !== hostile) findings.push({ id: 'a11y-scan:url:output', why: `With a hostile url the script printed url ${JSON.stringify(ran.output && ran.output.url)}.` });
    if (ran.tests[0] !== `${hostile}: WCAG 2.2 AA scan`) findings.push({ id: 'a11y-scan:url:title', why: `With a hostile url the test was named ${JSON.stringify(ran.tests[0])}.` });
  } catch (e) {
    findings.push({ id: 'a11y-scan:url:parse', why: `With a url holding a quote, a backtick and \${, the generated script failed: ${e && e.message ? e.message : e}` });
  }
  if (globalThis.__a11yInjected !== undefined) findings.push({ id: 'a11y-scan:url:injected', why: 'Code inside the url argument ran when the generated script was loaded.' });
  return { findings, measured: axe ? `axe-core ${axe.version}: ${five.map((t) => `${t} ${axe.getRules([t]).length}`).join(', ')}` : 'axe-core not loaded' };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CHECKS = [
  ['a11y-names', a11yNames],
  ['a11y-scan', a11yScan],
  ['fabricated-agreement', fabricatedAgreement],
  ['tokens-skip', tokensSkip],
  ['tokens-warn-half', tokensWarnHalf],
  ['tokens-alias', tokensAlias],
  ['export-dtcg', exportDtcg],
  ['guardrails-dtcg', guardrailsDtcg],
  ['monitor-m01', monitorM01],
  ['monitor-m02', monitorM02],
  ['monitor-m09', monitorM09],
  ['monitor-mail-off', monitorMailOff],
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
