/**
 * Engine 1.5.4, pinned rule by rule: the fetch layer reads the page the site
 * served, decoded.
 *
 *   - A stylesheet href resolves against the URL that answered: the page
 *     after its redirects, or the www. candidate that was read. Until 1.5.4
 *     it resolved against the URL requested, so a page that moved had its
 *     sheets fetched from the host it moved away from.
 *   - A body below status 400 sent with Content-Encoding gzip (x-gzip),
 *     deflate (zlib-wrapped or raw) or br is decoded. One that does not
 *     decode, decodes past 16 MiB, or names a registered coding not decoded
 *     here (or more than one coding) is not read; a label no registry
 *     defines (none) reads as identity. A page's stylesheets decode no more
 *     than 16 MiB between them. When a coded stream ends before the
 *     response does, the request is destroyed. Until 1.5.4 the compressed
 *     bytes were read as text.
 *   - A 4xx or 5xx stylesheet is not read as CSS.
 *   - A <link> that writes href before rel=stylesheet is read.
 *
 * node:https cannot reach a local server here (safeLookup refuses loopback,
 * as it should), so node:https get is replaced for each test, as in
 * engine-1-3-1.test.mjs, and every host is an example.test name. Each answer
 * is a real readable stream of the bytes a server would send.
 *
 * The rule tests fail on main's package engine (1.5.2 in @designesy/score
 * 0.9.3); the controls (marked) pass on both.
 * Zero dependencies: node:test + node:assert/strict.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { scoreUrl } from '../dist/engine.js';

const MiB = 1024 * 1024;
const page = (head = '', body = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title>${head}</head><body><main><h1>Fixture</h1><p>A synthetic page.</p>${body}</main></body></html>`;
/** A sheet declaring `n` :root tokens named after `tag`. */
const sheet = (tag, n) => `:root{${Array.from({ length: n }, (_, i) => `--${tag}-${i}:#${String(i).padStart(3, '0')}`).join(';')}}body{color:var(--${tag}-0)}`;
/** What a host answers at a sheet path it does not have: an HTML page, whose tokens a CSS read would count. */
const TRAP = `<!doctype html><html><head><title>Moved</title><style>${sheet('trap', 4)}</style></head><body><p>This page has moved.</p></body></html>`;

/**
 * Score `url` with node:https get answering from `routes`, keyed by host and
 * path: [status, headers, body]. Unknown paths answer 404. As in
 * engine-1-3-1, http:// candidates are answered too.
 */
async function withSite(routes, url) {
  const real = https.get;
  const calls = [];
  https.get = (target, opts, cb) => {
    const u = new URL(String(target));
    const key = `${u.host}${u.pathname}`;
    const call = { key, headers: (opts && opts.headers) || {}, destroyed: false };
    calls.push(call);
    const [statusCode, headers = {}, body = '', options = {}] = routes[key] || [404, {}, 'not here'];
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    // options.held: the body is sent and the response never ends, as a
    // server that holds the connection open.
    const res = options.held
      ? Object.assign(new Readable({ read() { if (!this.sent) { this.sent = true; this.push(bytes); } } }), { statusCode, headers })
      : Object.assign(Readable.from(bytes.length ? [bytes] : [], { objectMode: false }), { statusCode, headers });
    setImmediate(() => cb(res));
    return { on() { return this; }, destroy() { call.destroyed = true; res.destroy(); } };
  };
  syncBuiltinESMExports();
  try {
    return { result: await scoreUrl(url, 'universal'), calls: calls.filter((c) => !/\/DESIGN\.md$/i.test(c.key)) };
  } finally {
    https.get = real;
    syncBuiltinESMExports();
  }
}
const asCss = (body, encoding) => [200, { 'content-type': 'text/css', ...(encoding ? { 'content-encoding': encoding } : {}) }, body];
const asHtml = (body, encoding) => [200, { 'content-type': 'text/html', ...(encoding ? { 'content-encoding': encoding } : {}) }, body];

