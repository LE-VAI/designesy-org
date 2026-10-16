#!/usr/bin/env node
/**
 * Score read bounds: a slow or stalled third-party server cannot hold
 * POST /api/score open past its own read timeouts.
 *
 * WHY THIS EXISTS
 * Every read the route makes (the page, its stylesheets, /DESIGN.md, a linked
 * contract) goes through url-guard's safeFetch with an AbortSignal on a timer.
 * The timer only helps if the transport honours it on every path. Measured
 * before this gate: when the signal fired while a redirect hop's DNS check was
 * still running, the next hop's request went out with no timeout and no abort
 * listener, so a host with a slow resolver followed by a server that sent one
 * byte every half second held the page read, and /DESIGN.md read, open with no
 * end (the run was cut at 60 s by the measuring script, not by the route).
 *
 * HOW IT MEASURES
 * The real route and the real safeFetch, loaded through scripts/lib/
 * route-harness.js with realSafeFetch. Two things are swapped, both below the
 * guard: node:dns/promises answers a public address (after a delay, for the
 * slow-resolver cases), and node:http(s) connect to a server on 127.0.0.1 that
 * this script runs. The server trickles one byte every 500 ms, which keeps a
 * socket's idle timer from ending the read first, so what ends it is the
 * route's own timeout. The cases run concurrently, each on its own host names.
 *
 * WHAT IT ASSERTS, per case: the status and the existing public error shape,
 * and that the run ended inside its budget (the read timeouts it passes
 * through, plus a margin). A run still open at the case deadline fails.
 *
 * PROVING IT CAN FAIL
 * --app <dir> runs the gate against another apps/site directory (a copy with a
 * timeout removed, say); each case whose timeout is gone fails at its
 * deadline. --flip expects every case to miss its budget and exits 1 when they
 * hold.
 *
 * Usage:  node scripts/check-score-read-bounds.mjs [--app <dir>] [--flip]
 * Exits 1 on any failure.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argApp = process.argv.indexOf('--app');
const APP = argApp > 0 ? path.resolve(process.argv[argApp + 1]) : path.join(HERE, '..');
const FLIP = process.argv.includes('--flip');
const require = createRequire(import.meta.url);
const { createHarness } = require('./lib/route-harness.js');

/** How long a case may run past its expected end before it fails. */
const MARGIN_S = 2;
/** A case still open this long after it started has no bound at all. */
const CASE_DEADLINE_S = 45;
/** The slow resolver outlasts every read timeout the route sets. */
const SLOW_DNS_MS = 9_000;

const PAGE = '<!doctype html><html lang="en"><head><title>Read bounds</title><style>:root{--paper:#fff;--ink:#111;--signal:#06c}body{color:var(--ink);background:var(--paper)}</style></head><body><main><h1>Read bounds</h1><p>A page that answers at once.</p></main></body></html>';
const pageWithSheet = (href) => PAGE.replace('</head>', `<link rel="stylesheet" href="${href}"></head>`);
const redirect = (to) => ({ status: 302, location: to });
const TRICKLE = { trickle: true };

// host + path -> behaviour. Each case below owns its host names.
const ROUTES = {
  'ok.example.com/': { body: PAGE },
  'c-trickle.example.com/DESIGN.md': TRICKLE,
  'c-redirect.example.com/DESIGN.md': redirect('https://c-slowdns.example.com/DESIGN.md'),
  'c-slowdns.example.com/DESIGN.md': TRICKLE,
  'www.p-trickle.example.com/': TRICKLE,
  'www.p-redirect.example.com/': redirect('https://p-slowdns.example.com/'),
  'p-slowdns.example.com/': TRICKLE,
  'd-redirect.example.com/': { body: PAGE },
  'd-redirect.example.com/DESIGN.md': redirect('https://d-slowdns.example.com/DESIGN.md'),
  'd-slowdns.example.com/DESIGN.md': TRICKLE,
  's-redirect.example.com/': { body: pageWithSheet('/site.css') },
  's-redirect.example.com/site.css': redirect('https://s-slowdns.example.com/site.css'),
  's-slowdns.example.com/site.css': TRICKLE,
};
const SLOW_HOSTS = new Set(['c-slowdns.example.com', 'p-slowdns.example.com', 'd-slowdns.example.com', 's-slowdns.example.com']);

const server = http.createServer((req, res) => {
  const b = ROUTES[`${req.headers['x-read-bounds-host']}${req.url}`] || { status: 404, body: 'not here' };
  res.writeHead(b.status || 200, { 'content-type': 'text/html', ...(b.location ? { location: b.location } : {}) });
  if (!b.trickle) return res.end(b.body || '');
  const t = setInterval(() => res.write(' '), 500);
  res.on('close', () => clearInterval(t));
});
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 0;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// The guard's sockets reach the local server; every other option (the
// method, the headers, the signal handling) is the guard's own.
const toLocal = (real) => ({
  ...real,
  request(opts, cb) {
    const o = { ...opts, hostname: '127.0.0.1', port: PORT, headers: { ...(opts.headers || {}), 'x-read-bounds-host': opts.hostname } };
    delete o.lookup;
    return http.request(o, cb);
  },
});
const lookup = async (hostname) => {
  if (SLOW_HOSTS.has(hostname)) await new Promise((r) => setTimeout(r, SLOW_DNS_MS));
  return [{ address: '93.184.215.14', family: 4 }];
};

