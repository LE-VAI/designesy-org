#!/usr/bin/env node
/**
 * Fetch layer: what the engine reads is the page the site served, decoded.
 *
 * WHY THIS EXISTS
 * Every score, every own-contract score and the drift, guardrails, monitor
 * and compare routes read a page and its stylesheets through url-guard's
 * safeFetch. Until engine 1.5.4 three things in that path read the wrong
 * bytes, and no check could tell:
 *   1. A stylesheet href was resolved against the URL requested, not the URL
 *      that answered. A page reached through a redirect (or through the www.
 *      candidate) that links "/assets/site.css" had that sheet fetched from
 *      the host it redirected away from, which can answer with HTML.
 *   2. A body sent with Content-Encoding gzip, deflate or br was never
 *      decoded, so compressed bytes were read as CSS or HTML.
 *   3. A <link> that writes href before rel=stylesheet was not read.
 *
 * HOW IT MEASURES
 * The real routes and the real safeFetch, loaded through scripts/lib/
 * route-harness.js with realSafeFetch. Two things are swapped, both below the
 * guard: node:dns/promises answers a public address, and node:http(s) connect
 * to a server on 127.0.0.1 that this script runs, keyed by the host name the
 * guard asked for. Every host is an *.example.test name and every body is
 * built here at run time. The server logs each request, so a case can assert
 * what was never asked for.
 *
 * WHAT IT ASSERTS
 *   1. Transport: contentCodingOf; safeFetch's resp.url is the last hop; each
 *      coding decodes to what zlib decodes; maxBodyBytes holds a body (plain
 *      or decoded) to cap + 1 bytes; with no cap a decoded body past 4 MiB
 *      rejects; a budget shared by reads bounds what they hold together, and
 *      a failed read gives its bytes back; a corrupt, truncated, registered
 *      but undecoded or stacked coding rejects, and an unregistered label
 *      reads as identity; the connection closes when a coded stream ends
 *      before the response does; a status outside 200-599 rejects at once; an
 *      error status keeps its raw body; 204, 205, 304, HEAD and an empty gzip
 *      body resolve.
 *   2. POST /api/score, universal mode: a redirected page's sheets come from
 *      the host that answered; the www. candidate likewise; a gzip page is
 *      read; a corrupt page is unreachable with reason network, and one whose
 *      coding names "abort" is not a timeout; a gzip 404 stays http_error
 *      with its status (a control); a 999 answer is http_error with its
 *      status, and a 999 sheet drops only itself; a gzip /DESIGN.md reaches
 *      v37's linter; 60 compressed sheets decode no more than the 16 MiB
 *      stylesheet budget between them (bytes counted at the decoders).
 *   3. POST /api/score, own-contract mode: a gzip bomb sheet is cut at its
 *      cap and the coverage notes say so; a sheet that does not decode is not
 *      counted as read; a gzip contract URL is parsed; a gzip contract past
 *      256 KB is contract_too_large (413), decoded no further than its cap.
 *   4. drift, guardrails, monitor and compare read the redirected page's
 *      sheets from the host that answered; drift's sheets decode no more than
 *      the 16 MiB stylesheet budget between them.
 *   5. app/lib/page-fetch.ts's stylesheetLinkMatches returns what the
 *      combined pattern returns, on seeded inputs.
 *
 * PROVING IT CAN FAIL
 * --app <dir> runs the gate against another apps/site directory (a source
 * snapshot of main, say): every case but the controls fails there. --flip
 * expects every case but the controls to fail, and exits 1 when one holds.
 * A control holds on main and on this build: it pins what the fix must not
 * change (an unregistered label read as identity, as main read it, say).
 *
 * Usage:  node scripts/check-fetch-layer.mjs [--app <dir>] [--flip]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argApp = process.argv.indexOf('--app');
const APP = argApp > 0 ? path.resolve(process.argv[argApp + 1]) : path.join(HERE, '..');
const FLIP = process.argv.includes('--flip');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');

/** A case that has not settled in this long has hung (a throw inside a socket handler, say). */
const CASE_DEADLINE_MS = 10_000;
const MiB = 1024 * 1024;

// ── Synthetic bodies ─────────────────────────────────────────────────────────

