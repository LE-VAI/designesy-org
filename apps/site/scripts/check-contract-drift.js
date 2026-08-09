#!/usr/bin/env node
/**
 * Contract-drift guard — fails the build when the design-system contract
 * (app/lib/design-system-contract.ts) drifts from the live CSS token surface
 * (app/globals.css :root).
 *
 * Why this exists (2026-08-09): the audit found 13 real tokens defined in
 * :root but absent from the contract — radius-lg/xl, hover/press/focus state
 * roles, ok/warn/error status colors, surface/signal gradients, maxw-wide,
 * and the font stacks. Nothing caught it because nothing compared the two
 * surfaces. Every new public UI change must cite a contract token
 * (drift rule), and this check enforces that at build time.
 *
 * Rule: every custom property declared in :root MUST appear as a
 * `token: '--x'` entry somewhere in the contract file. The converse is NOT
 * enforced — the contract legitimately documents tokens that only exist in
 * component scope or in machine exports (e.g. --cue:* acoustic tokens are
 * engine-level, not :root CSS).
 *
 * Exit 0 on pass, 1 on drift. Wired into the build script so a drift fails
 * the Vercel deploy instead of silently shipping.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..'); // apps/site
const CONTRACT_PATH = path.join(ROOT, 'app', 'lib', 'design-system-contract.ts');
const CSS_PATH = path.join(ROOT, 'app', 'globals.css');

const contractSrc = fs.readFileSync(CONTRACT_PATH, 'utf8');
const cssSrc = fs.readFileSync(CSS_PATH, 'utf8');

// Custom properties declared in :root (the canonical token surface).
// Matches `--name:` inside the first :root { } block.
const rootMatch = cssSrc.match(/:root\s*\{([^}]+)\}/);
if (!rootMatch) {
  console.error('[check-contract-drift] no :root block found in globals.css');
  process.exit(1);
}
const rootProps = new Set(
  [...rootMatch[1].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1])
);

// Token names declared in the contract: `token: '--x'`.
const contractTokens = new Set(
  [...contractSrc.matchAll(/token:\s*'([^']+)'/g)].map((m) => m[1])
);

const missing = [...rootProps].filter((p) => !contractTokens.has(p)).sort();

if (missing.length > 0) {
  console.error(
    `[check-contract-drift] FAIL — ${missing.length} CSS :root token(s) missing from design-system-contract.ts:`
  );
  for (const p of missing) console.error(`  ${p}`);
  console.error(
    'Add each token to the contract (token/value/role) — every public UI change must cite a contract token.'
  );
  process.exit(1);
}

console.log(
  `[check-contract-drift] OK — all ${rootProps.size} :root tokens are declared in the contract (${contractTokens.size} contract tokens total).`
);
