#!/usr/bin/env node
/**
 * Fetch bounds: url-guard's safeFetch stops reading a response body at the
 * cap its caller names while the body is still arriving, a caller's signal
 * ends a read at its deadline however slowly the server sends and keeps no
 * listener once the read settles, a reader's chunk holds only the bytes
 * returned, every URL the MCP route reads for itself ends at the route's 15 s
 * read deadline and fails once its body is past that read's byte limit
 * (16 MiB for a Lottie file, 4 MiB for a token file or one of this site's
 * documents), and the MCP tools that read a URL through url-guard still read
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
 * all. The MCP route passed no signal for the URLs it reads (cachedFetch, and
 * the url of designesy_tokens_score and designesy_motion_score), so nothing
 * in the process ended such a read short of the function's maxDuration
 * (300 s, vercel.json). It passed no maxBodyBytes either, so it held an
 * identity body whole however long it was, and a compressed body that
 * decoded past url-guard's default of 4 MiB (DEFAULT_MAX_DECODED_BYTES)
 * failed with "content decoding failed", which names no limit, a gzip Lottie
 * file that decodes to 16 MiB among them. Each hop of a read adds an abort
 * listener to the caller's signal, and it stayed there once the read settled.
 * A signal can outlive the read: Node keeps an AbortSignal.timeout that has a
 * listener alive until its timer fires, and the listener kept the read's
 * request and the body it read reachable until then. The Response reads the
 * body as one chunk the transport joins, uncopied. Joined by Buffer.concat, a
 * body under 4 KiB would sit in Node's shared 8 KiB pool, whose buffer also
 * holds other reads' bytes.
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
 * time includes its load, and one case reads its source instead of running
 * it. The cases run concurrently, each on its own URLs; the last one runs
 * once the others have settled.
 *
 * The MCP read limits are stated here (MCP_READ_LIMITS), as the read deadline
 * is (MCP_DEADLINE_S): a route file cannot export them. The bodies of the
 * limit cases are built so that a body cut anywhere does not parse or shows
 * it was cut: JSON padded with spaces after its opening brace, and a document
 * whose last line says it is whole. The server sends an identity body of a
 * limit case at most PACE_WINDOW (256 KiB) ahead of what the client has
 * received, so a socket buffer larger than the 1 MiB past each limit cannot
 * let the server finish before the client stops reading. designesy_llms_txt
 * reads one fixed URL, and the route caches a read that succeeds for 5
 * minutes and answers later calls from it, so the designesy_llms_txt cases
 * take turns (llmsTurn), in the order they are listed, each setting what that
 * URL serves.
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
 *     destroyed. Each MCP read of such a server (designesy_tokens_score,
 *     designesy_motion_score, and designesy_llms_txt through cachedFetch)
 *     ends at the route's 15 s read deadline with an error saying the fetch
 *     timed out after 15 s, and its request is destroyed.
 *   - Each MCP read of a body 1 MiB past its limit fails with "Fetch failed:
 *     the response is over the N MiB read limit": designesy_tokens_score
 *     (4 MiB), designesy_motion_score (16 MiB) and designesy_llms_txt
 *     (cachedFetch, 4 MiB), each for an identity body sent with no
 *     content-length and with one. At most one socket read past the limit
 *     reached the client, the request was destroyed, and the server never
 *     finished sending. A gzip body that decodes to 1 MiB past the limit
 *     fails the same way in each of the three.
 *   - designesy_motion_score reads a gzip Lottie file that decodes to exactly
 *     16 MiB whole.
 *   - Every safeFetch call in the MCP route is the one in readUrl, which
 *     passes it a signal from AbortSignal.timeout(READ_DEADLINE_MS) and its
 *     limit as maxBodyBytes, and READ_DEADLINE_MS is 15 s. readUrl is called
 *     in three places, each with the limit in MCP_READ_LIMITS: cachedFetch
 *     (4 MiB), designesy_tokens_score (4 MiB) and designesy_motion_score
 *     (16 MiB).
 *   - Controls, which hold on a route with no read limit too: a body of
 *     exactly the limit is read whole (a 4 MiB token file, a 16 MiB Lottie
 *     file, a 4 MiB document read by designesy_skill_md through cachedFetch);
 *     a 404 whose body is 1 MiB past the limit still fails as "Fetch failed:
 *     404" in each of the three tools; a token file that is not JSON, and a
 *     document cachedFetch reads as JSON that is not, fail with JSON.parse's
 *     own message, and a token file that starts with a byte order mark is
 *     read; designesy_tokens_score still reads a token file that answers,
 *     and designesy_llms_full_txt (cachedFetch) a document that answers.
 *   - designesy_tokens_score still reads a token file whose server is quiet
 *     for 8 s before it answers. With a signal and no idle timeout of its
 *     own, Node's global agent ends a socket that is quiet for 5 s, so a
 *     read given only the deadline's signal fails there at 5 s.
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
 * its signal, after a throw nothing catches, which fails the last case. Its
 * MCP route, like engine 1.5.4's, passed safeFetch no signal: against
 * either, the three MCP drips are still open at the case deadline, and the
 * source case finds three safeFetch calls and no readUrl. Of the cases from
 * before the MCP read limits, the others hold there. Against engine 1.5.4's
 * url-guard, which left the listener registered, the listener case is the
 * only one of those that fails: each read settles as labelled
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
 * unhandled, or a throw in a timer, fails the last. A route that gives
 * readUrl's safeFetch the signal and no idleTimeoutMs fails the 8 s quiet
 * case at 5 s; main's route, which passed no signal and so kept url-guard's
 * 15 s idle timeout, holds it.
 *
 * Against the MCP route from before the read limits, whose readUrl takes no
 * limit and passes safeFetch no maxBodyBytes, five cases fail: the three
 * over-limit cases, the gzip Lottie file of exactly 16 MiB, and the source
 * case. Every control holds. Each identity body past a limit is read whole
 * and scored or returned, so the tool returns a result, not an error; in
 * designesy_llms_txt the second identity read is answered from the route's
 * cache, so no request reaches the server. Each gzip body past a limit, and
 * the gzip Lottie file of exactly 16 MiB, fails with url-guard's "the
 * decoded body is over 4194304 bytes". The source case finds a readUrl that
 * takes no limit. Three changes to the new readUrl each fail cases too. One
 * that fails a body of exactly its limit (`>=` for `>`) fails the four
 * exact-limit reads. One that checks the length before the status fails the
 * 404 control in all three tools. One that checks the length but passes
 * safeFetch no maxBodyBytes receives each identity body past a limit to its
 * end and fails each gzip body at url-guard's default, which fails the
 * three over-limit cases, the gzip Lottie file of exactly 16 MiB and the
 * source case. The ordinary page, the three identity exact-limit reads,
 * the 404s, the JSON.parse messages and the two MCP reads of a URL that
 * answers are controls: they pin what a change to the transport or the MCP
 * route must keep.
 *
 * Usage:  node scripts/check-fetch-bounds.mjs [--app <dir>]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import fs from 'node:fs';
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
/** READ_DEADLINE_MS in app/api/mcp/route.ts. */
const MCP_DEADLINE_S = 15;
/** The read limit of each place app/api/mcp/route.ts calls readUrl, in bytes (LOTTIE_READ_LIMIT and READ_LIMIT there). */
const MCP_READ_LIMITS = { cachedFetch: 4 * MiB, designesy_tokens_score: 4 * MiB, designesy_motion_score: 16 * MiB };
const TOKENS_LIMIT = MCP_READ_LIMITS.designesy_tokens_score;
const LOTTIE_LIMIT = MCP_READ_LIMITS.designesy_motion_score;
const DOC_LIMIT = MCP_READ_LIMITS.cachedFetch;
/** How far past its limit an over-limit body runs. */
const PAST_LIMIT = MiB;
/** The deadline the transport-level drip case passes as its own signal. */
const SIGNAL_DEADLINE_S = 3;
/** The listener case's signals: they outlive each read, and end one that never settles before the case deadline. */
const LISTEN_SIGNAL_S = 10;
/** Node hands a socket's bytes to the response in reads of at most 64 KiB, so this much can arrive past a cap before the check sees it. */
const ONE_READ = 64 * 1024;
/** How far a paced body may run ahead of what the client has received. */
const PACE_WINDOW = 256 * 1024;
/** How long a destroyed request is watched for bytes that still arrive. */
const SETTLE_MS = 300;