const SHEET = ':root{--paper:#fbfaf7;--ink:#14110f;--signal:#0a5bd8}body{color:var(--ink);background:var(--paper)}a{color:var(--signal)}';
const SHEET_TOKENS = 3;
const THEME = ':root{--radius-sm:4px;--space-2:8px}.card{border-radius:var(--radius-sm);padding:var(--space-2)}';
const THEME_TOKENS = 2;
/** What a host serves at a sheet path it does not have: a page, not CSS. */
const TRAP = '<!doctype html><html><head><title>Moved</title><style>:root{--trap-a:#f00;--trap-b:#0f0;--trap-c:#00f;--trap-d:#ff0}</style></head><body><p>This page has moved.</p></body></html>';
const page = (title, head = '', body = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body><main><h1>${title}</h1><p>A synthetic page for the fetch-layer gate.</p>${body}</main></body></html>`;
const INLINE_PAGE = page('Inline tokens', '<style>:root{--paper:#fff;--ink:#111;--signal:#06c;--muted:#666}body{color:var(--ink)}</style>');
const INLINE_TOKENS = 4;
/** 20 MiB of CSS comment once decoded, a few KiB on the wire. */
const BOMB_SOURCE = Buffer.concat([Buffer.from(':root{--paper:#fff}/*'), Buffer.alloc(20 * MiB, 0x61), Buffer.from('*/')]);
const BOMB_GZ = zlib.gzipSync(BOMB_SOURCE, { level: 9 });
const BOMB_BR = zlib.brotliCompressSync(BOMB_SOURCE, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
const CORRUPT = Buffer.from('this body says it is gzip and it is not: plain text that no decoder accepts, read as css it is garbage');
const TRUNCATED = zlib.gzipSync(SHEET).subarray(0, 20);
const DESIGN_MD = `---
name: Fetch layer fixture
colors:
  primary: "#0a5bd8"
  ink: "#14110f"
  paper: "#fbfaf7"
typography:
  body:
    fontFamily: Inter
    fontSize: 16px
---

# Fetch layer fixture

A synthetic DESIGN.md served gzip-encoded.
`;

const enc = {
  gzip: (s) => zlib.gzipSync(s),
  deflate: (s) => zlib.deflateSync(s),
  rawDeflate: (s) => zlib.deflateRawSync(s),
  br: (s) => zlib.brotliCompressSync(s),
};

// ── The local server: host + path -> [status, headers, body] ────────────────

const ROUTES = new Map();
const route = (hostPath, status, headers, body) => ROUTES.set(hostPath, { status, headers, body });
/** An answer that sends `body` and then keeps the connection open, sending nothing more. */
const held = (hostPath, status, headers, body) => ROUTES.set(hostPath, { status, headers, body, hold: true });
const LOG = [];
/** host + path -> whether the held connection has been closed, by the reader. */
const HELD = new Map();

const server = http.createServer((req, res) => {
  const host = req.headers['x-fetch-layer-host'];
  const key = `${host}${req.url}`;
  LOG.push({ host, path: req.url, method: req.method, headers: req.headers });
  const r = ROUTES.get(key) || { status: 404, headers: { 'content-type': 'text/plain' }, body: 'not here' };
  res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8', ...r.headers });
  if (r.hold) {
    HELD.set(key, false);
    req.socket.on('close', () => HELD.set(key, true));
    res.write(r.body);
    return;
  }
  res.end(req.method === 'HEAD' || r.body === undefined ? undefined : r.body);
});
server.keepAliveTimeout = 0;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const toLocal = (real) => ({
  ...real,
  request(opts, cb) {
    const o = { ...opts, hostname: '127.0.0.1', port: PORT, headers: { ...(opts.headers || {}), 'x-fetch-layer-host': opts.hostname } };
    delete o.lookup;
    return http.request(o, cb);
  },
});
const lookup = async () => [{ address: '93.184.215.14', family: 4 }];

// Every byte a decoder in the loaded modules produces, counted where zlib
// hands it on, and how many decoders are open at once. A bound that holds
// only after the bytes were decoded (and held) does not show here as one that
// stops the decoder; a br decoder keeps a window of up to 16 MiB while open.
const DECODED = { bytes: 0, live: 0, maxLive: 0 };
const countingZlib = { ...zlib };
for (const name of ['createGunzip', 'createInflate', 'createInflateRaw', 'createBrotliDecompress']) {
  countingZlib[name] = (...args) => {
    const d = zlib[name](...args);
    DECODED.live += 1;
    DECODED.maxLive = Math.max(DECODED.maxLive, DECODED.live);
    // Open until destroyed (which frees its window) or closed, whichever is first.
    let open = true;
    const shut = () => {
      if (open) DECODED.live -= 1;
      open = false;
    };
    const destroy = d.destroy.bind(d);
    d.destroy = (...a) => {
      shut();
      return destroy(...a);
    };
    d.once('close', shut);
    const push = d.push.bind(d);
    d.push = (chunk, encoding) => {
      if (chunk) DECODED.bytes += chunk.length;
      return push(chunk, encoding);
    };
    return d;
  };
}

const { lint } = await import('@google/design.md/linter');
const h = createHarness({
  app: APP,
  realSafeFetch: true,
  lookup,
  stubs: { 'node:http': toLocal(http), 'node:https': toLocal(https), 'node:zlib': countingZlib, '@google/design.md/linter': { lint } },
});

// A throw inside a socket handler (the 204 Response defect) would end the
// process; it is recorded instead, and the case it hangs fails at its deadline.
const uncaught = [];
process.on('uncaughtException', (e) => uncaught.push(String(e && e.message)));

const requested = (host, p) => LOG.some((l) => l.host === host && (p === undefined || l.path === p));
const post = (file, body) => h.post(file, body, { 'x-forwarded-for': '203.0.113.9' });

// ── Cases ────────────────────────────────────────────────────────────────────

const CASES = [];
let current = '';
const section = (t) => { current = t; };
/** A rule case fails on a build without the fix; a control passes on both. */
const rule = (name, fn) => CASES.push({ section: current, name, fn, control: false });
const control = (name, fn) => CASES.push({ section: current, name, fn, control: true });

// ── 1. Transport ─────────────────────────────────────────────────────────────
section('1. Transport (app/lib/url-guard.ts)');

const guard = () => h.load('app/lib/url-guard.ts');
const fetchT = (url, init) => guard().safeFetch(url, init);
const rejects = async (p, re) => {
  let err = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'the read resolved; it must reject');
  assert.match(String(err.message), re);
  // fetchContract and the routes classify a rejection by these two patterns:
  // a decoding failure must read as neither a timeout nor a blocked URL.
  assert.doesNotMatch(String(err.message), /abort/i);
  assert.doesNotMatch(String(err.message), /SSRF guard: blocked/);
  return err;
};

rule('contentCodingOf reads none, gzip (x-gzip too), deflate and br, passes an unregistered label as identity, and refuses registered codings it does not decode', () => {
  const { contentCodingOf } = guard();
  assert.equal(typeof contentCodingOf, 'function', 'url-guard exports no contentCodingOf');
  const ok = (v, coding) => assert.deepEqual(contentCodingOf(v), { ok: true, coding }, JSON.stringify(v));
  const no = (v) => assert.equal(contentCodingOf(v).ok, false, JSON.stringify(v));
  ok(undefined, null);
  ok('', null);
  ok('identity', null);
  ok(' Identity , ', null);
  ok('gzip', 'gzip');
  ok('X-GZIP', 'gzip');
  ok(' Deflate ', 'deflate');
  ok('br', 'br');
  ok(['gzip'], 'gzip');
  ok('gzip, identity', 'gzip');
  // A label no registry defines leaves the body as sent, as a browser reads it.
  ok('none', null);
  ok('UTF-8', null);
  ok('binary', null);
  ok('gzip, none', 'gzip');
  no('zstd');
  no('compress');
  no('x-compress');
  no('aes128gcm');
  no('gzip, br');
  no(['gzip', 'br']);
  no('gzip, gzip');
});

route('hop.fl.example.test/start', 302, { location: '/middle' }, '');
route('hop.fl.example.test/middle', 301, { location: 'https://end.fl.example.test/done/' }, '');
route('end.fl.example.test/done/', 200, {}, 'the page at the end of two redirects');
rule('resp.url is the URL that answered, after a relative and a cross-host redirect', async () => {
  const r = await fetchT('https://hop.fl.example.test/start');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'the page at the end of two redirects');
  assert.equal(r.url, 'https://end.fl.example.test/done/');
});

const CODINGS = [
  ['gzip', 'gzip', enc.gzip, zlib.gunzipSync],
  ['X-GZIP', 'xgzip', enc.gzip, zlib.gunzipSync],
  ['deflate (zlib-wrapped)', 'deflate', enc.deflate, zlib.inflateSync],
  ['deflate (raw)', 'rawdeflate', enc.rawDeflate, zlib.inflateRawSync],
  ['br', 'br', enc.br, zlib.brotliDecompressSync],
];
for (const [label, p, encode, decodeSync] of CODINGS) {
  const bytes = encode(SHEET);
  route(`codings.fl.example.test/${p}`, 200, { 'content-type': 'text/css', 'content-encoding': label.split(' ')[0] }, bytes);
  rule(`a 2xx body sent as ${label} reads as what zlib decodes, with no Content-Encoding left`, async () => {
    const r = await fetchT(`https://codings.fl.example.test/${p}`);
    const body = Buffer.from(await r.arrayBuffer());
    assert.deepEqual(body, decodeSync(bytes));
    assert.equal(body.toString(), SHEET);
    assert.equal(r.headers.get('content-encoding'), null);
    assert.equal(r.headers.get('content-length'), null);
  });
}