describe('engine 1.5.4: stylesheet hrefs resolve against the URL that answered', () => {
  it('a page reached through a redirect reads its sheets from the host it landed on', async () => {
    const { result, calls } = await withSite({
      'old.example.test/x/': [301, { location: 'https://new.example.test/x/' }, ''],
      'new.example.test/x/': asHtml(page('<link rel=stylesheet href="/assets/site.css"><link href="theme.css" rel="stylesheet">')),
      'new.example.test/assets/site.css': asCss(sheet('site', 3)),
      'new.example.test/x/theme.css': asCss(sheet('theme', 2)),
      'old.example.test/assets/site.css': asHtml(TRAP),
      'old.example.test/x/theme.css': asHtml(TRAP),
    }, 'https://old.example.test/x/');
    assert.deepEqual(calls.filter((c) => c.key.startsWith('old.example.test/') && c.key !== 'old.example.test/x/'), [], 'a sheet was asked of the host the page moved away from');
    assert.equal(result.tokensExtracted, 5);
  });

  it('the www. candidate that answered is the base for its sheets', async () => {
    const { result, calls } = await withSite({
      'bare.example.test/': [403, {}, 'Forbidden'],
      'www.bare.example.test/': asHtml(page('<link rel="stylesheet" href="/w.css">')),
      'www.bare.example.test/w.css': asCss(sheet('www', 3)),
      'bare.example.test/w.css': asHtml(TRAP),
    }, 'https://bare.example.test/');
    assert.ok(!calls.some((c) => c.key === 'bare.example.test/w.css'), 'the sheet was asked of the bare host');
    assert.equal(result.tokensExtracted, 3);
  });

  it('control: a page read where it was asked for reads the same sheets as before', async () => {
    const { result, calls } = await withSite({
      'plain.example.test/': asHtml(page('<style>:root{--paper:#fff}</style><link rel="stylesheet" href="/a.css"><link rel=stylesheet href="https://cdn.example.test/b.css">')),
      'plain.example.test/a.css': asCss(sheet('a', 2)),
      'cdn.example.test/b.css': asCss(sheet('b', 2)),
    }, 'https://plain.example.test/');
    assert.deepEqual(calls.map((c) => c.key), ['plain.example.test/', 'plain.example.test/a.css', 'cdn.example.test/b.css']);
    assert.equal(result.tokensExtracted, 5);
  });
});

