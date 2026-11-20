#!/usr/bin/env node
/**
 * report app text: the report page writes the address it is given, and every
 * value a report carries, as text, and only the host that embeds it can drive
 * it.
 *
 * WHY THIS EXISTS
 * /api/report/app?url= serves one HTML page (the MCP route serves the same
 * page as ui://designesy/report-app). Its inline script starts a report on the
 * address it was given and draws the result with innerHTML. The address comes
 * from the query string, and a report's strings can quote the page that was
 * scored, so both are untrusted text that lands inside a script element and
 * inside markup. Each must read back as the same text and never become markup
 * or code of the page's own. The page also takes reports and report requests
 * over postMessage, which only the host that embeds it may send.
 *
 * WHAT IT ASSERTS (offline: the real route, loaded by scripts/lib/route-harness.js,
 * and the page's own inline script run in a node:vm context against a small
 * stand-in DOM; nothing reaches the network)
 *   1. For every address in ADDRESSES (script end tags, a comment opener,
 *      quotes, backslashes, line breaks, U+2028, U+2029, NUL, non-ASCII), the
 *      page has one <script> start tag and one </script> end tag, that end tag
 *      is the one just before </body>, and the script holds no "<!--" and no
 *      "<script". The markup around the script, and every script line but the
 *      one that sets INITIAL_URL, are the same as with no address; that line
 *      holds no <, >, & and no raw U+2028 or U+2029.
 *   2. The script parses as JavaScript and, run, POSTs exactly the address
 *      given ({"url": address}) to its report API, a URL ending in /api/report.
 *      Embedded, it also tells its host that same address. With no address it
 *      POSTs nothing and tells its host null.
 *   3. A report from the API, and a report pushed by the embedding host, are
 *      drawn as text: no probe tag a report carries reaches innerHTML raw, each
 *      probe string is drawn escaped, a number field that is not a number is
 *      drawn as 0, and a status other than PASS, FAIL, WARN, SKIP and MANUAL is
 *      drawn escaped with no status- class.
 *   4. Only the embedding host drives the page: an embedded page ignores a
 *      report and a report request from any other window, and a page opened
 *      on its own (no host) ignores them even from itself. The same messages
 *      from the host are acted on, so the check is not vacuous.
 *
 * Usage:  node scripts/check-report-app-html.js [--app <dir>]
 * Exits 1 on any failure.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { createHarness } = require('./lib/route-harness');

const argv = process.argv.slice(2);
const appArg = argv.indexOf('--app');
const APP = path.resolve(appArg >= 0 ? argv[appArg + 1] : path.join(__dirname, '..'));
const ROUTE = 'app/api/report/app/route.ts';

/** Addresses the page must write as text. None is fetched: the run is offline. */
const ADDRESSES = [
  'https://site.example/',
  'https://site.example/a?b=1&c=2#d',
  'https://site.example/</script><b data-probe="address">x</b>',
  'https://site.example/</SCRIPT ><b data-probe="address">x</b>',
  'https://site.example/</script/',
  'https://site.example/<!--<script>',
  'https://site.example/"double"\'single\'`back`',
  'https://site.example/back\\slash\\',
  'https://site.example/\\u2028 written out',
  'https://site.example/line\nbreak\r\nend',
  'https://site.example/\u2028and\u2029',
  'https://site.example/nul\u0000',
  'https://site.example/caf\u00e9/\u{1F600}',
  '</script>',
];

const PROBE = '<b data-probe="report">x</b>';
const ESCAPED = '&lt;b data-probe=&quot;report&quot;&gt;x&lt;/b&gt;';
const STATUSES = ['PASS', 'FAIL', 'WARN', 'SKIP', 'MANUAL'];