route('caps.fl.example.test/plain', 200, { 'content-type': 'text/css' }, 'x'.repeat(100));
route('caps.fl.example.test/bomb.gz', 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, BOMB_GZ);
route('caps.fl.example.test/bomb.br', 200, { 'content-type': 'text/css', 'content-encoding': 'br' }, BOMB_BR);
rule('maxBodyBytes holds a plain body to cap + 1 bytes', async () => {
  const r = await fetchT('https://caps.fl.example.test/plain', { maxBodyBytes: 10 });
  assert.equal((await r.arrayBuffer()).byteLength, 11);
});
for (const p of ['bomb.gz', 'bomb.br']) {
  rule(`maxBodyBytes holds a ${p === 'bomb.gz' ? 'gzip' : 'br'} bomb (${(p === 'bomb.gz' ? BOMB_GZ : BOMB_BR).length} bytes sent, 20 MiB decoded) to cap + 1 decoded bytes`, async () => {
    const r = await fetchT(`https://caps.fl.example.test/${p}`, { maxBodyBytes: 4 * MiB });
    const body = Buffer.from(await r.arrayBuffer());
    assert.equal(body.length, 4 * MiB + 1);
    assert.equal(body.subarray(0, 19).toString(), ':root{--paper:#fff}');
  });
}
rule('with no cap, a body that decodes past 4 MiB rejects', async () => {
  const { DEFAULT_MAX_DECODED_BYTES } = guard();
  assert.equal(DEFAULT_MAX_DECODED_BYTES, 4 * MiB);
  await rejects(fetchT('https://caps.fl.example.test/bomb.gz'), /content decoding failed/);
});

for (let i = 0; i < 6; i++) route(`budget.fl.example.test/b${i}`, 200, { 'content-type': 'text/css', 'content-encoding': 'br' }, BOMB_BR);
rule('six bombs read at once with a 10 MiB budget hold no more than 10 MiB between them, and a cut body says so', async () => {
  const { cutByBudget } = guard();
  assert.equal(typeof cutByBudget, 'function', 'url-guard exports no cutByBudget');
  const budget = { left: 10 * MiB };
  const before = DECODED.bytes;
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => fetchT(`https://budget.fl.example.test/b${i}`, { maxBodyBytes: 4 * MiB, budget })));
  const sizes = await Promise.all(rs.map(async (r) => (await r.arrayBuffer()).byteLength));
  const total = sizes.reduce((a, b) => a + b, 0);
  // One uncharged byte past its own cap per read, so a cut read is seen as cut.
  assert.ok(total <= 10 * MiB + 6, `held ${total} bytes`);
  assert.ok(sizes.every((n) => n <= 4 * MiB + 1), sizes.join(', '));
  assert.ok(budget.left >= 0 && budget.left < 4 * MiB, `left ${budget.left}`);
  assert.ok(rs.some((r) => cutByBudget(r)), 'no body says the budget cut it');
  // Six decoders, each stopped as its bound was reached: not 6 x 4 MiB.
  const decoded = DECODED.bytes - before;
  assert.ok(decoded <= 10 * MiB + 6 * 256 * 1024, `decoded ${decoded} bytes`);
});

