/**
 * SSRF guard unit tests — validates the three-layer defense:
 *   1. isValidUrl (sync): protocol, IPv6, encoded IPs, IP-literal private ranges
 *   2. safeLookup (connection-path): DNS rebinding mitigation
 *   3. Redirect re-validation
 *
 * Zero dependencies: Node built-ins only. The address check tests at the
 * end replace node:https get and node:dns/promises lookup, so they open no
 * socket and resolve no name.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dnsPromises from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { isValidUrl, normalizeInputUrl, scoreFromParts, scoreUrl } from '../dist/engine.js';

describe('isValidUrl — sync layer', () => {
  it('accepts normal HTTPS URLs', () => {
    assert.equal(isValidUrl('https://example.com'), true);
    assert.equal(isValidUrl('https://designesy.org'), true);
    assert.equal(isValidUrl('http://example.com/path'), true);
  });

  it('rejects non-HTTP protocols', () => {
    assert.equal(isValidUrl('file:///etc/passwd'), false);
    assert.equal(isValidUrl('ftp://example.com'), false);
    assert.equal(isValidUrl('javascript:alert(1)'), false);
    assert.equal(isValidUrl('gopher://localhost'), false);
  });

  it('rejects AWS metadata IP', () => {
    assert.equal(isValidUrl('http://169.254.169.254'), false);
    assert.equal(isValidUrl('http://169.254.169.254/latest/meta-data'), false);
  });

  it('rejects loopback addresses', () => {
    assert.equal(isValidUrl('http://127.0.0.1'), false);
    assert.equal(isValidUrl('http://127.0.0.1:8080'), false);
  });

  it('rejects RFC1918 private ranges', () => {
    assert.equal(isValidUrl('http://10.0.0.1'), false);
    assert.equal(isValidUrl('http://10.255.255.255'), false);
    assert.equal(isValidUrl('http://172.16.0.1'), false);
    assert.equal(isValidUrl('http://172.31.255.255'), false);
    assert.equal(isValidUrl('http://192.168.1.1'), false);
  });

  it('rejects link-local addresses', () => {
    assert.equal(isValidUrl('http://169.254.0.1'), false);
  });

  it('rejects CGNAT range', () => {
    assert.equal(isValidUrl('http://100.64.0.1'), false);
  });

  it('rejects all IPv6 (including ::1)', () => {
    assert.equal(isValidUrl('http://[::1]'), false);
    assert.equal(isValidUrl('http://[::]'), false);
    assert.equal(isValidUrl('http://[fe80::1]'), false);
    assert.equal(isValidUrl('http://[fd00::1]'), false);
  });

  it('rejects IPv4-mapped IPv6', () => {
    assert.equal(isValidUrl('http://[::ffff:169.254.169.254]'), false);
  });

  it('rejects encoded IP forms', () => {
    // Octal: 0x7f.0x00.0x00.0x01 = 127.0.0.1
    assert.equal(isValidUrl('http://0x7f.0x00.0x00.0x01'), false);
    // Octal: 0177.0.0.1 = 127.0.0.1
    assert.equal(isValidUrl('http://0177.0.0.1'), false);
  });

  it('rejects localhost (no dot, no colon)', () => {
    assert.equal(isValidUrl('http://localhost'), false);
  });

  it('accepts public IP addresses', () => {
    assert.equal(isValidUrl('http://1.1.1.1'), true);
    assert.equal(isValidUrl('http://8.8.8.8'), true);
    assert.equal(isValidUrl('https://104.20.23.154'), true);
  });
});

describe('normalizeInputUrl', () => {
  it('adds https:// prefix when missing', () => {
    assert.equal(normalizeInputUrl('example.com'), 'https://example.com/');
    assert.equal(normalizeInputUrl('designesy.org'), 'https://designesy.org/');
  });

  it('preserves existing protocol', () => {
    assert.equal(normalizeInputUrl('http://example.com'), 'http://example.com/');
    assert.equal(normalizeInputUrl('https://example.com'), 'https://example.com/');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeInputUrl('  example.com  '), 'https://example.com/');
  });

  it('returns empty string for empty input', () => {
    assert.equal(normalizeInputUrl(''), '');
    assert.equal(normalizeInputUrl('   '), '');
  });
});

// ── One address check for URL hosts and lookup answers ──────────────────────
//
// The engine refuses an address in any range that is not public: every range
// ipaddr.js 2.5.0 names in its IPv4 and IPv6 SpecialRanges, and ::/96 (the
// IPv4-compatible addresses). The check reads a URL's IPv4 host (isValidUrl),
// an IPv4 host the lookup is handed, and every address the lookup gets for a
// name, IPv4 and IPv6, in the forms node:dns writes them. Tests marked control
// pass on the engine before this check too.
//
// The lookup is the function httpsFetch hands node:https get. It is captured
// by replacing https.get for one scoreUrl call, as engine-1-3-1.test.mjs does,
// so no socket opens. node:dns/promises lookup is replaced for each call, so
// no name is resolved: every answer below is written by the test.

/**
 * Answer every node:https get with `route(url)`: [status, location?, body?].
 * A /DESIGN.md request is answered 404 and listed apart, in `designMd`.
 */
