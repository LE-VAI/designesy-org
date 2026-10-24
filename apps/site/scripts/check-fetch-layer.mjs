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
 *      or decoded) to cap + 1 bytes; with no cap a decoded body past 16 MiB
 *      rejects; a corrupt, truncated, unknown or stacked coding rejects; an
 *      error status keeps its raw body; 204, 205, 304, HEAD and an empty
 *      gzip body resolve.
 *   2. POST /api/score, universal mode: a redirected page's sheets come from
 *      the host that answered; the www. candidate likewise; a gzip page is
 *      read; a corrupt page is unreachable with reason network; a gzip 404
 *      stays http_error (a control); a gzip /DESIGN.md reaches v37's linter.
 *   3. POST /api/score, own-contract mode: a gzip bomb sheet is cut at its
 *      cap and the coverage notes say so; a sheet that does not decode is not
 *      counted as read; a gzip contract URL is parsed.
 *   4. drift, guardrails, monitor and compare read the redirected page's
 *      sheets from the host that answered.
 *   5. app/lib/page-fetch.ts's stylesheetLinkMatches returns what the
 *      combined pattern returns, on seeded inputs.
 *
 * PROVING IT CAN FAIL
 * --app <dir> runs the gate against another apps/site directory (a source
 * snapshot of main, say): every case but the controls fails there. --flip
 * expects every case but the controls to fail, and exits 1 when one holds.
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
const LOG = [];

const server = http.createServer((req, res) => {
  const host = req.headers['x-fetch-layer-host'];
  const key = `${host}${req.url}`;
  LOG.push({ host, path: req.url, method: req.method, headers: req.headers });
  const r = ROUTES.get(key) || { status: 404, headers: { 'content-type': 'text/plain' }, body: 'not here' };
  res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8', ...r.headers });
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

const { lint } = await import('@google/design.md/linter');
const h = createHarness({
  app: APP,
  realSafeFetch: true,
  lookup,
  stubs: { 'node:http': toLocal(http), 'node:https': toLocal(https), '@google/design.md/linter': { lint } },
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

rule('contentCodingOf reads none, gzip (x-gzip too), deflate and br, and refuses the rest', () => {
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
  no('zstd');
  no('compress');
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
rule('with no cap, a body that decodes past 16 MiB rejects', async () => {
  const { DEFAULT_MAX_DECODED_BYTES } = guard();
  assert.equal(DEFAULT_MAX_DECODED_BYTES, 16 * MiB);
  await rejects(fetchT('https://caps.fl.example.test/bomb.gz'), /content decoding failed/);
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

for (const host of ['gone.fl.example.test', 'www.gone.fl.example.test']) route(`${host}/`, 404, { 'content-encoding': 'gzip' }, 'garbage, not gzip');
control('a 404 marked gzip stays an http_error with its status', async () => {
  const r = await post(SCORE, { url: 'https://gone.fl.example.test/', scope: 'universal' });
  assert.equal(r.body.unreachable, true);
  assert.equal(r.body.unreachableReason, 'http_error');
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
