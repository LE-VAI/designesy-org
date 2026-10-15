#!/usr/bin/env node
/**
 * Records the engine answers scripts/check-contract-page.js serves to
 * /score/contract. Every file here is a real POST /api/score response, never
 * a hand-written one, so the page is checked against what the engine says.
 *
 * Three sources, all the real engine:
 *   --live    the deployed engine (https://www.designesy.org/api/score),
 *             scoring designesy.org against contracts written for it
 *             (contracts/designesy-*.md), www.designesy.org against good.md
 *             (landed.json) and a name that never resolves (unreachable.json).
 *             Nothing else is scored live.
 *   --pinned  the same cases (the LIVE table), scored by this checkout's route
 *             against sites/snapshot.json: every request the route made to
 *             those sites when the snapshot was taken, with the answer it got.
 *             Nothing leaves the machine. A request the snapshot does not hold
 *             fails that record instead of being answered.
 *   --local   this checkout's route (app/api/score/route.ts) loaded with
 *             scripts/lib/route-harness.js, reading the local fixture pages
 *             in sites/ (studio, an empty app shell, a page with no CSS) and,
 *             for a linked contract, a contract served from the same table.
 *             Nothing leaves the machine.
 *
 * And one that writes no record:
 *   --snapshot  scores every LIVE case with this checkout's route against the
 *             real sites and writes each request the route made, and its
 *             answer, to sites/snapshot.json: the status and the body as the
 *             route reads it, or the error of a name that did not resolve.
 *             Each URL is fetched once, with the route's own request headers;
 *             a repeat is answered from the first. Any other failed request
 *             stops the snapshot and writes nothing.
 *
 * AN ENGINE VERSION BUMP
 * check-contract-page.js fails a landed record whose engineVersion or
 * contractVersion is not this checkout's. --live answers with the deployed
 * engine's versions, the old ones until the bump itself deploys, so a bump
 * re-records offline:
 *   1. Bump ENGINE_VERSION (app/lib/check-definitions.ts) or the contract.
 *   2. node scripts/fixtures/contract-page/record.mjs --local --pinned
 *      Every 200 the page gate reads is then this checkout's route's answer,
 *      at this checkout's versions.
 *   3. Read the diff. engineVersion, receipt.engine_version and retrieved_at
 *      move in every 200; anything else that moved, a verdict digest
 *      included, is what the bump changes on a page.
 *   4. Run check-contract-page.js against `next build && next start`, and
 *      check-ignition.js (it reads landed.json).
 * The snapshot keeps the sites as they were when it was taken. To score them
 * as they are now, run --snapshot and --pinned in a commit of their own, so a
 * change in the site and a change in the engine show as two diffs. Once the
 * bump deploys, --live --out <dir> gives the --pinned answers again,
 * retrieved_at aside, for as long as the snapshot still matches the site.
 *
 * Usage (from apps/site):
 *   node scripts/fixtures/contract-page/record.mjs --local
 *   node scripts/fixtures/contract-page/record.mjs --pinned
 *   node scripts/fixtures/contract-page/record.mjs --live
 *   node scripts/fixtures/contract-page/record.mjs --snapshot
 *   ... --only landed-pass,landed-drift   (--snapshot always takes every case)
 *   ... --out <dir>                       write the records there, not here
 *
 * Each file is { status, retryAfter, body }. retrieved_at moves with every
 * run, and a digest with what it covers (the verdict set, the contract); the
 * page reads them from the file, so a re-record changes the file and nothing
 * else.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', '..', '..');
const SNAPSHOT = path.join(HERE, 'sites', 'snapshot.json');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const only = opt('--only') ? opt('--only').split(',') : null;
const take = (c) => !only || only.includes(c.file.replace(/\.json$/, ''));
const OUT = opt('--out') ? path.resolve(opt('--out')) : HERE;
const read = (p) => fs.readFileSync(path.join(HERE, p), 'utf8').replace(/\r\n?/g, '\n');
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
// The network's fetch: a route run swaps the global one out while it scores.
const netFetch = globalThis.fetch;

const LIVE = [
  // A contract written from designesy.org's own shipped values: every check it can score passes.
  { file: 'landed-pass.json', url: 'designesy.org', contract: { content: read('contracts/designesy-pass.md') } },
  // The same values, plus named tokens remembered wrong: a drifted label colour fails f01 and the primary pair (f10, capped at 70).
  { file: 'landed-drift.json', url: 'designesy.org', contract: { content: read('contracts/designesy-drift.md') } },
  // The primary pair as the site ships it (Azure label on Azure): one failing check, which caps fidelity at 70.
  { file: 'landed-capped.json', url: 'designesy.org', contract: { content: read('contracts/designesy-pair.md') } },
  // The landed state, and the landing check-ignition.js replays: good.md against www.designesy.org.
  { file: 'landed.json', url: 'www.designesy.org', contract: { content: read('good.md') } },
  // A valid contract and a site that could not be read: .invalid never resolves (RFC 6761).
  { file: 'unreachable.json', url: 'unreachable.invalid', contract: { content: read('good.md') } },
];

const LOCAL_PAGES = {
  'https://studio.example.com/': read('sites/studio.html'),
  'https://studio.example.com/site.css': read('sites/studio.css'),
  'https://app.studio.example.com/': read('sites/shell.html'),
  'https://app.studio.example.com/assets/app.css': read('sites/studio.css'),
  'https://notes.studio.example.com/': read('sites/bare.html'),
  'https://studio.example.com/work': read('sites/work.html'),
  'https://studio.example.com/work.css': read('sites/work.css'),
  'https://pamphlet.studio.example.com/': read('sites/pamphlet.html'),
  'https://pamphlet.studio.example.com/pamphlet.css': read('sites/pamphlet.css'),
  'https://contracts.studio.example.com/DESIGN.md': read('contracts/studio-one-fail.md'),
};

const LOCAL = [
  // Every scored check passes or needs work: no failure.
  { file: 'landed-warn.json', url: 'studio.example.com', contract: { content: read('contracts/studio-warn.md') } },
  // A linked contract with exactly one failing check, which sets no ceiling, on a
  // page whose stylesheet has no focus ring and no reduced-motion rule (two baseline failures).
  { file: 'landed-one-fail.json', url: 'studio.example.com/work', contract: { url: 'https://contracts.studio.example.com/DESIGN.md' } },
  // DTCG tokens against a one-page pamphlet (two colors, two sizes, one face):
  // fewer than 3 fidelity checks score (too_few_checks).
  { file: 'landed-no-score.json', url: 'pamphlet.studio.example.com', contract: { content: read('contracts/studio-sparse.tokens.json') } },
  // Both layers null: an empty app shell, and a page with no CSS.
  { file: 'landed-empty-shell.json', url: 'app.studio.example.com', contract: { content: read('contracts/studio-warn.md') } },
  { file: 'landed-no-css.json', url: 'notes.studio.example.com', contract: { content: read('contracts/studio-warn.md') } },
  // The three refusals where the DESIGN.md linter never reads the file.
  { file: 'rejected-format.json', url: 'studio.example.com', contract: { content: read('contracts/unknown.txt') } },
  { file: 'rejected-link.json', url: 'studio.example.com', contract: { url: 'https://contracts.studio.example.com/missing.md' } },
  { file: 'rejected-dtcg.json', url: 'studio.example.com', contract: { content: read('contracts/two-colors.tokens.json') } },
];

function save(file, status, retryAfter, body) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), `${JSON.stringify({ status, retryAfter, body }, null, 1)}\n`);
  const f = body.fidelity;
  const b = body.baseline;
  console.log(`${file}: ${status}${f ? ` fidelity ${f.score} ${f.grade ?? ''} (${f.scored} scored) baseline ${b.score} ${b.grade ?? ''}` : ` ${body.code} ${(body.problems || []).map((p) => p.code).join(',')}`}`);
}

async function live() {
  for (const c of LIVE.filter(take)) {
    const r = await fetch('https://www.designesy.org/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: c.url, contract: { ...c.contract, format: 'auto' } }),
    });
    const ra = r.headers.get('retry-after');
    save(c.file, r.status, ra ? Number(ra) : null, await r.json());
  }
}

/** Score each case with this checkout's route, the harness answering the
    route's requests from `pages`, then `api`. Returns [case, status, retryAfter, body]. */