/** A report whose every string and number field carries the probe. */
function hostileReport() {
  const engine = (extra) => ({ ok: true, score: PROBE, grade: PROBE, pass: PROBE, warn: PROBE, fail: PROBE, total: PROBE, ...extra });
  return {
    ok: true,
    url: PROBE,
    compositeScore: PROBE,
    compositeGrade: PROBE,
    totalPass: PROBE,
    totalWarn: PROBE,
    totalFail: PROBE,
    totalManual: PROBE,
    totalSkip: PROBE,
    totalChecks: PROBE,
    score: engine({
      checks: [
        { id: PROBE, item: PROBE, detail: PROBE, status: PROBE },
        { id: 'S1', item: 'Known', detail: 'd', status: 'PASS' },
        { id: 'S2', item: 'Known', detail: 'd', status: 'SKIP' },
        { id: 'S3', item: 'Known', detail: 'd', status: 'MANUAL' },
        { id: 'S4', item: 'Known', detail: 'd', status: ['PASS'] },
      ],
    }),
    drift: { ok: false, error: PROBE },
    readiness: engine({ checks: { length: PROBE } }),
    synthesis: [{ id: PROBE, item: PROBE, detail: PROBE, status: 'WARN' }],
  };
}

class NextResponse extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}

const harness = createHarness({ app: APP, stubs: { 'next/server': { NextResponse, after: () => {} } } });

/** The route's page for `address` (null: no ?url= at all). */
async function page(address) {
  const query = address === null ? '' : `?url=${encodeURIComponent(address)}`;
  const r = await harness.get(ROUTE, `https://harness.test/api/report/app${query}`);
  assert.equal(r.status, 200, 'status 200');
  assert.match(r.headers.get('content-type') || '', /^text\/html/, 'an HTML page');
  return r.text;
}

/** Split a page into the markup before its script, the script, and the rest. */
function parts(html) {
  const opens = [...html.matchAll(/<script(?:\s|\/|>)/gi)];
  const closes = [...html.matchAll(/<\/script(?:\s|\/|>)/gi)];
  assert.equal(opens.length, 1, `one <script> start tag (found ${opens.length})`);
  assert.equal(closes.length, 1, `one </script> end tag (found ${closes.length})`);
  const start = html.indexOf('>', opens[0].index) + 1;
  const end = closes[0].index;
  assert.ok(start > 0 && start <= end, 'the script element opens before it closes');
  const body = html.slice(start, end);
  assert.doesNotMatch(body, /<!--/, 'the script holds no "<!--"');
  assert.doesNotMatch(body, /<script/i, 'the script holds no "<script"');
  assert.match(html.slice(end), /^<\/script>\s*<\/body>\s*<\/html>\s*$/, 'the script ends with the end tag just before </body>');
  return { before: html.slice(0, start), body, after: html.slice(end) };
}

const INITIAL_LINE = /^[ \t]*var INITIAL_URL = .*$/m;

/** The script with its one INITIAL_URL line taken out; returns [rest, line]. */
function splitInitial(body) {
  const lines = body.match(new RegExp(INITIAL_LINE.source, 'gm')) || [];
  assert.equal(lines.length, 1, `one INITIAL_URL line (found ${lines.length})`);
  return [body.replace(INITIAL_LINE, ''), lines[0]];
}

/** A stand-in element: records every innerHTML write. */
function element(id) {
  const classes = new Set();
  const attrs = {};
  let html = '';
  const el = {
    id,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    style: {},
    writes: [],
    listeners: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => {
      (el.listeners[type] = el.listeners[type] || []).push(fn);
    },
    querySelectorAll: () => [],
    setAttribute: (k, v) => {
      attrs[k] = String(v);
    },
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
    focus: () => {},
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => {
      html = String(v);
      el.writes.push(html);
    },
  });
  return el;
}

/** Let promise chains in the page settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Run a page's inline script in a fresh context. `embedded` gives it a host
 * (window.parent); otherwise window.parent is the window itself, as for a page
 * opened on its own. `reply` is what the report API answers.
 */
function run(html, { embedded = false, reply } = {}) {
  const { body } = parts(html);
  const els = {};
  const posts = [];
  const toHost = [];
  const listeners = [];
  const win = {
    addEventListener: (type, fn) => {
      if (type === 'message') listeners.push(fn);
    },
  };
  const host = { postMessage: (msg) => toHost.push(msg) };
  win.parent = embedded ? host : win;
  const document = {
    getElementById: (id) => {
      if (!els[id]) els[id] = element(id);
      return els[id];
    },
  };
  const fetch = (url, init) => {
    posts.push({ url, init });
    const data = reply === undefined ? { ok: false, error: 'no reply' } : reply;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  };
  const context = vm.createContext({ window: win, document, fetch, setTimeout: () => 0 });
  new vm.Script(body, { filename: 'report-app-inline.js' }).runInContext(context);
  const deliver = (source, data) => {
    for (const fn of listeners) fn({ source, data, origin: 'https://host.example' });
  };
  const drawn = () => ['composite', 'engines', 'tabs', 'checks'].flatMap((id) => (els[id] ? els[id].writes : []));
  return { els, posts, toHost, host, win, deliver, drawn };
}

