#!/usr/bin/env node
/**
 * engine-registry gate — the engine pages' instruments are drawn from
 * app/lib/engine/registry.ts, which adds presentation (a short label, a group,
 * and for readiness the path each probe looks at) to each engine's published
 * contract. This gate keeps that presentation layer honest against its sources.
 *
 * Clauses:
 *   1. Every check id in each engine contract (lib/*-contract.ts) has a label
 *      and a group in registry.ts, and registry.ts names no id the contract
 *      lacks. (registry.ts also throws at build time on a missing label; this
 *      states it as a gate and catches the reverse direction too.)
 *   2. Every readiness path drawn on the origin map is a path the readiness
 *      route actually probes (a string literal in app/api/readiness/route.ts),
 *      so the map cannot show a location the engine never visits.
 *
 * Usage:  node scripts/check-engine-registry.js
 * Exits 1 on any finding.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.resolve(__dirname, '..', 'app');
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');
const registry = read('lib/engine/registry.ts');
const problems = [];
let clauses = 0;

// The label and group maps are the 3rd and 4th arguments of each build() call.
function mapsFor(engine) {
  const start = registry.indexOf(`build(\n  '${engine}',`);
  if (start < 0) return null;
  const end = registry.indexOf('\n);', start);
  const body = registry.slice(start, end);
  const objects = [...body.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  const keysOf = (src) => new Set([...src.matchAll(/\b([a-z]{1,2}\d{2})\s*:/g)].map((m) => m[1]));
  return { labels: keysOf(objects[0] || ''), groups: keysOf(objects[1] || '') };
}

for (const engine of ['drift', 'readiness', 'guardrails', 'monitor', 'compare', 'report']) {
  const contract = read(`lib/${engine}-contract.ts`);
  const ids = [...contract.matchAll(/\{\s*id:\s*'([a-z]{1,2}\d{2})'/g)].map((m) => m[1]);
  const maps = mapsFor(engine);
  clauses++;
  if (!maps) {
    problems.push(`${engine}: no build('${engine}', ...) call in registry.ts`);
    continue;
  }
  for (const id of ids) {
    if (!maps.labels.has(id)) problems.push(`${engine}: contract check ${id} has no label in registry.ts`);
    if (!maps.groups.has(id)) problems.push(`${engine}: contract check ${id} has no group in registry.ts`);
  }
  for (const id of maps.labels) if (!ids.includes(id)) problems.push(`${engine}: registry.ts labels ${id}, which the contract does not define`);
}

// Readiness paths drawn on the origin map must be probed by the route.
const route = read('api/readiness/route.ts');
const readinessBlock = registry.slice(registry.indexOf("build(\n  'readiness',"), registry.indexOf("build(\n  'guardrails',"));
const paths = [...readinessBlock.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);
clauses++;
for (const p of paths) {
  if (p === '<head>') {
    if (!/og:|twitter:/.test(route)) problems.push("readiness: '<head>' is drawn, but the route reads no og:/twitter: tags");
    continue;
  }
  if (!route.includes(`'${p}'`)) problems.push(`readiness: the map draws ${p}, which app/api/readiness/route.ts never probes`);
}

if (problems.length) {
  console.error(`engine-registry: FAIL (${problems.length})`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`engine-registry: OK (${clauses} clauses: 6 contracts fully labelled, ${paths.length} readiness paths probed by the route)`);
