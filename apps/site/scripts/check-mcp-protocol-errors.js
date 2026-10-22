#!/usr/bin/env node
/**
 * mcp-protocol-errors gate — a request whose params fail the MCP schema is
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
 *                          params, initialize with no params or a clientInfo without
 *                          a version, tools/call without a name or with arguments
 *                          that are not an object, in both framings: -32602, one
 *                          line, the method and the field named, no issue list
 *   tool-arguments         a tools/call whose arguments fail the tool's input schema
 *                          is still a tool result with isError: true naming the
 *                          argument (the tools page lists "Input validation errors"
 *                          under tool execution errors)
 *   modern-clientInfo-optional  2026-07-28 server/discover and tools/list without
 *                          io.modelcontextprotocol/clientInfo get a result
 *   valid-unchanged        valid requests and ordinary errors answer, byte for
 *                          byte, what they answer with the rewrite switched off:
 *                          status, headers and body
 *   stream-passthrough     answerInvalidParams hands an event stream on unchanged
 *                          when it holds no failed check, however it is chunked (a
 *                          split inside a line or inside a UTF-8 character),
 *                          rewrites only a failed check's line, leaves a failed
 *                          result check alone, and sends each event before the
 *                          stream ends
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
// A message this long is not "short"; the longest one this gate provokes is under 100.
const MAX_MESSAGE = 300;

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
  if (/\n|"path"|"code"/.test(m)) problems.push(`the message is the raw issue list: ${JSON.stringify(short(m))}`);
  else {
    if (!m.startsWith(`Invalid params for ${method}: `)) problems.push(`the message does not start "Invalid params for ${method}: ": ${JSON.stringify(m)}`);
    if (!m.includes(field)) problems.push(`the message does not name ${field}: ${JSON.stringify(m)}`);
    if (m.length > MAX_MESSAGE) problems.push(`the message runs to ${m.length} characters`);
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

async function modernClientInfoOptional() {
  const findings = [];
  const registry = harness.load('app/lib/mcp-tool-registry.ts');
  const discover = await send(harness, modern(1, 'server/discover', {}, { clientInfo: false }));
  const d = discover.status === 200 && messages(discover)[0];
  if (!d || !d.result || !Array.isArray(d.result.supportedVersions) || !d.result.supportedVersions.includes(MODERN)) {
    findings.push({ id: 'modern-clientInfo-optional:server-discover', why: `server/discover without clientInfo answered HTTP ${discover.status}: ${short(discover.text)}` });
  }
  const list = await send(harness, modern(2, 'tools/list', {}, { clientInfo: false }));
  const l = list.status === 200 && messages(list)[0];
  const count = l && l.result && Array.isArray(l.result.tools) ? l.result.tools.length : -1;
  if (count !== registry.MCP_TOOL_NAMES.length) {
    findings.push({ id: 'modern-clientInfo-optional:tools-list', why: `tools/list without clientInfo answered HTTP ${list.status} with ${count} tool(s), expected ${registry.MCP_TOOL_NAMES.length}: ${short(list.text)}` });
  }
  return { findings, measured: findings.length ? undefined : `server/discover and tools/list (${count} tools) answered without clientInfo` };
}

async function validUnchanged() {
  // The reference: another checkout's route, or this one with the rewrite switched off.
  const reference = AGAINST
    ? routeHarness(AGAINST)
    : routeHarness(APP, { [LIB]: (real) => ({ ...real, answerInvalidParams: async (response) => response }) });
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

async function streamPassthrough() {
  let lib;
  try {
    lib = harness.load(LIB);
  } catch (e) {
    return { findings: [{ id: 'stream-passthrough:module', why: `${LIB} did not load: ${e && e.message ? e.message : e}` }] };
  }
  const findings = [];
  const issues = (path, expected) => JSON.stringify([{ expected, code: 'invalid_type', path, message: `Invalid input: expected ${expected}, received undefined` }], null, 2);
  const result = 'event: message\ndata: {"result":{"content":[{"type":"text","text":"Grüße, 日本語, ✓ and an emoji 🎛"}]},"jsonrpc":"2.0","id":1}\n\n';
  const failed = (id) => `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: issues(['params', 'clientInfo'], 'object') } })}\n\n`;
  const rewritten = (id) => `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params for initialize: params.clientInfo is missing (expected object)' } })}\n\n`;
  const internal = 'event: message\ndata: {"jsonrpc":"2.0","id":3,"error":{"code":-32603,"message":"Internal error"}}\n\n';
  // A tool's result failing its schema is the server's fault, not the caller's: left alone.
  const resultCheck = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 4, error: { code: -32602, message: `Invalid tools/call result: ${issues(['content', 0, 'text'], 'string')}` } })}\n\n`;
  const requestBody = JSON.stringify([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} },
  ]);
  const enc = new TextEncoder();
  const sse = (chunks) => new Response(new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const run = async (bytes, splits) => {
    const chunks = [];
    let at = 0;
    for (const s of [...splits, bytes.length]) {
      chunks.push(bytes.slice(at, s));
      at = s;
    }
    const out = await lib.answerInvalidParams(sse(chunks), requestBody);
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

  // The same with one failed check inside: only its line changes.
  const mixed = Buffer.from(enc.encode(result + failed(2) + internal));
  const expected = Buffer.from(enc.encode(result + rewritten(2) + internal));
  for (const splits of [[], [7], [result.length + 20], Array.from({ length: Math.floor((mixed.length - 1) / 5) }, (_, i) => 5 * (i + 1))]) {
    const out = await run(mixed, splits);
    if (!out.equals(expected)) {
      findings.push({ id: 'stream-passthrough:rewrite', why: `split at ${splits.slice(0, 5).join(',') || 'none'}: got ${short(out.toString('utf8'))}` });
      break;
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
  const within = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), 2000))]);
  const answered = await within(lib.answerInvalidParams(held, requestBody));
  const reader = answered && answered.body ? answered.body.getReader() : null;
  const first = reader ? await within(reader.read()) : null;
  release();
  if (!first || first.done || Buffer.from(first.value).toString('utf8') !== result) {
    findings.push({ id: 'stream-passthrough:streaming', why: 'the first event did not come out before the stream ended: the stream was buffered' });
  } else {
    while (!(await reader.read()).done);
  }

  // A JSON answer without a failed check is handed back as it is.
  const json = new Response('{"result":{},"jsonrpc":"2.0","id":1}', { status: 200, headers: { 'content-type': 'application/json' } });
  if ((await lib.answerInvalidParams(json, requestBody)) !== json) {
    findings.push({ id: 'stream-passthrough:json', why: 'a JSON result came back as a new Response, not the one passed in' });
  }
  return { findings, measured: `${cleanRuns} chunkings of a ${clean.length}-byte stream` };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CHECKS = [
  ['initialize-clientInfo', initializeClientInfo],
  ['invalid-params', invalidParams],
  ['tool-arguments', toolArguments],
  ['modern-clientInfo-optional', modernClientInfoOptional],
  ['valid-unchanged', validUnchanged],
  ['stream-passthrough', streamPassthrough],
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
      const verdict = r.findings.length === 0 ? 'OK  ' : 'FAIL';
      console.log(`mcp-protocol-errors: ${verdict} ${r.name}${r.measured ? ` (${r.measured})` : ''}`);
      for (const f of r.findings) console.log(`    [${f.id}] ${f.why}`);
    }
    console.log(findings.length === 0 ? `mcp-protocol-errors: OK, ${CHECKS.length} check(s) hold` : `mcp-protocol-errors: ${findings.length} finding(s)`);
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