for (let i = 0; i < 5; i++) route(`slots.fl.example.test/s${i}`, 200, { 'content-type': 'text/css', 'content-encoding': 'br' }, enc.br(SHEET));
rule('a budget of 2 decoders lets no more than 2 bodies decode at once; the rest wait their turn and are read', async () => {
  const budget = { left: 16 * MiB, decoders: 2 };
  DECODED.maxLive = DECODED.live;
  const base = DECODED.live;
  const texts = await Promise.all(Array.from({ length: 5 }, (_, i) => fetchT(`https://slots.fl.example.test/s${i}`, { budget }).then((r) => r.text())));
  assert.deepEqual(texts, Array(5).fill(SHEET));
  assert.ok(DECODED.maxLive - base <= 2, `${DECODED.maxLive - base} decoders were open at once`);
  assert.equal(budget.decoders, 2, 'a decoder was not given back');
});

held('slots.fl.example.test/held', 200, { 'content-type': 'text/css', 'content-encoding': 'deflate' }, enc.deflate(SHEET));
rule('a read aborted while it waits for a decoder gives its turn on, and the next read gets the decoder when it is free', async () => {
  const budget = { left: 16 * MiB, decoders: 1 };
  const outcome = (p) => p.then((r) => r.text(), (e) => e);
  // A holds the one decoder: its stream is complete, but its response never ends.
  const a = outcome(fetchT('https://slots.fl.example.test/held', { budget, signal: AbortSignal.timeout(700) }));
  await new Promise((res) => setTimeout(res, 100));
  const b = outcome(fetchT('https://slots.fl.example.test/s0', { budget, signal: AbortSignal.timeout(250) }));
  const c = outcome(fetchT('https://slots.fl.example.test/s1', { budget, signal: AbortSignal.timeout(5000) }));
  const [ra, rb, rc] = await Promise.all([a, b, c]);
  assert.equal(ra && ra.name, 'AbortError', `A ended with ${ra}`);
  assert.equal(rb && rb.name, 'AbortError', `B ended with ${rb}`);
  assert.equal(rc, SHEET);
  assert.equal(budget.decoders, 1, 'a decoder was not given back');
});

const HALF_GZ = zlib.gzipSync(Buffer.alloc(2 * MiB, 0x62)).subarray(0, 1500);
route('budget.fl.example.test/half', 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, HALF_GZ);
rule('a read that fails gives back what it was charged to the budget', async () => {
  const budget = { left: 8 * MiB };
  await rejects(fetchT('https://budget.fl.example.test/half', { maxBodyBytes: 4 * MiB, budget }), /content decoding failed \(gzip\)/);
  assert.equal(budget.left, 8 * MiB);
});

// A coded stream that ends before the response does: bytes after it, on a
// connection the server holds open. A br or deflate decoder ends at the end
// of its stream, so the read resolves; it must not go on reading the socket.
const TRAILING = Buffer.from('trailing bytes after the end of the coded stream');
const isClosed = async (key) => {
  for (let i = 0; i < 40 && !HELD.get(key); i++) await new Promise((res) => setTimeout(res, 25));
  return HELD.get(key) === true;
};
held('heldopen.fl.example.test/br', 200, { 'content-type': 'text/css', 'content-encoding': 'br' }, Buffer.concat([enc.br(SHEET), TRAILING]));
held('heldopen.fl.example.test/deflate', 200, { 'content-type': 'text/css', 'content-encoding': 'deflate' }, Buffer.concat([enc.deflate(SHEET), TRAILING]));
for (const p of ['br', 'deflate']) {
  rule(`a ${p} body whose stream ends before the response does resolves, and its connection is closed`, async () => {
    const r = await fetchT(`https://heldopen.fl.example.test/${p}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(await r.text(), SHEET);
    assert.ok(await isClosed(`heldopen.fl.example.test/${p}`), 'the connection is still open after the body was read');
  });
}
// With nothing after the stream, a decoder waits for the response to end, as
// a plain read does: the reader's own abort ends it, and closes the socket.
held('heldopen.fl.example.test/complete', 200, { 'content-type': 'text/css', 'content-encoding': 'deflate' }, enc.deflate(SHEET));
control('a complete coded stream on a connection held open ends at the reader\'s abort, and the connection is closed', async () => {
  let err = null;
  try {
    await fetchT('https://heldopen.fl.example.test/complete', { signal: AbortSignal.timeout(400) });
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.name === 'AbortError', `the read ended with ${err ? err.message : 'a body'}`);
  assert.ok(await isClosed('heldopen.fl.example.test/complete'), 'the connection is still open after the abort');
});

route('status.fl.example.test/nines', 999, { 'content-type': 'text/plain' }, 'Request denied');
rule('a 999 answer rejects at once with its status, instead of leaving the read open', async () => {
  const { InvalidStatusError } = guard();
  assert.equal(typeof InvalidStatusError, 'function', 'url-guard exports no InvalidStatusError');
  const t0 = Date.now();
  const err = await rejects(fetchT('https://status.fl.example.test/nines', { signal: AbortSignal.timeout(5000) }), /invalid HTTP status 999/);
  assert.ok(err instanceof InvalidStatusError);
  assert.equal(err.status, 999);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});

route('label.fl.example.test/none', 200, { 'content-type': 'text/css', 'content-encoding': 'none' }, SHEET);
control('a body labelled Content-Encoding: none reads as sent, as main read it', async () => {
  const r = await fetchT('https://label.fl.example.test/none');
  assert.equal(await r.text(), SHEET);
});

route('bad.fl.example.test/corrupt', 200, { 'content-encoding': 'gzip' }, CORRUPT);
route('bad.fl.example.test/truncated', 200, { 'content-encoding': 'gzip' }, TRUNCATED);
route('bad.fl.example.test/zstd', 200, { 'content-encoding': 'zstd' }, Buffer.from('(not zstd either)'));
route('bad.fl.example.test/stacked', 200, { 'content-encoding': 'gzip, br' }, zlib.brotliCompressSync(zlib.gzipSync(SHEET)));
route('bad.fl.example.test/deflate-corrupt', 200, { 'content-encoding': 'deflate' }, CORRUPT);
for (const [p, re] of [['corrupt', /content decoding failed \(gzip\)/], ['truncated', /content decoding failed \(gzip\)/], ['deflate-corrupt', /content decoding failed \(deflate\)/], ['zstd', /unsupported Content-Encoding "zstd"/], ['stacked', /unsupported Content-Encoding "gzip, br"/]]) {
  rule(`a ${p} body rejects as a decoding failure, never as compressed text`, async () => {
    await rejects(fetchT(`https://bad.fl.example.test/${p}`), re);
  });
}

route('status.fl.example.test/missing', 404, { 'content-encoding': 'gzip' }, 'garbage');
route('status.fl.example.test/no-content', 204, { 'content-encoding': 'gzip' }, undefined);
route('status.fl.example.test/reset', 205, {}, undefined);
route('status.fl.example.test/not-modified', 304, { etag: '"x"' }, undefined);
route('status.fl.example.test/empty', 200, { 'content-encoding': 'gzip' }, Buffer.alloc(0));
route('status.fl.example.test/head', 200, { 'content-encoding': 'gzip' }, enc.gzip(SHEET));
control('an error status keeps its raw body and its Content-Encoding header', async () => {
  const r = await fetchT('https://status.fl.example.test/missing');
  assert.equal(r.status, 404);
  assert.equal(await r.text(), 'garbage');
  assert.equal(r.headers.get('content-encoding'), 'gzip');
});
for (const [p, status] of [['no-content', 204], ['reset', 205], ['not-modified', 304]]) {
  rule(`a ${status} answer resolves with no body (a non-null body made new Response throw)`, async () => {
    const r = await fetchT(`https://status.fl.example.test/${p}`);
    assert.equal(r.status, status);
    assert.equal(await r.text(), '');
  });
}
control('an empty 200 body marked gzip resolves as an empty body (gunzip of no bytes is an error)', async () => {
  const r = await fetchT('https://status.fl.example.test/empty');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '');
});
control('a HEAD request resolves, with nothing decoded', async () => {
  const r = await fetchT('https://status.fl.example.test/head', { method: 'HEAD' });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '');
});