describe('engine 1.5.4: a compressed body is decoded, or not read', () => {
  it('reads sheets sent as gzip, X-GZIP, deflate (zlib and raw) and br', async () => {
    const { result } = await withSite({
      'enc.example.test/': asHtml(page(['gz', 'xgz', 'zd', 'rd', 'br'].map((p) => `<link rel="stylesheet" href="/${p}.css">`).join(''))),
      'enc.example.test/gz.css': asCss(zlib.gzipSync(sheet('gz', 1)), 'gzip'),
      'enc.example.test/xgz.css': asCss(zlib.gzipSync(sheet('xgz', 2)), 'X-GZIP'),
      'enc.example.test/zd.css': asCss(zlib.deflateSync(sheet('zd', 3)), 'deflate'),
      'enc.example.test/rd.css': asCss(zlib.deflateRawSync(sheet('rd', 4)), 'deflate'),
      'enc.example.test/br.css': asCss(zlib.brotliCompressSync(sheet('br', 5)), 'br'),
    }, 'https://enc.example.test/');
    assert.equal(result.tokensExtracted, 1 + 2 + 3 + 4 + 5);
  });

  it('scores a page sent gzip-encoded from its decoded HTML', async () => {
    const { result } = await withSite({
      'gzpage.example.test/': asHtml(zlib.gzipSync(page(`<style>${sheet('inline', 4)}</style>`)), 'gzip'),
    }, 'https://gzpage.example.test/');
    assert.equal(typeof result.score, 'number');
    assert.equal(result.tokensExtracted, 4);
  });

  it('drops a sheet that decodes past 16 MiB and still scores the page (and reads one under it)', async () => {
    const bomb = Buffer.concat([Buffer.from(`${sheet('bomb', 2)}/*`), Buffer.alloc(17 * MiB, 0x61), Buffer.from('*/')]);
    const under = Buffer.concat([Buffer.from(`${sheet('under', 3)}/*`), Buffer.alloc(1 * MiB, 0x61), Buffer.from('*/')]);
    const { result } = await withSite({
      'bomb.example.test/': asHtml(page('<link rel="stylesheet" href="/bomb.css"><link rel="stylesheet" href="/under.css">')),
      'bomb.example.test/bomb.css': asCss(zlib.gzipSync(bomb), 'gzip'),
      'bomb.example.test/under.css': asCss(zlib.gzipSync(under), 'gzip'),
    }, 'https://bomb.example.test/');
    assert.equal(typeof result.score, 'number');
    // A decoder with no bound would count the bomb's two tokens as well.
    assert.equal(result.tokensExtracted, 3);
  });

  it('drops a sheet that is corrupt, truncated, zstd or stacked (gzip, br), never reading it as text', async () => {
    const { result } = await withSite({
      'bad.example.test/': asHtml(page(['corrupt', 'truncated', 'zstd', 'stacked', 'good'].map((p) => `<link rel="stylesheet" href="/${p}.css">`).join(''))),
      // Plain CSS that says it is gzip: a reader that ignores the header would count its tokens.
      'bad.example.test/corrupt.css': asCss(sheet('corrupt', 2), 'gzip'),
      // A stream cut short: a decoder that keeps what it decoded before the error would count these.
      'bad.example.test/truncated.css': asCss(zlib.gzipSync(sheet('cut', 40)).subarray(0, 60), 'gzip'),
      'bad.example.test/zstd.css': asCss(sheet('zstd', 2), 'zstd'),
      'bad.example.test/stacked.css': asCss(sheet('stacked', 2), 'gzip, br'),
      'bad.example.test/good.css': asCss(zlib.gzipSync(sheet('good', 3)), 'gzip'),
    }, 'https://bad.example.test/');
    assert.equal(result.tokensExtracted, 3);
  });

  it('a page that does not decode is unreachable (network), not a page of compressed bytes', async () => {
    const corrupt = asHtml(Buffer.from(page('<style>:root{--x:#000}</style>')), 'gzip');
    const { result } = await withSite({ 'cpage.example.test/': corrupt, 'www.cpage.example.test/': corrupt }, 'https://cpage.example.test/');
    assert.equal(result.unreachable, true);
    assert.equal(result.unreachableReason, 'network');
    assert.equal(result.score, null);
  });

  it('control: a 404 marked gzip stays an http_error with its status', async () => {
    const missing = [404, { 'content-encoding': 'gzip' }, 'garbage, not gzip'];
    const { result } = await withSite({ 'gone.example.test/': missing, 'www.gone.example.test/': missing }, 'https://gone.example.test/');
    assert.equal(result.unreachable, true);
    assert.equal(result.unreachableReason, 'http_error');
    assert.match(result.unreachableDetail, /HTTP 404/);
  });

  it('control: a label no registry defines (Content-Encoding: none) reads the body as sent', async () => {
    const { result } = await withSite({
      'none.example.test/': asHtml(page(`<style>${sheet('none', 4)}</style>`), 'none'),
    }, 'https://none.example.test/');
    assert.equal(typeof result.score, 'number');
    assert.equal(result.tokensExtracted, 4);
  });

  it('a page\'s compressed sheets decode no more than 16 MiB between them: a sheet past what is left is dropped', async () => {
    // Eight sheets of 3 MiB each once decoded, a few KiB each on the wire:
    // five fit in 16 MiB (15 MiB), the sixth would pass it, the last two too.
    const routes = { 'many.example.test/': asHtml(page(Array.from({ length: 8 }, (_, i) => `<link rel="stylesheet" href="/s${i}.css">`).join(''))) };
    for (let i = 0; i < 8; i++) {
      const body = Buffer.concat([Buffer.from(`${sheet(`s${i}`, 1)}/*`), Buffer.alloc(3 * MiB - 64, 0x61), Buffer.from('*/')]);
      routes[`many.example.test/s${i}.css`] = asCss(zlib.gzipSync(body), 'gzip');
    }
    const { result } = await withSite(routes, 'https://many.example.test/');
    assert.equal(typeof result.score, 'number');
    assert.equal(result.tokensExtracted, 5);
  });

  it('a br page whose stream ends before the response does is read, and its request is destroyed', { timeout: 10000 }, async () => {
    const body = Buffer.concat([zlib.brotliCompressSync(page(`<style>${sheet('held', 3)}</style>`)), Buffer.from('bytes after the end of the coded stream')]);
    const { result, calls } = await withSite({
      'held.example.test/': [200, { 'content-type': 'text/html', 'content-encoding': 'br' }, body, { held: true }],
    }, 'https://held.example.test/');
    assert.equal(result.tokensExtracted, 3);
    assert.equal(calls[0].key, 'held.example.test/');
    assert.equal(calls[0].destroyed, true, 'the connection was left open after the page was read');
  });

  it('asks for gzip, deflate and br by name, for the page and for each sheet', async () => {
    const { calls } = await withSite({
      'ae.example.test/': asHtml(page('<link rel="stylesheet" href="/a.css">')),
      'ae.example.test/a.css': asCss(sheet('ae', 1)),
    }, 'https://ae.example.test/');
    assert.equal(calls.length, 2);
    for (const c of calls) assert.equal(c.headers['Accept-Encoding'], 'gzip, deflate, br', c.key);
  });

  it('control: identity pages and sheets read exactly as before', async () => {
    const { result } = await withSite({
      'id.example.test/': [200, { 'content-encoding': 'identity' }, page('<link rel="stylesheet" href="/a.css">')],
      'id.example.test/a.css': asCss(sheet('id', 3)),
    }, 'https://id.example.test/');
    assert.equal(result.tokensExtracted, 3);
  });
});

