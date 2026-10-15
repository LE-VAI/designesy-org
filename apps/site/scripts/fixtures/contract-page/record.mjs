#!/usr/bin/env node
/**
 * Records the engine answers scripts/check-contract-page.js serves to
 * /score/contract. Every file here is a real POST /api/score response, never
 * a hand-written one, so the page is checked against what the engine says.
 *
 * Two sources, both the real engine:
 *   --live    the deployed engine (https://www.designesy.org/api/score),
 *             scoring designesy.org against contracts written for it
 *             (contracts/designesy-*.md). Nothing else is scored live.
 *   --local   this checkout's route (app/api/score/route.ts) loaded with
 *             scripts/lib/route-harness.js, reading the local fixture pages
 *             in sites/ (studio, an empty app shell, a page with no CSS) and,
 *             for a linked contract, a contract served from the same table.
 *             Nothing leaves the machine.
 *
 * Usage (from apps/site):
 *   node scripts/fixtures/contract-page/record.mjs --local
 *   node scripts/fixtures/contract-page/record.mjs --live
 *   ... --only landed-pass,landed-drift
 *
 * Each file is { status, retryAfter, body }. retrieved_at and the digests
 * move with the run; the page reads them from the file, so a re-record
 * changes the file and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf('--only');
  return i >= 0 && args[i + 1] ? args[i + 1].split(',') : null;
})();
const read = (p) => fs.readFileSync(path.join(HERE, p), 'utf8').replace(/\r\n?/g, '\n');

const LIVE = [
  // A contract written from designesy.org's own shipped values: every check it can score passes.
  { file: 'landed-pass.json', url: 'designesy.org', contract: { content: read('contracts/designesy-pass.md') } },
  // The same values, plus named tokens remembered wrong: a drifted label colour fails f01 and the primary pair (f10, capped at 70).
  { file: 'landed-drift.json', url: 'designesy.org', contract: { content: read('contracts/designesy-drift.md') } },
  // The primary pair as the site ships it (Azure label on Azure): one failing check, which caps fidelity at 70.
  { file: 'landed-capped.json', url: 'designesy.org', contract: { content: read('contracts/designesy-pair.md') } },
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
  fs.writeFileSync(path.join(HERE, file), `${JSON.stringify({ status, retryAfter, body }, null, 1)}\n`);
  const f = body.fidelity;
  const b = body.baseline;
  console.log(`${file}: ${status}${f ? ` fidelity ${f.score} ${f.grade ?? ''} (${f.scored} scored) baseline ${b.score} ${b.grade ?? ''}` : ` ${body.code} ${(body.problems || []).map((p) => p.code).join(',')}`}`);
}

async function live() {
  for (const c of LIVE) {
    if (only && !only.includes(c.file.replace(/\.json$/, ''))) continue;
    const r = await fetch('https://www.designesy.org/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: c.url, contract: { ...c.contract, format: 'auto' } }),
    });
    const ra = r.headers.get('retry-after');
    save(c.file, r.status, ra ? Number(ra) : null, await r.json());
  }
}

async function local() {
  const { createHarness } = require('../../lib/route-harness.js');
  const { lint } = await import('@google/design.md/linter');
  const harness = createHarness({ app: APP, pages: LOCAL_PAGES, stubs: { '@google/design.md/linter': { lint } } });
  const route = harness.load('app/api/score/route.ts');
  for (const c of LOCAL) {
    if (only && !only.includes(c.file.replace(/\.json$/, ''))) continue;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('not found', { status: 404 });
    try {
      const res = await route.POST(new Request('https://harness.test/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ url: c.url, contract: { ...c.contract, format: 'auto' } }),
      }));
      const ra = res.headers.get('retry-after');
      save(c.file, res.status, ra ? Number(ra) : null, JSON.parse(await res.text()));
    } finally {
      globalThis.fetch = realFetch;
    }
  }
}

if (args.includes('--live')) await live();
if (args.includes('--local')) await local();
if (!args.includes('--live') && !args.includes('--local')) {
  console.error('usage: record.mjs --local | --live [--only name,name]');
  process.exit(2);
}