const { lint } = await import('@google/design.md/linter');
const h = createHarness({
  app: APP,
  realSafeFetch: true,
  lookup,
  stubs: { 'node:http': toLocal(http), 'node:https': toLocal(https), '@google/design.md/linter': { lint } },
});
const route = 'app/api/score/route.ts';
h.load(route);

const CONTRACT_PROBLEM = (r) => {
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'contract_not_scoreable');
  assert.equal(r.body.problems.length, 1);
  assert.equal(r.body.problems[0].code, 'CONTRACT_URL_UNREACHABLE');
  assert.equal(r.body.problems[0].why, 'timeout');
};
const PAGE_UNREACHABLE = (r) => {
  assert.equal(r.status, 200);
  assert.equal(r.body.unreachable, true);
  assert.equal(r.body.unreachableReason, 'timeout');
  assert.equal(r.body.score, null);
};
const SCORED = (r) => {
  assert.equal(r.status, 200);
  assert.equal(r.body.unreachable, undefined);
  assert.equal(typeof r.body.score, 'number');
};

// expect: the seconds of read timeouts the run passes through before it answers.
const CASES = [
  { name: 'a linked contract that trickles ends at its 8 s timeout (422 CONTRACT_URL_UNREACHABLE, timeout)', body: { url: 'ok.example.com', contract: { url: 'https://c-trickle.example.com/DESIGN.md' } }, expect: 8, shape: CONTRACT_PROBLEM },
  { name: 'a linked contract redirected to a slow resolver, then a trickle, ends at 8 s (422, timeout)', body: { url: 'ok.example.com', contract: { url: 'https://c-redirect.example.com/DESIGN.md' } }, expect: 8, shape: CONTRACT_PROBLEM },
  { name: 'a page that trickles on both candidate URLs ends at 2 x 8 s (unreachable, timeout)', body: { url: 'www.p-trickle.example.com' }, expect: 16, shape: PAGE_UNREACHABLE },
  { name: 'a page redirected to a slow resolver, then a trickle, ends at 2 x 8 s (unreachable, timeout)', body: { url: 'www.p-redirect.example.com' }, expect: 16, shape: PAGE_UNREACHABLE },
  { name: '/DESIGN.md redirected to a slow resolver, then a trickle, ends at its 5 s timeout and the page is scored', body: { url: 'd-redirect.example.com' }, expect: 5, shape: SCORED },
  { name: 'a stylesheet redirected to a slow resolver, then a trickle, ends at its 8 s timeout and the page is scored', body: { url: 's-redirect.example.com' }, expect: 8, shape: SCORED },
];

console.log(`Score read bounds (${path.relative(process.cwd(), APP) || '.'}, node ${process.version}, margin ${MARGIN_S} s, case deadline ${CASE_DEADLINE_S} s)`);
const results = await Promise.all(CASES.map(async (c) => {
  const t0 = performance.now();
  let timer;
  const deadline = new Promise((res) => { timer = setTimeout(() => res(null), CASE_DEADLINE_S * 1000); });
  let r;
  let error = null;
  try {
    r = await Promise.race([h.post(route, c.body), deadline]);
  } catch (e) {
    error = e;
  } finally {
    clearTimeout(timer);
  }
  return { c, r, error, s: (performance.now() - t0) / 1000 };
}));

const failures = [];
for (const { c, r, error, s } of results) {
  let why = null;
  try {
    if (error) throw error;
    if (r === null) throw new Error(`still open at the ${CASE_DEADLINE_S} s case deadline: no bound`);
    c.shape(r);
    assert.ok(s <= c.expect + MARGIN_S, `${s.toFixed(2)} s is over the ${c.expect} s budget plus ${MARGIN_S} s`);
    assert.ok(s >= c.expect - 0.5, `${s.toFixed(2)} s is under the ${c.expect} s the read timeouts allow: the case did not reach the timeout it tests`);
  } catch (e) {
    why = String(e && e.message).split('\n')[0];
  }
  const held = why === null;
  if (held === FLIP) failures.push(c.name);
  console.log(`  ${held === !FLIP ? 'ok  ' : 'FAIL'}  ${s.toFixed(2).padStart(6)} s  ${c.name}${why ? `\n                   ${why}` : ''}`);
}

server.closeAllConnections();
server.close();
console.log(`\n${CASES.length - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(FLIP ? 'Score read bounds (--flip): a case held its budget, so the flip did not fail it.' : `Score read bounds: ${failures.length} case(s) not bounded.`);
  process.exit(1);
}
console.log(FLIP ? 'Score read bounds (--flip): every case missed its budget, as expected.' : 'Score read bounds: every read ends inside its budget.');
process.exit(0);
