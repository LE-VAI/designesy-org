/**
 * The engine connects directly to each site and does not use proxy settings
 * from the environment, so its address check applies to every request: the
 * page and its other candidate URLs, each redirect, each stylesheet and the
 * /DESIGN.md probe.
 *
 * Node can send a node:https request through a proxy: one named in the
 * environment (HTTPS_PROXY, used when NODE_USE_ENV_PROXY=1 or
 * --use-env-proxy is set), or one that code in the process gave
 * https.globalAgent. The proxy then resolves the site's name and connects to
 * it. The engine sends every request on one agent of its own, which has no
 * proxy, so it resolves each name itself and the address check judges every
 * answer.
 *
 * Each test runs the engine in a child process with the proxy settings under
 * test. A loopback proxy here records each request it is sent and answers
 * 502, so no tunnel opens. In the child, node:dns/promises lookup is
 * replaced: it records each name and answers 192.0.2.1, a documentation
 * address the check refuses, no address at all, or the answers a test gives
 * in turn, so no request leaves this machine. The child's node:https get is
 * wrapped: it records the agent each request of the engine is sent on, and
 * answers the URLs a test fakes, with a response, a connection error or a
 * timeout. The child's fetch records each call and fails it. The child
 * records each connection the engine opens to a host name, with the lookup
 * it carries and what that lookup gave it, and can make a connection fail
 * with ENETUNREACH. Two tests serve pages from loopback TLS sites here,
 * whose certificates come from CAs made for the test: the child sends each
 * connection whose lookup answers the site's public address to that site.
 *
 * The child also sends requests of its own on Node's global agents: one on
 * https.globalAgent and one on http.globalAgent before the engine loads,
 * after it loads and after it scores, through node:https get and node:http
 * get as read when each is sent. The CLI test sends only the first pair.
 * The proxy sees the first request of a kind whenever the child's proxy
 * settings send that kind through it, which shows they took effect, and
 * every test but the CLI's checks that it then sees the later ones, so the
 * engine did not change how the global agents send requests. Every test
 * also checks that the engine left https.globalAgent and http.globalAgent
 * the same objects and the proxy settings in the environment as they were,
 * that nothing called fetch, and that each connection it opened to a host
 * name carried its own lookup. The control test, with the environment proxy
 * off, checks that nothing at all reaches the proxy, the child's own
 * requests included.
 *
 * Zero dependencies: Node's built-in modules.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENGINE = new URL('../dist/engine.js', import.meta.url).href;
const CLI = new URL('../dist/cli.js', import.meta.url).href;
const BEFORE = 'control-before.example.test:443';
const AFTER = 'control-after.example.test:443';
const END = 'control-end.example.test:443';
// The child's requests on http.globalAgent, as the proxy records them.
const PLAIN = ['before', 'after', 'end'].map((when) => `GET http://control-${when}.example.test/`);
const PROXY = '<loopback proxy>';
// A public address the check accepts. The child connects to the loopback
// TLS site in its place, so nothing is sent to it.
const PUBLIC = '93.184.215.14';
const PRIVATE = '10.0.0.1';
const FLAG = process.allowedNodeEnvironmentFlags.has('--use-env-proxy');
const { env: parentEnv } = process;

// The child: replaces node:dns/promises lookup, wraps node:https get, fetch
// and net connections, sends control requests on the global agents, loads
// the engine, sends them again, scores `url`, then sends them a third time.
// It can replace https.globalAgent before or after the engine loads, or
// node:https's Agent class after. With `cli` set it runs the package's CLI
// on `url` in place of loading the engine and scoring, sends only the first
// control requests, and writes its result as the CLI exits. It writes its
// result with fs.writeSync, so the result reaches the parent even when the
// child ends abnormally after writing it.
const CHILD = String.raw`
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import * as httpsExports from 'node:https';
import dnsPromises from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
const { env } = process;
const cfg = JSON.parse(env.DIRECT_CONNECT_CASE);
const CONTROL = new Set(['control-before.example.test', 'control-after.example.test', 'control-end.example.test']);
// The proxy settings in the environment, as they are when this is called.
const proxyEnv = () => Object.entries(env).filter(([k]) => /^(https?_proxy|all_proxy|no_proxy|node_use_env_proxy|node_options)$/i.test(k)).sort();
const envAt = { start: proxyEnv() };
// Each name looked up. A list of answers is given in turn for each name,
// its last entry from then on.
const looked = [];
const asked = {};
dnsPromises.lookup = async (name) => {
  looked.push(name);
  asked[name] = (asked[name] || 0) + 1;
  const answer = Array.isArray(cfg.answer) ? cfg.answer[Math.min(asked[name], cfg.answer.length) - 1] : cfg.answer;
  if (answer === null) throw Object.assign(new Error('no address for ' + name), { code: 'ENOTFOUND' });
  return [{ address: answer, family: 4 }];
};
// Each fetch call. Nothing here sends a request with fetch, so each fails.
const fetches = [];
globalThis.fetch = async (input) => {
  fetches.push(String(input?.url ?? input));
  throw new TypeError('fetch is not used in this test');
};
// Each connection opened to a host name, with the name of the lookup it
// carries and what that lookup gave the connection: 'refused', or the
// addresses it accepted. With a site, a connection whose lookup answers the
// site's public address goes to the loopback site in its place, on the port
// given for its host, if any. The first connections to a host named in
// cfg.unreach fail with ENETUNREACH before anything is sent, that many
// times.
const connections = [];
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  const o = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (o && typeof o === 'object' && !o.path && o.host && !net.isIP(String(o.host)) && !CONTROL.has(o.host)) {
    const c = { host: o.host, lookup: typeof o.lookup === 'function' ? o.lookup.name || 'anonymous' : null, gave: null };
    connections.push(c);
    if (cfg.unreach?.[o.host] > 0) {
      cfg.unreach[o.host] -= 1;
      const e = Object.assign(new Error('connect ENETUNREACH ' + o.host), { code: 'ENETUNREACH' });
      process.nextTick(() => this.destroy(e));
      return this;
    }
    if (typeof o.lookup === 'function') {
      const inner = o.lookup;
      const to = (a) => (a === cfg.site?.address ? '127.0.0.1' : a);
      if (cfg.site) o.port = cfg.site.ports?.[o.host] ?? cfg.site.port;
      o.lookup = (name, opts, cb) => inner(name, opts, (err, address, family) => {
        c.gave = err ? 'refused' : [address].flat().map((x) => (typeof x === 'string' ? x : x.address)).join(' ');
        if (err || !cfg.site) return cb(err, address, family);
        if (Array.isArray(address)) return cb(null, address.map((x) => ({ address: to(x.address), family: 4 })), 4);
        return cb(null, to(address), 4);
      });
    }
  }
  return realConnect.apply(this, args);
};
// Each request of the engine: its URL and the agent it is sent on.
const agents = [];
const requests = [];
const describeAgent = (agent) => {
  if (agent === undefined || agent === null || agent === false) return { agent: String(agent) };
  if (!agents.includes(agent)) agents.push(agent);
  return {
    agent: agents.indexOf(agent),
    global: agent === https.globalAgent,
    keepAlive: agent.keepAlive,
    scheduling: agent.scheduling,
    timeout: agent.options?.timeout,
  };
};
const realGet = https.get;
https.get = (url, opts, cb) => {
  if (CONTROL.has(new URL(String(url)).hostname)) return realGet(url, opts, cb);
  requests.push({ url: String(url), ...describeAgent(opts?.agent) });
  const fake = cfg.fake[String(url)];
  if (!fake) return realGet(url, opts, cb);
  const [statusCode, location, body] = fake;
  if (typeof statusCode === 'string') {
    // A connection error with this code, such as ECONNREFUSED, or, for
    // TIMEOUT, no answer within the request's timeout: its timeout event.
    const event = statusCode === 'TIMEOUT' ? 'timeout' : 'error';
    const req = {
      on(ev, h) {
        if (ev === event) setImmediate(() => (event === 'error' ? h(Object.assign(new Error('connect ' + statusCode), { code: statusCode })) : h()));
        return req;
      },
      destroy() {},
    };
    return req;
  }
  const handlers = {};
  const res = {
    statusCode,
    headers: location ? { location } : {},
    resume() {},
    setEncoding() {},
    on(ev, h) {
      handlers[ev] = h;
      if (ev === 'end') setImmediate(() => { if (body) handlers.data?.(body); h(); });
      return res;
    },
  };
  setImmediate(() => cb(res));
  return { on() { return this; }, destroy() {} };
};
syncBuiltinESMExports();
// An agent class that sends each connection through the proxy with CONNECT,
// as a proxy agent library's class does, on every Node version.
const [proxyHost, proxyPort] = String(cfg.proxy).replace('http://', '').split(':');
class TunnelAgent extends https.Agent {
  createConnection(options, cb) {
    const socket = net.connect(Number(proxyPort), proxyHost);
    socket.once('connect', () => socket.write('CONNECT ' + options.host + ':' + options.port + ' HTTP/1.1\r\nHost: ' + options.host + ':' + options.port + '\r\n\r\n'));
    socket.once('data', (d) => { socket.destroy(); cb(Object.assign(new Error('tunnel: ' + String(d).split('\r\n')[0]), { code: 'ETUNNEL' })); });
    socket.once('error', cb);
  }
}
// A request of the child's own on https.globalAgent or http.globalAgent,
// sent with node:https get or node:http get as read when it is sent. Its
// lookup answers no address, so only a proxy can see it.
const send = (mod, url) => new Promise((done) => {
  const lookup = (_name, _o, cb) => process.nextTick(cb, Object.assign(new Error('control: not resolved'), { code: 'ENOTFOUND' }));
  mod.get(url, { lookup }, (res) => { res.resume(); done('response'); })
    .on('error', (e) => done(e.code || 'error'));
});
const control = {};
const plainControl = {};
const sendControls = async (when) => {
  control[when] = await send(https, 'https://control-' + when + '.example.test/');
  plainControl[when] = await send(http, 'http://control-' + when + '.example.test/');
};
// http.setGlobalProxyFromEnv, where this Node has it, gives https.globalAgent
// the proxy named in the object it is given, at run time.
let proxyFromEnv = null;
const setProxyFromEnv = () => {
  proxyFromEnv = typeof http.setGlobalProxyFromEnv === 'function';
  if (proxyFromEnv) http.setGlobalProxyFromEnv({ HTTPS_PROXY: cfg.proxy });
};
const write = (r) => fs.writeSync(1, 'RESULT ' + JSON.stringify({ looked, requests, fetches, connections, envAt, control, plainControl, proxyFromEnv, ...r }) + '\n');
if (cfg.globalAgent === 'before') https.globalAgent = new TunnelAgent({ keepAlive: true });
if (cfg.proxyFromEnv === 'before') setProxyFromEnv();
const globalAgentBefore = https.globalAgent;
const httpAgentBefore = http.globalAgent;
const kept = () => https.globalAgent === globalAgentBefore && http.globalAgent === httpAgentBefore;
await sendControls('before');
if (cfg.cli) {
  process.argv = [process.execPath, 'designesy-score', cfg.url, '--quiet'];
  process.on('exit', (code) => {
    envAt.exit = proxyEnv();
    write({ cliExit: code, globalAgentKept: { exit: kept() } });
  });
  await import(cfg.cli);
} else {
  const { scoreUrl } = await import(cfg.engine);
  envAt.loaded = proxyEnv();
  const globalAgentKept = { load: kept() };
  if (cfg.globalAgent === 'after') https.globalAgent = new TunnelAgent({ keepAlive: true });
  if (cfg.proxyFromEnv === 'after') setProxyFromEnv();
  let classReplaced = null;
  if (cfg.agentClass === 'after') {
    https.Agent = TunnelAgent;
    syncBuiltinESMExports();
    classReplaced = httpsExports.Agent === TunnelAgent;
  }
  await sendControls('after');
  const globalAgentScoring = https.globalAgent;
  const r = await scoreUrl(cfg.url, 'universal');
  envAt.scored = proxyEnv();
  globalAgentKept.score = https.globalAgent === globalAgentScoring && http.globalAgent === httpAgentBefore;
  await sendControls('end');
  write({ globalAgentKept, classReplaced, unreachable: r.unreachable === true, reason: r.unreachableReason ?? null, score: r.score });
}
`;

/**
 * Score `url` in a child process. `env` holds the proxy settings (PROXY
 * stands for the loopback proxy's URL), `nodeOptions` is added to the
 * child's NODE_OPTIONS, `globalAgent` ('before' or 'after') replaces
 * https.globalAgent with an agent that tunnels through the proxy, before or
 * after the engine loads, `proxyFromEnv` ('before' or 'after') has
 * http.setGlobalProxyFromEnv give https.globalAgent the proxy at that point,
 * where this Node has that function, `agentClass` ('after') puts the
 * tunnelling agent's class in place of node:https's Agent after the engine
 * loads, and `cli` runs the package's CLI on `url`. `fake` maps a URL to
 * [status, location, body], or to [code] for a connection error with that
 * code (TIMEOUT for a timeout). `unreach` maps a host name to how many of
 * its first connections fail with ENETUNREACH. `answer` is what the child's
 * lookup answers: an address, null for none, or a list given in turn for
 * each name. `site` ({ port, address, ports }) sends each connection whose
 * lookup answers `address` to the loopback TLS site on `port`, or on the
 * port `ports` gives for its host, and `extraCa` sets NODE_EXTRA_CA_CERTS in
 * the child to a file (null leaves it unset). Any proxy setting this process
 * has is left out of the child's environment first. Resolves to { connects,
 * engineConnects, plain, looked, requests, fetches, connections, envAt,
 * globalAgentKept, control, plainControl, proxyFromEnv, classReplaced,
 * unreachable, reason, score, cliExit }: connects lists what the proxy was
 * sent (a CONNECT target, or GET and a URL), engineConnects the same without
 * the control requests, plain the control requests sent on http.globalAgent
 * that reached the proxy, looked the names the child's lookup was asked for,
 * requests each request of the engine with the agent it was sent on,
 * fetches each fetch call, connections each connection opened to a host
 * name with its lookup and what that lookup gave it, envAt the proxy
 * settings in the environment at each step, control and plainControl how
 * the control requests ended, and proxyFromEnv whether
 * http.setGlobalProxyFromEnv was called (null when not asked). It checks
 * that the global agents stayed the same objects and the proxy settings
 * stayed as they were while the engine loaded and scored, that nothing
 * called fetch, that each connection to a host name carried the engine's
 * lookup, and that when a control request sent before the engine loads
 * reaches the proxy, the later ones of its kind do too. It notes a child
 * that did not exit 0 (for the CLI, with the CLI's exit code).
 */
