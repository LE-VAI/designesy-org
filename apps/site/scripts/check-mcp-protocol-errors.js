#!/usr/bin/env node
/**
 * mcp-protocol-errors gate: a request whose params fail the MCP schema is
 * answered -32602 Invalid params with a short message naming the field, and a
 * 2026-07-28 request may leave out clientInfo.
 *
 * WHY THIS EXISTS
 * On 2026-10-21 https://www.designesy.org/api/mcp answered an initialize
 * without clientInfo (protocolVersion 2026-07-28 or 2025-06-18) with HTTP 200
 * and the JSON-RPC error -32603 Internal error, its message the schema
 * library's raw issue list:
 *   "[\n  {\n    \"expected\": \"object\",\n    \"code\": \"invalid_type\", ...
 * tools/list with a numeric cursor and resources/read without a uri got the
 * same, and tools/call answered -32602 with the same list behind "Invalid
 * tools/call request: ". JSON-RPC 2.0 assigns invalid params -32602 ("Invalid
 * method parameter(s)."), and the MCP schemas of 2025-06-18, 2025-11-25 and
 * 2026-07-28 all define INVALID_PARAMS = -32602. The cause is in the SDK
 * (app/lib/mcp-invalid-params.ts says where); the route now rewrites those
 * answers.
 *
 * The same day, a 2026-07-28 request that left out the optional
 * io.modelcontextprotocol/clientInfo was answered 400 -32020: the route's
 * compatibility shim required that key, stripped the MCP-Protocol-Version
 * header, and the SDK then found the header missing.
 *
 * WHAT IT DOES
 * scripts/lib/route-harness.js loads app/api/mcp/route.ts under Node with the
 * real mcp-handler and SDK (only the network is stubbed), and this gate POSTs
 * JSON-RPC to it in both framings the route answers with: an event stream for
 * 2025-era requests, JSON for 2026-07-28 ones.
 *   initialize-clientInfo  initialize without clientInfo, as 2025-06-18, 2025-11-25
 *                          and 2026-07-28 (also with the 2026-07-28 header): -32602
 *                          naming params.clientInfo. clientInfo stays required: the
 *                          2025 schemas declare `clientInfo: Implementation;`, and
 *                          2026-07-28 has no initialize (one selects the negotiated
 *                          legacy revision, 2025-11-25 here)
 *   invalid-params         tools/list, resources/list and resources/read with bad
 *                          params, initialize with no params, a clientInfo without
 *                          a version or a capability key holding a newline,
 *                          tools/call without a name or with arguments that are not
 *                          an object, in both framings: -32602, one line with no
 *                          control character, the method and the field named, no
 *                          issue list
 *   tool-arguments         a tools/call whose arguments fail the tool's input schema
 *                          is still a tool result with isError: true naming the
 *                          argument (the tools page lists "Input validation errors"
 *                          under tool execution errors)
 *   modern-clientInfo-optional  2026-07-28 server/discover and tools/list without
 *                          io.modelcontextprotocol/clientInfo get a result, and the
 *                          shim passes them on as modern (X-MCP-Shim:
 *                          passthrough-modern); a 2026-07-28 header on a body with
 *                          no envelope, or with one that lacks clientCapabilities
 *                          or protocolVersion, is still downgraded
 *                          (downgraded-to-legacy)
 *   valid-unchanged        valid requests and ordinary errors answer, byte for
 *                          byte, what they answer with the rewrite switched off:
 *                          status, headers and body. Not applicable (SKIP) on a
 *                          tree without app/lib/mcp-invalid-params.ts and no
 *                          --against: there is no rewrite to switch off
 *   stream-passthrough     answerInvalidParams hands an event stream on unchanged
 *                          when it holds no failed check, however it is chunked (a
 *                          split inside a line or inside a UTF-8 character),
 *                          rewrites only a failed check's line (as the SDK
 *                          writes it today, and as an open upstream change would),
 *                          leaves a failed result check alone, sends each event
 *                          before the stream ends, keeps a line's CRLF ending,
 *                          rewrites a last line that the stream ends without its
 *                          newline and a data line without the space after
 *                          "data:", and leaves alone a failed check on a line of
 *                          another field or with bytes that are not UTF-8
 *   detection              each of the four conditions in mcp-invalid-params.ts is
 *                          enforced on its own, in both framings: a failed check is
 *                          rewritten (alone; in a batch, first or second; two in
 *                          one batch; with its "error" member's name written with
 *                          an escape; with error data, which is kept; after
 *                          leading whitespace), and a
 *                          payload that differs from it in one condition only
 *                          passes unchanged (results holding an error-shaped
 *                          object, or with an id that reads as an "error" member to
 *                          a scan that ends a string at an escaped quote or takes a
 *                          value for a name, none of which is parsed; another error
 *                          code; a message whose text before the list is not a
 *                          request label, such as a result check's, or holds one
 *                          after other text or before more text; an empty list;
 *                          a list with an issue outside params). A rewritten answer
 *                          keeps its status and headers, and no content-length that
 *                          is not its new body's
 *   message-text           the -32602 message names the method only when the
 *                          request's method looks like one; words each kind of
 *                          issue as stated in mcp-invalid-params.ts (a missing
 *                          field, an invalid one, a record called an object);
 *                          writes each control character as an escape; and cuts
 *                          each issue to 160 characters (one of 160 is kept, one
 *                          of 161 is cut), never inside a character or an escape,
 *                          also when the text holds an earlier escape
 *   frame-bound            an initialize whose clientInfo.icons holds 2,000 numbers
 *                          (2,000 issues; the check prints the answer's size with
 *                          and without the rewrite) is answered -32602; a failed
 *                          check of exactly FRAME_BOUND bytes is rewritten in both
 *                          framings and one byte more passes unchanged; a JSON body
 *                          over the bound is handed back before its end arrives,
 *                          and the copy read for the rewrite is cancelled, so
 *                          cancelling the answer cancels its source; a line longer
 *                          than the bound goes out before its newline arrives; and
 *                          after a result line longer than the bound, each of three
 *                          later chunks of it goes out before the next is sent, and
 *                          the failed check on the next line is rewritten
 *
 * --app <dir> runs the checks against another checkout's apps/site; that is how
 * the failing verdicts on main were recorded. --against <dir> makes
 * valid-unchanged compare with that checkout's route instead of this one's with
 * the rewrite switched off.
 *
 * Usage:  node scripts/check-mcp-protocol-errors.js [--json] [--app <dir>] [--against <dir>]
 * Exits 1 on any finding, so it can gate CI.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHarness } = require('./lib/route-harness');

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APP = path.resolve(arg('--app') || path.join(__dirname, '..'));
const AGAINST = arg('--against') ? path.resolve(arg('--against')) : null;

const ROUTE = 'app/api/mcp/route.ts';
const LIB = 'app/lib/mcp-invalid-params.ts';
const MODERN = '2026-07-28';
const CLIENT = { name: 'protocol-errors-gate', version: '0.0.0' };
// A message this long is not "short". The longest one this gate provokes, three
// issues named and the rest counted (frame-bound's 2,000 issues), is 230 characters.
const MAX_MESSAGE = 300;
// MAX_FRAME_BYTES in mcp-invalid-params.ts: the most of one payload that is held
// and examined. Written out here, not read from the module, so the gate holds the
// bound the module's comment states.
const FRAME_BOUND = 4 * 1024 * 1024;

/** The real mcp-handler, from the loaded app or, failing that, this checkout. */
function realMcpHandler(app) {
  for (const from of [path.join(app, 'package.json'), __filename]) {
    try {
      return createRequire(from)('mcp-handler');
    } catch (e) {
      if (!e || e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new Error('mcp-handler is not installed; run npm ci in apps/site');
}

/** A harness whose MCP route runs on the real handler. */
function routeHarness(app, overrides = {}) {
  return createHarness({ app, stubs: { 'mcp-handler': realMcpHandler(app) }, overrides });
}

// Built in main(), after the check that TypeScript is installed: the harness needs it.
let harness;

// ── Requests ──────────────────────────────────────────────────────────────────

/** A 2025-era request: no envelope, no protocol headers. */
function legacy(id, method, params) {
  const body = { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, ...(params === undefined ? {} : { params }) };
  return { body, headers: {} };
}

/** A 2026-07-28 request: the _meta envelope plus the headers it requires. */
function modern(id, method, params = {}, { clientInfo = true } = {}) {
  const _meta = {
    'io.modelcontextprotocol/protocolVersion': MODERN,
    ...(clientInfo ? { 'io.modelcontextprotocol/clientInfo': CLIENT } : {}),
    'io.modelcontextprotocol/clientCapabilities': {},
  };
  const headers = { 'mcp-protocol-version': MODERN, 'mcp-method': method };
  if (method === 'tools/call' && typeof params.name === 'string') headers['mcp-name'] = params.name;
  if (method === 'resources/read' && typeof params.uri === 'string') headers['mcp-name'] = params.uri;
  return { body: { jsonrpc: '2.0', id, method, params: { ...params, _meta } }, headers };
}

/** POST one request to the route; returns status, headers, bytes and the text. */
async function send(h, { body, headers }) {
  const route = h.load(ROUTE);
  const realFetch = globalThis.fetch;
  const realError = console.error;
  // mcp-handler logs every error it answers (verboseLogs); the gate reads the answers.
  console.error = () => {};
  globalThis.fetch = async (url) => {
    throw new Error(`the gate made a network call to ${url}`);
  };
  try {
    const res = await route.POST(new Request('https://www.designesy.org/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      headers: [...res.headers].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      type: res.headers.get('content-type') || '',
      bytes,
      text: bytes.toString('utf8'),
    };
  } finally {
    console.error = realError;
    globalThis.fetch = realFetch;
  }
}

/** The JSON-RPC messages in an answer: each data line of an event stream, or the JSON body. */
function messages(answer) {
  if (answer.type.startsWith('text/event-stream')) {
    return answer.text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.replace(/^data: ?/, '')));
  }
  if (!answer.text) return [];
  const parsed = JSON.parse(answer.text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

const short = (s) => (s.length > 160 ? `${s.slice(0, 160)}...` : s);

/** The first control character (C0, DEL, C1) or line or paragraph separator in a string, as U+XXXX, or null. */
function controlIn(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return `U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return null;
}

/** What is wrong with an answer that should be -32602 for `method` naming `field`. */
function invalidParamsProblems(answer, method, field) {
  let msgs;
  try {
    msgs = messages(answer);
  } catch (e) {
    return [`the answer (HTTP ${answer.status}) did not parse: ${short(answer.text)}`];
  }
  const error = msgs.length === 1 && msgs[0] && msgs[0].error;
  if (!error) return [`expected one JSON-RPC error, got HTTP ${answer.status}: ${short(answer.text)}`];
  const problems = [];
  if (error.code !== -32602) problems.push(`code ${error.code}, not -32602 Invalid params`);
  const m = String(error.message);
  if (/"path"|"code"/.test(m)) problems.push(`the message is the raw issue list: ${JSON.stringify(short(m))}`);
  else {
    if (!m.startsWith(`Invalid params for ${method}: `)) problems.push(`the message does not start "Invalid params for ${method}: ": ${JSON.stringify(m)}`);
    if (!m.includes(field)) problems.push(`the message does not name ${field}: ${JSON.stringify(m)}`);
    if (m.length > MAX_MESSAGE) problems.push(`the message runs to ${m.length} characters`);
    const control = controlIn(m);
    if (control) problems.push(`the message holds ${control}, so it may not stay on one line: ${JSON.stringify(m)}`);
  }
  return problems;
}

/** Run named cases that each expect -32602; one finding per case that does not hold. */
async function expectInvalidParams(check, cases) {
  const findings = [];
  const seen = [];
  for (const c of cases) {
    const answer = await send(harness, c.request);
    const problems = invalidParamsProblems(answer, c.request.body.method, c.field);
    if (problems.length) findings.push({ id: `${check}:${c.name}`, why: problems.join('; ') });
    else seen.push(messages(answer)[0].error.message);
  }
  return { findings, measured: `${cases.length - findings.length}/${cases.length} answered -32602${seen[0] ? `, e.g. "${seen[0]}"` : ''}` };
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function initializeClientInfo() {
  const params = (protocolVersion) => ({ protocolVersion, capabilities: {} });
  return expectInvalidParams('initialize-clientInfo', [
    { name: '2025-06-18', field: 'params.clientInfo', request: legacy(1, 'initialize', params('2025-06-18')) },
    { name: '2025-11-25', field: 'params.clientInfo', request: legacy(2, 'initialize', params('2025-11-25')) },
    { name: '2026-07-28', field: 'params.clientInfo', request: legacy(3, 'initialize', params(MODERN)) },
    // The shim strips a 2026-07-28 header from a body without an envelope.
    {
      name: '2026-07-28-header',
      field: 'params.clientInfo',
      request: { body: legacy('four', 'initialize', params(MODERN)).body, headers: { 'mcp-protocol-version': MODERN } },
    },
  ]);
}

async function invalidParams() {
  return expectInvalidParams('invalid-params', [
    { name: 'initialize-no-params', field: 'params is missing', request: legacy(1, 'initialize') },
    {
      name: 'initialize-clientInfo-version',
      field: 'params.clientInfo.version',
      request: legacy(2, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: CLIENT.name } }),
    },
    // The key is the client's: its newline is written as an escape.
    {
      name: 'initialize-key-newline',
      field: 'params.capabilities.experimental.a\\u000ab',
      request: legacy(11, 'initialize', { protocolVersion: '2025-11-25', capabilities: { experimental: { 'a\nb': 5 } }, clientInfo: CLIENT }),
    },
    { name: 'tools-list-cursor', field: 'params.cursor', request: legacy(3, 'tools/list', { cursor: 5 }) },
    { name: 'resources-list-cursor', field: 'params.cursor', request: legacy(4, 'resources/list', { cursor: 5 }) },
    { name: 'resources-read-uri', field: 'params.uri', request: legacy(5, 'resources/read', {}) },
    { name: 'tools-call-name', field: 'params.name', request: legacy(6, 'tools/call', { arguments: {} }) },
    { name: 'tools-call-arguments', field: 'params.arguments', request: legacy(7, 'tools/call', { name: 'designesy_contract', arguments: 'motion' }) },
    { name: 'modern-tools-list-cursor', field: 'params.cursor', request: modern(8, 'tools/list', { cursor: 5 }) },
    { name: 'modern-resources-read-uri', field: 'params.uri', request: modern(9, 'resources/read', {}) },
    { name: 'modern-tools-call-arguments', field: 'params.arguments', request: modern(10, 'tools/call', { name: 'designesy_contract', arguments: 'motion' }) },
  ]);
}

async function toolArguments() {
  const findings = [];
  const cases = [
    ['legacy', legacy(1, 'tools/call', { name: 'designesy_contract', arguments: { sections: 5 } })],
    ['modern', modern(2, 'tools/call', { name: 'designesy_contract', arguments: { sections: 5 } })],
  ];
  let text = '';
  for (const [name, request] of cases) {
    const answer = await send(harness, request);
    const msgs = messages(answer);
    const result = msgs.length === 1 && msgs[0] && msgs[0].result;
    const t = result && Array.isArray(result.content) && result.content[0] && result.content[0].text;
    if (!result || result.isError !== true || typeof t !== 'string' || !t.includes('sections')) {
      findings.push({ id: `tool-arguments:${name}`, why: `expected a tool result with isError: true naming sections, got HTTP ${answer.status}: ${short(answer.text)}` });
    } else text = t;
  }
  return { findings, measured: text ? `isError result: "${short(text)}"` : undefined };
}

/** The X-MCP-Shim header of an answer: how the route's compatibility shim classed the request. */
const shimOf = (answer) => (answer.headers.find(([name]) => name === 'x-mcp-shim') || [])[1] || null;

async function modernClientInfoOptional() {
  const findings = [];
  const registry = harness.load('app/lib/mcp-tool-registry.ts');
  // Without clientInfo, the envelope is whole: the shim passes it on as modern.
  const discover = await send(harness, modern(1, 'server/discover', {}, { clientInfo: false }));
  const d = discover.status === 200 && messages(discover)[0];
  if (!d || !d.result || !Array.isArray(d.result.supportedVersions) || !d.result.supportedVersions.includes(MODERN) || shimOf(discover) !== 'passthrough-modern') {
    findings.push({ id: 'modern-clientInfo-optional:server-discover', why: `server/discover without clientInfo answered HTTP ${discover.status}, X-MCP-Shim ${shimOf(discover)}: ${short(discover.text)}` });
  }
  const list = await send(harness, modern(2, 'tools/list', {}, { clientInfo: false }));
  const l = list.status === 200 && messages(list)[0];
  const count = l && l.result && Array.isArray(l.result.tools) ? l.result.tools.length : -1;
  if (count !== registry.MCP_TOOL_NAMES.length || shimOf(list) !== 'passthrough-modern') {
    findings.push({ id: 'modern-clientInfo-optional:tools-list', why: `tools/list without clientInfo answered HTTP ${list.status}, X-MCP-Shim ${shimOf(list)}, with ${count} tool(s), expected ${registry.MCP_TOOL_NAMES.length}: ${short(list.text)}` });
  }
  // The envelope test still requires its two keys: a 2026-07-28 header on a
  // body with no envelope, or with an envelope that lacks either key, is
  // downgraded. (valid-unchanged compares with this same route, so it cannot
  // see the shim change.)
  const P = 'io.modelcontextprotocol/protocolVersion';
  const C = 'io.modelcontextprotocol/clientCapabilities';
  const header = { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' };
  const downgrades = [
    ['no-envelope', {}],
    ['no-clientCapabilities', { _meta: { [P]: MODERN, 'io.modelcontextprotocol/clientInfo': CLIENT } }],
    ['no-protocolVersion', { _meta: { [C]: {}, 'io.modelcontextprotocol/clientInfo': CLIENT } }],
  ];
  for (const [name, params] of downgrades) {
    const answer = await send(harness, { body: { jsonrpc: '2.0', id: 3, method: 'tools/list', params }, headers: header });
    if (shimOf(answer) !== 'downgraded-to-legacy') {
      findings.push({ id: `modern-clientInfo-optional:shim-${name}`, why: `a 2026-07-28 header with ${name.replace(/-/g, ' ')} was not downgraded: X-MCP-Shim ${shimOf(answer)}, HTTP ${answer.status}` });
    }
  }
  return {
    findings,
    measured: findings.length ? undefined : `server/discover and tools/list (${count} tools) answered without clientInfo, passed on as modern; ${downgrades.length} incomplete envelopes downgraded`,
  };
}

async function validUnchanged() {
  // Without the module there is no rewrite to switch off: the reference would
  // be this route itself, and every answer would match trivially.
  if (!AGAINST && !fs.existsSync(path.join(APP, LIB))) {
    return { findings: [], skipped: `not applicable: this tree has no ${LIB}, so there is no rewrite to switch off (--against <dir> compares with another checkout)` };
  }
  // The reference: another checkout's route, or this one with the rewrite switched off.
  const reference = AGAINST ? routeHarness(AGAINST) : routeWithoutRewrite();
  const tokens = JSON.stringify({ $schema: 'https://www.designtokens.org/schemas/2025.10/format.json', space: { $type: 'dimension', $value: { value: 4, unit: 'px' }, $description: 'base step' } });
  const init = (protocolVersion) => ({ protocolVersion, capabilities: {}, clientInfo: CLIENT });
  const cases = [
    ['initialize 2025-11-25', legacy(1, 'initialize', init('2025-11-25'))],
    ['initialize 2025-06-18', legacy(2, 'initialize', init('2025-06-18'))],
    ['initialize 2026-07-28', legacy(3, 'initialize', init(MODERN))],
    ['notifications/initialized', legacy(undefined, 'notifications/initialized')],
    ['ping', legacy(4, 'ping')],
    ['tools/list', legacy(5, 'tools/list')],
    ['resources/list', legacy(6, 'resources/list')],
    ['resources/read', legacy(7, 'resources/read', { uri: 'ui://designesy/report-app' })],
    ['tools/call tokens', legacy(8, 'tools/call', { name: 'designesy_tokens_score', arguments: { dtcg_file: tokens } })],
    ['tools/call a11y', legacy(9, 'tools/call', { name: 'designesy_a11y_score', arguments: { url: 'https://example.com/' } })],
    ['tools/call bad argument', legacy(10, 'tools/call', { name: 'designesy_contract', arguments: { sections: 5 } })],
    ['tools/call unknown tool', legacy(11, 'tools/call', { name: 'no_such_tool', arguments: {} })],
    ['unknown method', legacy(12, 'no/such/method', {})],
    ['unparseable body', { body: '{"jsonrpc":"2.0","id":13,', headers: {} }],
    ['header without envelope', { body: legacy(14, 'tools/list').body, headers: { 'mcp-protocol-version': MODERN } }],
    ['modern server/discover', modern(15, 'server/discover')],
    ['modern tools/list', modern(16, 'tools/list')],
    ['modern tools/call tokens', modern(17, 'tools/call', { name: 'designesy_tokens_score', arguments: { dtcg_file: tokens } })],
    ['modern resources/read', modern(18, 'resources/read', { uri: 'ui://designesy/report-app' })],
    ['modern envelope missing capabilities', {
      body: { jsonrpc: '2.0', id: 19, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN } } },
      headers: { 'mcp-protocol-version': MODERN, 'mcp-method': 'tools/list' },
    }],
  ];
  const findings = [];
  let bytes = 0;
  for (const [name, request] of cases) {
    const got = await send(harness, request);
    const want = await send(reference, request);
    bytes += got.bytes.length;
    const diffs = [];
    if (got.status !== want.status) diffs.push(`status ${got.status}, reference ${want.status}`);
    if (JSON.stringify(got.headers) !== JSON.stringify(want.headers)) diffs.push(`headers ${JSON.stringify(got.headers)}, reference ${JSON.stringify(want.headers)}`);
    if (!got.bytes.equals(want.bytes)) diffs.push(`body differs (${got.bytes.length} vs ${want.bytes.length} bytes): ${short(got.text)}`);
    if (diffs.length) findings.push({ id: `valid-unchanged:${name}`, why: diffs.join('; ') });
  }
  const ref = AGAINST ? `the route in ${AGAINST}` : 'the rewrite switched off';
  return { findings, measured: `${cases.length - findings.length}/${cases.length} answers identical to ${ref}, ${bytes} bytes` };
}

/** The rewrite module of the tree under test, or a finding for `check` when it is not there. */
function rewriteModule(check) {
  // Checked first: the harness caches a module whose file is missing as empty.
  if (!fs.existsSync(path.join(APP, LIB))) return { finding: { id: `${check}:module`, why: `${LIB} is not in this tree` } };
  try {
    return { lib: harness.load(LIB) };
  } catch (e) {
    return { finding: { id: `${check}:module`, why: `${LIB} did not load: ${e && e.message ? e.message : e}` } };
  }
}

/** A Response whose body is these chunks, in order. */
function chunked(chunks, type) {
  return new Response(new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  }), { status: 200, headers: { 'content-type': type } });
}

/** The bytes cut into pieces of at most `size`. */
function pieces(bytes, size) {
  const out = [];
  for (let at = 0; at < bytes.length; at += size) out.push(bytes.subarray(at, at + size));
  return out;
}

/** A promise's value, or null when it has not settled within two seconds. */
const within = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), 2000))]);

/**
 * A reader of `body` whose waits are bounded. until(n) reads until n bytes in
 * all have come out, and is false when a read waits two seconds or the body
 * ends first; rest() reads to the end and returns every byte that came out.
 */
function patientReader(body) {
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  let pending = null; // a read that timed out still delivers its chunk later
  return {
    get size() {
      return size;
    },
    async until(n) {
      while (size < n) {
        pending = pending || reader.read();
        const r = await within(pending);
        if (!r) return false;
        pending = null;
        if (r.done) return false;
        chunks.push(Buffer.from(r.value));
        size += r.value.length;
      }
      return true;
    },
    async rest() {
      for (;;) {
        const r = await (pending || reader.read());
        pending = null;
        if (r.done) return Buffer.concat(chunks);
        chunks.push(Buffer.from(r.value));
        size += r.value.length;
      }
    },
  };
}

async function streamPassthrough() {
  const { lib, finding } = rewriteModule('stream-passthrough');
  if (!lib) return { findings: [finding] };
  const findings = [];
  const issues = (path, expected) => JSON.stringify([{ expected, code: 'invalid_type', path, message: `Invalid input: expected ${expected}, received undefined` }], null, 2);
  const result = 'event: message\ndata: {"result":{"content":[{"type":"text","text":"Grüße, 日本語, ✓ and an emoji 🎛"}]},"jsonrpc":"2.0","id":1}\n\n';
  // As the SDK answers today (-32603, the bare list), and as an open upstream
  // change would (-32602, the list behind "Invalid params for <method>: ").
  const failedJson = (id, code = -32603, label = '') => JSON.stringify({ jsonrpc: '2.0', id, error: { code, message: `${label}${issues(['params', 'clientInfo'], 'object')}` } });
  const failed = (id, code, label) => `event: message\ndata: ${failedJson(id, code, label)}\n\n`;
  // The same failed check with a member whose string holds a byte that is not UTF-8.
  const notUtf8Json = Buffer.concat([Buffer.from(`${failedJson(2).slice(0, -1)},"note":"`), Buffer.from([0xff]), Buffer.from('"}')]);
  const notUtf8 = Buffer.concat([Buffer.from('event: message\ndata: '), notUtf8Json, Buffer.from('\n\n')]);
  const rewritten = (id) => `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params for initialize: params.clientInfo is missing (expected object)' } })}\n\n`;
  const internal = 'event: message\ndata: {"jsonrpc":"2.0","id":3,"error":{"code":-32603,"message":"Internal error"}}\n\n';
  // A tool's result failing its schema is the server's fault, not the caller's: left alone.
  const resultCheck = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 4, error: { code: -32602, message: `Invalid tools/call result: ${issues(['content', 0, 'text'], 'string')}` } })}\n\n`;
  const requestBody = JSON.stringify([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 5, method: 'initialize', params: {} },
  ]);
  const enc = new TextEncoder();
  const run = async (bytes, splits) => {
    const chunks = [];
    let at = 0;
    for (const s of [...splits, bytes.length]) {
      chunks.push(bytes.slice(at, s));
      at = s;
    }
    const out = await lib.answerInvalidParams(chunked(chunks, 'text/event-stream'), requestBody);
    return Buffer.from(await out.arrayBuffer());
  };

  // Every single split point, then every 3 bytes, of a stream with no failed check.
  const clean = Buffer.from(enc.encode(result + internal + resultCheck));
  let cleanRuns = 0;
  const splitSets = [...Array.from({ length: clean.length - 1 }, (_, i) => [i + 1]), Array.from({ length: Math.floor((clean.length - 1) / 3) }, (_, i) => 3 * (i + 1))];
  for (const splits of splitSets) {
    const out = await run(clean, splits);
    cleanRuns += 1;
    if (!out.equals(clean)) {
      findings.push({ id: 'stream-passthrough:unchanged', why: `split at ${splits.slice(0, 5).join(',')}${splits.length > 5 ? ',...' : ''}: the bytes changed (${short(out.toString('utf8'))})` });
      break;
    }
  }

  // The same with failed checks inside, in both forms: only their lines change.
  const mixed = Buffer.from(enc.encode(result + failed(2) + internal + failed(5, -32602, 'Invalid params for initialize: ')));
  const expected = Buffer.from(enc.encode(result + rewritten(2) + internal + rewritten(5)));
  for (const splits of [[], [7], [result.length + 20], Array.from({ length: Math.floor((mixed.length - 1) / 5) }, (_, i) => 5 * (i + 1))]) {
    const out = await run(mixed, splits);
    if (!out.equals(expected)) {
      findings.push({ id: 'stream-passthrough:rewrite', why: `split at ${splits.slice(0, 5).join(',') || 'none'}: got ${short(out.toString('utf8'))}` });
      break;
    }
  }

  // A failed check's line keeps a CRLF ending, a last line that the stream ends
  // without its newline is still examined, and so is a data line without the
  // space after "data:". A failed check on a line of another field, or with a
  // byte that is not UTF-8, is not read as a data line's text: it passes
  // unchanged. (Each JSON payload is one line: JSON.stringify writes no raw
  // newline.)
  const lineForms = [
    ['crlf', failed(2).replace(/\n/g, '\r\n'), rewritten(2).replace(/\n/g, '\r\n')],
    ['unterminated', failed(2).replace(/\n+$/, ''), rewritten(2).replace(/\n+$/, '')],
    ['no-space', failed(2).replace('data: ', 'data:'), rewritten(2).replace('data: ', 'data:')],
    ['other-field', failed(2).replace('data: ', 'info: '), failed(2).replace('data: ', 'info: ')],
    ['not-utf8', notUtf8, notUtf8],
  ];
  for (const [name, input, output] of lineForms) {
    const bytes = Buffer.isBuffer(input) ? input : Buffer.from(enc.encode(input));
    const want = Buffer.isBuffer(output) ? output : Buffer.from(enc.encode(output));
    for (const splits of [[], Array.from({ length: Math.floor((bytes.length - 1) / 5) }, (_, i) => 5 * (i + 1))]) {
      const out = await run(bytes, splits);
      if (!out.equals(want)) {
        const tail = (b) => JSON.stringify(b.toString('utf8').slice(-40));
        findings.push({ id: `stream-passthrough:${name}`, why: `split at ${splits.slice(0, 5).join(',') || 'none'}: the stream ended ${tail(out)}, expected ${tail(want)}` });
        break;
      }
    }
  }

  // Each event leaves before the stream ends. The source holds its second event
  // until the first has come out; a rewrite that buffered would wait for ever,
  // so each wait is bounded.
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const held = new Response(new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(result));
      await gate;
      c.enqueue(enc.encode(internal));
      c.close();
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const answered = await within(lib.answerInvalidParams(held, requestBody));
  const reader = answered && answered.body ? answered.body.getReader() : null;
  const first = reader ? await within(reader.read()) : null;
  release();
  if (!first || first.done || Buffer.from(first.value).toString('utf8') !== result) {
    findings.push({ id: 'stream-passthrough:streaming', why: 'the first event did not come out before the stream ended: the stream was buffered' });
  } else {
    while (!(await reader.read()).done);
  }

  // A JSON answer without a failed check is handed back as it is, and so are a
  // failed check with a byte that is not UTF-8 and an answer with no body.
  const handBack = [
    ['json', '{"result":{},"jsonrpc":"2.0","id":1}', 'application/json', 'a JSON result'],
    ['json-not-utf8', notUtf8Json, 'application/json', 'a JSON failed check with a byte that is not UTF-8'],
    ['no-body', null, 'text/event-stream', 'an event-stream answer with no body'],
  ];
  for (const [name, body, type, what] of handBack) {
    const res = new Response(body, { status: body === null ? 202 : 200, headers: { 'content-type': type } });
    const back = await lib.answerInvalidParams(res, requestBody).catch((e) => ({ threw: e }));
    if (back !== res) {
      findings.push({ id: `stream-passthrough:${name}`, why: `${what} ${back && back.threw ? `threw: ${back.threw.message || back.threw}` : 'came back as a new Response, not the one passed in'}` });
    }
  }
  return { findings, measured: `${cleanRuns} chunkings of a ${clean.length}-byte stream` };
}

/** An issue list as the SDK writes one into a message: pretty-printed JSON. */
function issueList(issues) {
  return JSON.stringify(issues.map(([path, message = 'Invalid input: expected string, received number']) => ({ expected: 'string', code: 'invalid_type', path, message })), null, 2);
}

/** A JSON-RPC error answering request 7. */
const errorFrame = (code, message) => ({ jsonrpc: '2.0', id: 7, error: { code, message } });

/** The request body the module-level cases answer: request 7 is a tools/list. */
const TOOLS_LIST_7 = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: { cursor: 5 } });

/**
 * One payload through answerInvalidParams in each framing: the payload it
 * answers with, and every text JSON.parse was given. `linePayload`, when given,
 * is the event stream's data line text in place of `payload`.
 */
async function throughBothFramings(lib, payload, requestBody, linePayload = payload) {
  const enc = new TextEncoder();
  const parsed = [];
  const realParse = JSON.parse;
  JSON.parse = function parse(text, reviver) {
    parsed.push(String(text));
    return realParse.call(JSON, text, reviver);
  };
  try {
    const res = new Response(payload, { status: 200, headers: { 'content-type': 'application/json' } });
    const out = await lib.answerInvalidParams(res, requestBody);
    const json = out === res ? { same: true, payload } : { same: false, payload: await out.text() };
    const stream = await lib.answerInvalidParams(chunked([enc.encode(`event: message\ndata: ${linePayload}\n\n`)], 'text/event-stream'), requestBody);
    const text = Buffer.from(await stream.arrayBuffer()).toString('utf8');
    const line = /^event: message\ndata: (.*)\n\n$/s.exec(text);
    return { json, eventStream: line ? line[1] : `(not one event: ${short(text)})`, parsed };
  } finally {
    JSON.parse = realParse;
  }
}

async function detection() {
  const { lib, finding } = rewriteModule('detection');
  if (!lib) return { findings: [finding] };
  const findings = [];
  const list = issueList([[['params', 'cursor']]]);
  const want = 'Invalid params for tools/list: params.cursor: expected string, received number';
  const answered = (frame) => (Array.isArray(frame) ? frame.map((m) => (m.error ? answered(m) : m)) : { ...frame, error: { ...frame.error, code: -32602, message: want } });
  // The failed check meets all four conditions of mcp-invalid-params.ts, and
  // is rewritten alone and in a batch. Each other case differs from it in one
  // condition only, so it fails when that condition, or a detail of how the
  // module tests it, is dropped.
  const failedCheck = errorFrame(-32603, list);
  const beside = { jsonrpc: '2.0', id: 8, result: {} };
  const cases = [
    { name: 'failed-check', frame: failedCheck, rewritten: true },
    // In a batch, beside a result, a message's members sit one level deeper,
    // and every message of the batch is examined, not only the first.
    { name: 'batch', frame: [failedCheck, beside], rewritten: true },
    { name: 'batch-second', frame: [beside, failedCheck], rewritten: true },
    // Two failed checks in one batch: both are rewritten, not only the first.
    {
      name: 'batch-two-failed',
      frame: [failedCheck, { ...failedCheck, id: 8 }],
      requestBody: JSON.stringify([7, 8].map((id) => ({ jsonrpc: '2.0', id, method: 'tools/list', params: { cursor: 5 } }))),
      rewritten: true,
    },
    // 1: a member name written with an escape can read "error", so it is parsed
    // to be sure; here it does.
    { name: 'escaped-name', frame: failedCheck, text: JSON.stringify(failedCheck).replace('"error":', '"\\u0065rror":'), rewritten: true },
    // The error's other members, such as data, are kept.
    { name: 'error-data', frame: { ...failedCheck, error: { ...failedCheck.error, data: { kept: true } } }, rewritten: true },
    // Whitespace before a batch: its messages are still found one level in.
    // (An event-stream line holds no newline, so its whitespace is a space and a tab.)
    { name: 'leading-whitespace', frame: [failedCheck, beside], text: `\r\n\t ${JSON.stringify([failedCheck, beside])}`, line: ` \t${JSON.stringify([failedCheck, beside])}`, rewritten: true },
    // 1: a result whose content holds an error-shaped object. Never parsed either.
    { name: 'result', frame: { jsonrpc: '2.0', id: 7, result: { structuredContent: { error: { code: -32603, message: list } } } }, unparsed: true },
    // 1: results whose id, a string the client chose, reads as an "error" member
    // to a scan that ends a string at an escaped quote, or that takes a member's
    // value for its name. Never parsed either.
    { name: 'id-with-quotes', frame: { jsonrpc: '2.0', id: '","error', result: {} }, unparsed: true },
    { name: 'id-error', frame: { jsonrpc: '2.0', id: 'error', result: {} }, unparsed: true },
    // 2: the same list under another error code.
    { name: 'other-code', frame: errorFrame(-32600, list) },
    // 3: the same list behind text that is not a request label, or behind the
    // label of a failed result check; and an empty list, which names no issue.
    { name: 'other-label', frame: errorFrame(-32603, `Upstream answered 400: ${list}`) },
    { name: 'result-label', frame: errorFrame(-32603, `Invalid tools/call result: ${list}`) },
    // A request label counts only as the whole text before the list: not after
    // other text, nor with more text after it.
    { name: 'label-not-at-start', frame: errorFrame(-32603, `Upstream said: Invalid tools/list request: ${list}`) },
    { name: 'label-then-text', frame: errorFrame(-32603, `Invalid tools/list request: see below ${list}`) },
    { name: 'empty-list', frame: errorFrame(-32603, '[]') },
    // 4: an issue outside params, alone or beside one under params.
    { name: 'outside-params', frame: errorFrame(-32603, issueList([[['cursor']]])) },
    { name: 'partly-outside-params', frame: errorFrame(-32603, issueList([[['params', 'cursor']], [['result', 'tools']]])) },
  ];
  for (const c of cases) {
    const payload = c.text || JSON.stringify(c.frame);
    const expected = c.rewritten ? JSON.stringify(answered(c.frame)) : payload;
    const got = await throughBothFramings(lib, payload, c.requestBody || TOOLS_LIST_7, c.line);
    const what = c.rewritten ? `rewritten to ${expected}` : 'unchanged';
    if (got.json.payload !== expected || (!c.rewritten && !got.json.same)) {
      findings.push({ id: `detection:${c.name}:json`, why: `expected ${what}${c.rewritten ? '' : ' (the same Response)'}, got ${short(got.json.payload)}` });
    }
    if (got.eventStream !== expected) findings.push({ id: `detection:${c.name}:event-stream`, why: `expected ${what}, got ${short(got.eventStream)}` });
    if (c.unparsed && got.parsed.length) findings.push({ id: `detection:${c.name}:parsed`, why: `a result was parsed: JSON.parse ran ${got.parsed.length} time(s), on ${short(got.parsed[0])}` });
  }
  const answers = cases.length * 2;
  const wrong = new Set(findings.filter((f) => !f.id.endsWith(':parsed')).map((f) => f.id)).size;
  const rewritten = cases.filter((c) => c.rewritten).length;
  const unparsed = cases.filter((c) => c.unparsed).length;

  // A rewritten answer keeps its status and headers. Its body's length changed,
  // so a content-length it carries, if any, must be the new body's. (Each
  // content type is written in mixed case, which names the same type.)
  let kept = 0;
  for (const [framing, type, body] of [['json', 'Application/JSON; charset=utf-8', JSON.stringify(failedCheck)], ['event-stream', 'Text/Event-Stream', `event: message\ndata: ${JSON.stringify(failedCheck)}\n\n`]]) {
    const res = new Response(body, { status: 202, statusText: 'Accepted', headers: { 'content-type': type, 'content-length': String(Buffer.byteLength(body)), 'x-kept': 'yes' } });
    const out = await lib.answerInvalidParams(res, TOOLS_LIST_7);
    const bytes = Buffer.from(await out.arrayBuffer());
    const length = out.headers.get('content-length');
    const problems = [];
    if (!bytes.toString('utf8').includes('"code":-32602')) problems.push('the failed check was not rewritten');
    if (out.status !== 202 || out.statusText !== 'Accepted') problems.push(`status ${out.status} ${out.statusText}, not 202 Accepted`);
    if (out.headers.get('content-type') !== type || out.headers.get('x-kept') !== 'yes') problems.push(`headers ${JSON.stringify([...out.headers])}`);
    if (length !== null && Number(length) !== bytes.length) problems.push(`content-length ${length} on a ${bytes.length}-byte body`);
    if (problems.length) findings.push({ id: `detection:headers:${framing}`, why: problems.join('; ') });
    else kept += 1;
  }
  return {
    findings,
    measured: `${answers - wrong}/${answers} answers as expected: ${rewritten} failed checks rewritten, in both framings; ${cases.length - rewritten} near misses unchanged; ${unparsed} results never parsed; status and headers kept in ${kept}/2 framings`,
  };
}

/** The error message in a JSON-RPC payload, or the payload itself when it has none. */
function messageIn(payload) {
  try {
    return JSON.parse(payload).error.message;
  } catch {
    return payload;
  }
}

async function messageText() {
  const { lib, finding } = rewriteModule('message-text');
  if (!lib) return { findings: [finding] };
  const findings = [];
  // One issue as the schema library writes it, for a tools/call request 7.
  const one = (issue) => JSON.stringify([issue], null, 2);
  const toolsCall = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'designesy_contract', arguments: 'motion' } });
  const missing = (extra) => one({ code: 'invalid_type', expected: 'string', path: ['params', 'name'], message: 'Invalid input: expected string, received undefined', ...extra });
  // Control characters a key can hold, each written as \u and four hex digits,
  // between characters that are kept as they are (space, ~, no-break space).
  const controls = [0x00, 0x1f, 0x7f, 0x85, 0x9f, 0x2028, 0x2029, 0x0a];
  const plainChars = [0x20, 0x7e, 0xa0];
  const escaped = (c) => `\\u${c.toString(16).padStart(4, '0')}`;
  const keyWith = [...controls, ...plainChars].map((c) => String.fromCharCode(c)).join('');
  const keyShown = [...controls.map(escaped), ...plainChars.map((c) => String.fromCharCode(c))].join('');
  const cases = [
    // The client writes the method, so it is named only when it looks like one.
    {
      name: 'method-name',
      list: issueList([[['params', 'cursor']]]),
      requestBody: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list: params.cursor is fine', params: { cursor: 5 } }),
      want: 'Invalid params: params.cursor: expected string, received number',
    },
    // A method name is at most 64 characters: only the length differs here.
    {
      name: 'method-name-64',
      list: issueList([[['params', 'cursor']]]),
      requestBody: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'm'.repeat(64), params: { cursor: 5 } }),
      want: `Invalid params for ${'m'.repeat(64)}: params.cursor: expected string, received number`,
    },
    {
      name: 'method-name-65',
      list: issueList([[['params', 'cursor']]]),
      requestBody: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'm'.repeat(65), params: { cursor: 5 } }),
      want: 'Invalid params: params.cursor: expected string, received number',
    },
    // A missing field, in the schema library's own words: "received undefined"
    // ends the message of an invalid_type issue that names the expected type.
    { name: 'missing', list: missing(), requestBody: toolsCall, want: 'Invalid params for tools/call: params.name is missing (expected string)' },
    // Any other message keeps its words, after "Invalid input: ".
    { name: 'missing-not-at-end', list: missing({ message: 'Invalid input: expected string, received undefined or a symbol' }), requestBody: toolsCall, want: 'Invalid params for tools/call: params.name: expected string, received undefined or a symbol' },
    { name: 'missing-other-code', list: missing({ code: 'custom' }), requestBody: toolsCall, want: 'Invalid params for tools/call: params.name: expected string, received undefined' },
    { name: 'missing-no-expected', list: missing({ expected: undefined }), requestBody: toolsCall, want: 'Invalid params for tools/call: params.name: expected string, received undefined' },
    // The schema library calls a JSON object with string keys a record.
    {
      name: 'record',
      list: one({ code: 'invalid_type', expected: 'record', path: ['params', 'arguments'], message: 'Invalid input: expected record, received string' }),
      requestBody: toolsCall,
      want: 'Invalid params for tools/call: params.arguments: expected object, received string',
    },
    {
      name: 'missing-record',
      list: one({ code: 'invalid_type', expected: 'record', path: ['params', 'arguments'], message: 'Invalid input: expected record, received undefined' }),
      requestBody: toolsCall,
      want: 'Invalid params for tools/call: params.arguments is missing (expected object)',
    },
    // A union that matched no member says only "Invalid input".
    { name: 'invalid', list: one({ code: 'invalid_union', errors: [], path: ['params', 'cursor'], message: 'Invalid input' }), want: 'Invalid params for tools/list: params.cursor is invalid' },
    // Each control character in a key is written as an escape: the message stays on one line.
    { name: 'control-characters', list: issueList([[['params', `a${keyWith}b`]]]), want: `Invalid params for tools/list: params.a${keyShown}b: expected string, received number` },
    // A path can carry a key the client chose: each issue is cut to 160
    // characters, the ellipsis included.
    { name: 'issue-cut', list: issueList([[['params', 'k'.repeat(200)]]]), want: `Invalid params for tools/list: params.${'k'.repeat(152)}…` },
    // The bound itself: an issue of exactly 160 characters is kept whole, and
    // one of 161 is cut to 159 and the ellipsis.
    { name: 'issue-160', list: issueList([[['params', 'k'.repeat(119)]]]), want: `Invalid params for tools/list: params.${'k'.repeat(119)}: expected string, received number` },
    { name: 'issue-161', list: issueList([[['params', 'k'.repeat(120)]]]), want: `Invalid params for tools/list: params.${'k'.repeat(120)}: expected string, received numb…` },
    // Never inside a character: here the issue's 159th UTF-16 unit, the last
    // one a cut keeps, is the first of the two that make up U+1F39B, so the
    // whole character goes.
    { name: 'issue-cut-surrogate', list: issueList([[['params', `${'k'.repeat(151)}\u{1F39B}${'k'.repeat(40)}`]]]), want: `Invalid params for tools/list: params.${'k'.repeat(151)}…` },
    // Here U+1F39B's two units are the 158th and 159th, the last two a cut
    // keeps: the character is kept whole.
    { name: 'issue-cut-surrogate-whole', list: issueList([[['params', `${'k'.repeat(150)}\u{1F39B}${'k'.repeat(40)}`]]]), want: `Invalid params for tools/list: params.${'k'.repeat(150)}\u{1F39B}…` },
    // Nor inside an escape: here the six units of a newline's escape are the
    // 155th to 160th, so the cut would keep five of them and the escape goes;
    // one unit earlier, they end at the 159th and the escape is kept whole.
    { name: 'issue-cut-escape', list: issueList([[['params', `${'k'.repeat(147)}\n${'k'.repeat(40)}`]]]), want: `Invalid params for tools/list: params.${'k'.repeat(147)}…` },
    { name: 'issue-cut-escape-whole', list: issueList([[['params', `${'k'.repeat(146)}\n${'k'.repeat(40)}`]]]), want: `Invalid params for tools/list: params.${'k'.repeat(146)}${escaped(0x0a)}…` },
    // With an earlier escape in the text too, the one the cut would split is
    // still the one dropped: the 18th to 23rd units are kept, the 155th to
    // 160th go.
    {
      name: 'issue-cut-second-escape',
      list: issueList([[['params', `${'k'.repeat(10)}\n${'k'.repeat(131)}\n${'k'.repeat(40)}`]]]),
      want: `Invalid params for tools/list: params.${'k'.repeat(10)}${escaped(0x0a)}${'k'.repeat(131)}…`,
    },
  ];
  for (const c of cases) {
    const frame = errorFrame(-32603, c.list);
    const expected = JSON.stringify({ ...frame, error: { code: -32602, message: c.want } });
    const got = await throughBothFramings(lib, JSON.stringify(frame), c.requestBody || TOOLS_LIST_7);
    for (const [framing, payload] of [['json', got.json.payload], ['event-stream', got.eventStream]]) {
      if (payload !== expected) findings.push({ id: `message-text:${c.name}:${framing}`, why: `expected the message ${JSON.stringify(c.want)}, got ${JSON.stringify(messageIn(payload))}` });
    }
  }
  const answers = cases.length * 2;
  return {
    findings,
    measured: `${answers - findings.length}/${answers} messages as expected: the method named only when it looks like one, each kind of issue worded as stated, control characters escaped, each issue cut to 160 characters, never inside a character or an escape`,
  };
}

// Built on first use: the route with its rewrite switched off.
let rewriteOff;
const routeWithoutRewrite = () => {
  if (!rewriteOff) rewriteOff = routeHarness(APP, { [LIB]: (real) => ({ ...real, answerInvalidParams: async (response) => response }) });
  return rewriteOff;
};

async function frameBound() {
  const findings = [];
  const notes = [];

  // Through the real route and SDK: 2,000 issues, one per number in clientInfo.icons.
  const icons = Array.from({ length: 2000 }, () => 5);
  const request = legacy(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { ...CLIENT, icons } });
  const answer = await send(harness, request);
  const problems = invalidParamsProblems(answer, 'initialize', 'params.clientInfo.icons[0]');
  if (!problems.length) {
    const m = messages(answer)[0].error.message;
    if (!m.endsWith('; and 1997 more')) problems.push(`the message does not end "; and 1997 more": ${JSON.stringify(m)}`);
  }
  if (problems.length) findings.push({ id: 'frame-bound:2000-issues', why: problems.join('; ') });
  if (fs.existsSync(path.join(APP, LIB))) {
    const raw = await send(routeWithoutRewrite(), request);
    notes.push(`2,000 issues: ${raw.bytes.length} bytes without the rewrite, ${answer.bytes.length} with it`);
  } else {
    notes.push(`2,000 issues: ${answer.bytes.length} bytes`);
  }

  const { lib, finding } = rewriteModule('frame-bound');
  if (!lib) return { findings: [...findings, finding], measured: notes.join('; ') };
  const enc = new TextEncoder();

  // A failed check padded to an exact size: three issues named, a fourth counted
  // whose message carries the padding (ASCII, so one byte per character).
  const named = [[['params', 'a']], [['params', 'b']], [['params', 'c']]];
  const padded = (pad) => errorFrame(-32603, issueList([...named, [['params', 'pad'], 'x'.repeat(pad)]]));
  const sized = (bytes, wrap) => padded(bytes - Buffer.byteLength(wrap(JSON.stringify(padded(0)))));
  const rewrittenFrame = (frame) => JSON.stringify({ ...frame, error: { ...frame.error, code: -32602, message: 'Invalid params for tools/list: params.a: expected string, received number; params.b: expected string, received number; params.c: expected string, received number; and 1 more' } });
  const KIB64 = 64 * 1024;

  // A JSON body of exactly the bound is rewritten; one byte more is handed back
  // as it is, and before its end arrives: reading stops at the bound.
  {
    const frame = sized(FRAME_BOUND, (p) => p);
    const body = enc.encode(JSON.stringify(frame));
    const out = await lib.answerInvalidParams(chunked(pieces(body, KIB64), 'application/json'), TOOLS_LIST_7);
    const text = await out.text();
    if (text !== rewrittenFrame(frame)) findings.push({ id: 'frame-bound:json-at-bound', why: `a ${body.length}-byte failed check was not rewritten: ${short(text)}` });

    const over = enc.encode(JSON.stringify(sized(FRAME_BOUND + 1, (p) => p)));
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const res = new Response(new ReadableStream({
      async start(c) {
        for (const p of pieces(over.subarray(0, over.length - 1), KIB64)) c.enqueue(p);
        c.enqueue(over.subarray(over.length - 1));
        await gate;
        c.enqueue(enc.encode(' '));
        c.close();
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const back = await within(lib.answerInvalidParams(res, TOOLS_LIST_7));
    release();
    if (back !== res) findings.push({ id: 'frame-bound:json-over-bound', why: back ? 'a JSON body one byte over the bound came back as a new Response, not the one passed in' : 'a JSON body over the bound was read on past the bound: no answer before the rest arrived' });
    if (back) await back.arrayBuffer();

    // Nor is the body kept whole: the copy that was read is cancelled once it
    // passes the bound. The copy and the answer share one source, which is
    // cancelled only when both are, so cancelling the answer must cancel the
    // source. A copy left open would keep every later chunk of the body.
    let cancelled = false;
    const open = new Response(new ReadableStream({
      start(c) {
        for (const p of pieces(over, KIB64)) c.enqueue(p);
      },
      cancel() {
        cancelled = true;
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const kept = await within(lib.answerInvalidParams(open, TOOLS_LIST_7));
    if (kept === open) {
      await within(open.body.cancel().catch(() => {}));
      if (!cancelled) findings.push({ id: 'frame-bound:json-over-bound-copy', why: 'cancelling a JSON answer over the bound did not cancel its source: the copy read for the rewrite was left open, keeping the rest of the body' });
    }
  }

  // An event-stream line of exactly the bound (newline included) is rewritten
  // across chunks; one byte more passes unchanged.
  {
    const frame = sized(FRAME_BOUND, (p) => `data: ${p}\n`);
    const stream = enc.encode(`event: message\ndata: ${JSON.stringify(frame)}\n\n`);
    const out = await lib.answerInvalidParams(chunked(pieces(stream, KIB64), 'text/event-stream'), TOOLS_LIST_7);
    const text = Buffer.from(await out.arrayBuffer()).toString('utf8');
    if (text !== `event: message\ndata: ${rewrittenFrame(frame)}\n\n`) findings.push({ id: 'frame-bound:event-stream-at-bound', why: `a ${FRAME_BOUND}-byte line was not rewritten: ${short(text)}` });

    const over = enc.encode(`event: message\ndata: ${JSON.stringify(sized(FRAME_BOUND + 1, (p) => `data: ${p}\n`))}\n\n`);
    const back = Buffer.from(await (await lib.answerInvalidParams(chunked(pieces(over, KIB64), 'text/event-stream'), TOOLS_LIST_7)).arrayBuffer());
    if (!back.equals(Buffer.from(over))) findings.push({ id: 'frame-bound:event-stream-over-bound', why: `a line one byte over the bound changed: ${short(back.toString('utf8'))}` });
  }

  // A line that passes the bound goes out before its newline arrives. The
  // source sends the event line and the line's first FRAME_BOUND + 1 bytes, in
  // two chunks, then waits; each read is bounded.
  {
    const line = enc.encode(`data: ${JSON.stringify(sized(FRAME_BOUND + 1001, (p) => `data: ${p}\n`))}\n`);
    const event = enc.encode('event: message\n');
    const first = Buffer.concat([event, line.subarray(0, FRAME_BOUND - 999)]);
    const second = line.subarray(FRAME_BOUND - 999, FRAME_BOUND + 1);
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const res = new Response(new ReadableStream({
      async start(c) {
        c.enqueue(first);
        c.enqueue(second);
        await gate;
        c.enqueue(line.subarray(FRAME_BOUND + 1));
        c.enqueue(enc.encode('\n'));
        c.close();
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const out = await within(lib.answerInvalidParams(res, TOOLS_LIST_7));
    const reader = out && out.body ? patientReader(out.body) : null;
    const early = event.length + FRAME_BOUND + 1;
    const sentOn = reader ? await reader.until(early) : false;
    release();
    if (!sentOn) {
      findings.push({ id: 'frame-bound:held-line', why: `${reader ? reader.size : 0} of the first ${early} bytes came out before the line's newline arrived: a line longer than the bound was held` });
    }
    if (reader) {
      const all = await reader.rest();
      const sent = Buffer.concat([event, line, enc.encode('\n')]);
      if (!all.equals(sent)) findings.push({ id: 'frame-bound:held-line-bytes', why: `the ${sent.length}-byte stream came out as ${all.length} different bytes` });
    }
  }

  // After a line passes the bound, the rest of it goes out as it arrives, and
  // the next line is examined again. The source sends a result line longer than
  // the bound in 64 KiB chunks, the bound falling inside the last of them, and
  // waits; then three more chunks of that line, one at a time, each only after
  // the one before has come out; then the rest of it and an event whose line is
  // a failed check. Each read is bounded.
  {
    const result = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'x'.repeat(FRAME_BOUND + 8 * KIB64) }] } };
    const failed = errorFrame(-32603, issueList([[['params', 'cursor']]]));
    const answered = { ...failed, error: { code: -32602, message: 'Invalid params for tools/list: params.cursor: expected string, received number' } };
    const stream = (second) => Buffer.from(enc.encode(`event: message\ndata: ${JSON.stringify(result)}\n\nevent: message\ndata: ${JSON.stringify(second)}\n\n`));
    const sent = stream(failed);
    const passes = 'event: message\n'.length + FRAME_BOUND; // the line's first byte over the bound
    const crossed = (Math.floor(passes / KIB64) + 1) * KIB64; // the end of the chunk it falls in
    const steps = [1, 2, 3].map((k) => crossed + k * KIB64); // the ends of the next three chunks, still inside the line
    const releases = [];
    // One gate before each of the three chunks, and one before the rest.
    const gates = [...steps, sent.length].map(() => new Promise((r) => releases.push(r)));
    const res = new Response(new ReadableStream({
      async start(c) {
        for (const p of pieces(sent.subarray(0, crossed), KIB64)) c.enqueue(p);
        let at = crossed;
        for (let k = 0; k < steps.length; k++) {
          await gates[k];
          c.enqueue(sent.subarray(at, steps[k]));
          at = steps[k];
        }
        await gates[steps.length];
        c.enqueue(sent.subarray(at));
        c.close();
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const out = await within(lib.answerInvalidParams(res, TOOLS_LIST_7));
    const reader = out && out.body ? patientReader(out.body) : null;
    // The chunk that was held: 0 is the one the bound falls in, k the k-th after it.
    let held = reader && (await reader.until(crossed)) ? -1 : 0;
    for (let k = 0; k < steps.length; k++) {
      releases[k]();
      if (held < 0 && !(await reader.until(steps[k]))) held = k + 1;
    }
    const before = reader ? reader.size : 0;
    releases[steps.length]();
    if (held >= 0) {
      const what = held === 0 ? 'the chunk the bound falls in' : `chunk ${held} of the ${steps.length} sent after the bound, each only after the one before came out,`;
      findings.push({ id: 'frame-bound:after-bound-held', why: `${before} bytes came out before the rest of the line was sent: ${what} was held, though the line had passed the bound` });
    }
    if (reader) {
      const all = await reader.rest();
      const want = stream(answered);
      const last = all.toString('utf8').split('\n').filter((l) => l.startsWith('data:')).pop() || '';
      if (!all.equals(want)) findings.push({ id: 'frame-bound:after-bound-next-line', why: `the ${want.length}-byte answer came out as ${all.length} different bytes; its last data line: ${short(last)}` });
    }
  }

  if (!findings.length) {
    notes.push(
      `at ${FRAME_BOUND} bytes rewritten and at ${FRAME_BOUND + 1} unchanged, in both framings`,
      'a longer JSON body handed back before its end arrived, its copy cancelled',
      'a longer line sent on before its newline arrived',
      'after a longer result line, each of 3 later chunks of it sent on before the next was sent, and the failed check on the next line rewritten',
    );
  }
  return { findings, measured: notes.join('; ') };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CHECKS = [
  ['initialize-clientInfo', initializeClientInfo],
  ['invalid-params', invalidParams],
  ['tool-arguments', toolArguments],
  ['modern-clientInfo-optional', modernClientInfoOptional],
  ['valid-unchanged', validUnchanged],
  ['stream-passthrough', streamPassthrough],
  ['detection', detection],
  ['message-text', messageText],
  ['frame-bound', frameBound],
];

async function main() {
  const asJson = argv.includes('--json');
  try {
    require.resolve('typescript', { paths: [APP, __dirname] });
  } catch (e) {
    if (process.env.VERCEL === '1') {
      console.log(`mcp-protocol-errors: [NOT EVALUATED] typescript is not installed in this Vercel build (${e.code || e.message})`);
      process.exit(0);
    }
    console.error(`mcp-protocol-errors: typescript could not be loaded from ${APP}; install apps/site's dev dependencies (npm ci).`);
    process.exit(1);
  }

  harness = routeHarness(APP);
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
      const verdict = r.findings.length ? 'FAIL' : r.skipped ? 'SKIP' : 'OK  ';
      const note = r.findings.length === 0 && r.skipped ? r.skipped : r.measured;
      console.log(`mcp-protocol-errors: ${verdict} ${r.name}${note ? ` (${note})` : ''}`);
      for (const f of r.findings) console.log(`    [${f.id}] ${f.why}`);
    }
    const skipped = results.filter((r) => r.skipped && r.findings.length === 0).length;
    const notApplicable = skipped ? `, ${skipped} not applicable` : '';
    console.log(findings.length === 0
      ? `mcp-protocol-errors: OK, ${CHECKS.length - skipped} check(s) hold${notApplicable}`
      : `mcp-protocol-errors: ${findings.length} finding(s)${notApplicable}`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

// main() ends in process.exit. Node also exits, with code 0, when nothing is
// left to wait on, so a check stuck on a promise that never settles would end
// the run silently and pass. That run fails instead.
process.on('beforeExit', () => {
  // stderr directly: a stuck send() still has console.error silenced.
  process.stderr.write('mcp-protocol-errors: a check never finished (a promise that never settles); failing\n');
  process.exit(1);
});

main().catch((e) => {
  console.error(`mcp-protocol-errors: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