// ── 2. POST /api/score, universal mode ───────────────────────────────────────
section('2. POST /api/score, universal mode (app/api/score/route.ts)');

const SCORE = 'app/api/score/route.ts';
const scored = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.unreachable, undefined, r.body.unreachableDetail);
  assert.equal(typeof r.body.score, 'number');
};

// A page that moved: its sheets live on the host it moved to. The host it
// moved away from answers each sheet path with an HTML page.
const MOVED = page('Moved page', '<link rel=stylesheet href="/assets/site.css"><link href="theme.css" rel="stylesheet">');
const movedSite = (from, to) => {
  route(`${from}/x/`, 301, { location: `https://${to}/x/` }, '');
  route(`${to}/x/`, 200, {}, MOVED);
  route(`${to}/assets/site.css`, 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, enc.gzip(SHEET));
  route(`${to}/x/theme.css`, 200, { 'content-type': 'text/css', 'content-encoding': 'br' }, enc.br(THEME));
  route(`${from}/assets/site.css`, 200, {}, TRAP);
  route(`${from}/x/theme.css`, 200, {}, TRAP);
};
const trapAsked = (from) => requested(from, '/assets/site.css') || requested(from, '/x/theme.css');

movedSite('old.fl.example.test', 'new.fl.example.test');
rule('a redirected page reads its sheets from the host it landed on: a gzip sheet, and a br sheet linked href first', async () => {
  const r = await post(SCORE, { url: 'https://old.fl.example.test/x/', scope: 'universal' });
  scored(r);
  assert.ok(!trapAsked('old.fl.example.test'), 'a sheet was asked of the host the page moved away from');
  assert.equal(r.body.tokensExtracted, SHEET_TOKENS + THEME_TOKENS);
});

route('bare.fl.example.test/', 403, {}, 'Forbidden');
route('www.bare.fl.example.test/', 200, {}, page('www candidate', '<link rel="stylesheet" href="/w.css">'));
route('www.bare.fl.example.test/w.css', 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, enc.gzip(SHEET));
route('bare.fl.example.test/w.css', 200, {}, TRAP);
rule('the www. candidate that answered is the base for its sheets', async () => {
  const r = await post(SCORE, { url: 'https://bare.fl.example.test/', scope: 'universal' });
  scored(r);
  assert.ok(!requested('bare.fl.example.test', '/w.css'), 'the sheet was asked of the bare host');
  assert.equal(r.body.tokensExtracted, SHEET_TOKENS);
});

route('gzpage.fl.example.test/', 200, { 'content-encoding': 'gzip' }, enc.gzip(INLINE_PAGE));
rule('a page sent gzip-encoded is scored from its decoded HTML', async () => {
  const r = await post(SCORE, { url: 'https://gzpage.fl.example.test/', scope: 'universal' });
  scored(r);
  assert.equal(r.body.tokensExtracted, INLINE_TOKENS);
});