async function scoreInChild(t, { url, fake = {}, unreach = null, answer = '192.0.2.1', env = {}, nodeOptions = '', flags = [], globalAgent = null, proxyFromEnv = null, agentClass = null, cli = false, site = null, extraCa = undefined }) {
  const connects = [];
  const plain = [];
  const proxy = http.createServer((req, res) => {
    const line = `GET ${req.url}`;
    (PLAIN.includes(line) ? plain : connects).push(line);
    res.writeHead(502);
    res.end();
  });
  // A client may reset its socket after the 502; the case ignores that.
  proxy.on('connect', (req, socket) => { connects.push(req.url); socket.on('error', () => {}); socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); });
  await new Promise((ok) => proxy.listen(0, '127.0.0.1', ok));
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  try {
    const childEnv = {};
    for (const [k, v] of Object.entries(parentEnv)) {
      if (!/^(https?_proxy|all_proxy|no_proxy|node_use_env_proxy)$/i.test(k)) childEnv[k] = v;
    }
    childEnv.NODE_OPTIONS = `${(childEnv.NODE_OPTIONS || '').replace(/--use-env-proxy\b/g, '')} ${nodeOptions}`.trim();
    if (!childEnv.NODE_OPTIONS) delete childEnv.NODE_OPTIONS;
    for (const [k, v] of Object.entries(env)) childEnv[k] = v === PROXY ? proxyUrl : v;
    if (extraCa !== undefined) {
      for (const k of Object.keys(childEnv)) if (k.toUpperCase() === 'NODE_EXTRA_CA_CERTS') delete childEnv[k];
      if (extraCa) childEnv.NODE_EXTRA_CA_CERTS = extraCa;
    }
    childEnv.DIRECT_CONNECT_CASE = JSON.stringify({ engine: ENGINE, cli: cli ? CLI : null, url, fake, unreach, answer, proxy: proxyUrl, globalAgent, proxyFromEnv, agentClass, site });
    // A child that ends before it writes a result is run once more, and the
    // test notes it.
    let out;
    let line;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      connects.length = 0;
      plain.length = 0;
      out = await new Promise((ok) => {
        const child = spawn(process.execPath, [...flags, '--input-type=module', '-e', CHILD], { env: childEnv });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        const timer = setTimeout(() => child.kill(), 30000);
        child.on('close', (code, signal) => { clearTimeout(timer); ok({ code, signal, stdout, stderr }); });
      });
      line = out.stdout.split(/\r?\n/).find((l) => l.startsWith('RESULT '));
      if (line) break;
      t.diagnostic(`attempt ${attempt}: the child ended (exit ${out.code ?? out.signal}) before it wrote a result`);
    }
    assert.ok(line, `the child printed no result (exit ${out.code ?? out.signal}): ${out.stderr.slice(-600)}`);
    const controls = [BEFORE, AFTER, END];
    const r = { connects, engineConnects: connects.filter((c) => !controls.includes(c)), plain, ...JSON.parse(line.slice('RESULT '.length)) };
    if (out.code !== (cli ? r.cliExit : 0)) t.diagnostic(`the child wrote its result, then exited ${out.code ?? out.signal}`);
    for (const [when, kept] of Object.entries(r.globalAgentKept)) assert.equal(kept, true, `the engine replaced https.globalAgent or http.globalAgent (${when})`);
    for (const [when, vars] of Object.entries(r.envAt)) assert.deepEqual(vars, r.envAt.start, `the proxy settings in the environment changed (${when})`);
    assert.deepEqual(r.fetches, [], 'a request was sent with fetch');
    for (const c of r.connections) assert.equal(c.lookup, 'safeLookup', `a connection to ${c.host} was opened without the engine's lookup`);
    if (connects.includes(BEFORE) && !cli) {
      assert.ok(connects.includes(AFTER), 'after the engine loaded, https.globalAgent no longer sent requests through the proxy');
      assert.ok(connects.includes(END), 'after the engine scored a page, https.globalAgent no longer sent requests through the proxy');
    }
    if (plain.includes(PLAIN[0]) && !cli) {
      assert.deepEqual(plain, PLAIN, 'after the engine loaded or scored a page, http.globalAgent no longer sent requests through the proxy');
    }
    return r;
  } finally {
    proxy.close();
  }
}