describe('engine 1.5.4: a 4xx or 5xx stylesheet is not read as CSS', () => {
  it('drops a 404 sheet, whether its body is an HTML page or compressed bytes the engine does not decode', async () => {
    const { result } = await withSite({
      'err.example.test/': asHtml(page('<link rel="stylesheet" href="/good.css"><link rel="stylesheet" href="/missing.css"><link rel="stylesheet" href="/broken.css">')),
      'err.example.test/good.css': asCss(sheet('good', 3)),
      'err.example.test/missing.css': [404, { 'content-type': 'text/html' }, TRAP],
      'err.example.test/broken.css': [500, { 'content-type': 'text/html', 'content-encoding': 'gzip' }, zlib.gzipSync(TRAP)],
    }, 'https://err.example.test/');
    assert.equal(result.tokensExtracted, 3);
  });
});

describe('engine 1.5.4: a <link> with href before rel=stylesheet is read', () => {
  it('reads href-first tags, quoted, single-quoted and unquoted rel, in any case', async () => {
    const { result, calls } = await withSite({
      'order.example.test/': asHtml(page('<link href="/a.css" rel="stylesheet"><LINK HREF=\'/b.css\' REL=stylesheet><link href="/c.css" media="print" rel=\'stylesheet\'>')),
      'order.example.test/a.css': asCss(sheet('a', 1)),
      'order.example.test/b.css': asCss(sheet('b', 2)),
      'order.example.test/c.css': asCss(sheet('c', 3)),
    }, 'https://order.example.test/');
    assert.deepEqual(calls.map((c) => c.key), ['order.example.test/', 'order.example.test/a.css', 'order.example.test/b.css', 'order.example.test/c.css']);
    assert.equal(result.tokensExtracted, 6);
  });

  it('control: a tag with no rel=stylesheet is still not a stylesheet', async () => {
    const { calls } = await withSite({
      'icons.example.test/': asHtml(page('<link href="/icon.svg" rel="icon"><link rel="preload" href="/font.woff2"><link href="/x.css">')),
    }, 'https://icons.example.test/');
    assert.deepEqual(calls.map((c) => c.key), ['icons.example.test/']);
  });
});