for (const host of ['cpage.fl.example.test', 'www.cpage.fl.example.test']) route(`${host}/`, 200, { 'content-encoding': 'gzip' }, Buffer.from(INLINE_PAGE));
rule('a page that does not decode is unreachable with reason network, not graded as compressed bytes', async () => {
  const r = await post(SCORE, { url: 'https://cpage.fl.example.test/', scope: 'universal' });
  assert.equal(r.status, 200);
  assert.equal(r.body.unreachable, true);
  assert.equal(r.body.unreachableReason, 'network');
  assert.equal(r.body.score, null);
});

for (const host of ['abortenc.fl.example.test', 'www.abortenc.fl.example.test']) route(`${host}/`, 200, { 'content-encoding': 'x-abort, zstd' }, Buffer.from(INLINE_PAGE));
rule('a page whose refused coding names "abort" is unreachable with reason network, not timeout', async () => {
  const r = await post(SCORE, { url: 'https://abortenc.fl.example.test/', scope: 'universal' });
  assert.equal(r.body.unreachable, true);
  assert.equal(r.body.unreachableReason, 'network');
});

for (const host of ['gone.fl.example.test', 'www.gone.fl.example.test']) route(`${host}/`, 404, { 'content-encoding': 'gzip' }, 'garbage, not gzip');
control('a 404 marked gzip stays an http_error with its status', async () => {
  const r = await post(SCORE, { url: 'https://gone.fl.example.test/', scope: 'universal' });
  assert.equal(r.body.unreachable, true);
  assert.equal(r.body.unreachableReason, 'http_error');
  assert.match(r.body.unreachableDetail, /HTTP 404/);
});

for (const host of ['nines.fl.example.test', 'www.nines.fl.example.test']) route(`${host}/`, 999, { 'content-type': 'text/plain' }, 'Request denied');
rule('a page that answers 999 on every candidate is an http_error with that status, at once', async () => {
  const t0 = Date.now();
  const r = await post(SCORE, { url: 'https://nines.fl.example.test/', scope: 'universal' });
  assert.equal(r.body.unreachable, true);
  assert.equal(r.body.unreachableReason, 'http_error');
  assert.match(r.body.unreachableDetail, /HTTP 999/);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
});

route('ninesheet.fl.example.test/', 200, {}, page('A 999 sheet', '<link rel="stylesheet" href="/good.css"><link rel="stylesheet" href="/denied.css">'));
route('ninesheet.fl.example.test/good.css', 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, enc.gzip(SHEET));
route('ninesheet.fl.example.test/denied.css', 999, { 'content-type': 'text/plain' }, 'Request denied');
rule('a sheet that answers 999 drops only itself: the other sheet is read, well inside the stylesheet deadline', async () => {
  const t0 = Date.now();
  const r = await post(SCORE, { url: 'https://ninesheet.fl.example.test/', scope: 'universal' });
  scored(r);
  assert.equal(r.body.tokensExtracted, SHEET_TOKENS);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
});

// A page sent gzip (so a build that does not decode reads no tokens at all)
// that links 60 distinct br bombs, each 20 MiB decoded and a few KiB sent.
const MANY = 60;
route('many.fl.example.test/', 200, { 'content-encoding': 'gzip' }, enc.gzip(page('Many bombs', `<style>:root{--paper:#fff;--ink:#111;--signal:#06c;--muted:#666}</style>${Array.from({ length: MANY }, (_, i) => `<link rel="stylesheet" href="/s.css?${i}">`).join('')}`)));
for (let i = 0; i < MANY; i++) route(`many.fl.example.test/s.css?${i}`, 200, { 'content-type': 'text/css', 'content-encoding': 'br' }, BOMB_BR);
rule(`${MANY} br bomb sheets asked for at once decode no more than the 16 MiB stylesheet budget between them, at most 8 at a time`, async () => {
  const before = DECODED.bytes;
  DECODED.maxLive = DECODED.live;
  const r = await post(SCORE, { url: 'https://many.fl.example.test/', scope: 'universal' });
  scored(r);
  assert.equal(r.body.tokensExtracted, INLINE_TOKENS);
  const decoded = DECODED.bytes - before;
  // The budget, the page, and at most a few decoder chunks per sheet past it.
  // Each sheet held to its 4 MiB cap alone would decode 240 MiB.
  assert.ok(decoded <= 16 * MiB + MANY * 256 * 1024, `the decoders produced ${(decoded / MiB).toFixed(1)} MiB`);
  // Eight sheets' decoders, and the page's or /DESIGN.md's at the edges.
  assert.ok(DECODED.maxLive <= 9, `${DECODED.maxLive} decoders were open at once`);
});

route('md.fl.example.test/', 200, {}, INLINE_PAGE);
route('md.fl.example.test/DESIGN.md', 200, { 'content-type': 'text/markdown', 'content-encoding': 'gzip' }, enc.gzip(DESIGN_MD));
rule('a gzip /DESIGN.md is read decoded, so v37 runs the linter on it', async () => {
  const r = await post(SCORE, { url: 'https://md.fl.example.test/', scope: 'universal' });
  scored(r);
  const v37 = r.body.checks.find((c) => c.id === 'v37');
  assert.ok(v37, 'no v37 in the result');
  assert.ok(['PASS', 'WARN', 'FAIL'].includes(v37.status), `${v37.status}: ${v37.detail}`);
  assert.doesNotMatch(v37.detail, /does not appear to be a valid DESIGN\.md|not publicly served|could not fetch/);
});

