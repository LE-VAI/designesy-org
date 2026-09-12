#!/usr/bin/env node
// Windows-only build runner.
//
// Node 24 on Windows regressed fs.readlink: for non-symlink targets it now
// raises EISDIR instead of EINVAL, and Webpack lets EISDIR escape, crashing
// `next build` on rotating metadata files (manifest.ts, robots.ts, sitemap.ts).
// The committed shim (node24-win-readlink-shim.cjs) translates EISDIR -> EINVAL
// for genuine non-symlinks. Preloading it here keeps the shared `build` script
// untouched for Vercel/CI (Linux, where readlink behaves correctly) while making
// local Windows builds work without the caller memorising NODE_OPTIONS.
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const siteRoot = path.resolve(__dirname, '..');
const shim = path.join(siteRoot, 'node24-win-readlink-shim.cjs');
const nextBin = path.join(siteRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

const steps = [
  ['next build', [nextBin, 'build']],
  ['check-contract-drift', [path.join(siteRoot, 'scripts', 'check-contract-drift.js')]],
  ['postbuild-pagefind', [path.join(siteRoot, 'scripts', 'postbuild-pagefind.js')]],
];

for (const [label, args] of steps) {
  const r = spawnSync(process.execPath, ['--require', shim, ...args], {
    cwd: siteRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.error) { console.error(`${label} failed:`, r.error.message); process.exit(1); }
  if (r.status !== 0) { console.error(`${label} exited ${r.status}`); process.exit(r.status ?? 1); }
}
