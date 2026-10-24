#!/usr/bin/env node
/**
 * Fetch bounds: url-guard's safeFetch stops reading a response body at the
 * cap its caller names while the body is still arriving, a caller's signal
 * ends a read at its deadline however slowly the server sends and keeps no
 * listener once the read settles, a reader's chunk holds only the bytes
 * returned, and the MCP tools that read a URL through url-guard still read
 * one that answers.
 *
 * WHY THIS EXISTS
 * safeFetch holds a body in memory whole before it returns. With maxBodyBytes
 * it holds at most cap + 1 bytes, and check-fetch-layer.mjs checks that
 * length, but a length alone cannot show that the read stopped as the cap was
 * reached rather than once the whole body had arrived. The transport's own
 * 15 s timeout is a socket idle timeout, set only when the caller passes no
 * signal, so a server that sends one byte a second and never stops never
 * trips it: read with no cap, that body ends at the caller's signal or not at
 * all. Each hop of a read adds an abort listener to the caller's signal, and
 * it stayed there once the read settled. A signal can outlive the read: Node
 * keeps an AbortSignal.timeout that has a listener alive until its timer
 * fires, and the listener kept the read's request and the body it read
 * reachable until then. The Response is built from the bytes Buffer.concat
 * joins. Handed to a reader uncopied, a body under 4 KiB would sit in Node's
 * shared 8 KiB pool, whose buffer also holds other reads' bytes.
 *
 * HOW IT MEASURES
 * The real URL guard and the real MCP route, loaded through
 * scripts/lib/route-harness.js with realSafeFetch. As in
 * check-score-read-bounds.mjs, two things are swapped, both below the guard:
 * node:dns/promises answers a public address, and node:http(s) connect to a
 * server on 127.0.0.1 that this script runs. The connect wrapper also counts
 * the body bytes that reach the client and keeps the request, so a case can
 * say how far a body got and whether the request was destroyed.
 * getEventListeners (node:events) counts the abort listeners left on a
 * signal. The MCP route is loaded before the first case starts, so no case's
 * time includes its load. The cases run concurrently, each on its own host
 * names; the last one runs once the others have settled.
 *
 * WHAT IT ASSERTS
 *   - A 10 MiB body read with maxBodyBytes 1 MiB resolves with exactly its
 *     first 1 MiB + 1 bytes (the byte past the cap says the body went past
 *     it); at most one socket read past the cap reached the client, the
 *     request was destroyed, nothing more arrived after it, and the server
 *     never finished sending.
 *   - A body of exactly maxBodyBytes comes back whole, with no byte past the
 *     cap, and cutByBudget says no budget cut it. An ordinary page read with
 *     no cap comes back whole.
 *   - The chunk a reader gets (for a 9 byte body, a 2 MiB body read with
 *     maxBodyBytes 100, and a 1 MiB body) sits in a buffer that holds exactly
 *     the bytes returned, with none of the body of a read made just before
 *     it. How much comes back is the cap cases' to check.
 *   - A read leaves no abort listener on the caller's signal once it
 *     settles, and settles as its label says: whole, cut at maxBodyBytes,
 *     after a redirect, failed (the server closes the connection), at a 999
 *     status, as a gzip body, as a corrupt gzip body, and cut by a shared
 *     budget. Between them they reach every place the transport settles a
 *     read other than an abort.
 *   - A server that sends one byte a second is ended by the caller's 3 s
 *     signal at its deadline, with an AbortError, and the request is
 *     destroyed.
 *   - designesy_tokens_score still reads a token file that answers, and
 *     designesy_llms_full_txt (cachedFetch) a document that answers.
 *   - Last: nothing was thrown during the run where no caller could catch it
 *     (an uncaught exception or an unhandled rejection).
 *
 * PROVING IT CAN FAIL
 * --app <dir> runs the gate against another apps/site directory. Against a
 * source snapshot of main from before engine 1.5.4, which has no
 * maxBodyBytes, the 10 MiB body comes back whole and the exact-size case
 * finds no cutByBudget. The listener case fails there too: every read but
 * the 999 leaves a listener (two after the redirect), and the cap, budget,
 * gzip, corrupt gzip and 999 reads settle some other way, the 999 only at
 * its signal, after a throw nothing catches, which fails the last case. The
 * other cases hold there. Against engine 1.5.4's url-guard, which left the
 * listener registered, only that case fails: each read settles as labelled
 * and leaves a listener (two after the redirect). A url-guard that skips the
 * removal at one of its three places leaves the listener after the 999 and
 * corrupt gzip reads (fail), after the five reads that resolve (finish), or
 * after the failed read (the request's 'error' handler). The 10 MiB case and
 * the chunk, signal and last cases each fail against a url-guard changed to
 * break them: one that holds cap + 1 bytes but reads the socket to its end
 * receives all 10 MiB; one that hands the Response Buffer.concat's bytes
 * uncopied puts the 9 byte and the 101 byte chunks in the shared pool,
 * beside the earlier read's body; one that never listens to the caller's
 * signal leaves the drip open at the case deadline; and a rejection left
 * unhandled, or a throw in a timer, fails the last. The ordinary page and
 * the two MCP cases are controls: they pin what a change to the transport or
 * the MCP route must keep.
 *
 * Usage:  node scripts/check-fetch-bounds.mjs [--app <dir>]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argApp = process.argv.indexOf('--app');
const APP = argApp > 0 ? path.resolve(process.argv[argApp + 1]) : path.join(HERE, '..');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');

const MiB = 1024 * 1024;
/** How long a timed case may run past its expected end before it fails. */
const MARGIN_S = 2;
/** A case still open this long after it started has no bound at all. */
const CASE_DEADLINE_S = 30;
/** The deadline the transport-level drip case passes as its own signal. */
const SIGNAL_DEADLINE_S = 3;
/** The listener case's signals: they outlive each read, and end one that never settles before the case deadline. */
const LISTEN_SIGNAL_S = 10;
/** Node hands a socket's bytes to the response in reads of at most 64 KiB, so this much can arrive past a cap before the check sees it. */
const ONE_READ = 64 * 1024;
/** How long a destroyed request is watched for bytes that still arrive. */
const SETTLE_MS = 300;