route('ae.fl.example.test/', 200, {}, page('Accept-Encoding', '<link rel="stylesheet" href="/a.css">'));
route('ae.fl.example.test/a.css', 200, { 'content-type': 'text/css' }, SHEET);
rule('the page, its sheets and /DESIGN.md are asked for with Accept-Encoding: gzip, deflate, br', async () => {
  scored(await post(SCORE, { url: 'https://ae.fl.example.test/', scope: 'universal' }));
  const asked = LOG.filter((l) => l.host === 'ae.fl.example.test');
  assert.deepEqual(asked.map((l) => l.path).sort(), ['/', '/DESIGN.md', '/a.css']);
  for (const l of asked) assert.equal(l.headers['accept-encoding'], 'gzip, deflate, br', l.path);
});

// ── 3. POST /api/score, own-contract mode ────────────────────────────────────
section('3. POST /api/score, own-contract mode (contract scoring reads pages through the same fetch)');

const CONTRACT = (await import('node:fs')).readFileSync(path.join(HERE, 'fixtures', 'own-contract', 'DM-1.md'), 'utf8');

route('ocbomb.fl.example.test/', 200, {}, page('Own contract, bomb sheet', '<link rel="stylesheet" href="/bomb.css">'));
route('ocbomb.fl.example.test/bomb.css', 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, BOMB_GZ);
rule('a gzip bomb sheet is read up to the stylesheet cap, and the coverage notes say so (DOCUMENT_CAP)', async () => {
  const r = await post(SCORE, { url: 'https://ocbomb.fl.example.test/', contract: { content: CONTRACT } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.mode, 'own-contract');
  assert.ok(r.body.coverage.notes.some((n) => n.startsWith('DOCUMENT_CAP')), r.body.coverage.notes.join(' | '));
});

route('ocbad.fl.example.test/', 200, {}, page('Own contract, two sheets', '<link rel="stylesheet" href="/bad.css"><link rel="stylesheet" href="/good.css">'));
route('ocbad.fl.example.test/bad.css', 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, CORRUPT);
route('ocbad.fl.example.test/good.css', 200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, enc.gzip(SHEET));
rule('a sheet that does not decode is not counted as read: 1 of 2 stylesheets fetched', async () => {
  const r = await post(SCORE, { url: 'https://ocbad.fl.example.test/', contract: { content: CONTRACT } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.site.stylesheetsTotal, 2);
  assert.equal(r.body.site.stylesheetsFetched, 1);
});

route('ocpage.fl.example.test/', 200, {}, INLINE_PAGE);
route('contract.fl.example.test/DESIGN.md', 200, { 'content-type': 'text/markdown', 'content-encoding': 'gzip' }, enc.gzip(CONTRACT));
rule('a contract URL served gzip-encoded is parsed as the contract it decodes to', async () => {
  const r = await post(SCORE, { url: 'https://ocpage.fl.example.test/', contract: { url: 'https://contract.fl.example.test/DESIGN.md' } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.ownContract.source, 'url');
  const inline = await post(SCORE, { url: 'https://ocpage.fl.example.test/', contract: { content: CONTRACT } });
  assert.equal(r.body.ownContract.digest, inline.body.ownContract.digest);
});

route('ocpage2.fl.example.test/', 200, {}, INLINE_PAGE);
const BIG_CONTRACT = `${CONTRACT}\n${'<!-- padding -->\n'.repeat(Math.ceil((1 * MiB) / 17))}`;
route('contract.fl.example.test/BIG.md', 200, { 'content-type': 'text/markdown', 'content-encoding': 'gzip' }, enc.gzip(BIG_CONTRACT));
rule('a gzip contract past 256 KB is contract_too_large (413), decoded no further than its cap', async () => {
  const before = DECODED.bytes;
  const r = await post(SCORE, { url: 'https://ocpage2.fl.example.test/', contract: { url: 'https://contract.fl.example.test/BIG.md' } });
  assert.equal(r.status, 413, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.code, 'contract_too_large');
  assert.match(r.body.error, /more than 256 KB/);
  const decoded = DECODED.bytes - before;
  assert.ok(decoded <= 256 * 1024 + 256 * 1024, `the decoder produced ${decoded} bytes of a ${BIG_CONTRACT.length}-byte contract`);
});

// ── 4. drift, guardrails, monitor and compare ───────────────────────────────
section('4. drift, guardrails, monitor and compare (app/lib/page-fetch.ts)');

const ROUTES_4 = [
  ['drift', 'app/api/drift/route.ts', (url) => ({ url }), (b) => b.tokensExtracted],
  ['guardrails', 'app/api/guardrails/route.ts', (url) => ({ url }), (b) => b.tokensExtracted],
  ['monitor', 'app/api/monitor/route.ts', (url) => ({ url }), (b) => b.currentSnapshot && b.currentSnapshot.tokensExtracted],
  ['compare', 'app/api/compare/route.ts', (url) => ({ urlA: url, urlB: 'https://plain-compare.fl.example.test/' }), (b) => b.tokensA],
];
route('plain-compare.fl.example.test/', 200, {}, INLINE_PAGE);
for (const [name, file, body, tokens] of ROUTES_4) {
  const from = `old-${name}.fl.example.test`;
  const to = `new-${name}.fl.example.test`;
  movedSite(from, to);
  rule(`${name} reads a redirected page's sheets from the host it landed on, as many tokens as the page read directly`, async () => {
    const moved = await post(file, body(`https://${from}/x/`));
    assert.equal(moved.status, 200, JSON.stringify(moved.body).slice(0, 300));
    assert.ok(!trapAsked(from), 'a sheet was asked of the host the page moved away from');
    const direct = await post(file, body(`https://${to}/x/`));
    assert.equal(direct.status, 200, JSON.stringify(direct.body).slice(0, 300));
    assert.equal(tokens(direct.body), SHEET_TOKENS + THEME_TOKENS, 'the page read directly: the gzip sheet and the br sheet linked href first');
    assert.equal(tokens(moved.body), tokens(direct.body));
  });
}

const DRIFT_MANY = 20;
route('driftmany.fl.example.test/', 200, { 'content-encoding': 'gzip' }, enc.gzip(page('Many bombs, drift', `<style>:root{--paper:#fff;--ink:#111;--signal:#06c;--muted:#666}</style>${Array.from({ length: DRIFT_MANY }, (_, i) => `<link rel="stylesheet" href="/s.css?${i}">`).join('')}`)));
for (let i = 0; i < DRIFT_MANY; i++) route(`driftmany.fl.example.test/s.css?${i}`, 200, { 'content-type': 'text/css', 'content-encoding': 'br' }, BOMB_BR);
rule(`drift: ${DRIFT_MANY} br bomb sheets decode no more than the 16 MiB stylesheet budget between them, and no sheet is asked for once it is spent`, async () => {
  const before = DECODED.bytes;
  const r = await post('app/api/drift/route.ts', { url: 'https://driftmany.fl.example.test/' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.tokensExtracted, INLINE_TOKENS);
  const decoded = DECODED.bytes - before;
  assert.ok(decoded <= 16 * MiB + DRIFT_MANY * 256 * 1024, `the decoders produced ${(decoded / MiB).toFixed(1)} MiB`);
  const asked = LOG.filter((l) => l.host === 'driftmany.fl.example.test' && l.path.startsWith('/s.css')).length;
  assert.ok(asked <= 5, `${asked} of ${DRIFT_MANY} sheets were asked for`);
});

rule('the four routes ask for the page and its sheets with Accept-Encoding: gzip, deflate, br', () => {
  const asked = LOG.filter((l) => ROUTES_4.some(([name]) => l.host === `new-${name}.fl.example.test`));
  assert.ok(asked.length >= 12, `only ${asked.length} requests reached the hosts the routes read`);
  for (const l of asked) assert.equal(l.headers['accept-encoding'], 'gzip, deflate, br', `${l.host}${l.path}`);
});

// ── 5. The shared link scanner ───────────────────────────────────────────────
section('5. app/lib/page-fetch.ts stylesheetLinkMatches');

const LINK_ORACLE = /<link(?:[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']|[^>]*href=["']([^"']+)["'][^>]*rel=["']?stylesheet)/gi;
const oracleLinks = (s) => {
  const out = [];
  LINK_ORACLE.lastIndex = 0;
  for (let m = LINK_ORACLE.exec(s); m; m = LINK_ORACLE.exec(s)) out.push({ index: m.index, text: m[0], groups: [m[1] ?? m[2]] });
  return out;
};
rule('returns what the combined pattern returns on 2,000 seeded inputs, href-first tags among them', () => {
  const { stylesheetLinkMatches } = h.load('app/lib/page-fetch.ts');
  const alphabet = ['<link', '<LINK', ' ', 'rel=', 'rel="stylesheet"', "rel='stylesheet'", 'rel=stylesheet', 'stylesheet', 'href=', 'href="', "href='", 'a.css', '"', "'", '>', 'x', ' rel="stylesheet">', 'href="a.css" ', '<', 'REL=STYLESHEET', 'HREF="'];
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let hrefFirst = 0;
  for (let i = 0; i < 2000; i++) {
    let s = '';
    const len = 1 + Math.floor(rand() * 30);
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rand() * alphabet.length)];
    const want = oracleLinks(s);
    assert.deepEqual(stylesheetLinkMatches(s), want, JSON.stringify(s));
    if (want.some((m) => /^<link[^>]*?href=["'][^"']+["'][^>]*rel=/i.test(m.text) && !/rel=["']?stylesheet["']?[^>]*href=/i.test(m.text))) hrefFirst++;
  }
  assert.ok(hrefFirst >= 20, `only ${hrefFirst} inputs matched by href before rel`);
});

// ── Run ──────────────────────────────────────────────────────────────────────

console.log(`Fetch layer (${path.relative(process.cwd(), APP) || '.'}, node ${process.version}${FLIP ? ', --flip' : ''})`);
const failures = [];
let last = '';
for (const c of CASES) {
  if (c.section !== last) {
    console.log(`\n${c.section}`);
    last = c.section;
  }
  let why = null;
  let timer;
  const before = uncaught.length;
  try {
    await Promise.race([
      Promise.resolve().then(c.fn),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`still open after ${CASE_DEADLINE_MS / 1000} s`)), CASE_DEADLINE_MS); }),
    ]);
  } catch (e) {
    const lines = String(e && e.message).split('\n').map((l) => l.trim()).filter(Boolean);
    why = lines.slice(0, 4).join(' / ').slice(0, 300) || String((e && e.name) || 'failed');
  } finally {
    clearTimeout(timer);
  }
  if (uncaught.length > before) why = `${why ? `${why}; ` : ''}uncaught: ${uncaught.slice(before).join('; ')}`;
  const held = why === null;
  // Under --flip a control must still hold; every other case must fail.
  const ok = c.control ? held : held !== FLIP;
  if (!ok) failures.push(c.name);
  const tag = c.control ? ' (control)' : '';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${c.name}${tag}${why ? `\n          ${why}` : ''}`);
}

server.closeAllConnections();
server.close();
console.log(`\n${CASES.length - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(FLIP ? 'Fetch layer (--flip): a case held on this build, so it does not prove the fix.' : `Fetch layer: ${failures.length} case(s) failed.`);
  process.exit(1);
}
console.log(FLIP ? 'Fetch layer (--flip): every rule case failed and every control held, as expected.' : 'Fetch layer: every read is the page the site served, decoded.');
process.exit(0);