/**
 * Every request of the engine went on one agent that is not
 * https.globalAgent, with keep-alive, lifo scheduling and a 5 s idle
 * timeout, so requests to one host share a connection.
 */
function assertOneDirectAgent(r) {
  assert.ok(r.requests.length > 0, 'the engine sent no request');
  for (const q of r.requests) {
    assert.deepEqual(
      { agent: q.agent, global: q.global, keepAlive: q.keepAlive, scheduling: q.scheduling, timeout: q.timeout },
      { agent: 0, global: false, keepAlive: true, scheduling: 'lifo', timeout: 5000 },
      `the request to ${q.url} was not sent on the engine's one direct agent`,
    );
  }
}

// DER for two small X.509 certificates: a CA and a site it signs.
const der = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  const n = body.length;
  const len = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return Buffer.concat([Buffer.from([tag, ...len]), body]);
};
const seq = (...parts) => der(0x30, ...parts);
const oid = (dotted) => {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * a + b];
  for (let v of rest) {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift(0x80 | (v & 0x7f));
    bytes.push(...out);
  }
  return der(0x06, Buffer.from(bytes));
};
const dn = (cn) => seq(der(0x31, seq(oid('2.5.4.3'), der(0x0c, Buffer.from(cn)))));
const utc = (date) => der(0x17, Buffer.from(`${date.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));
const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'));
function certificate({ serial, subject, issuer, publicKey, signer, ca = false, names = [] }) {
  const ext = (id, critical, value) => seq(oid(id), ...(critical ? [der(0x01, Buffer.from([0xff]))] : []), der(0x04, value));
  const exts = [ext('2.5.29.19', true, ca ? seq(der(0x01, Buffer.from([0xff]))) : seq())];
  if (names.length) exts.push(ext('2.5.29.17', false, seq(...names.map((n) => der(0x82, Buffer.from(n))))));
  const now = Date.now();
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([serial])),
    ECDSA_SHA256,
    dn(issuer),
    seq(utc(new Date(now - 86400000)), utc(new Date(now + 86400000))),
    dn(subject),
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, seq(...exts)),
  );
  return new X509Certificate(seq(tbs, ECDSA_SHA256, der(0x03, Buffer.from([0]), sign('sha256', tbs, signer))));
}

/**
 * A loopback TLS site for `names`, whose certificate comes from a CA made
 * here. `routes` maps a path to [status, body]; any other path is 404. With
 * `close`, each response closes its connection. Resolves to { port,
 * address, caFile, accepted, paths, failed, close }: accepted counts the TLS
 * connections it accepted, paths lists each request's path, and failed
 * counts the handshakes that did not complete.
 */
async function tlsSite({ names, routes, close = false }) {
  const caKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const siteKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ca = certificate({ serial: 1, subject: 'Direct connection test CA', issuer: 'Direct connection test CA', publicKey: caKeys.publicKey, signer: caKeys.privateKey, ca: true });
  const cert = certificate({ serial: 2, subject: names[0], issuer: 'Direct connection test CA', publicKey: siteKeys.publicKey, signer: caKeys.privateKey, names });
  assert.ok(cert.checkIssued(ca) && cert.verify(ca.publicKey), 'the test CA did not sign the site certificate');
  const dir = mkdtempSync(join(tmpdir(), 'direct-connect-'));
  const caFile = join(dir, 'ca.pem');
  writeFileSync(caFile, ca.toString());
  const site = { address: PUBLIC, caFile, accepted: 0, paths: [], failed: 0 };
  const server = https.createServer({ key: siteKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: cert.toString() }, (req, res) => {
    site.paths.push(req.url);
    const [status, body] = routes[req.url] || [404, 'Not found'];
    res.writeHead(status, { 'content-type': req.url.endsWith('.css') ? 'text/css' : 'text/html', ...(close ? { connection: 'close' } : {}) });
    res.end(body);
  });
  server.on('secureConnection', () => { site.accepted += 1; });
  server.on('tlsClientError', () => { site.failed += 1; });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  site.port = server.address().port;
  site.close = async () => {
    server.closeAllConnections?.();
    await new Promise((ok) => server.close(ok));
    rmSync(dir, { recursive: true, force: true });
  };
  return site;
}

const ENV_PROXY_ON = { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY };

let supported = null;
/**
 * True when this Node sends a node:https request on its global agent through
 * a proxy named in the environment: the control request sent before the
 * engine loads reached the proxy. Node added the --use-env-proxy flag with
 * that support, so on a Node that has the flag and does not send it, the
 * test fails.
 */
async function envProxySupported(t) {
  if (supported === null) {
    const r = await scoreInChild(t, { url: 'https://probe.example.test/', env: ENV_PROXY_ON });
    supported = r.connects.includes(BEFORE);
  }
  assert.ok(supported || !FLAG, 'this Node has --use-env-proxy, but NODE_USE_ENV_PROXY=1 with HTTPS_PROXY did not send its control request through the proxy');
  return supported;
}
const NO_ENV_PROXY = 'this Node does not send node:https requests through a proxy named in the environment';

/**
 * The proxy settings a test runs with: the environment proxy on where this
 * Node supports it, and none where it does not, so the test still checks
 * each lookup there. `vars` holds the settings, and `controls` is what the
 * proxy then sees: the child's three control requests on https.globalAgent,
 * or nothing.
 */
async function envProxyOrNone(t) {
  if (await envProxySupported(t)) return { on: true, name: 'the environment proxy on', vars: ENV_PROXY_ON, controls: [BEFORE, AFTER, END] };
  t.diagnostic(`${NO_ENV_PROXY}: this test runs with no proxy settings`);
  return { on: false, name: 'no proxy settings', vars: {}, controls: [] };
}

// Each way to set the environment proxy, with HTTPS_PROXY (or https_proxy).
// On Windows the environment is not case sensitive, so https_proxy names
// the same variable as HTTPS_PROXY; elsewhere it is a variable of its own.
const SETUPS = [
  ['NODE_USE_ENV_PROXY=1, HTTPS_PROXY and HTTP_PROXY', { env: ENV_PROXY_ON }],
  ['NODE_USE_ENV_PROXY=1, HTTPS_PROXY and an empty NO_PROXY', { env: { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: PROXY, NO_PROXY: '' } }],
  ['--use-env-proxy, HTTPS_PROXY and a NO_PROXY that does not match', { flags: ['--use-env-proxy'], env: { HTTPS_PROXY: PROXY, NO_PROXY: 'other.example.test' } }],
  ['NODE_OPTIONS=--use-env-proxy and HTTPS_PROXY', { nodeOptions: '--use-env-proxy', env: { HTTPS_PROXY: PROXY } }],
  ['NODE_USE_ENV_PROXY=1 and https_proxy alone', { env: { NODE_USE_ENV_PROXY: '1', https_proxy: PROXY } }],
];
// Variables that name a proxy for other requests: HTTP_PROXY, for http, and
// ALL_PROXY, which some tools use for every protocol. The engine uses
// neither for its https requests.
const NOT_FOR_HTTPS = [
  ['NODE_USE_ENV_PROXY=1 and HTTP_PROXY alone', { env: { NODE_USE_ENV_PROXY: '1', HTTP_PROXY: PROXY } }],
  ['NODE_USE_ENV_PROXY=1 and ALL_PROXY', { env: { NODE_USE_ENV_PROXY: '1', ALL_PROXY: PROXY } }],
  ['NODE_USE_ENV_PROXY=1 and all_proxy', { env: { NODE_USE_ENV_PROXY: '1', all_proxy: PROXY } }],
];

const PAGE = (head) => `<!doctype html><html lang="en"><head><title>Fixture</title>${head}</head><body><main><h1>Fixture</h1><p>Body copy for the direct connection tests.</p></main></body></html>`;

describe('direct connection: the environment proxy is not used', () => {
  it('sends the page request and its www. candidate directly, however the environment proxy is set', async (t) => {
    if (!(await envProxySupported(t))) return t.skip(NO_ENV_PROXY);
    let ran = 0;
    for (const [name, setup] of SETUPS) {
      if (setup.flags && !FLAG) { t.diagnostic(`${name}: this Node has no --use-env-proxy flag`); continue; }
      const r = await scoreInChild(t, { url: 'https://direct.example.test/', ...setup });
      if (!r.connects.includes(BEFORE)) { t.diagnostic(`${name}: not in effect on this Node`); continue; }
      ran += 1;
      assert.deepEqual(r.connects, [BEFORE, AFTER, END], `${name}: a request of the engine went to the proxy`);
      assert.deepEqual(r.looked, ['direct.example.test', 'www.direct.example.test'], name);
      assert.equal(r.unreachable, true, name);
      assert.equal(r.reason, 'network', name);
    }
    assert.ok(ran > 0, 'no way to set the environment proxy took effect');
  });

  it('sends every redirect directly, up to the third and last one followed', async (t) => {
    const proxy = await envProxyOrNone(t);
    const chain = ['https://start.example.test/', 'https://hop1.example.test/a', 'https://hop2.example.test/b', 'https://hop3.example.test/c'];
    // Redirect n is sent for real; the requests before it are faked.
    for (let n = 1; n < chain.length; n += 1) {
      const fake = {};
      for (let i = 0; i < n; i += 1) fake[chain[i]] = [302, chain[i + 1]];
      const r = await scoreInChild(t, { url: chain[0], fake, env: proxy.vars });
      assert.deepEqual(r.connects, proxy.controls, `redirect ${n}: a request of the engine went to the proxy`);
      assert.deepEqual(r.looked, [`hop${n}.example.test`, 'www.start.example.test'], `redirect ${n}: its host was not looked up`);
    }
  });

  it('sends a stylesheet request directly', async (t) => {
    const proxy = await envProxyOrNone(t);
    const page = PAGE('<link rel="stylesheet" href="https://sheets.example.test/site.css">');
    const r = await scoreInChild(t, { url: 'https://page.example.test/', fake: { 'https://page.example.test/': [200, null, page] }, env: proxy.vars });
    assert.deepEqual(r.connects, proxy.controls, 'a request of the engine went to the proxy');
    assert.ok(r.looked.includes('sheets.example.test'), `the stylesheet host was not looked up: ${r.looked}`);
    assert.equal(typeof r.score, 'number');
  });

  it('sends the /DESIGN.md probe directly', async (t) => {
    const proxy = await envProxyOrNone(t);
    const r = await scoreInChild(t, { url: 'https://spec.example.test/', fake: { 'https://spec.example.test/': [200, null, PAGE('')] }, env: proxy.vars });
    assert.deepEqual(r.connects, proxy.controls, 'a request of the engine went to the proxy');
    assert.deepEqual(r.looked, ['spec.example.test'], 'the /DESIGN.md host was not looked up');
    assert.equal(typeof r.score, 'number');
  });

  it('reports a page it cannot resolve without a proxy as unreachable, and sends nothing to the proxy', async (t) => {
    const proxy = await envProxyOrNone(t);
    const r = await scoreInChild(t, { url: 'https://inside.example.test/', answer: null, env: proxy.vars });
    assert.deepEqual(r.connects, proxy.controls, 'a request of the engine went to the proxy');
    assert.deepEqual(r.looked, ['inside.example.test', 'www.inside.example.test']);
    assert.equal(r.unreachable, true);
    assert.equal(r.reason, 'network');
    assert.equal(r.score, null);
  });

  // Each of the next two runs once with an agent whose class tunnels through
  // the proxy, and once with the agent http.setGlobalProxyFromEnv makes,
  // where this Node has that function.
  it('does not use an agent that tunnels through a proxy, set as https.globalAgent before the engine loads', async (t) => {
    for (const setup of [{ globalAgent: 'before' }, { proxyFromEnv: 'before' }]) {
      const r = await scoreInChild(t, { url: 'https://agent.example.test/', ...setup });
      if (r.proxyFromEnv === false) { t.diagnostic('this Node has no http.setGlobalProxyFromEnv'); continue; }
      assert.deepEqual(r.connects, [BEFORE, AFTER, END], `${Object.keys(setup)}: a request of the engine went to the proxy`);
      assert.deepEqual(r.looked, ['agent.example.test', 'www.agent.example.test']);
    }
  });

  it('does not use an agent that tunnels through a proxy, set as https.globalAgent after the engine loads', async (t) => {
    for (const setup of [{ globalAgent: 'after' }, { proxyFromEnv: 'after' }]) {
      const r = await scoreInChild(t, { url: 'https://later.example.test/', ...setup });
      if (r.proxyFromEnv === false) { t.diagnostic('this Node has no http.setGlobalProxyFromEnv'); continue; }
      assert.deepEqual(r.connects, [AFTER, END], `${Object.keys(setup)}: a request of the engine went to the proxy`);
      assert.deepEqual(r.looked, ['later.example.test', 'www.later.example.test']);
    }
  });

  it('sends every request on one agent of its own, with keep-alive, and no proxy settings', async (t) => {
    // The page fails, so the www. candidate is read: three redirects, then
    // a page with a stylesheet. /DESIGN.md is sent for real and refused.
    const css = 'https://www.one.example.test/site.css';
    const fake = {
      'https://one.example.test/': [500, null, ''],
      'https://www.one.example.test/': [302, 'https://www.one.example.test/a'],
      'https://www.one.example.test/a': [302, '/b'],
      'https://www.one.example.test/b': [302, '/c'],
      'https://www.one.example.test/c': [200, null, PAGE(`<link rel="stylesheet" href="${css}">`)],
      [css]: [200, null, 'body { color: #111; }'],
    };
    const r = await scoreInChild(t, { url: 'https://one.example.test/', fake });
    assert.deepEqual(r.connects, []);
    assert.deepEqual(r.requests.map((q) => q.url).sort(), [...Object.keys(fake), 'https://one.example.test/DESIGN.md'].sort());
    assertOneDirectAgent(r);
    assert.deepEqual(r.looked, ['one.example.test']);
    assert.equal(typeof r.score, 'number');
  });

  it("does not use an agent class that tunnels through a proxy, put in place of node:https's Agent after the engine loads", async (t) => {
    const r = await scoreInChild(t, { url: 'https://class.example.test/', agentClass: 'after' });
    assert.equal(r.classReplaced, true, "node:https's Agent export was not replaced");
    assert.deepEqual(r.connects, [], 'a request of the engine went to the proxy');
    assert.deepEqual(r.looked, ['class.example.test', 'www.class.example.test']);
    assert.equal(r.unreachable, true);
    assert.equal(r.reason, 'network');
  });

  it('sends the page request directly with HTTP_PROXY alone, ALL_PROXY or all_proxy, the environment proxy on', async (t) => {
    for (const [name, setup] of NOT_FOR_HTTPS) {
      const r = await scoreInChild(t, { url: 'https://fallback.example.test/', ...setup });
      if (r.connects.includes(BEFORE)) t.diagnostic(`${name}: this Node sent its own control request through the proxy`);
      assert.deepEqual(r.engineConnects, [], `${name}: a request of the engine went to the proxy`);
      assert.deepEqual(r.looked, ['fallback.example.test', 'www.fallback.example.test'], name);
      assert.equal(r.unreachable, true, name);
      assert.equal(r.reason, 'network', name);
    }
  });

  it('sends no request again after a connection error, on any agent', async (t) => {
    // First page: its connection is refused, its www. candidate's times out,
    // and its http:// candidate's is reset. Second page: the network, then
    // the host, is unreachable. Third page: its first connection is opened
    // on the engine's agent, and the child fails it with ENETUNREACH; its
    // www. candidate is looked up and refused.
    const pages = [
      ['https://refused.example.test/', {
        fake: {
          'https://refused.example.test/': ['ECONNREFUSED'],
          'https://www.refused.example.test/': ['ETIMEDOUT'],
          'http://refused.example.test/': ['ECONNRESET'],
        },
      }, []],
      ['https://unreach.example.test/', {
        fake: {
          'https://unreach.example.test/': ['ENETUNREACH'],
          'https://www.unreach.example.test/': ['EHOSTUNREACH'],
          'http://unreach.example.test/': ['ENETUNREACH'],
        },
      }, []],
      ['https://once.example.test/', { unreach: { 'once.example.test': 1 } }, ['www.once.example.test']],
    ];
    const proxy = await envProxyOrNone(t);
    const setups = [
      [proxy.name, { env: proxy.vars }, proxy.controls],
      ['an agent that tunnels through a proxy, set as https.globalAgent before the engine loads', { globalAgent: 'before' }, [BEFORE, AFTER, END]],
    ];
    for (const [url, errors, looked] of pages) {
      for (const [name, setup, controls] of setups) {
        const r = await scoreInChild(t, { url, ...errors, ...setup });
        const host = new URL(url).hostname;
        assert.deepEqual(r.connects, controls, `${url}, ${name}: a request of the engine went to the proxy`);
        assert.deepEqual(r.requests.map((q) => q.url), [url, `https://www.${host}/`, `http://${host}/`], `${url}, ${name}: a request was sent again`);
        assertOneDirectAgent(r);
        assert.deepEqual(r.looked, looked, `${url}, ${name}`);
        assert.equal(r.unreachable, true, `${url}, ${name}`);
        assert.equal(r.reason, 'network', `${url}, ${name}`);
      }
    }
  });

  it("scores through the package's CLI on the same agent, and the CLI sends no request of its own", async (t) => {
    const proxy = await envProxyOrNone(t);
    const r = await scoreInChild(t, { url: 'https://cli.example.test/', cli: true, env: proxy.vars });
    assert.equal(r.cliExit, 1, 'the CLI did not fail the gate for a page it could not read');
    assert.deepEqual(r.connects, proxy.on ? [BEFORE] : [], 'a request of the CLI went to the proxy');
    assert.deepEqual(r.requests.map((q) => q.url), ['https://cli.example.test/', 'https://www.cli.example.test/', 'http://cli.example.test/']);
    assertOneDirectAgent(r);
    assert.deepEqual(r.looked, ['cli.example.test', 'www.cli.example.test']);
  });

  it('control: with the environment proxy off, the page request is direct and HTTPS_PROXY is not used', async (t) => {
    const r = await scoreInChild(t, { url: 'https://plain.example.test/', env: { HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY } });
    assert.deepEqual(r.connects, [], 'a request went to the proxy with the environment proxy off');
    assert.deepEqual(r.plain, [], 'a request went to the proxy with the environment proxy off');
    assert.deepEqual(r.control, { before: 'ENOTFOUND', after: 'ENOTFOUND', end: 'ENOTFOUND' });
    assert.deepEqual(r.plainControl, { before: 'ENOTFOUND', after: 'ENOTFOUND', end: 'ENOTFOUND' });
    assert.deepEqual(r.looked, ['plain.example.test', 'www.plain.example.test']);
  });

  it('sends no request again after a timeout or a refusing answer, on any agent', async (t) => {
    // First page: it times out, its www. candidate answers 403 and its
    // http:// candidate 429. Second page: it answers 407, its www.
    // candidate 502 and its http:// candidate 407. Third page: it is read,
    // one stylesheet answers 503, the other times out, and /DESIGN.md
    // answers 403.
    const pages = [
      [{
        'https://slow.example.test/': ['TIMEOUT'],
        'https://www.slow.example.test/': [403, null, 'Forbidden'],
        'http://slow.example.test/': [429, null, 'Too many requests'],
      }, 'http_error'],
      [{
        'https://gate.example.test/': [407, null, 'Proxy authentication required'],
        'https://www.gate.example.test/': [502, null, 'Bad gateway'],
        'http://gate.example.test/': [407, null, 'Proxy authentication required'],
      }, 'http_error'],
      [{
        'https://busy.example.test/': [200, null, PAGE('<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css">')],
        'https://busy.example.test/a.css': [503, null, 'Unavailable'],
        'https://busy.example.test/b.css': ['TIMEOUT'],
        'https://busy.example.test/DESIGN.md': [403, null, 'Forbidden'],
      }, null],
    ];
    const proxy = await envProxyOrNone(t);
    const setups = [
      [proxy.name, { env: proxy.vars }, proxy.controls],
      ['an agent that tunnels through a proxy, set as https.globalAgent before the engine loads', { globalAgent: 'before' }, [BEFORE, AFTER, END]],
    ];
    for (const [fake, reason] of pages) {
      for (const [name, setup, controls] of setups) {
        const url = Object.keys(fake)[0];
        const r = await scoreInChild(t, { url, fake, ...setup });
        assert.deepEqual(r.connects, controls, `${url}, ${name}: a request of the engine went to the proxy`);
        assert.deepEqual(r.requests.map((q) => q.url), Object.keys(fake), `${url}, ${name}: a request was sent again`);
        assertOneDirectAgent(r);
        assert.deepEqual(r.looked, [], `${url}, ${name}`);
        assert.equal(r.reason, reason, `${url}, ${name}`);
        assert.equal(r.unreachable, reason !== null, `${url}, ${name}`);
      }
    }
  });

  it('looks up the host again for each new connection, and judges each answer', async (t) => {
    // The site closes each connection, so the page, its stylesheet and
    // /DESIGN.md each open one. In the second run the host's lookup answers
    // a public address once and a private one from then on.
    const proxy = await envProxyOrNone(t);
    const host = 'again.example.test';
    const routes = { '/': [200, PAGE('<link rel="stylesheet" href="/site.css">')], '/site.css': [200, 'body { color: #111; }'] };
    // The lookup itself must refuse each private answer: the child records
    // what the engine's lookup gave each connection.
    const runs = [
      ['public answers', PUBLIC, ['/', '/DESIGN.md', '/site.css'], [PUBLIC, PUBLIC, PUBLIC]],
      ['a private answer after the first', [PUBLIC, PRIVATE], ['/'], [PUBLIC, 'refused', 'refused']],
    ];
    for (const [name, answer, read, gave] of runs) {
      const site = await tlsSite({ names: [host], routes, close: true });
      try {
        const r = await scoreInChild(t, { url: `https://${host}/`, answer, site, extraCa: site.caFile, env: proxy.vars });
        assert.deepEqual(r.connects, proxy.controls, `${name}: a request of the engine went to the proxy`);
        assert.equal(typeof r.score, 'number', `${name}: the page was not read`);
        assert.equal(r.connections.filter((c) => c.host === host).length, 3, `${name}: the engine did not open a connection for each request`);
        assert.deepEqual(r.looked, [host, host, host], `${name}: a connection was opened with no lookup of its host`);
        assert.deepEqual(r.connections.filter((c) => c.host === host).map((c) => c.gave), gave, `${name}: the engine's lookup did not refuse each private answer`);
        assert.deepEqual([...site.paths].sort(), read, `${name}: the site was sent other requests`);
        assert.equal(site.accepted, read.length, name);
        assertOneDirectAgent(r);
      } finally {
        await site.close();
      }
    }
  });

  it("checks each site's certificate: a CA given in NODE_EXTRA_CA_CERTS is trusted, and a site no trusted CA vouches for, or whose certificate is for another name, is refused", async (t) => {
    const proxy = await envProxyOrNone(t);
    const host = 'trusted.example.test';
    const site = await tlsSite({ names: [host, `www.${host}`], routes: { '/': [200, PAGE('')] } });
    try {
      const known = await scoreInChild(t, { url: `https://${host}/`, answer: PUBLIC, site, extraCa: site.caFile, env: proxy.vars });
      assert.equal(known.unreachable, false, 'the engine did not trust the CA given in NODE_EXTRA_CA_CERTS');
      assert.equal(typeof known.score, 'number');
      assert.deepEqual(site.paths, ['/', '/DESIGN.md']);
      // Keep-alive: /DESIGN.md went on the page's connection.
      assert.deepEqual([site.accepted, known.looked], [1, [host]], 'the two requests did not share one connection');
      site.paths.length = 0;
      const failedBefore = site.failed;
      const unknown = await scoreInChild(t, { url: `https://${host}/`, answer: PUBLIC, site, extraCa: null, env: proxy.vars });
      assert.equal(unknown.unreachable, true, 'the engine read a site whose certificate no CA it trusts vouches for');
      assert.equal(unknown.reason, 'network');
      assert.deepEqual(site.paths, [], 'the site was sent a request');
      assert.ok(site.failed > failedBefore, 'no handshake failed at the site');
      // A site whose certificate comes from the CA given in
      // NODE_EXTRA_CA_CERTS but names another host is refused too.
      const other = await tlsSite({ names: ['other.example.test'], routes: { '/': [200, PAGE('')] } });
      let named;
      try {
        named = await scoreInChild(t, { url: `https://${host}/`, answer: PUBLIC, site: other, extraCa: other.caFile, env: proxy.vars });
        assert.equal(named.unreachable, true, 'the engine read a site whose certificate is for another name');
        assert.equal(named.reason, 'network');
        assert.deepEqual(other.paths, [], 'the site was sent a request');
        assert.ok(other.failed > 0, 'no handshake failed at the site');
      } finally {
        await other.close();
      }
      // A page read from a trusted site, whose stylesheet sits on another
      // site that no trusted CA vouches for: the page is scored, and the
      // stylesheet's site is sent no request.
      const cdn = 'sheets.example.test';
      const page = await tlsSite({ names: [host, `www.${host}`], routes: { '/': [200, PAGE(`<link rel="stylesheet" href="https://${cdn}/site.css">`)] } });
      const sheets = await tlsSite({ names: [cdn], routes: { '/site.css': [200, 'body { color: #111; }'] } });
      let styled;
      try {
        styled = await scoreInChild(t, { url: `https://${host}/`, answer: PUBLIC, site: { port: page.port, address: page.address, ports: { [cdn]: sheets.port } }, extraCa: page.caFile, env: proxy.vars });
        assert.equal(typeof styled.score, 'number', 'the page was not read');
        assert.ok(page.paths.includes('/'), 'the page was not asked for');
        assert.deepEqual(sheets.paths, [], 'a stylesheet was read from a site whose certificate no trusted CA vouches for');
        assert.ok(sheets.failed > 0, 'no handshake failed at the stylesheet site');
      } finally {
        await page.close();
        await sheets.close();
      }
      for (const r of [known, unknown, named, styled]) {
        assert.deepEqual(r.connects, proxy.controls, 'a request of the engine went to the proxy');
        assertOneDirectAgent(r);
      }
    } finally {
      await site.close();
    }
  });
});