const PAGE = '<!doctype html><html lang="en"><head><title>Fetch bounds</title></head><body><main><h1>Fetch bounds</h1><p>A page that answers at once.</p></main></body></html>';
const TOKENS = JSON.stringify({
  $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
  color: { ink: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.07, 0.07, 0.07] }, $description: 'Body text.' } },
});

/** host + path -> the client side of the last request: body bytes received, and the request. */
const seen = new Map();

// The guard's sockets reach the local server; every other option (the
// method, the headers, the timeout, the signal handling) is the guard's own.
const toLocal = (real) => ({
  ...real,
  request(opts, cb) {
    const key = `${opts.hostname}${opts.path}`;
    const o = { ...opts, hostname: '127.0.0.1', port: PORT, headers: { ...(opts.headers || {}), 'x-fetch-bounds-host': opts.hostname } };
    delete o.lookup;
    const record = { received: 0, req: null };
    seen.set(key, record);
    record.req = http.request(o, (res) => {
      res.on('data', (c) => { record.received += c.length; });
      cb(res);
    });
    return record.req;
  },
});
const lookup = async () => [{ address: '93.184.215.14', family: 4 }];

/** Errors thrown where no caller could catch them (in a stream listener, say): the last case fails on any. */
const uncaught = [];
process.on('uncaughtException', (e) => { uncaught.push(`uncaught ${e && e.name}: ${e && e.message}`); });
process.on('unhandledRejection', (e) => { uncaught.push(`unhandled rejection ${e && e.name}: ${e && e.message}`); });

const h = createHarness({
  app: APP,
  realSafeFetch: true,
  lookup,
  stubs: { 'node:http': toLocal(http), 'node:https': toLocal(https) },
});
const guard = h.load('app/lib/url-guard.ts');
const { safeFetch } = guard;
// Load the MCP route before any case starts, so no case's time includes its load.
h.load('app/api/mcp/route.ts');