async function viaRoute(cases, { pages, api }, onCase = () => {}) {
  const { createHarness } = require('../../lib/route-harness.js');
  const { lint } = await import('@google/design.md/linter');
  const harness = createHarness({ app: APP, pages, api, stubs: { '@google/design.md/linter': { lint } } });
  const route = harness.load('app/api/score/route.ts');
  const out = [];
  for (const c of cases) {
    onCase(c);
    globalThis.fetch = async () => new Response('not found', { status: 404 });
    try {
      const res = await route.POST(new Request('https://harness.test/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ url: c.url, contract: { ...c.contract, format: 'auto' } }),
      }));
      const ra = res.headers.get('retry-after');
      out.push([c, res.status, ra ? Number(ra) : null, JSON.parse(await res.text())]);
    } finally {
      globalThis.fetch = netFetch;
    }
  }
  return out;
}

async function local() {
  for (const [c, ...r] of await viaRoute(LOCAL.filter(take), { pages: LOCAL_PAGES })) save(c.file, ...r);
}

/** A snapshot entry as the route reads it: a response, or a failure at the network level. */
function answer(entry, bodies) {
  if (entry.error) throw new TypeError('fetch failed', { cause: Object.assign(new Error(entry.error), { code: entry.error }) });
  return new Response(bodies[entry.body], { status: entry.status });
}