const PAGE = '<!doctype html><html lang="en"><head><title>Fetch bounds</title></head><body><main><h1>Fetch bounds</h1><p>A page that answers at once.</p></main></body></html>';
const TOKENS = JSON.stringify({
  $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
  color: { ink: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.07, 0.07, 0.07] }, $description: 'Body text.' } },
});
const LOTTIE = JSON.stringify({ v: '5.12.2', fr: 60, ip: 0, op: 18, w: 64, h: 64, layers: [], markers: [{ cm: 'reduced-motion', tm: 0, dr: 0 }], meta: { g: 'fetch bounds' } });

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
    const record = { received: 0, req: null, wake: null };
    seen.set(key, record);
    record.req = http.request(o, (res) => {
      res.on('data', (c) => {
        record.received += c.length;
        // A paced body waiting on the client goes on.
        const wake = record.wake;
        record.wake = null;
        if (wake) wake();
      });
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

/** `json`, one JSON object, as exactly n bytes: spaces after its opening brace, so a body cut anywhere does not parse. */
function jsonOfSize(json, n) {
  const pad = n - Buffer.byteLength(json);
  assert.ok(pad >= 0, `${json.length} bytes of JSON do not fit in ${n}`);
  return Buffer.from(`{${' '.repeat(pad)}${json.slice(1)}`);
}

/** The last line of a document of docOfSize: a document cut anywhere lacks it. */
const DOC_END = 'The last line of the document.\n';
/** A text document of exactly n bytes. */
function docOfSize(n) {
  const head = '# Read limits\n\n';
  return Buffer.from(`${head}${'a'.repeat(n - head.length - DOC_END.length - 1)}\n${DOC_END}`);
}

const TOKENS_AT = jsonOfSize(TOKENS, TOKENS_LIMIT);
const TOKENS_OVER = jsonOfSize(TOKENS, TOKENS_LIMIT + PAST_LIMIT);
const LOTTIE_AT = jsonOfSize(LOTTIE, LOTTIE_LIMIT);
const LOTTIE_OVER = jsonOfSize(LOTTIE, LOTTIE_LIMIT + PAST_LIMIT);
const DOC_AT = docOfSize(DOC_LIMIT);
const DOC_OVER = docOfSize(DOC_LIMIT + PAST_LIMIT);
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const NOT_JSON = 'this is not json';

// host + path -> what the server sends. Each case below owns its URLs, but
// designesy_llms_txt's: llmsTurn sets what www.designesy.org/llms.txt sends.
// bytes: sent in 64 KiB pieces; paced: at most PACE_WINDOW ahead of the
// client; length: with a content-length header.
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
  'tokens-drip.example.com/tokens.json': { drip: true },
  'motion-drip.example.com/anim.json': { drip: true },
  'tokens-over.example.com/plain.json': { bytes: TOKENS_OVER, paced: true, type: 'application/json' },
  'tokens-over.example.com/length.json': { bytes: TOKENS_OVER, paced: true, length: true, type: 'application/json' },
  'tokens-over.example.com/gzip.json': { bytes: zlib.gzipSync(TOKENS_OVER), encoding: 'gzip', decoded: TOKENS_OVER.length, type: 'application/json' },
  'tokens-at.example.com/tokens.json': { bytes: TOKENS_AT, type: 'application/json' },
  'tokens-404.example.com/tokens.json': { status: 404, bytes: TOKENS_OVER, paced: true },
  'motion-over.example.com/plain.json': { bytes: LOTTIE_OVER, paced: true, type: 'application/json' },
  'motion-over.example.com/length.json': { bytes: LOTTIE_OVER, paced: true, length: true, type: 'application/json' },
  'motion-over.example.com/gzip.json': { bytes: zlib.gzipSync(LOTTIE_OVER), encoding: 'gzip', decoded: LOTTIE_OVER.length, type: 'application/json' },
  'motion-at.example.com/anim.json': { bytes: LOTTIE_AT, type: 'application/json' },
  'motion-at.example.com/gzip.json': { bytes: zlib.gzipSync(LOTTIE_AT), encoding: 'gzip', decoded: LOTTIE_AT.length, type: 'application/json' },
  'motion-404.example.com/anim.json': { status: 404, bytes: LOTTIE_OVER, paced: true },
  'www.designesy.org/contracts/skill': { bytes: DOC_AT, type: 'text/markdown' },
  'tokens-parse.example.com/not.json': { body: NOT_JSON, type: 'application/json' },
  'tokens-parse.example.com/bom.json': { bytes: Buffer.concat([BOM, Buffer.from(TOKENS)]), type: 'application/json' },
  'www.designesy.org/.well-known/agent.json': { body: NOT_JSON, type: 'application/json' },
  'tokens-ok.example.com/tokens.json': { body: TOKENS, type: 'application/json' },
  'tokens-late.example.com/tokens.json': { body: TOKENS, type: 'application/json', delayMs: 8000 },
  'www.designesy.org/llms-full.txt': { body: '# Fetch bounds\n\nA published document that answers at once.\n', type: 'text/plain' },
};
const LLMS = 'www.designesy.org/llms.txt';
const LLMS_OVER = { bytes: DOC_OVER, paced: true, type: 'text/plain' };
const LLMS_OVER_LENGTH = { bytes: DOC_OVER, paced: true, length: true, type: 'text/plain' };
const LLMS_OVER_GZIP = { bytes: zlib.gzipSync(DOC_OVER), encoding: 'gzip', decoded: DOC_OVER.length, type: 'text/plain' };
const LLMS_404 = { status: 404, bytes: DOC_OVER, paced: true };

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
  // A server that is quiet before it answers, well inside the read deadline.
  if (b.delayMs) {
    setTimeout(() => { res.writeHead(200, { 'content-type': b.type }); res.end(b.body); }, b.delayMs);
    return;
  }
  const headers = { 'content-type': b.type || 'text/html' };
  if (b.location) headers.location = b.location;
  if (b.encoding) headers['content-encoding'] = b.encoding;
  if (b.length) headers['content-length'] = String(b.bytes.length);
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
      // A paced body waits until the client has received all but PACE_WINDOW of what was written.
      const client = seen.get(key);
      if (b.paced && client && at - client.received >= PACE_WINDOW) {
        client.wake = () => setImmediate(pump);
        return;
      }
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

/** The first 120 characters of a tool's output. */
const clip = (text) => `${String(text).slice(0, 120)}${String(text).length > 120 ? '...' : ''}`;

/** An MCP tool call: whether it failed, and its error message (returned or thrown) or its payload. */
async function toolOutcome(tool, args) {
  try {
    const { result, payload } = await h.callTool(tool, args);
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return { failed: result.isError === true, message: String(payload && payload.error), payload, text };
  } catch (e) {
    return { failed: true, message: String(e && e.message), payload: null, text: '' };
  }
}

/** An MCP tool call that must fail; its error message, whether returned or thrown. */
async function toolError(tool, args) {
  const o = await toolOutcome(tool, args);
  assert.equal(o.failed, true, `${tool} returned a result, not an error: ${clip(o.text)}`);
  return o.message;
}

/** An MCP tool call that must not fail; its payload. */
async function toolResult(tool, args) {
  const o = await toolOutcome(tool, args);
  assert.equal(o.failed, false, `${tool} failed: ${o.message}`);
  return o.payload;
}

/** An MCP tool call of a server sending one byte a second: it must end at the route's read deadline with a timeout error. */
async function mcpDrip(tool, args, key) {
  const t0 = performance.now();
  const message = await toolError(tool, args);
  const s = (performance.now() - t0) / 1000;
  assert.match(message, new RegExp(`timed out after ${MCP_DEADLINE_S} s`), `ended with "${message}"`);
  endedAt(s, MCP_DEADLINE_S);
  assert.equal(seen.get(key).req.destroyed, true, 'the request was not destroyed');
  return `${s.toFixed(2)} s, "${message}", ${seen.get(key).received} bytes received`;
}

/** The error an MCP read past `limit` bytes fails with. */
const overLimit = (limit) => new RegExp(`^Fetch failed: the response is over the ${limit / MiB} MiB read limit$`);

/**
 * designesy_llms_txt reads one URL, so its cases take turns, in the order
 * they are listed, each setting what that URL serves for its turn. A read
 * that succeeds is cached and answers every call after it, so the read that
 * succeeds on a route with no read limit (a body past the limit, read whole)
 * is the last to take a turn.
 */
let llmsQueue = Promise.resolve();
function llmsTurn(route, work) {
  const turn = llmsQueue.then(() => {
    ROUTES[LLMS] = route;
    return work();
  });
  llmsQueue = turn.catch(() => {});
  return turn;
}

/**
 * Asserts an MCP read of `key`, whose body is past the tool's `limit`, failed
 * with the error that names the limit. For an identity body it also asserts
 * the read stopped at the limit: at most one socket read past it reached the
 * client, the request was destroyed, and the server never finished sending.
 * Says how far the body got.
 */
async function mcpOverLimit(tool, args, key, limit) {
  const route = ROUTES[key];
  seen.delete(key);
  const o = await toolOutcome(tool, args);
  const rec = seen.get(key);
  assert.ok(rec && rec.req, `no request reached ${key}, so the route answered from its cache`);
  assert.equal(o.failed, true, `returned a result, not an error, after ${rec.received} of ${route.bytes.length} bytes received: ${clip(o.text)}`);
  assert.match(o.message, overLimit(limit), `failed with "${o.message}"`);
  if (route.encoding) {
    return `"${o.message}"; ${route.bytes.length} ${route.encoding} bytes that decode to ${route.decoded}`;
  }
  assert.ok(rec.received <= limit + ONE_READ, `${rec.received} bytes received, more than one ${ONE_READ} byte read past the ${limit} byte limit`);
  assert.equal(rec.req.destroyed, true, 'the request was not destroyed');
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const s = sent.get(key);
  assert.equal(s.finished, false, `the server finished sending all ${route.bytes.length} bytes`);
  return `"${o.message}"; ${rec.received} of ${route.bytes.length} bytes received, server sent ${s.written} before the socket closed`;
}

/** Runs labelled reads one after another, and fails naming each that failed. */
async function eachRead(reads) {
  const out = [];
  for (const [label, read] of reads) {
    try {
      out.push({ wrong: false, text: `${label}: ${await read()}` });
    } catch (e) {
      out.push({ wrong: true, text: `${label}: ${String(e && e.message).split('\n')[0]}` });
    }
  }
  const wrong = out.filter((o) => o.wrong);
  assert.equal(wrong.length, 0, wrong.map((o) => o.text).join('; '));
  return out.map((o) => o.text).join('; ');
}

/**
 * The labelled reads of an over-limit case: each [label, key, route] reads
 * `key` with `tool` (designesy_llms_txt's url is its own), serving `route`
 * there first when one is given.
 */
function overLimitReads(tool, limit, reads) {
  return reads.map(([label, key, route]) => [label, () => {
    if (route) ROUTES[key] = route;
    return mcpOverLimit(tool, key === LLMS ? {} : { url: `https://${key}` }, key, limit);
  }]);
}

/**
 * Asserts an MCP read of `key`, a body of exactly the tool's limit, came back
 * whole: the client received every byte sent, and the tool returned a result
 * that `whole` accepts. (The server's 'finish' can come after the client has
 * read the last byte, so it is not waited for.)
 */
async function mcpAtLimit(tool, args, key, whole) {
  const route = ROUTES[key];
  const payload = await toolResult(tool, args);
  const rec = seen.get(key);
  assert.ok(rec && rec.req, `no request reached ${key}`);
  assert.equal(rec.received, route.bytes.length, `${rec.received} of ${route.bytes.length} bytes received`);
  return `${route.bytes.length} bytes${route.encoding ? ` of ${route.encoding} that decode to ${route.decoded}` : ''} read; ${whole(payload)}`;
}

/** The message JSON.parse throws for `text`. */
function parseMessage(text) {
  try {
    JSON.parse(text);
  } catch (e) {
    return e.message;
  }
  throw new Error(`${JSON.stringify(text)} parses`);
}

// ── Cases ────────────────────────────────────────────────────────────────────

/** Run together; each timed one measures its own deadline. */
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
    name: `designesy_tokens_score on a URL sending one byte a second ends at the ${MCP_DEADLINE_S} s read deadline`,
    run: async () => mcpDrip('designesy_tokens_score', { url: 'https://tokens-drip.example.com/tokens.json' }, 'tokens-drip.example.com/tokens.json'),
  },
  {
    name: `designesy_motion_score on a URL sending one byte a second ends at the ${MCP_DEADLINE_S} s read deadline`,
    run: async () => mcpDrip('designesy_motion_score', { url: 'https://motion-drip.example.com/anim.json' }, 'motion-drip.example.com/anim.json'),
  },
  {
    // designesy_llms_txt's first turn.
    name: `designesy_llms_txt (cachedFetch) on a source sending one byte a second ends at the ${MCP_DEADLINE_S} s read deadline`,
    run: async () => llmsTurn({ drip: true }, () => mcpDrip('designesy_llms_txt', {}, LLMS)),
  },
  {
    // Listed before the over-limit cases: its designesy_llms_txt read is the second turn.
    name: 'a 404 whose body is 1 MiB past the read limit still fails as "Fetch failed: 404" (tokens, motion, llms_txt)',
    run: async () => {
      const is404 = (tool, args, key) => async () => {
        seen.delete(key);
        const message = await toolError(tool, args);
        assert.match(message, /^Fetch failed: 404\b/, `failed with "${message}"`);
        const rec = seen.get(key);
        assert.ok(rec, `no request reached ${key}`);
        return `"${message}", ${rec.received} of ${ROUTES[key].bytes.length} bytes received`;
      };
      const llms = llmsTurn(LLMS_404, () => eachRead([['designesy_llms_txt', is404('designesy_llms_txt', {}, LLMS)]]));
      const others = eachRead([
        ['designesy_tokens_score', is404('designesy_tokens_score', { url: 'https://tokens-404.example.com/tokens.json' }, 'tokens-404.example.com/tokens.json')],
        ['designesy_motion_score', is404('designesy_motion_score', { url: 'https://motion-404.example.com/anim.json' }, 'motion-404.example.com/anim.json')],
      ]);
      const [a, b] = await Promise.allSettled([others, llms]);
      const wrong = [a, b].filter((r) => r.status === 'rejected').map((r) => String(r.reason && r.reason.message).split('\n')[0]);
      assert.equal(wrong.length, 0, wrong.join('; '));
      return `${a.value}; ${b.value}`;
    },
  },
  {
    name: `designesy_tokens_score fails on a token file 1 MiB past its ${TOKENS_LIMIT / MiB} MiB read limit, naming the limit`,
    run: async () => eachRead(overLimitReads('designesy_tokens_score', TOKENS_LIMIT, [
      ['gzip that decodes past the limit', 'tokens-over.example.com/gzip.json'],
      ['identity, no content-length', 'tokens-over.example.com/plain.json'],
      ['identity with content-length', 'tokens-over.example.com/length.json'],
    ])),
  },
  {
    name: `designesy_motion_score fails on a Lottie file 1 MiB past its ${LOTTIE_LIMIT / MiB} MiB read limit, naming the limit`,
    run: async () => eachRead(overLimitReads('designesy_motion_score', LOTTIE_LIMIT, [
      ['gzip that decodes past the limit', 'motion-over.example.com/gzip.json'],
      ['identity, no content-length', 'motion-over.example.com/plain.json'],
      ['identity with content-length', 'motion-over.example.com/length.json'],
    ])),
  },
  {
    // designesy_llms_txt's last turn. On a route with no read limit its
    // identity reads succeed, and the first is cached, so they come last.
    name: `designesy_llms_txt (cachedFetch) fails on a document 1 MiB past its ${DOC_LIMIT / MiB} MiB read limit, naming the limit`,
    run: async () => llmsTurn(null, () => eachRead(overLimitReads('designesy_llms_txt', DOC_LIMIT, [
      ['gzip that decodes past the limit', LLMS, LLMS_OVER_GZIP],
      ['identity, no content-length', LLMS, LLMS_OVER],
      ['identity with content-length', LLMS, LLMS_OVER_LENGTH],
    ]))),
  },
  {
    name: `designesy_motion_score reads a gzip Lottie file that decodes to exactly its ${LOTTIE_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_motion_score', { url: 'https://motion-at.example.com/gzip.json' }, 'motion-at.example.com/gzip.json', (p) => `score ${p.score}, ${p.layer_count} layer(s)`),
  },
  {
    name: "every safeFetch call in the MCP route is readUrl's, which passes the read deadline and each call site's read limit",
    run: async () => {
      const src = fs.readFileSync(path.join(APP, 'app/api/mcp/route.ts'), 'utf8').replace(/\r\n/g, '\n');
      const calls = [...src.matchAll(/\bsafeFetch\(/g)].map((m) => m.index);
      const start = src.indexOf('\nasync function readUrl(');
      assert.ok(start >= 0, `no readUrl in the MCP route, which has ${calls.length} safeFetch call(s)`);
      // readUrl is a top-level function: it ends at the first closing brace
      // on a line of its own.
      const end = src.indexOf('\n}\n', start);
      const outside = calls.filter((i) => i < start || i > end);
      assert.equal(outside.length, 0, `${outside.length} of ${calls.length} safeFetch calls in the MCP route are outside readUrl`);
      assert.equal(calls.length, 1, `${calls.length} safeFetch calls in readUrl, expected 1`);
      const fn = src.slice(start, end);
      assert.match(fn, /const signal = AbortSignal\.timeout\(READ_DEADLINE_MS\);/, 'readUrl makes no AbortSignal.timeout(READ_DEADLINE_MS)');
      assert.match(fn, /safeFetch\(url, \{[^}]*(?<![\w.])signal(?=\s*[,}])/, 'readUrl does not pass that signal to safeFetch');
      const ms = src.match(/^const READ_DEADLINE_MS = ([\d_]+);$/m);
      assert.ok(ms, 'no READ_DEADLINE_MS in the MCP route');
      assert.equal(Number(ms[1].replace(/_/g, '')), MCP_DEADLINE_S * 1000, `READ_DEADLINE_MS is ${ms[1]}, not ${MCP_DEADLINE_S} s`);
      // The limit: readUrl takes it after the url and hands it to safeFetch.
      assert.match(fn, /^\nasync function readUrl\(url: string, limit: number, /, `readUrl takes no byte limit after its url: ${fn.split('\n')[1]}`);
      assert.match(fn, /safeFetch\(url, \{[^}]*(?<![\w.])maxBodyBytes: limit(?=\s*[,}])/, 'readUrl does not pass its limit to safeFetch as maxBodyBytes');
      // Each call of readUrl, by the function or tool it sits in, with the
      // byte count of the limit it passes: a constant's or a literal product.
      const bytesOf = (expr) => {
        const named = /^[A-Za-z_]\w*$/.test(expr) ? src.match(new RegExp(`^const ${expr} = ([\\d_ *]+);$`, 'm')) : null;
        const value = named ? named[1] : expr;
        return /^[\d_]+( *\* *[\d_]+)*$/.test(value) ? value.split('*').reduce((p, x) => p * Number(x.trim().replace(/_/g, '')), 1) : null;
      };
      const siteOf = (i) => {
        const before = src.slice(0, i);
        const fnAt = [...before.matchAll(/\nasync function (\w+)\(/g)].pop();
        const toolAt = [...before.matchAll(/registerTool\(\s*'(\w+)'/g)].pop();
        return toolAt && (!fnAt || toolAt.index > fnAt.index) ? toolAt[1] : fnAt ? fnAt[1] : '(top level)';
      };
      const defAt = start + '\nasync function '.length;
      const found = {};
      const problems = [];
      for (const { index } of src.matchAll(/\breadUrl\(/g)) {
        if (index === defAt) continue;
        const site = siteOf(index);
        const arg = src.slice(index).match(/^readUrl\(\s*[^,()]+,\s*([^,(){}]+?)\s*,/);
        const bytes = arg ? bytesOf(arg[1]) : null;
        if (bytes === null) problems.push(`the readUrl call in ${site} passes no limit this gate can read`);
        else if (!(site in MCP_READ_LIMITS)) problems.push(`a readUrl call in ${site}, which has no limit in MCP_READ_LIMITS`);
        else if (site in found) problems.push(`a second readUrl call in ${site}`);
        else if (bytes !== MCP_READ_LIMITS[site]) problems.push(`the readUrl call in ${site} passes ${bytes} bytes (${arg[1]}), not ${MCP_READ_LIMITS[site]}`);
        if (bytes !== null) found[site] = `${bytes / MiB} MiB (${arg[1]})`;
      }
      for (const site of Object.keys(MCP_READ_LIMITS)) if (!(site in found)) problems.push(`no readUrl call in ${site}`);
      assert.equal(problems.length, 0, problems.join('; '));
      return `1 safeFetch call, in readUrl; READ_DEADLINE_MS ${ms[1]}; limits ${Object.entries(found).map(([s, v]) => `${s} ${v}`).join(', ')}`;
    },
  },
  {
    name: `designesy_tokens_score reads a token file of exactly its ${TOKENS_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_tokens_score', { url: 'https://tokens-at.example.com/tokens.json' }, 'tokens-at.example.com/tokens.json', (p) => {
      assert.equal(p.total_tokens, 1, `${p.total_tokens} tokens, not 1`);
      return `score ${p.score}, ${p.total_tokens} token(s)`;
    }),
  },
  {
    name: `designesy_motion_score reads a Lottie file of exactly its ${LOTTIE_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_motion_score', { url: 'https://motion-at.example.com/anim.json' }, 'motion-at.example.com/anim.json', (p) => `score ${p.score}, ${p.layer_count} layer(s)`),
  },
  {
    name: `designesy_skill_md (cachedFetch) reads a document of exactly its ${DOC_LIMIT / MiB} MiB read limit whole`,
    run: async () => mcpAtLimit('designesy_skill_md', {}, 'www.designesy.org/contracts/skill', (p) => {
      const content = String(p.content);
      assert.equal(Buffer.byteLength(content), DOC_AT.length, `${Buffer.byteLength(content)} bytes of content, not ${DOC_AT.length}`);
      assert.ok(content.endsWith(DOC_END), 'the content does not end with the document\'s last line');
      return `${Buffer.byteLength(content)} bytes of content, ending with its last line`;
    }),
  },
  {
    name: "a token file or a cachedFetch JSON document that is not JSON fails with JSON.parse's own message, and one that starts with a byte order mark is read",
    run: async () => {
      const expected = parseMessage(NOT_JSON);
      const sameMessage = (tool, args) => async () => {
        const message = await toolError(tool, args);
        assert.equal(message, expected, `failed with "${message}", not JSON.parse's "${expected}"`);
        return `"${message}"`;
      };
      return eachRead([
        ['designesy_tokens_score, not JSON', sameMessage('designesy_tokens_score', { url: 'https://tokens-parse.example.com/not.json' })],
        ['designesy_agent_json (cachedFetch), not JSON', sameMessage('designesy_agent_json', {})],
        ['designesy_tokens_score, a byte order mark first', async () => {
          const p = await toolResult('designesy_tokens_score', { url: 'https://tokens-parse.example.com/bom.json' });
          assert.equal(p.total_tokens, 1, `${p.total_tokens} tokens, not 1`);
          return `score ${p.score}, ${p.total_tokens} token(s)`;
        }],
      ]);
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
    name: 'designesy_tokens_score still reads a token file whose server is quiet for 8 s before it answers',
    run: async () => {
      const t0 = performance.now();
      const { result, payload } = await h.callTool('designesy_tokens_score', { url: 'https://tokens-late.example.com/tokens.json' });
      const s = (performance.now() - t0) / 1000;
      assert.notEqual(result.isError, true, `returned an error after ${s.toFixed(2)} s: ${payload && payload.error}`);
      return `score ${payload.score} after ${s.toFixed(2)} s`;
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
console.log('Fetch bounds: a body stops at its cap as it arrives, a read at its caller\'s deadline and an MCP read at the route\'s deadline and its own byte limit, and no read leaves a listener on its signal.');
process.exit(0);