async function withFakeGet(route, fn) {
  const real = https.get;
  const calls = [];
  https.get = (url, opts, cb) => {
    const href = String(url);
    calls.push({ href, lookup: opts && opts.lookup });
    const [statusCode, location, body = ''] = /\/DESIGN\.md$/i.test(href) ? [404] : route(href);
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
  try {
    const result = await fn();
    const isDesignMd = (c) => /\/DESIGN\.md$/i.test(c.href);
    return { result, calls: calls.filter((c) => !isDesignMd(c)), designMd: calls.filter(isDesignMd) };
  } finally {
    https.get = real;
    syncBuiltinESMExports();
  }
}

let engineLookup = null;
/** The lookup function httpsFetch hands node:https. */
async function getLookup() {
  if (engineLookup) return engineLookup;
  const { calls } = await withFakeGet(() => [404], () => scoreUrl('https://capture.example.test/', 'universal'));
  engineLookup = calls.find((c) => typeof c.lookup === 'function')?.lookup;
  assert.equal(typeof engineLookup, 'function', 'httpsFetch passed no lookup to node:https');
  return engineLookup;
}

/**
 * Run the engine's lookup for `host` with node:dns/promises lookup answering
 * `answers` ([address, family] pairs). Resolves to
 * { refused, address, family, dnsCalls }.
 */
async function lookupAnswering(host, answers, options = { all: true }) {
  const lookup = await getLookup();
  const real = dnsPromises.lookup;
  let dnsCalls = 0;
  dnsPromises.lookup = async () => {
    dnsCalls += 1;
    return answers.map(([address, family]) => ({ address, family }));
  };
  syncBuiltinESMExports();
  try {
    const out = await new Promise((resolve) => {
      lookup(host, options, (err, address, family) => resolve({ err, address, family }));
    });
    return { refused: Boolean(out.err), address: out.err ? null : out.address, family: out.family, dnsCalls };
  } finally {
    dnsPromises.lookup = real;
    syncBuiltinESMExports();
  }
}

const answerRefused = async (address, family) => (await lookupAnswering('name.example.test', [[address, family]])).refused;

/**
 * [range, first, inside, last, just below or null, just above or null]. The
 * address just outside a range is in no range on this list. Null stands where
 * there is no such address, or where the next address is in another range on
 * this list.
 */
const V4_RANGES = [
  ['0.0.0.0/8', '0.0.0.0', '0.1.2.3', '0.255.255.255', null, '1.0.0.0'],
  ['10.0.0.0/8', '10.0.0.0', '10.20.30.40', '10.255.255.255', '9.255.255.255', '11.0.0.0'],
  ['100.64.0.0/10', '100.64.0.0', '100.100.100.100', '100.127.255.255', '100.63.255.255', '100.128.0.0'],
  ['127.0.0.0/8', '127.0.0.0', '127.0.0.1', '127.255.255.255', '126.255.255.255', '128.0.0.0'],
  ['169.254.0.0/16', '169.254.0.0', '169.254.1.2', '169.254.255.255', '169.253.255.255', '169.255.0.0'],
  ['172.16.0.0/12', '172.16.0.0', '172.20.0.1', '172.31.255.255', '172.15.255.255', '172.32.0.0'],
  ['192.0.0.0/24', '192.0.0.0', '192.0.0.8', '192.0.0.255', '191.255.255.255', '192.0.1.0'],
  ['192.0.2.0/24', '192.0.2.0', '192.0.2.1', '192.0.2.255', '192.0.1.255', '192.0.3.0'],
  ['192.31.196.0/24', '192.31.196.0', '192.31.196.1', '192.31.196.255', '192.31.195.255', '192.31.197.0'],
  ['192.52.193.0/24', '192.52.193.0', '192.52.193.1', '192.52.193.255', '192.52.192.255', '192.52.194.0'],
  ['192.88.99.0/24', '192.88.99.0', '192.88.99.1', '192.88.99.255', '192.88.98.255', '192.88.100.0'],
  ['192.168.0.0/16', '192.168.0.0', '192.168.1.1', '192.168.255.255', '192.167.255.255', '192.169.0.0'],
  ['192.175.48.0/24', '192.175.48.0', '192.175.48.1', '192.175.48.255', '192.175.47.255', '192.175.49.0'],
  ['198.18.0.0/15', '198.18.0.0', '198.19.0.1', '198.19.255.255', '198.17.255.255', '198.20.0.0'],
  ['198.51.100.0/24', '198.51.100.0', '198.51.100.1', '198.51.100.255', '198.51.99.255', '198.51.101.0'],
  ['203.0.113.0/24', '203.0.113.0', '203.0.113.1', '203.0.113.255', '203.0.112.255', '203.0.114.0'],
  ['224.0.0.0/4', '224.0.0.0', '232.1.2.3', '239.255.255.255', '223.255.255.255', null],
  ['240.0.0.0/4', '240.0.0.0', '250.1.2.3', '255.255.255.255', null, null],
];

/** The same shape for IPv6, each address written as node:dns writes it. */
const MAX = 'ffff:ffff:ffff:ffff:ffff:ffff';
const V6_RANGES = [
  ['::/96', '::', '::127.0.0.1', '::255.255.255.255', null, '::1:0:0'],
  ['::ffff:0:0/96', '::ffff:0.0.0.0', '::ffff:127.0.0.1', '::ffff:255.255.255.255', '::fffe:ffff:ffff', '::1:0:0:0'],
  ['::ffff:0:0:0/96', '::ffff:0:0:0', '::ffff:0:7f00:1', '::ffff:0:ffff:ffff', '::fffe:ffff:ffff:ffff', '::ffff:1:0:0'],
  ['64:ff9b::/96', '64:ff9b::', '64:ff9b::7f00:1', '64:ff9b::ffff:ffff', `64:ff9a:${MAX}`, '64:ff9b::1:0:0'],
  ['64:ff9b:1::/48', '64:ff9b:1::', '64:ff9b:1::7f00:1', '64:ff9b:1:ffff:ffff:ffff:ffff:ffff', '64:ff9b:0:ffff:ffff:ffff:ffff:ffff', '64:ff9b:2::'],
  ['100::/64', '100::', '100::1', '100::ffff:ffff:ffff:ffff', `ff:ffff:${MAX}`, '100:0:0:1::'],
  ['2001::/23', '2001::', '2001:100::1', `2001:1ff:${MAX}`, `2000:ffff:${MAX}`, '2001:200::'],
  ['2001:db8::/32', '2001:db8::', '2001:db8::1', `2001:db8:${MAX}`, `2001:db7:${MAX}`, '2001:db9::'],
  ['2002::/16', '2002::', '2002:7f00:1::1', `2002:ffff:${MAX}`, `2001:ffff:${MAX}`, '2003::'],
  ['2620:4f:8000::/48', '2620:4f:8000::', '2620:4f:8000::1', '2620:4f:8000:ffff:ffff:ffff:ffff:ffff', '2620:4f:7fff:ffff:ffff:ffff:ffff:ffff', '2620:4f:8001::'],
  ['3fff::/20', '3fff::', '3fff:800::1', `3fff:fff:${MAX}`, `3ffe:ffff:${MAX}`, '3fff:1000::'],
  ['5f00::/16', '5f00::', '5f00:1::1', `5f00:ffff:${MAX}`, `5eff:ffff:${MAX}`, '5f01::'],
  ['fc00::/7', 'fc00::', 'fd12:3456::1', `fdff:ffff:${MAX}`, `fbff:ffff:${MAX}`, 'fe00::'],
  ['fe80::/10', 'fe80::', 'fe90::1', `febf:ffff:${MAX}`, `fe7f:ffff:${MAX}`, null],
  ['fec0::/10', 'fec0::', 'fed0::1', `feff:ffff:${MAX}`, null, null],
  ['ff00::/8', 'ff00::', 'ff02::1', `ffff:ffff:${MAX}`, null, null],
];

describe('address check: IPv4 ranges, as a URL host and as a lookup answer', () => {
  // Ranges the engine refused in full before this check.
  const controls = new Set(['0.0.0.0/8', '10.0.0.0/8', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '224.0.0.0/4', '240.0.0.0/4']);
  for (const [range, first, inside, last, below, above] of V4_RANGES) {
    it(`${controls.has(range) ? 'control: ' : ''}refuses ${range} at both ends and inside, and accepts the address on either side that no range holds`, async () => {
      for (const a of [first, inside, last]) {
        assert.equal(isValidUrl(`http://${a}/`), false, `isValidUrl accepted http://${a}/`);
        assert.equal(await answerRefused(a, 4), true, `the lookup accepted the answer ${a}`);
      }
      for (const a of [below, above].filter(Boolean)) {
        assert.equal(isValidUrl(`http://${a}/`), true, `isValidUrl refused http://${a}/`);
        assert.equal(await answerRefused(a, 4), false, `the lookup refused the answer ${a}`);
      }
    });
  }
});

describe('address check: IPv6 ranges, as a lookup answer', () => {
  for (const [range, first, inside, last, below, above] of V6_RANGES) {
    it(`${range === 'fc00::/7' ? 'control: ' : ''}refuses ${range} at both ends and inside, and accepts the address on either side that no range holds`, async () => {
      for (const a of [first, inside, last]) {
        assert.equal(await answerRefused(a, 6), true, `the lookup accepted the answer ${a}`);
      }
      for (const a of [below, above].filter(Boolean)) {
        assert.equal(await answerRefused(a, 6), false, `the lookup refused the answer ${a}`);
      }
    });
  }
});

describe('address check: what an answer holds and how it is written', () => {
  it('refuses an IPv4-mapped answer whatever IPv4 address it holds', async () => {
    for (const a of ['::ffff:8.8.8.8', '::ffff:93.184.215.14', '::ffff:1.1.1.1', '::ffff:10.0.0.1']) {
      assert.equal(await answerRefused(a, 6), true, `the lookup accepted the answer ${a}`);
    }
  });

  it('refuses each ::/96 answer in the form node:dns writes it', async () => {
    for (const a of ['::2', '::ffff', '::0.1.0.0', '::10.0.0.1', '::8.8.8.8', '::169.254.1.2']) {
      assert.equal(await answerRefused(a, 6), true, `the lookup accepted the answer ${a}`);
    }
  });

  it('reads upper case, zone ids, full and zero-padded groups, and an IPv4 tail', async () => {
    for (const a of ['FE80::1', 'fe80::1%eth0', 'fe80::1%2', '0:0:0:0:0:0:0:1', '0000:0000:0000:0000:0000:0000:0000:0001', '::FFFF:127.0.0.1', '64:ff9b::127.0.0.1', 'FF02::1']) {
      assert.equal(await answerRefused(a, 6), true, `the lookup accepted the answer ${a}`);
    }
    for (const a of ['2606:4700:4700::ABCD', '2606:4700:4700::1111%eth0', '2606:4700:4700:0:0:0:0:1111', '2606:4700:4700:0000:0000:0000:0000:1111', '2606:4700:4700::0.0.17.17', '2001:4860:4860:0:0:0:8.8.136.136']) {
      assert.equal(await answerRefused(a, 6), false, `the lookup refused the answer ${a}`);
    }
  });

  it('refuses an answer it cannot read as an IP address', async () => {
    // Stricter than ipaddr.js on two IPv4 forms node:dns never writes: a short
    // form (1.2.3) and a leading zero (01.2.3.4) are not read as addresses.
    const unread = [
      'not-an-address', '', '1.2.3', '1.2.3.4.5', '256.1.1.1', '300.1.1.1', '01.2.3.4',
      '::g', '2606:4700:4700::11111', '1::2::3', '1:2:3:4::5:6:7:8::9', '1:2:3:4::5:6:7:8',
      '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7', '1.2.3.4::', ':1::2',
      '2606:4700:4700::1.2.3', '2606:4700:4700::256.1.1.1', '2606:4700:4700::01.2.3.4',
    ];
    for (const a of unread) {
      assert.equal(await answerRefused(a, a.includes(':') ? 6 : 4), true, `the lookup accepted the answer ${JSON.stringify(a)}`);
    }
  });

  it('judges an answer by its address, whatever family it is labelled with', async () => {
    assert.equal(await answerRefused('::ffff:127.0.0.1', 4), true);
    assert.equal(await answerRefused('2001:db8::1', 4), true);
    assert.equal(await answerRefused('192.0.2.1', 6), true);
  });

  it('refuses a name when any of its answers is not public, in any position', async () => {
    const pub4 = ['93.184.215.14', 4];
    const pub6 = ['2606:4700:4700::1111', 6];
    for (const bad of [['::ffff:127.0.0.1', 6], ['::7f00:1', 6], ['192.0.2.1', 4], ['100.64.0.1', 4]]) {
      assert.equal((await lookupAnswering('name.example.test', [pub4, pub6, bad])).refused, true, `accepted with ${bad[0]} last`);
      assert.equal((await lookupAnswering('name.example.test', [bad, pub4])).refused, true, `accepted with ${bad[0]} first`);
    }
  });

  it('refuses a name with an answer that is not public when the lookup is asked for one address', async () => {
    // node:https asks for one address, with no `all`, when automatic family
    // selection is off.
    const pub4 = ['93.184.215.14', 4];
    for (const bad of [['::ffff:127.0.0.1', 6], ['192.0.2.1', 4], ['64:ff9b::7f00:1', 6]]) {
      assert.equal((await lookupAnswering('name.example.test', [bad], {})).refused, true, `accepted ${bad[0]}`);
      assert.equal((await lookupAnswering('name.example.test', [pub4, bad], {})).refused, true, `accepted ${bad[0]} second`);
    }
    const literal = await lookupAnswering('192.0.2.1', [pub4], {});
    assert.equal(literal.refused, true, 'the lookup accepted the host 192.0.2.1');
    assert.equal(literal.dnsCalls, 0, 'an IPv4 host was resolved');
  });

  it('control: hands every answer on when all are public', async () => {
    const answers = [['93.184.215.14', 4], ['2606:4700:4700::1111', 6]];
    const all = await lookupAnswering('name.example.test', answers);
    assert.equal(all.refused, false);
    assert.deepEqual(all.address, answers.map(([address, family]) => ({ address, family })));
    const one = await lookupAnswering('name.example.test', answers, {});
    assert.equal(one.address, '93.184.215.14');
    assert.equal(one.family, 4);
  });
});

describe('address check: literal IPv4 hosts', () => {
  const PAGE = '<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1><p>Body copy for the address check.</p></main></body></html>';

  it('accepts the public addresses above carrier-grade NAT', async () => {
    for (const a of ['100.128.0.0', '100.128.0.1', '100.200.1.1', '100.255.255.255']) {
      assert.equal(isValidUrl(`http://${a}/`), true, `isValidUrl refused http://${a}/`);
      const r = await lookupAnswering(a, []);
      assert.equal(r.refused, false, `the lookup refused the host ${a}`);
      assert.equal(r.dnsCalls, 0, 'an IPv4 host was resolved');
    }
  });

  it('refuses a host the lookup is handed in a range that is not public, without resolving it', async () => {
    for (const a of ['192.0.2.1', '198.18.0.1', '203.0.113.9', '100.64.0.1', '127.0.0.1']) {
      const r = await lookupAnswering(a, [['93.184.215.14', 4]]);
      assert.equal(r.refused, true, `the lookup accepted the host ${a}`);
      assert.equal(r.dnsCalls, 0, 'an IPv4 host was resolved');
    }
  });

  it('reads a page whose host is a public address above carrier-grade NAT', async () => {
    const { result, calls } = await withFakeGet(() => [200, undefined, PAGE], () => scoreUrl('https://100.128.0.1/', 'universal'));
    assert.equal(calls[0]?.href, 'https://100.128.0.1/');
    assert.equal(typeof result.score, 'number');
  });

  it('follows a redirect to a public address above carrier-grade NAT and refuses one to a range that is not public', async () => {
    const ok = await withFakeGet(
      (url) => (url.includes('start.example.test') ? [302, 'https://100.128.0.1/page'] : [200, undefined, PAGE]),
      () => scoreUrl('https://start.example.test/', 'universal'),
    );
    assert.ok(ok.calls.some((c) => c.href === 'https://100.128.0.1/page'), 'the redirect was not followed');
    assert.equal(typeof ok.result.score, 'number');
    const refused = await withFakeGet(
      (url) => (url.includes('start.example.test') ? [302, 'https://198.51.100.7/page'] : [200, undefined, PAGE]),
      () => scoreUrl('https://start.example.test/', 'universal'),
    );
    assert.ok(refused.calls.every((c) => !c.href.includes('198.51.100.7')), 'the redirect was followed');
    assert.equal(refused.result.unreachable, true);
  });

  it('control: follows a first redirect to a public host and refuses a second one to a range that is not public', async () => {
    const { result, calls } = await withFakeGet(
      (url) => {
        if (url.includes('start.example.test')) return [302, 'https://next.example.test/a'];
        if (url.includes('next.example.test')) return [302, 'https://10.0.0.9/b'];
        return [200, undefined, PAGE];
      },
      () => scoreUrl('https://start.example.test/', 'universal'),
    );
    assert.ok(calls.some((c) => c.href === 'https://next.example.test/a'), 'the first redirect was not followed');
    assert.ok(calls.every((c) => !c.href.includes('10.0.0.9')), 'the second redirect was followed');
    assert.equal(result.unreachable, true);
  });

  it('control: follows a chain of three redirects to public hosts and refuses one whose third hop is in a range that is not public', async () => {
    // The engine follows at most three redirects: the third is the last one it follows.
    const chain = (third) => (url) => {
      if (url.includes('start.example.test')) return [302, 'https://one.example.test/a'];
      if (url.includes('one.example.test')) return [302, 'https://two.example.test/b'];
      if (url.includes('two.example.test')) return [302, third];
      return [200, undefined, PAGE];
    };
    const ok = await withFakeGet(chain('https://three.example.test/c'), () => scoreUrl('https://start.example.test/', 'universal'));
    assert.ok(ok.calls.some((c) => c.href === 'https://three.example.test/c'), 'the third redirect was not followed');
    assert.equal(typeof ok.result.score, 'number');
    const { result, calls } = await withFakeGet(chain('https://192.168.7.8/c'), () => scoreUrl('https://start.example.test/', 'universal'));
    assert.ok(calls.some((c) => c.href === 'https://two.example.test/b'), 'the second redirect was not followed');
    assert.ok(calls.every((c) => !c.href.includes('192.168.7.8')), 'the third redirect was followed');
    assert.equal(result.unreachable, true);
  });

  it('control: a page whose host is in a range that is not public is never requested', async () => {
    const { result, calls } = await withFakeGet(() => [200, undefined, PAGE], () => scoreUrl('https://10.1.2.3/', 'universal'));
    assert.equal(calls.length, 0);
    assert.equal(result.unreachable, true);
  });

  it('control: a stylesheet whose host is in a range that is not public is never requested', async () => {
    const links = '<link rel="stylesheet" href="https://10.4.5.6/site.css"><link rel="stylesheet" href="https://cdn.example.test/site.css">';
    const page = PAGE.replace('</head>', `${links}</head>`);
    const { result, calls } = await withFakeGet(
      (url) => (url.endsWith('.css') ? [200, undefined, 'body { color: #111; }'] : [200, undefined, page]),
      () => scoreUrl('https://page.example.test/', 'universal'),
    );
    assert.ok(calls.some((c) => c.href === 'https://cdn.example.test/site.css'), 'the public stylesheet was not requested');
    assert.ok(calls.every((c) => !c.href.includes('10.4.5.6')), 'the stylesheet at 10.4.5.6 was requested');
    assert.equal(typeof result.score, 'number');
  });

  it('control: a stylesheet whose host is in a range that is not public is never requested, when a public one is listed before it', async () => {
    const links = '<link rel="stylesheet" href="https://cdn.example.test/site.css"><link rel="stylesheet" href="https://172.16.0.5/late.css">';
    const page = PAGE.replace('</head>', `${links}</head>`);
    const { result, calls } = await withFakeGet(
      (url) => (url.endsWith('.css') ? [200, undefined, 'body { color: #111; }'] : [200, undefined, page]),
      () => scoreUrl('https://page.example.test/', 'universal'),
    );
    assert.ok(calls.some((c) => c.href === 'https://cdn.example.test/site.css'), 'the public stylesheet was not requested');
    assert.ok(calls.every((c) => !c.href.includes('172.16.0.5')), 'the stylesheet at 172.16.0.5 was requested');
    assert.equal(typeof result.score, 'number');
  });

  it('control: a /DESIGN.md whose host is in a range that is not public is never requested', async () => {
    const publicSite = await withFakeGet(() => [404], () => scoreFromParts({ html: PAGE, css: '', subject: 'https://page.example.test/', scope: 'universal' }));
    assert.deepEqual(publicSite.designMd.map((c) => c.href), ['https://page.example.test/DESIGN.md'], 'the public /DESIGN.md was not requested');
    const { result, designMd } = await withFakeGet(() => [404], () => scoreFromParts({ html: PAGE, css: '', subject: 'https://10.4.5.6/', scope: 'universal' }));
    assert.equal(designMd.length, 0, 'the /DESIGN.md at 10.4.5.6 was requested');
    assert.equal(result.checks.find((c) => c.id === 'v37')?.status, 'SKIP');
  });
});