async function snapshot() {
  const requests = {};
  const bodies = {};
  const failed = [];
  const fetchOnce = async (url, init) => {
    try {
      const res = await netFetch(url, { headers: init && init.headers, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      // As Response.text() decodes it, which is what the route reads.
      const text = new TextDecoder().decode(await res.arrayBuffer());
      bodies[sha256(text)] = text;
      requests[url] = { status: res.status, body: sha256(text) };
    } catch (e) {
      const code = e && e.cause && e.cause.code;
      if (code === 'ENOTFOUND') requests[url] = { error: code };
      else failed.push(`${url}: ${code || e.message}`);
    }
  };
  const pending = {};
  const api = async (url, init) => {
    await (pending[url] = pending[url] || fetchOnce(url, init));
    if (!requests[url]) throw new TypeError('fetch failed');
    return answer(requests[url], bodies);
  };
  const results = await viaRoute(LIVE, { api });
  if (failed.length) {
    console.error(`no snapshot written; these requests failed:\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify({
    note: 'Every request app/api/score/route.ts made while scoring the cases below against the real sites, and the answer it got: the status and the body as Response.text() decodes it (keyed by its sha256), or the error of a name that did not resolve. Written by record.mjs --snapshot; record.mjs --pinned answers the route from it, offline.',
    takenAt: new Date().toISOString(),
    engineVersion: results[0][3].engineVersion,
    cases: LIVE.map((c) => ({ file: c.file, url: c.url })),
    requests: sorted(requests),
    bodies: sorted(bodies),
  }, null, 1)}\n`);
  const bytes = Object.values(bodies).reduce((n, t) => n + Buffer.byteLength(t), 0);
  console.log(`sites/snapshot.json: ${Object.keys(requests).length} requests, ${Object.keys(bodies).length} bodies, ${bytes} bytes`);
}

async function pinned() {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  for (const [sha, text] of Object.entries(snap.bodies)) {
    if (sha256(text) !== sha) {
      console.error(`sites/snapshot.json: the body under ${sha.slice(0, 12)} is not the one recorded; take the snapshot again`);
      process.exit(2);
    }
  }
  let current = null;
  const missed = {};
  const api = async (url) => {
    if (snap.requests[url]) return answer(snap.requests[url], snap.bodies);
    (missed[current] = missed[current] || []).push(url);
    return undefined;
  };
  for (const [c, ...r] of await viaRoute(LIVE.filter(take), { api }, (c) => { current = c.file; })) {
    if (missed[c.file]) {
      console.error(`${c.file}: not recorded. The route asked for ${missed[c.file].join(', ')}, which the snapshot (taken ${snap.takenAt}, engine ${snap.engineVersion}) does not hold; run --snapshot.`);
      process.exitCode = 1;
      continue;
    }
    save(c.file, ...r);
  }
}

const MODES = { '--snapshot': snapshot, '--live': live, '--pinned': pinned, '--local': local };
const run = Object.keys(MODES).filter((m) => args.includes(m));
if (!run.length) {
  console.error('usage: record.mjs --local | --pinned | --live | --snapshot [--only name,name] [--out dir]');
  process.exit(2);
}
for (const m of run) await MODES[m]();