// ── Bodies ───────────────────────────────────────────────────────────────────

/** Printable bytes whose value at offset i is fixed by i, so a cut body can be checked byte for byte. */
const PATTERN = Buffer.alloc(10 * MiB);
for (let i = 0; i < PATTERN.length; i++) PATTERN[i] = 0x21 + (i % 89);

/** An earlier read's body: no later read's chunk may reach these bytes. */
const EARLIER = 'fetch bounds: the body of an earlier read, which no later reader may reach';

// host + path -> what the server sends. Each case below owns its host names.
const ROUTES = {
  'ok.example.com/': { body: PAGE },
  'big.example.com/ten': { bytes: PATTERN },
  'exact.example.com/': { bytes: PATTERN.subarray(0, MiB) },
  'own-earlier.example.com/': { body: EARLIER, type: 'text/plain' },
  'own-small.example.com/': { body: 'nine byte', type: 'text/plain' },
  'own-cut.example.com/': { bytes: PATTERN.subarray(0, 2 * MiB) },
  'own-large.example.com/': { bytes: PATTERN.subarray(0, MiB) },
  'drip.example.com/': { drip: true },
  'listen-ok.example.com/': { body: PAGE },
  'listen-cut.example.com/': { bytes: PATTERN.subarray(0, 2 * MiB) },
  'listen-hop.example.com/': { status: 302, location: 'https://listen-landed.example.com/' },
  'listen-landed.example.com/': { body: PAGE },
  'listen-reset.example.com/': { reset: true },
  'listen-nines.example.com/': { status: 999, body: 'Request denied', type: 'text/plain' },
  'listen-gzip.example.com/': { bytes: zlib.gzipSync(PAGE), encoding: 'gzip' },
  'listen-corrupt.example.com/': { bytes: Buffer.from('this body says it is gzip and it is not'), encoding: 'gzip' },
  'listen-budget.example.com/': { bytes: PATTERN.subarray(0, 2 * MiB) },
  'tokens-ok.example.com/tokens.json': { body: TOKENS, type: 'application/json' },
  'www.designesy.org/llms-full.txt': { body: '# Fetch bounds\n\nA published document that answers at once.\n', type: 'text/plain' },
};

/** host + path -> what the server managed to send: bytes handed to the socket, and whether the body finished. */
const sent = new Map();

const server = http.createServer((req, res) => {
  const key = `${req.headers['x-fetch-bounds-host']}${req.url}`;
  const b = ROUTES[key] || { status: 404, body: 'not here' };
  const stat = { written: 0, finished: false };
  sent.set(key, stat);
  res.on('error', () => {});
  res.on('finish', () => { stat.finished = true; });
  // A read that fails: the connection closes before any answer.
  if (b.reset) return req.socket.destroy();
  const headers = { 'content-type': b.type || 'text/html' };
  if (b.location) headers.location = b.location;
  if (b.encoding) headers['content-encoding'] = b.encoding;
  res.writeHead(b.status || 200, headers);
  if (b.drip) {
    res.flushHeaders();
    const t = setInterval(() => { stat.written += 1; res.write('a'); }, 1000);
    res.on('close', () => clearInterval(t));
    return;
  }
  if (!b.bytes) return res.end(b.body || '');
  // Written in 64 KiB pieces with backpressure, so the socket closing stops it.
  let at = 0;
  const pump = () => {
    while (at < b.bytes.length) {
      if (res.destroyed) return;
      const piece = b.bytes.subarray(at, at + ONE_READ);
      at += piece.length;
      stat.written += piece.length;
      if (!res.write(piece)) {
        res.once('drain', pump);
        return;
      }
    }
    res.end();
  };
  pump();
});
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 0;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `work`'s Response; a rejection fails the case, naming the error. */
async function resolution(work) {
  try {
    return await work;
  } catch (e) {
    throw new Error(`rejected instead of resolving: ${e && e.message}`);
  }
}

