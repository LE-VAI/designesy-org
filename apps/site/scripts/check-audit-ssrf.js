#!/usr/bin/env node
/**
 * audit-ssrf gate: the full browser audit reaches public addresses only.
 *
 * WHY THIS EXISTS
 * /api/score/audit carried its own URL check, a string match on localhost,
 * 127.0.0.1, 10., 192.168., 172.16., 0.0.0.0 and dotless hosts. It did no DNS
 * lookup, so 169.254.169.254, 172.20.0.1, 100.64.0.1, 127.0.0.2 and a name
 * resolving to 127.0.0.1 all passed, on to PageSpeed Insights and, with
 * ENABLE_BROWSER_AUDIT set, to a Chromium navigation. The six JSON engines
 * already used app/lib/url-guard.ts; this route did not.
 *
 * Checking the audited URL is not enough for a browser: it follows redirects,
 * loads subresources, and runs the page's scripts, and the in-function
 * Chromium runs with --disable-web-security, so those scripts can read
 * cross-origin responses. Playwright's route() is not enough either: it is not
 * called for a redirect hop (its docs say so, and its Chromium network manager
 * continues the hop itself). app/lib/browser-guard.ts adds browser-wide CDP
 * Fetch interception for that.
 *
 * WHAT IT ASSERTS (offline, no browser, no live DNS)
 *   1. Route: POST /api/score/audit answers 400 with the engine's wording for
 *      every refused address, before any PageSpeed request; a public name
 *      answers 200 with v02, v04 and v21.
 *   2. Verdict: createUrlVerdict refuses private, loopback, link-local, CGNAT,
 *      IPv6, mixed-answer and unresolvable hosts and non-network schemes it
 *      does not know; allows public hosts and data:/blob:/about:; caches one
 *      answer per hostname for the life of one verdict, and no longer.
 *   3. Interception: guardBrowser enables browser-wide Fetch before any
 *      context exists, fails a paused request (redirect hop included) to a
 *      non-public host and continues a public one; every context it makes has
 *      serviceWorkers 'block', a route() for every URL and a routeWebSocket(),
 *      which refuse a private host and pass a public one; if the interception
 *      cannot be enabled it rejects rather than hand back a browser.
 *   4. Wiring: the route defines no URL check of its own, imports url-guard's,
 *      calls launchBrowser() only inside openAuditBrowser(), and every browser
 *      check takes a GuardedBrowser.
 *
 * WITH --chromium <path to a Chrome or Chromium binary> (local, not in CI)
 *   5. A real browser against a local server, with hostnames mapped by
 *      --host-resolver-rules and private.test standing for a non-public host:
 *      context.route() alone lets redirect hops through and the page reads the
 *      response (so this section can fail), and guardBrowser lets no HTTP
 *      request through. The one remaining hit allowed is the documented
 *      residual, a WebSocket opened inside a worker. A public subresource and a
 *      public WebSocket still work through the guard.
 *
 * PROVING IT CAN FAIL
 * --app <dir> runs sections 1-4 against another checkout's apps/site. Pointed at
 * a checkout from before this change, section 1 reports 200 for the refused
 * addresses. Section 5 runs the unguarded configuration on purpose.
 *
 * Usage:  node scripts/check-audit-ssrf.js [--app <dir>] [--chromium <path>]
 * Exits 1 on any failure.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { createHarness } = require('./lib/route-harness');

const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const APP = path.resolve(arg('--app') || path.join(__dirname, '..'));
const CHROMIUM = arg('--chromium');
const ROUTE = 'app/api/score/audit/route.ts';
const GUARD = 'app/lib/browser-guard.ts';

// The browser path must stay off: this gate exercises validation, not Chromium.
delete process.env.ENABLE_BROWSER_AUDIT;
delete process.env.CDP_ENDPOINT;
delete process.env.PSI_API_KEY;

// ── Stubbed DNS: what each name resolves to. Nothing reaches a resolver. ─────
const PUBLIC_V4 = '93.184.215.14'; // a public unicast address
const DNS = {
  'public.example': [{ address: PUBLIC_V4, family: 4 }],
  '127.0.0.1.nip.io': [{ address: '127.0.0.1', family: 4 }],
  'mixed.example': [{ address: PUBLIC_V4, family: 4 }, { address: '10.0.0.7', family: 4 }],
  'v6-loopback.example': [{ address: '::1', family: 6 }],
  'v6-mapped-metadata.example': [{ address: '::ffff:169.254.169.254', family: 6 }],
};
const lookups = [];
async function lookup(hostname) {
  lookups.push(hostname);
  const family = net.isIP(hostname);
  if (family) return [{ address: hostname, family }];
  if (Object.prototype.hasOwnProperty.call(DNS, hostname)) return DNS[hostname];
  const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
  err.code = 'ENOTFOUND';
  throw err;
}

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(err && err.message).split('\n').join('\n        ')}`);
  }
}

const REFUSED_BODY = { ok: false, error: 'Invalid URL. Enter a valid domain like designesy.org or nike.com.' };

// [input, why it is refused]. The first seven are the cases this change was
// asked to cover; the rest are neighbours the retired check let through.
const REFUSED = [
  ['169.254.169.254', 'link-local, cloud metadata'],
  ['http://169.254.169.254/latest/meta-data/', 'cloud metadata path'],
  ['172.20.0.1', '172.16.0.0/12 beyond 172.16.x'],
  ['100.64.0.1', 'carrier-grade NAT 100.64.0.0/10'],
  ['[::1]', 'IPv6 loopback'],
  ['2130706433', 'decimal form of 127.0.0.1'],
  ['127.0.0.1.nip.io', 'a name that resolves to 127.0.0.1'],
  ['127.0.0.2', 'loopback other than 127.0.0.1'],
  ['2130706434', 'decimal form of 127.0.0.2'],
  ['0x7f.0.0.2', 'hex form of 127.0.0.2'],
  ['mixed.example', 'resolves to one public and one private address'],
  ['v6-loopback.example', 'resolves to ::1'],
  ['v6-mapped-metadata.example', 'resolves to ::ffff:169.254.169.254'],
  ['nxdomain.example', 'does not resolve, so cannot be shown public'],
];

async function routeSection(h) {
  console.log('route: POST /api/score/audit');
  let ip = 0;
  const post = (url) => h.post(ROUTE, { url }, { 'x-forwarded-for': `198.51.100.${++ip}` });
  const psiCalls = () => h.calls.filter((c) => c.url.startsWith('https://www.googleapis.com/pagespeedonline/')).length;

  for (const [input, why] of REFUSED) {
    await check(`refuses ${input} (${why})`, async () => {
      const before = psiCalls();
      const res = await post(input);
      assert.equal(res.status, 400, `status ${res.status}, body ${JSON.stringify(res.body)}`);
      assert.deepEqual(res.body, REFUSED_BODY);
      assert.equal(psiCalls(), before, 'a PageSpeed request was made for a refused address');
    });
  }

  await check('accepts a public name: 200, checks v02 v04 v21, PageSpeed asked for that URL', async () => {
    const before = psiCalls();
    const res = await post('public.example');
    assert.equal(res.status, 200, `status ${res.status}, body ${JSON.stringify(res.body)}`);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.url, 'https://public.example/');
    assert.deepEqual(res.body.checks.map((c) => c.id), ['v02', 'v04', 'v21']);
    assert.equal(psiCalls(), before + 1);
    const psi = new URL(h.calls.filter((c) => c.url.includes('pagespeedonline')).pop().url);
    assert.equal(psi.searchParams.get('url'), 'https://public.example/');
  });

  await check('the lookups above came from the stub (no live DNS)', async () => {
    assert.ok(lookups.includes('127.0.0.1.nip.io'), `lookups: ${lookups.join(', ')}`);
    assert.ok(lookups.includes('public.example'));
  });
}

async function verdictSection(guard) {
  console.log('verdict: createUrlVerdict');
  const verdict = guard.createUrlVerdict();
  const cases = [
    ['https://public.example/app.css', true],
    ['wss://public.example/socket', true],
    ['data:text/plain,hello', true],
    ['blob:https://public.example/1b4d', true],
    ['about:blank', true],
    ['http://169.254.169.254/latest/meta-data/', false],
    ['http://127.0.0.1.nip.io/', false],
    ['ws://127.0.0.1.nip.io/socket', false],
    ['https://mixed.example/', false],
    ['https://v6-mapped-metadata.example/', false],
    ['https://nxdomain.example/', false],
    ['http://localhost:3000/', false],
    ['http://[fd00:ec2::254]/', false],
    ['http://100.64.0.1/', false],
    ['file:///etc/passwd', false],
    ['chrome://settings/', false],
    ['ftp://public.example/', false],
    ['not a url', false],
  ];
  for (const [url, expected] of cases) {
    await check(`${expected ? 'allows' : 'refuses'} ${url}`, async () => {
      assert.equal(await verdict(url), expected);
    });
  }

  await check('one lookup per hostname per verdict, a fresh verdict looks up again', async () => {
    const asked = [];
    const hostIsPublic = async (host) => {
      asked.push(host);
      return host === 'public.example';
    };
    const a = guard.createUrlVerdict(hostIsPublic);
    assert.equal(await a('https://public.example/a'), true);
    assert.equal(await a('https://public.example/b'), true);
    assert.equal(await a('http://public.example:8080/c'), true);
    assert.equal(await a('wss://public.example/d'), true);
    assert.deepEqual(asked, ['public.example']);
    const b = guard.createUrlVerdict(hostIsPublic);
    assert.equal(await b('https://public.example/a'), true);
    assert.deepEqual(asked, ['public.example', 'public.example']);
  });

  await check('a host check that throws refuses', async () => {
    const v = guard.createUrlVerdict(async () => {
      throw new Error('resolver down');
    });
    assert.equal(await v('https://public.example/'), false);
  });
}

// ── Fakes for the Playwright surface guardBrowser touches ────────────────────

function fakeBrowser({ sessionFails = false, enableFails = false } = {}) {
  const log = [];
  const listeners = {};
  const session = {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return session;
    },
    async send(method, params) {
      log.push({ kind: 'cdp', method, params });
      if (enableFails && method === 'Fetch.enable') throw new Error('Fetch.enable refused');
      return {};
    },
  };
  const contexts = [];
  const browser = {
    async newBrowserCDPSession() {
      log.push({ kind: 'newBrowserCDPSession' });
      if (sessionFails) throw new Error('browser target not available');
      return session;
    },
    async newContext(opts) {
      log.push({ kind: 'newContext', opts });
      const ctx = {
        routes: [],
        sockets: [],
        closed: false,
        async route(pattern, handler) {
          ctx.routes.push({ pattern, handler });
        },
        async routeWebSocket(matcher, handler) {
          ctx.sockets.push({ matcher, handler });
        },
        async close() {
          ctx.closed = true;
        },
      };
      contexts.push(ctx);
      return ctx;
    },
  };
  const emit = (event, payload) => (listeners[event] || []).forEach((fn) => fn(payload));
  return { browser, log, contexts, emit };
}

function fakeRoute(url) {
  const r = {
    outcome: null,
    request: () => ({ url: () => url }),
    async continue() {
      r.outcome = 'continue';
    },
    async abort(code) {
      r.outcome = `abort:${code}`;
    },
  };
  return r;
}

function fakeSocket(url) {
  const w = {
    outcome: null,
    url: () => url,
    connectToServer() {
      w.outcome = 'connect';
      return w;
    },
    async close(opts) {
      w.outcome = `close:${opts && opts.code}`;
    },
  };
  return w;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

async function interceptionSection(guard) {
  console.log('interception: guardBrowser');
  const fb = fakeBrowser();
  let closed = 0;
  const gb = await guard.guardBrowser(fb.browser, guard.createUrlVerdict(), async () => {
    closed += 1;
  });

  await check('browser-wide Fetch is enabled at the request stage before any context', async () => {
    const enable = fb.log.findIndex((e) => e.method === 'Fetch.enable');
    assert.ok(enable >= 0, 'Fetch.enable was never sent');
    assert.deepEqual(fb.log[enable].params, { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    assert.equal(fb.log.findIndex((e) => e.kind === 'newContext'), -1);
    assert.equal(fb.log[0].kind, 'newBrowserCDPSession');
  });

  const paused = [
    ['r1', 'https://public.example/', undefined, 'Fetch.continueRequest'],
    ['r2', 'http://169.254.169.254/latest/meta-data/iam/', 'r1', 'Fetch.failRequest'],
    ['r3', 'http://127.0.0.1.nip.io/admin', undefined, 'Fetch.failRequest'],
    ['r4', 'https://mixed.example/', 'r1', 'Fetch.failRequest'],
    ['r5', 'https://public.example/next', 'r1', 'Fetch.continueRequest'],
  ];
  for (const [requestId, url, redirectedRequestId] of paused) {
    fb.emit('Fetch.requestPaused', { requestId, redirectedRequestId, request: { url } });
  }
  await tick();
  for (const [requestId, url, redirectedRequestId, expected] of paused) {
    await check(`paused ${redirectedRequestId ? 'redirect hop' : 'request'} ${url} -> ${expected}`, async () => {
      const sent = fb.log.filter((e) => e.kind === 'cdp' && e.params && e.params.requestId === requestId);
      assert.equal(sent.length, 1, `expected one reply for ${requestId}, got ${JSON.stringify(sent)}`);
      assert.equal(sent[0].method, expected);
      if (expected === 'Fetch.failRequest') assert.equal(sent[0].params.errorReason, 'BlockedByClient');
    });
  }

  const ctx = await gb.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const made = fb.contexts[0];
  await check('every context: serviceWorkers block, options kept, route **/* and routeWebSocket installed', async () => {
    assert.equal(ctx, made);
    const opts = fb.log.find((e) => e.kind === 'newContext').opts;
    assert.equal(opts.serviceWorkers, 'block');
    assert.deepEqual(opts.viewport, { width: 390, height: 844 });
    assert.equal(made.routes.length, 1);
    assert.equal(made.routes[0].pattern, '**/*');
    assert.equal(made.sockets.length, 1);
    assert.equal(made.sockets[0].matcher(new URL('wss://anything.example/socket')), true);
  });

  for (const [url, expected] of [
    ['http://169.254.169.254/latest/meta-data/', 'abort:blockedbyclient'],
    ['http://127.0.0.1.nip.io/', 'abort:blockedbyclient'],
    ['https://public.example/app.js', 'continue'],
  ]) {
    await check(`route() ${url} -> ${expected}`, async () => {
      const r = fakeRoute(url);
      await made.routes[0].handler(r);
      assert.equal(r.outcome, expected);
    });
  }

  for (const [url, expected] of [
    ['ws://127.0.0.1.nip.io/socket', 'close:1008'],
    ['ws://10.0.0.7/socket', 'close:1008'],
    ['wss://public.example/socket', 'connect'],
  ]) {
    await check(`routeWebSocket() ${url} -> ${expected}`, async () => {
      const w = fakeSocket(url);
      await made.sockets[0].handler(w);
      assert.equal(w.outcome, expected);
    });
  }

  await check('close() releases the browser through the given closer', async () => {
    await gb.close();
    assert.equal(closed, 1);
  });

  await check('no browser-wide interception, no browser: a missing browser target rejects', async () => {
    const f = fakeBrowser({ sessionFails: true });
    await assert.rejects(guard.guardBrowser(f.browser, guard.createUrlVerdict(), async () => {}));
  });

  await check('no browser-wide interception, no browser: a refused Fetch.enable rejects', async () => {
    const f = fakeBrowser({ enableFails: true });
    await assert.rejects(guard.guardBrowser(f.browser, guard.createUrlVerdict(), async () => {}));
  });
}

