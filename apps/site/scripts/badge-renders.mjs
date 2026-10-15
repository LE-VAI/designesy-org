#!/usr/bin/env node
/**
 * badge renders: the badge images match the renderer, and the renderer still
 * draws the set the brand review approved.
 *
 * WHAT IT COVERS
 *   1. public/badge.svg and public/badge-light.svg, the static images, drawn by
 *      renderStaticBadge in app/lib/badge/live-badge.ts with the live badge's
 *      outlined label and mark. Their filenames and their 156 x 32 box never
 *      change: pages embed them with width="156" height="32".
 *   2. scripts/fixtures/live-badge/spec-<state>-<ground>.svg, the live badge
 *      (/api/badge?url=) drawn for fixed states: grades A to F from the
 *      leaderboard's 2026-10-11 rows, a host long enough to truncate, and the
 *      two "Not scored" states, each on the dark and the light ground. These
 *      are the bytes the brand review approved (round 2, ledger D61), so a
 *      change to the badge's type, layout or colour fails here until the new
 *      set is written on purpose and reviewed.
 *
 * The renderer is TypeScript with extensionless imports, so this script
 * transpiles the four modules it needs into a temporary folder (the
 * typescript package the site already depends on) and imports them there.
 *
 * Usage:  node scripts/badge-renders.mjs           write every file
 *         node scripts/badge-renders.mjs --check   exit 1 if any file differs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(APP, 'package.json'));
const ts = require('typescript');

const MODULES = {
  glyphs: 'app/lib/badge/glyphs.ts',
  mark: 'app/lib/badge/mark.ts',
  'live-badge': 'app/lib/badge/live-badge.ts',
  verdict: 'app/score/verdict.ts',
};
const IMPORTS = [
  [/from '\.\/glyphs'/g, "from './glyphs.mjs'"],
  [/from '\.\/mark'/g, "from './mark.mjs'"],
  [/from '\.\.\/\.\.\/score\/verdict'/g, "from './verdict.mjs'"],
];

// The live badge's fixed states (the leaderboard's 2026-10-11 rows).
const STATES = [
  ['A', { kind: 'scored', grade: 'A', score: 90.4, date: '2026-10-11', host: 'primer.style' }],
  ['B', { kind: 'scored', grade: 'B', score: 84.6, date: '2026-10-11', host: 'vercel.com' }],
  ['C', { kind: 'scored', grade: 'C', score: 70, date: '2026-10-11', host: 'linear.app' }],
  ['D', { kind: 'scored', grade: 'D', score: 67.9, date: '2026-10-11', host: 'stripe.com' }],
  ['F', { kind: 'scored', grade: 'F', score: 56.8, date: '2026-10-11', host: 'plex.ibm.com' }],
  ['long', { kind: 'scored', grade: 'B', score: 81.2, date: '2026-10-11', host: 'www.a-very-long-subdomain.example-company.com' }],
  ['notscored-host', { kind: 'not-scored', host: 'example.com' }],
  ['notscored', { kind: 'not-scored', host: null }],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'designesy-badge-'));
try {
  for (const [name, rel] of Object.entries(MODULES)) {
    let js = ts.transpileModule(fs.readFileSync(path.join(APP, rel), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const [from, to] of IMPORTS) js = js.replace(from, to);
    fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
  }
  const { renderLiveBadge, renderStaticBadge } = await import(pathToFileURL(path.join(tmp, 'live-badge.mjs')).href);

  const files = {
    'public/badge.svg': renderStaticBadge('dark'),
    'public/badge-light.svg': renderStaticBadge('light'),
  };
  for (const ground of ['dark', 'light']) {
    for (const [name, state] of STATES) files[`scripts/fixtures/live-badge/spec-${name}-${ground}.svg`] = renderLiveBadge(state, ground);
  }

  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [rel, svg] of Object.entries(files)) {
    const file = path.join(APP, rel);
    if (check) {
      const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
      if (now !== svg) {
        stale++;
        console.log(`  DIFFERS ${rel}`);
      }
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, svg);
    }
  }
  const n = Object.keys(files).length;
  if (check) {
    console.log(
      stale
        ? `[badge-renders] ${stale} of ${n} file(s) differ from the renderer. If the change is meant, run npm run badge-renders and include the new renders in the PR.`
        : `[badge-renders] OK - ${n} files match the renderer (2 static images, ${n - 2} live badge states)`,
    );
  } else {
    console.log(`[badge-renders] wrote ${n} files`);
  }
  process.exitCode = stale ? 1 : 0;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