/** The error `work` rejects with; a resolve fails the case, naming how much it returned. */
async function rejection(work) {
  let resp;
  try {
    resp = await work;
  } catch (e) {
    return e;
  }
  const bytes = resp instanceof Response ? (await resp.arrayBuffer()).byteLength : null;
  throw new Error(bytes === null ? 'resolved instead of rejecting' : `resolved with ${bytes} bytes (HTTP ${resp.status})`);
}

/**
 * Asserts a read of `key` with maxBodyBytes `cap` stopped at the cap: the
 * response holds exactly the body's first cap + 1 bytes, at most one socket
 * read past the cap reached the client, the request was destroyed, nothing
 * more arrived after it, and the server never finished. Says how far it got.
 */
async function heldToCap(key, cap, resp) {
  const rec = seen.get(key);
  assert.ok(rec && rec.req, `no request reached ${key}`);
  const atResolve = rec.received;
  const body = Buffer.from(await resp.arrayBuffer());
  assert.equal(body.length, cap + 1, `${body.length} bytes returned, not the ${cap} byte cap + 1`);
  assert.equal(Buffer.compare(body, ROUTES[key].bytes.subarray(0, cap + 1)), 0, 'the bytes returned are not the body\'s first bytes');
  assert.ok(atResolve <= cap + ONE_READ, `${atResolve} bytes received, more than one ${ONE_READ} byte read past the ${cap} byte cap`);
  assert.equal(rec.req.destroyed, true, 'the request was not destroyed');
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  assert.equal(rec.received, atResolve, `${rec.received - atResolve} more bytes arrived after the body was cut`);
  const s = sent.get(key);
  assert.equal(s.finished, false, `the server finished sending all ${ROUTES[key].bytes.length} bytes`);
  return `${body.length} bytes returned; ${atResolve} of ${ROUTES[key].bytes.length} received (${atResolve - cap} past the cap), server sent ${s.written} before the socket closed`;
}

/** The time, in seconds, `work` takes to reject, and the error. */
async function timedRejection(work) {
  const t0 = performance.now();
  const err = await rejection(work);
  return { err, s: (performance.now() - t0) / 1000 };
}

/** Asserts a run ended at `expect` seconds, within the margin. */
function endedAt(s, expect) {
  assert.ok(s <= expect + MARGIN_S, `${s.toFixed(2)} s is over the ${expect} s deadline plus ${MARGIN_S} s`);
  assert.ok(s >= expect - 0.5, `${s.toFixed(2)} s is under the ${expect} s deadline: something else ended the read`);
}

// ── Cases ────────────────────────────────────────────────────────────────────