function wiringSection(ts) {
  console.log('wiring: app/api/score/audit/route.ts');
  const file = path.join(APP, ROUTE);
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const enclosingFunction = (node) => {
    for (let n = node.parent; n; n = n.parent) {
      if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    }
    return null;
  };
  const calls = [];
  const refs = [];
  const functions = new Map();
  (function walk(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push({ name: node.expression.text, in: enclosingFunction(node) });
    if (ts.isIdentifier(node) && node.text === 'playwrightChromium' && !ts.isImportSpecifier(node.parent)) refs.push(enclosingFunction(node));
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    ts.forEachChild(node, walk);
  })(sf);

  return Promise.all([
    check('no local URL check: isValidUrl and normalizeInputUrl are not defined in the route', async () => {
      assert.equal(functions.has('isValidUrl'), false);
      assert.equal(functions.has('normalizeInputUrl'), false);
    }),
    check("imports normalizeInputUrl and isPublicUrl from url-guard", async () => {
      const imp = sf.statements.find((s) => ts.isImportDeclaration(s) && s.moduleSpecifier.text === '../../../lib/url-guard');
      assert.ok(imp, 'no import from ../../../lib/url-guard');
      const names = imp.importClause.namedBindings.elements.map((e) => e.name.text);
      assert.ok(names.includes('normalizeInputUrl') && names.includes('isPublicUrl'), `imports: ${names.join(', ')}`);
    }),
    check('launchBrowser() is called only inside openAuditBrowser()', async () => {
      const sites = calls.filter((c) => c.name === 'launchBrowser');
      assert.ok(sites.length >= 1, 'launchBrowser is never called');
      assert.deepEqual([...new Set(sites.map((c) => c.in))], ['openAuditBrowser']);
    }),
    check('openAuditBrowser() guards the browser and closes it if the guard fails', async () => {
      assert.ok(calls.some((c) => c.name === 'guardBrowser' && c.in === 'openAuditBrowser'));
      assert.ok(calls.some((c) => c.name === 'closeBrowserSafely' && c.in === 'openAuditBrowser'));
    }),
    check('playwright-core is touched only inside launchBrowser()', async () => {
      assert.deepEqual([...new Set(refs)], ['launchBrowser']);
    }),
    check('every browser check takes a GuardedBrowser', async () => {
      for (const name of ['checkResponsiveOverflow', 'checkSoundToggle', 'checkCoreWebVitalsLab']) {
        const fn = functions.get(name);
        assert.ok(fn, `${name} not found`);
        const shared = fn.parameters.find((p) => p.name.getText(sf) === 'shared');
        assert.ok(shared && shared.type && shared.type.getText(sf) === 'GuardedBrowser', `${name}: shared is ${shared && shared.type ? shared.type.getText(sf) : 'untyped'}`);
      }
    }),
  ]);
}

