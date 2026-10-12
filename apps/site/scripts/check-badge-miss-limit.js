#!/usr/bin/env node
/**
 * badge miss limit: the live badge starts a fresh score only behind its
 * limiter, and never limits a cached view.
 *
 * WHY THIS EXISTS
 * /api/badge?url= (and the older /score/badge?url=) runs a full score when the
 * score cache has no entry for the site: it fetches the site and runs the
 * engine. Neither route is in middleware.ts's limiter table, by design (badge
 * views come through GitHub's image proxy from a shared pool of IPs, so a
 * per-view limit would refuse legitimate cached views). Without a limit on
 * the miss itself, anyone could loop /api/badge?url=<random-domain>.com and
 * make the site fetch and score without end.
 *
 * WHAT IT ASSERTS (offline: the real badge routes and the real score engine,
 * loaded by scripts/lib/route-harness.js, with pages served from fixtures, a
 * caching stand-in for unstable_cache, and a scripted stand-in for the
 * Upstash limiters in app/lib/rate-limit.ts)
 *   1. A miss asks the per-IP limiter ('badge-miss', keyed by the caller's IP)
 *      and then the global one ('badge-miss-global'), once each, and only then
 *      fetches the site. The badge says RateLimit-Limiter: active.
 *   2. A hit asks no limiter and fetches nothing: the same site again, the same
 *      site with a path and a query, and the same site through /score/badge.
 *   3. A refused miss fetches nothing and draws "Not scored" with
 *      Cache-Control public, max-age=60, s-maxage=60 (status 200, an image,
 *      never a 429): per IP over its limit (the global limiter is not asked),
 *      global over its limit, Upstash throwing, Upstash answering after
 *      Ratelimit's timeout, and no limiter on Vercel. A refusal is not cached:
 *      the next allowed request for that site scores it.
 *   4. No limiter off Vercel (a local server, CI's served build) is allowed and
 *      says RateLimit-Limiter: inactive.
 *   5. A URL the SSRF guard refuses asks no limiter and fetches nothing.
 *   6. One IP looping 25 unscored random domains, against a counting limiter
 *      with the real thresholds (BADGE_MISS_LIMITS): the first 20 are fetched,
 *      the last 5 are refused with no fetch.
 *   7. Wiring: live-badge-route.ts calls scoreUrl once, as the run of
 *      withScoreMissGate; the badge routes do not import scoreUrl; the cached
 *      function in api/score/route.ts awaits the gate before
 *      scoreUrlUncached.
 *
 * Usage:  node scripts/check-badge-miss-limit.js [--app <dir>]
 * Exits 1 on any failure.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./lib/route-harness');

const argv = process.argv.slice(2);
const appArg = argv.indexOf('--app');
const APP = path.resolve(appArg >= 0 ? argv[appArg + 1] : path.join(__dirname, '..'));
const API_BADGE = 'app/api/badge/route.ts';
const SCORE_BADGE = 'app/score/badge/route.ts';
const IP = '203.0.113.7';
const LIMITED = 'public, max-age=60, s-maxage=60';

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

// ── 7. Wiring (static) ─────────────────────────────────────────────────────
function read(rel) {
  return fs.readFileSync(path.join(APP, rel), 'utf8');
}

// ── The offline stage ───────────────────────────────────────────────────────

// A small page the engine can read and grade.
const PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture site</title>' +
  '<style>:root{--ink:#111111;--paper:#ffffff;--space-1:4px;--space-2:8px}' +
  'body{font-family:system-ui,sans-serif;color:var(--ink);background:var(--paper);margin:0}' +
  '@media (prefers-reduced-motion: reduce){*{animation:none}}</style></head>' +
  `<body><main><h1>Fixture site</h1><p>${'A sentence of body copy for the engine to read. '.repeat(40)}</p>` +
  '<a href="/about">About</a><button type="button">Go</button></main></body></html>';

const SCORED_SITES = ['a.example', 'b.example', 'c.example', 'd.example', 'e.example', 'f.example', 'g.example'];
const pages = Object.fromEntries(SCORED_SITES.map((h) => [`https://${h}/`, PAGE]));

// The scripted limiter. `mode` says what the next limit() answers; `asked`
// records every identifier each limiter was asked about.
const limiter = {
  mode: 'allow',
  asked: { perIp: [], global: [] },
  counts: new Map(),
  thresholds: { perIp: 20, global: 300 },
};
function fake(kind) {
  return {
    async limit(id) {
      limiter.asked[kind].push(id);
      const m = limiter.mode;
      const answer = (success) => ({ success, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve() });
      if (m === 'throw') throw new Error('upstash unreachable (scripted)');
      if (m === 'timeout') return { ...answer(true), reason: 'timeout' };
      if (m === 'deny-ip') return answer(kind !== 'perIp');
      if (m === 'deny-global') return answer(kind !== 'global');
      if (m === 'count') {
        const n = (limiter.counts.get(`${kind}:${id}`) || 0) + 1;
        limiter.counts.set(`${kind}:${id}`, n);
        return answer(n <= limiter.thresholds[kind]);
      }
      return answer(true);
    },
  };
}
const fakes = { 'badge-miss': fake('perIp'), 'badge-miss-global': fake('global') };

// unstable_cache as a cache: the wrapped function runs on a miss only, and a
// throw is not cached (as Next.js does).
function cachingUnstableCache(fn) {
  const memo = new Map();
  return async (...args) => {
    const key = JSON.stringify(args);
    if (memo.has(key)) return memo.get(key);
    const value = await fn(...args);
    memo.set(key, value);
    return value;
  };
}

const harness = createHarness({
  app: APP,
  pages,
  stubs: {
    'next/cache': { unstable_cache: cachingUnstableCache },
  },
  overrides: {
    'app/lib/rate-limit.ts': (real) => ({
      ...real,
      fixedWindow: () => ({}),
      getLimiter: (prefix) => (limiter.mode === 'none' ? null : fakes[prefix] || null),
    }),
  },
});

const fetchedFor = (host) => harness.calls.filter((c) => new URL(c.url).hostname.replace(/^www\./, '') === host).length;
const said = (text) => (text.match(/aria-label="([^"]*)"/) || [])[1] || '';
const askedTotal = () => limiter.asked.perIp.length + limiter.asked.global.length;

async function badge(route, url, extra = '') {
  const r = await harness.get(route, `https://harness.test/x?url=${encodeURIComponent(url)}${extra}`, { 'x-forwarded-for': IP });
  return { ...r, said: said(r.text), cache: r.headers.get('cache-control'), limiter: r.headers.get('ratelimit-limiter'), type: r.headers.get('content-type') };
}

async function main() {
  delete process.env.VERCEL;
  console.log(`badge miss limit (${path.relative(process.cwd(), APP) || '.'})`);

  await check('1. a miss asks the per-IP then the global limiter, once each, before it fetches', async () => {
    limiter.mode = 'allow';
    const r = await badge(API_BADGE, 'a.example');
    assert.equal(r.status, 200);
    assert.match(r.type, /^image\/svg\+xml/);
    assert.match(r.said, /^Scored by Designesy: [ABCDF], \d+\.\d, \d{4}-\d{2}-\d{2}, a\.example$/, r.said);
    assert.deepEqual(limiter.asked.perIp, [`badge-miss:${IP}`]);
    assert.deepEqual(limiter.asked.global, ['badge-miss:all']);
    assert.ok(fetchedFor('a.example') > 0, 'the miss fetched the site');
    assert.equal(r.limiter, 'active');
  });

  await check('2. a hit asks no limiter and fetches nothing (again, with a path and query, and via /score/badge)', async () => {
    const asked = askedTotal();
    const fetched = fetchedFor('a.example');
    const first = await badge(API_BADGE, 'a.example');
    const variant = await badge(API_BADGE, 'https://a.example/pricing?utm=1#top', '&theme=light');
    const old = await badge(SCORE_BADGE, 'a.example');
    assert.equal(askedTotal(), asked, 'a cached view asked a limiter');
    assert.equal(fetchedFor('a.example'), fetched, 'a cached view fetched the site');
    for (const r of [first, variant, old]) {
      assert.match(r.said, /^Scored by Designesy: /);
      assert.equal(r.limiter, null, 'a hit carries no RateLimit-Limiter header');
    }
  });

  const refusals = [
    ['per IP over its limit (the global limiter is not asked)', 'deny-ip', 'b.example', { perIp: 1, global: 0 }, 'active'],
    ['global over its limit', 'deny-global', 'c.example', { perIp: 1, global: 1 }, 'active'],
    ['Upstash throws', 'throw', 'd.example', { perIp: 1, global: 0 }, 'degraded'],
    ["Upstash answers after Ratelimit's timeout", 'timeout', 'e.example', { perIp: 1, global: 0 }, 'degraded'],
  ];
  for (const [why, mode, host, asks, outcome] of refusals) {
    await check(`3. refused, no fetch, "Not scored" for 60 s: ${why}`, async () => {
      limiter.mode = mode;
      const before = { perIp: limiter.asked.perIp.length, global: limiter.asked.global.length };
      const r = await badge(API_BADGE, host);
      assert.equal(r.status, 200);
      assert.match(r.type, /^image\/svg\+xml/);
      assert.equal(r.said, `Designesy score: not scored, ${host}`);
      assert.equal(r.cache, LIMITED);
      assert.equal(r.limiter, outcome);
      assert.equal(fetchedFor(host), 0, 'a refused miss fetched the site');
      assert.equal(limiter.asked.perIp.length - before.perIp, asks.perIp);
      assert.equal(limiter.asked.global.length - before.global, asks.global);
    });
  }

  await check('3. no limiter on Vercel: refused, no fetch', async () => {
    limiter.mode = 'none';
    process.env.VERCEL = '1';
    try {
      const r = await badge(API_BADGE, 'f.example');
      assert.equal(r.said, 'Designesy score: not scored, f.example');
      assert.equal(r.cache, LIMITED);
      assert.equal(r.limiter, 'inactive');
      assert.equal(fetchedFor('f.example'), 0);
    } finally {
      delete process.env.VERCEL;
    }
  });

  await check('3. a refusal is not cached: the next allowed request scores the site', async () => {
    limiter.mode = 'allow';
    const r = await badge(API_BADGE, 'b.example');
    assert.match(r.said, /^Scored by Designesy: .*, b\.example$/);
    assert.ok(fetchedFor('b.example') > 0);
  });

  await check('4. no limiter off Vercel (local, CI): allowed, RateLimit-Limiter: inactive', async () => {
    limiter.mode = 'none';
    const r = await badge(API_BADGE, 'g.example');
    assert.match(r.said, /^Scored by Designesy: .*, g\.example$/);
    assert.equal(r.limiter, 'inactive');
    assert.ok(fetchedFor('g.example') > 0);
  });

  await check('5. a URL the SSRF guard refuses asks no limiter and fetches nothing', async () => {
    limiter.mode = 'allow';
    const asked = askedTotal();
    const calls = harness.calls.length;
    for (const url of ['http://127.0.0.1', 'http://169.254.169.254/latest/meta-data', 'localhost', '']) {
      const r = await badge(API_BADGE, url);
      assert.equal(r.said, 'Designesy score: not scored', url);
      assert.equal(r.cache, 'public, max-age=86400, s-maxage=86400');
    }
    assert.equal(askedTotal(), asked);
    assert.equal(harness.calls.length, calls);
  });

  await check('6. one IP looping 25 unscored random domains: 20 fetched, 5 refused with no fetch', async () => {
    const { BADGE_MISS_LIMITS } = harness.load('app/lib/badge/miss-limit.ts');
    assert.equal(BADGE_MISS_LIMITS.perIp.tokens, 20);
    assert.equal(BADGE_MISS_LIMITS.global.tokens, 300);
    limiter.mode = 'count';
    limiter.thresholds = { perIp: BADGE_MISS_LIMITS.perIp.tokens, global: BADGE_MISS_LIMITS.global.tokens };
    limiter.counts.clear();
    let fetched = 0;
    let refused = 0;
    for (let i = 0; i < 25; i++) {
      const host = `loop-${i}-${Math.random().toString(36).slice(2, 8)}.example`;
      const r = await badge(API_BADGE, host);
      assert.match(r.said, /^Designesy score: not scored, /, 'an unscored domain never draws a grade');
      if (fetchedFor(host) > 0) fetched++;
      if (r.cache === LIMITED) {
        refused++;
        assert.equal(fetchedFor(host), 0);
      }
    }
    assert.deepEqual({ fetched, refused }, { fetched: 20, refused: 5 });
  });

  await check('7. wiring: one scoreUrl call, run by withScoreMissGate; the cached function awaits the gate', async () => {
    const route = read('app/lib/badge/live-badge-route.ts');
    const calls = route.match(/\bscoreUrl\(/g) || [];
    assert.equal(calls.length, 1, 'live-badge-route.ts calls scoreUrl exactly once');
    assert.match(route, /withScoreMissGate\(\s*async \(\) => \{[\s\S]*?decideBadgeMiss\([\s\S]*?\},\s*\(\) => scoreUrl\(/);
    for (const rel of [API_BADGE, SCORE_BADGE]) assert.doesNotMatch(read(rel), /\bscoreUrl\b/, `${rel} imports scoreUrl`);
    const score = read('app/api/score/route.ts');
    assert.match(
      score,
      /export const scoreUrl = unstable_cache\(\s*async \(targetUrl: string, scope\?: ScoreScope\) => \{\s*const gate = missGate\.getStore\(\);\s*if \(gate\) await gate\(\);\s*return scoreUrlUncached\(targetUrl, scope\);/,
    );
  });

  if (failures.length) {
    console.log(`\nbadge-miss-limit: ${failures.length} failing: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\nbadge-miss-limit: OK - a fresh score starts only behind the limiter; cached views are never limited');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