/** Run together; the timed one measures its own deadline. */
const CONCURRENT = [
  {
    name: 'a 10 MiB body read with maxBodyBytes 1 MiB comes back as its first 1 MiB + 1 bytes, and the request is destroyed',
    run: async () => heldToCap('big.example.com/ten', MiB, await resolution(safeFetch('https://big.example.com/ten', { maxBodyBytes: MiB }))),
  },
  {
    name: 'a body of exactly maxBodyBytes comes back whole, with no byte past the cap and no budget cut',
    run: async () => {
      const { cutByBudget } = guard;
      assert.equal(typeof cutByBudget, 'function', 'url-guard exports no cutByBudget');
      const resp = await resolution(safeFetch('https://exact.example.com/', { maxBodyBytes: MiB }));
      const n = (await resp.arrayBuffer()).byteLength;
      assert.equal(n, MiB, `${n} bytes returned, not the ${MiB} bytes sent`);
      assert.equal(cutByBudget(resp), false, 'cutByBudget says a budget cut it');
      return `${n} bytes, cutByBudget false`;
    },
  },
  {
    name: 'an ordinary page read with no cap comes back whole',
    run: async () => {
      const resp = await resolution(safeFetch('https://ok.example.com/'));
      assert.equal(resp.status, 200);
      assert.equal(await resp.text(), PAGE);
      return `HTTP ${resp.status}, ${PAGE.length} bytes`;
    },
  },
  {
    name: "a reader's chunk sits in a buffer of exactly the bytes returned, with none of an earlier read's",
    run: async () => {
      const out = [];
      // How much of each body comes back is the cap cases' to check; this one
      // checks only where the bytes that come back sit.
      for (const [label, url, extra, sentBytes] of [
        ['9 byte body', 'https://own-small.example.com/', {}, Buffer.from('nine byte')],
        ['2 MiB body read with maxBodyBytes 100', 'https://own-cut.example.com/', { maxBodyBytes: 100 }, ROUTES['own-cut.example.com/'].bytes],
        ['1 MiB body', 'https://own-large.example.com/', {}, ROUTES['own-large.example.com/'].bytes],
      ]) {
        // Read just before, so a buffer the two reads shared would hold it.
        assert.equal(await (await safeFetch('https://own-earlier.example.com/')).text(), EARLIER);
        const resp = await resolution(safeFetch(url, extra));
        const reader = resp.body.getReader();
        const { value } = await reader.read();
        const rest = await reader.read();
        const own = value.byteOffset === 0 && value.buffer.byteLength === value.byteLength;
        const foreign = Buffer.from(value.buffer).includes(EARLIER);
        const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        const same = value.byteLength > 0 && Buffer.compare(chunk, sentBytes.subarray(0, value.byteLength)) === 0;
        out.push({
          wrong: !own || foreign || !same || !rest.done,
          text: `${label}: a ${value.byteLength} byte chunk in a ${value.buffer.byteLength} byte buffer`
            + `${value.byteOffset ? ` at offset ${value.byteOffset}` : ''}`
            + `${foreign ? " that holds the earlier read's body" : ''}`
            + `${same ? '' : ', not the start of the body sent'}${rest.done ? '' : ', with more chunks after it'}`,
        });
      }
      const wrong = out.filter((o) => o.wrong);
      assert.equal(wrong.length, 0, wrong.map((o) => o.text).join('; '));
      return out.map((o) => o.text).join('; ');
    },
  },
  {
    name: "a read leaves no abort listener on the caller's signal once it settles, however it settles",
    run: async () => {
      const { cutByBudget } = guard;
      // Each read reaches its outcome by a different path: the body's end,
      // the cap, two hops, the request's error, the status check, the
      // decoder's end and its error, and the shared budget. The last field
      // says whether the read settled the way its label says.
      const reads = [
        ['whole', 'https://listen-ok.example.com/', {}, (o) => o.text === PAGE],
        ['cut at maxBodyBytes', 'https://listen-cut.example.com/', { maxBodyBytes: MiB }, (o) => o.bytes === MiB + 1],
        ['after a redirect', 'https://listen-hop.example.com/', {}, (o) => seen.has('listen-landed.example.com/') && o.text === PAGE],
        ['failed (the server closes the connection)', 'https://listen-reset.example.com/', {}, (o) => o.err?.code === 'ECONNRESET'],
        ['status 999', 'https://listen-nines.example.com/', {}, (o) => o.err?.name === 'InvalidStatusError'],
        ['a gzip body', 'https://listen-gzip.example.com/', {}, (o) => o.text === PAGE],
        ['a corrupt gzip body', 'https://listen-corrupt.example.com/', {}, (o) => o.err?.name === 'ContentDecodingError'],
        ['cut by a shared budget', 'https://listen-budget.example.com/', { budget: { left: MiB } }, (o) => o.bytes === MiB && o.cut],
      ];
      const out = await Promise.all(reads.map(async ([label, url, extra, settledAsLabelled]) => {
        // A signal that outlives the read, as the readiness route's AbortSignal.timeout(8000) does.
        const signal = AbortSignal.timeout(LISTEN_SIGNAL_S * 1000);
        const o = {};
        try {
          const resp = await safeFetch(url, { ...extra, signal });
          const body = Buffer.from(await resp.arrayBuffer());
          Object.assign(o, { bytes: body.length, text: body.toString(), cut: typeof cutByBudget === 'function' && cutByBudget(resp) });
        } catch (e) {
          o.err = e;
        }
        const left = getEventListeners(signal, 'abort').length;
        const settled = o.err ? `rejected (${o.err.name}: ${o.err.message})` : `resolved, ${o.bytes} bytes${o.cut ? ', cut by the budget' : ''}`;
        const asLabelled = settledAsLabelled(o);
        return { wrong: !asLabelled || left !== 0, text: `${label}: ${settled}${asLabelled ? '' : ' (not the outcome this read is for)'}, ${left} abort listener(s) left` };
      }));
      const wrong = out.filter((o) => o.wrong);
      assert.equal(wrong.length, 0, wrong.map((o) => o.text).join('; '));
      return out.map((o) => o.text).join('; ');
    },
  },
  {
    name: `a server sending one byte a second is ended by the caller's ${SIGNAL_DEADLINE_S} s signal`,
    run: async () => {
      const { err, s } = await timedRejection(safeFetch('https://drip.example.com/', { signal: AbortSignal.timeout(SIGNAL_DEADLINE_S * 1000) }));
      assert.equal(err.name, 'AbortError', `ended with ${err.name}: ${err.message}`);
      endedAt(s, SIGNAL_DEADLINE_S);
      const rec = seen.get('drip.example.com/');
      assert.equal(rec.req.destroyed, true, 'the request was not destroyed');
      return `${s.toFixed(2)} s, ${rec.received} bytes received`;
    },
  },
  {
    name: 'designesy_tokens_score still reads a token file that answers',
    run: async () => {
      const { result, payload } = await h.callTool('designesy_tokens_score', { url: 'https://tokens-ok.example.com/tokens.json' });
      assert.notEqual(result.isError, true, `returned an error: ${payload && payload.error}`);
      assert.equal(typeof payload.score, 'number');
      return `score ${payload.score}, ${payload.total_tokens} token(s)`;
    },
  },
  {
    name: 'designesy_llms_full_txt (cachedFetch) still reads a document that answers',
    run: async () => {
      const { result, payload } = await h.callTool('designesy_llms_full_txt', {});
      assert.notEqual(result.isError, true, `returned an error: ${payload && payload.error}`);
      assert.match(String(payload.content), /A published document that answers at once/);
      return `${String(payload.content).length} characters`;
    },
  },
];