// ── Section 5: a real browser (opt-in) ───────────────────────────────────────

function wsAccept(key) {
  return require('node:crypto').createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
}

/** A local server for the attack page. Every request is logged by host and path. */
function attackServer() {
  const http = require('node:http');
  const seen = [];
  const server = http.createServer((req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    seen.push(`${host}${req.url}`);
    const P = (h) => `http://${h}:${server.address().port}`;
    const u = req.url;
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const send = (type, body) => {
      res.writeHead(200, { 'Content-Type': type, ...cors });
      res.end(body);
    };
    if (u.startsWith('/redir')) {
      res.writeHead(302, { Location: `${P('private.test')}/secret${u}`, ...cors });
      return res.end();
    }
    if (u === '/page') {
      return send('text/html', `<!doctype html><title>t</title>
<img src="${P('private.test')}/img-direct">
<iframe src="${P('public.test')}/redir-iframe-nav"></iframe>
<iframe src="${P('other.test')}/frame"></iframe>
<script>
fetch('${P('public.test')}/redir-fetch').then(r=>r.text()).then(t=>{document.title='READ:'+t}).catch(()=>{});
fetch('${P('public.test')}/public-asset').then(r=>r.text()).then(t=>{document.body.dataset.asset=t}).catch(()=>{});
fetch('${P('private.test')}/fetch-direct').catch(()=>{});
setTimeout(()=>{ try { window.open('${P('public.test')}/redir-popup'); } catch(e){} }, 50);
try { new SharedWorker('/shared.js'); } catch(e) {}
try { new Worker('/worker.js'); } catch(e) {}
try { const p = new WebSocket('ws://private.test:${server.address().port}/ws-page'); p.onerror=()=>{}; } catch(e) {}
try { const s = new WebSocket('ws://public.test:${server.address().port}/ws-echo'); s.onopen=()=>s.send('ping'); s.onmessage=(e)=>{document.body.dataset.ws=e.data}; } catch(e) {}
</script>`);
    }
    if (u === '/shared.js') return send('text/javascript', `fetch('${P('public.test')}/redir-shared').catch(()=>{}); fetch('${P('private.test')}/shared-direct').catch(()=>{});`);
    if (u === '/worker.js') return send('text/javascript', `fetch('${P('public.test')}/redir-worker').catch(()=>{}); try { new WebSocket('ws://private.test:${server.address().port}/ws-worker'); } catch(e) {}`);
    if (u === '/frame') return send('text/html', `<!doctype html><img src="${P('private.test')}/iframe-img"><script>fetch('${P('public.test')}/redir-oopif').catch(()=>{}); setTimeout(()=>fetch('${P('public.test')}/redir-oopif-late').catch(()=>{}), 800);</script>`);
    if (u.startsWith('/secret')) return send('text/plain', 'METADATA-SECRET');
    return send('text/plain', 'ok');
  });
  server.on('upgrade', (req, socket) => {
    const host = (req.headers.host || '').split(':')[0];
    seen.push(`${host}${req.url}`);
    if (host !== 'public.test') return socket.destroy();
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${wsAccept(req.headers['sec-websocket-key'])}\r\n\r\n`);
    socket.on('data', (buf) => {
      // One small masked text frame in, the same text out (unmasked).
      if ((buf[0] & 0x0f) !== 1) return;
      const len = buf[1] & 0x7f;
      const mask = buf.subarray(2, 6);
      const text = Buffer.from(buf.subarray(6, 6 + len).map((b, i) => b ^ mask[i % 4])).toString();
      const out = Buffer.from(`echo:${text}`);
      socket.write(Buffer.concat([Buffer.from([0x81, out.length]), out]));
    });
    socket.on('error', () => {});
  });
  return { server, seen };
}

const IN_FUNCTION_FLAGS = ['--disable-web-security', '--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process'];
const RESIDUAL = new Set(['private.test/ws-worker']);

async function runBrowser(chromium, guard, { flags, guarded }) {
  const { server, seen } = attackServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ['--host-resolver-rules=MAP *.test 127.0.0.1', ...flags],
  });
  try {
    const verdict = guard.createUrlVerdict(async (host) => host !== 'private.test');
    let ctx;
    if (guarded) {
      const gb = await guard.guardBrowser(browser, verdict, async () => {});
      ctx = await gb.newContext();
    } else {
      // The shape first proposed for this fix: context.route() only.
      ctx = await browser.newContext({ serviceWorkers: 'block' });
      await ctx.route('**/*', async (route) => ((await verdict(route.request().url())) ? route.continue() : route.abort('blockedbyclient')));
      await ctx.routeWebSocket(() => true, async (ws) => ((await verdict(ws.url())) ? ws.connectToServer() : ws.close()));
    }
    const page = await ctx.newPage();
    await page.goto(`http://public.test:${port}/page`, { timeout: 8000 });
    await page.waitForTimeout(3500);
    const state = await page.evaluate(() => ({ title: document.title, asset: document.body.dataset.asset || null, ws: document.body.dataset.ws || null }));
    return { ...state, privateHits: seen.filter((s) => s.startsWith('private.test')).map((s) => s.split(`:${port}`).join('')) };
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

async function browserSection(guard) {
  console.log(`real browser: ${CHROMIUM}`);
  const { chromium } = require(require.resolve('playwright-core', { paths: [APP] }));
  for (const [label, flags] of [['in-function flags', IN_FUNCTION_FLAGS], ['default flags', []]]) {
    const bare = await runBrowser(chromium, guard, { flags, guarded: false });
    await check(`${label}, context.route() only: a redirect hop reaches the private host (the gap)`, async () => {
      assert.ok(bare.privateHits.some((s) => s.includes('/secret/redir-')), `private hits: ${JSON.stringify(bare.privateHits)}`);
      console.log(`        measured: title ${JSON.stringify(bare.title)}, private hits ${JSON.stringify(bare.privateHits)}`);
    });
    const safe = await runBrowser(chromium, guard, { flags, guarded: true });
    await check(`${label}, guardBrowser: no private HTTP request, nothing read`, async () => {
      const unexpected = safe.privateHits.filter((s) => !RESIDUAL.has(s));
      assert.deepEqual(unexpected, [], `private hits: ${JSON.stringify(safe.privateHits)}`);
      assert.equal(safe.title.startsWith('READ:'), false, `title ${safe.title}`);
      console.log(`        measured: title ${JSON.stringify(safe.title)}, private hits ${JSON.stringify(safe.privateHits)} (allowed residual: ${[...RESIDUAL].join(', ')})`);
    });
    await check(`${label}, guardBrowser: a public subresource and a public WebSocket still work`, async () => {
      assert.equal(safe.asset, 'ok', `public fetch read ${JSON.stringify(safe.asset)}`);
      assert.equal(safe.ws, 'echo:ping', `public WebSocket read ${JSON.stringify(safe.ws)}`);
    });
  }
}

async function main() {
  console.log(`audit-ssrf gate (app: ${path.relative(process.cwd(), APP) || '.'})`);
  const h = createHarness({ app: APP, lookup });
  const ts = require(require.resolve('typescript', { paths: [APP, __dirname] }));

  await routeSection(h);

  let guard = null;
  await check(`loads ${GUARD}`, async () => {
    guard = h.load(GUARD);
    assert.equal(typeof guard.createUrlVerdict, 'function');
    assert.equal(typeof guard.guardBrowser, 'function');
  });
  if (guard) {
    await verdictSection(guard);
    await interceptionSection(guard);
  }
  await wiringSection(ts);

  if (CHROMIUM && guard) await browserSection(guard);
  else console.log('real browser: not run (pass --chromium <path to a Chrome or Chromium binary>)');

  if (failures.length) {
    console.log(`\naudit-ssrf: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\naudit-ssrf: all checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