/** The address a run POSTed to its report API. */
function postedAddress(r) {
  assert.equal(r.posts.length, 1, `one POST to the report API (found ${r.posts.length})`);
  const { url, init } = r.posts[0];
  assert.match(String(url), /^https:\/\/[^/]+\/api\/report$/, 'the POST goes to <origin>/api/report');
  assert.equal(init && init.method, 'POST');
  return JSON.parse(init.body).url;
}

/** Every innerHTML write of a drawn report is text: the probe only escaped. */
function assertDrawnAsText(r) {
  const writes = r.drawn();
  assert.ok(writes.length >= 4, `the report is drawn (${writes.length} innerHTML writes)`);
  const all = writes.join('\n');
  assert.ok(!all.includes('data-probe="report"'), 'no probe tag from the report reaches innerHTML raw');
  const last = (id) => {
    const w = r.els[id].writes;
    return w[w.length - 1];
  };
  const composite = last('composite');
  assert.ok(composite.includes(`Composite grade ${ESCAPED}`), 'the composite grade is drawn escaped');
  assert.ok(composite.includes('>0/100<') || composite.includes('0/100 '), 'a composite score that is not a number is drawn as 0');
  assert.ok(composite.includes('0 pass</span>') && composite.includes('0 N/A of 0 checks'), 'composite totals that are not numbers are drawn as 0');
  const engines = last('engines');
  assert.ok(engines.includes(`${ESCAPED} · 0</p>`), 'an engine grade is drawn escaped, its score as 0');
  assert.ok(engines.includes('0 pass · 0 warn · 0 fail of 0'), 'engine totals that are not numbers are drawn as 0');
  assert.ok(engines.includes(`<p class="engine-fail">${ESCAPED}</p>`), "a failed engine's error is drawn escaped");
  assert.ok(last('tabs').includes('Readiness (0)'), 'a check count that is not a number is drawn as 0');
  const checks = last('checks');
  assert.ok(checks.includes(`<span class="check-id">${ESCAPED}</span>`), 'a check id is drawn escaped');
  assert.ok(checks.includes(`<span class="status">${ESCAPED}</span>`), 'an unknown status is drawn escaped, with no status- class');
  assert.ok(checks.includes('<span class="status status-PASS">PASS</span>'), 'PASS keeps its badge');
  assert.ok(checks.includes('<span class="status status-SKIP">N/A</span>'), 'SKIP is drawn N/A');
  assert.ok(checks.includes('<span class="status status-MANUAL">Manual</span>'), 'MANUAL is drawn Manual');
  assert.ok(checks.includes('<span class="status">PASS</span>'), 'a status that is not a string gets no status- class');
  for (const m of all.matchAll(/status-([^"\s]*)/g)) {
    assert.ok(STATUSES.includes(m[1]), `status- class only for the five statuses (found status-${m[1]})`);
  }
  assert.equal(r.els.targetUrl.textContent, PROBE, 'the report URL is set as text');
}

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(e && e.message ? e.message : e).split('\n').join('\n        ')}`);
  }
}

async function main() {
  console.log(`report-app-html: ${path.relative(process.cwd(), APP) || '.'}`);
  const baselineHtml = await page(null);
  const baseline = parts(baselineHtml);
  const [baselineRest, baselineLine] = splitInitial(baseline.body);
  assert.match(baselineLine, /var INITIAL_URL = null;\s*$/, 'with no address INITIAL_URL is null');
  assert.equal(await page(''), baselineHtml, 'an empty ?url= serves the same page as none');

  await check('1. every address stays inside its string: one script element, the page\'s own end tag, nothing else changed', async () => {
    const bad = [];
    for (const address of ADDRESSES) {
      try {
        const p = parts(await page(address));
        assert.equal(p.before, baseline.before, 'the markup before the script is unchanged');
        assert.equal(p.after, baseline.after, 'the markup after the script is unchanged');
        const [rest, line] = splitInitial(p.body);
        assert.equal(rest, baselineRest, 'only the INITIAL_URL line differs');
        assert.doesNotMatch(line, /[<>&\u2028\u2029]/, 'the INITIAL_URL line holds no <, >, & and no raw U+2028 or U+2029');
      } catch (e) {
        bad.push(`address ${JSON.stringify(address)}: ${String(e.message).split('\n')[0]}`);
      }
    }
    if (bad.length) throw new Error(`${bad.length} of ${ADDRESSES.length} addresses:\n${bad.join('\n')}`);
  });

  await check('2. the script parses and POSTs exactly the address given; embedded, it tells its host the same', async () => {
    const bad = [];
    for (const address of ADDRESSES) {
      try {
        const html = await page(address);
        const alone = run(html);
        await settle();
        assert.equal(postedAddress(alone), address, 'the POSTed address is the address given');
        const embedded = run(html, { embedded: true });
        await settle();
        assert.equal(postedAddress(embedded), address, 'embedded, the POSTed address is the address given');
        const ready = embedded.toHost.find((m) => m && m.params && 'initialUrl' in m.params);
        assert.ok(ready, 'embedded, the page tells its host it is ready');
        assert.equal(ready.params.initialUrl, address, 'and names the address given');
      } catch (e) {
        bad.push(`address ${JSON.stringify(address)}: ${String(e.message).split('\n')[0]}`);
      }
    }
    if (bad.length) throw new Error(`${bad.length} of ${ADDRESSES.length} addresses:\n${bad.join('\n')}`);
    const none = run(baselineHtml, { embedded: true });
    await settle();
    assert.equal(none.posts.length, 0, 'with no address nothing is POSTed');
    const ready = none.toHost.find((m) => m && m.params && 'initialUrl' in m.params);
    assert.ok(ready && ready.params.initialUrl === null, 'with no address the host is told null');
  });

  await check('3. a report is drawn as text, from the API and from the host', async () => {
    const fromApi = run(await page('https://site.example/'), { reply: hostileReport() });
    await settle();
    assertDrawnAsText(fromApi);
    const fromHost = run(baselineHtml, { embedded: true });
    await settle();
    fromHost.deliver(fromHost.host, { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { result: hostileReport() } });
    await settle();
    assertDrawnAsText(fromHost);
  });

  await check('4. only the embedding host drives the page', async () => {
    const result = { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { result: hostileReport() } };
    const request = { jsonrpc: '2.0', method: 'ui/message', params: { url: 'https://site.example/asked' } };

    const embedded = run(baselineHtml, { embedded: true });
    await settle();
    const stranger = {};
    for (const source of [stranger, embedded.win, null, undefined]) {
      embedded.deliver(source, result);
      embedded.deliver(source, request);
    }
    await settle();
    assert.equal(embedded.drawn().length, 0, 'an embedded page draws no report from another window');
    assert.equal(embedded.posts.length, 0, 'an embedded page runs no report asked by another window');
    embedded.deliver(embedded.host, request);
    await settle();
    assert.equal(postedAddress(embedded), 'https://site.example/asked', 'the host can ask for a report');
    embedded.deliver(embedded.host, result);
    await settle();
    assert.ok(embedded.drawn().length > 0, 'the host can push a report');

    const alone = run(baselineHtml);
    await settle();
    for (const source of [alone.win, stranger, null, undefined]) {
      alone.deliver(source, result);
      alone.deliver(source, request);
    }
    await settle();
    assert.equal(alone.drawn().length, 0, 'a page with no host draws no pushed report');
    assert.equal(alone.posts.length, 0, 'a page with no host runs no report asked by message');
  });

  if (failures.length) {
    console.log(`\nreport-app-html: ${failures.length} failing: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log(`\nreport-app-html: OK - ${ADDRESSES.length} addresses and every report value are written as text; only the embedding host drives the page`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