/** Run once every concurrent case has settled. */
const LAST = {
  name: 'nothing was thrown during the run where no caller could catch it',
  run: async () => {
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    assert.equal(uncaught.length, 0, `${uncaught.length}: ${uncaught.join('; ')}`);
    return 'none';
  },
};

/** Runs one case against the case deadline: its detail, or the error that failed it, and its time. */
async function runCase(c) {
  const t0 = performance.now();
  let timer;
  const deadline = new Promise((res) => { timer = setTimeout(() => res(null), CASE_DEADLINE_S * 1000); });
  let detail = null;
  let error = null;
  try {
    const r = await Promise.race([c.run().then((d) => ({ d })), deadline]);
    if (r === null) throw new Error(`still open at the ${CASE_DEADLINE_S} s case deadline: no bound`);
    detail = r.d;
  } catch (e) {
    error = e;
  } finally {
    clearTimeout(timer);
  }
  return { c, detail, error, s: (performance.now() - t0) / 1000 };
}

console.log(`Fetch bounds (${path.relative(process.cwd(), APP) || '.'}, node ${process.version}, margin ${MARGIN_S} s, case deadline ${CASE_DEADLINE_S} s)`);
const results = await Promise.all(CONCURRENT.map(runCase));
results.push(await runCase(LAST));

const failures = [];
for (const { c, detail, error, s } of results) {
  const why = error ? String(error && error.message).split('\n')[0] : null;
  if (why) failures.push(c.name);
  console.log(`  ${why ? 'FAIL' : 'ok  '}  ${s.toFixed(2).padStart(6)} s  ${c.name}\n                   ${why || detail}`);
}

server.closeAllConnections();
server.close();
const total = results.length;
console.log(`\n${total - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Fetch bounds: ${failures.length} case(s) failed.`);
  process.exit(1);
}
console.log('Fetch bounds: a body stops at its cap as it arrives, a read at its caller\'s deadline, and no read leaves a listener on its signal.');
process.exit(0);
