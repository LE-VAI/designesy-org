#!/usr/bin/env node
/**
 * Paused entrances gate: every animation that starts invisible declares how
 * it behaves when a visitor pauses motion.
 *
 * WHY THIS EXISTS
 * The "Pause animations" control (WCAG 2.2.2) holds every CSS animation on
 * its current frame, and layout.tsx restores the pause before first paint.
 * An entrance whose first frame is opacity 0 is therefore held invisible
 * from the first paint on. .fade-up wraps the header of every "surface" page,
 * so until 2026-10-08 a paused visitor got empty pages: 1,198 text elements
 * across 8 of 16 sampled routes. Nothing failed, because the CSS was valid
 * and with motion on the pages looked right.
 *
 * WHAT IT ASSERTS
 *   Every @keyframes under app/ whose first frame (from / 0%) sets opacity 0
 *   is listed in exactly one of the three groups below. A new one fails the
 *   build until its author decides:
 *     ENDED      jumps to its last frame under the pause (globals.css,
 *                "One-shot entrances end"), for content an entrance brings in
 *     REMOVED    gets animation: none under the pause in its own stylesheet
 *     DECORATIVE may stay held invisible: a glow, scan or shimmer that carries
 *                no content, or a loop that is already guarded
 *   The runtime gate, scripts/check-motion-pause.js, then checks the result
 *   on real routes in CI.
 *
 * Usage: node scripts/check-paused-entrances.js        (exit 1 on any failure)
 */

const fs = require('fs');
const path = require('path');

const ENDED = new Set([
  'fadeUp', 'scoreCardReveal', 'scoreDrawerOpen', 'auditPanelIn', 'auditStepIn',
  'verifyStepIn', 'check-fade', 'check-pop', 'constelNodeIn', 'demo-stagger-fade',
  'orb-mark-settle', 'eg-host-in', 'eg-host-fade', 'eg-state-in', 'ix-foot',
  'seamDockScatter',
]);
const REMOVED = new Set([
  'cmdk-in', 'cmdk-panel-in', 'senses-in', 'back-button-in', 'dock-in', 'director-dock-in',
]);
const DECORATIVE = new Set([
  'eg-verdict-glow', 'ix-light', 'ix-scan', 'ix-verdict-glow', 'lottie-shimmer-sweep',
  'sv-verdict-glow', 'cs-resolve', 'seamTriangleEcho',
  'seamDock', // defined in globals.css but used by no rule (2026-10-08)
]);

const SITE = path.join(__dirname, '..');
const APP = path.join(SITE, 'app');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

const found = new Map();
for (const file of walk(APP)) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1;
    let j = m.index + m[0].length;
    const start = j;
    while (depth && j < css.length) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const first = /(?:from|0%)\s*(?:,[^{]*)?\{([^}]*)\}/.exec(css.slice(start, j - 1));
    if (first && /(?:^|[;\s])opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/.test(first[1])) {
      found.set(m[1], path.relative(SITE, file).split(path.sep).join('/'));
    }
  }
}

const failures = [];
for (const [name, file] of found) {
  const groups = [ENDED, REMOVED, DECORATIVE].filter((g) => g.has(name)).length;
  if (groups === 0) failures.push(`@keyframes ${name} (${file}) starts at opacity 0 and is in no group: under the pause it would be held invisible`);
  if (groups > 1) failures.push(`@keyframes ${name} is in more than one group`);
}
const stale = [...ENDED, ...REMOVED, ...DECORATIVE].filter((n) => !found.has(n));

console.log(`  ${found.size} keyframes start at opacity 0: ${[...found.keys()].filter((n) => ENDED.has(n)).length} end, ${[...found.keys()].filter((n) => REMOVED.has(n)).length} are removed, ${[...found.keys()].filter((n) => DECORATIVE.has(n)).length} decorative`);
if (stale.length) console.log(`  note: listed but no longer found (safe to drop): ${stale.join(', ')}`);
if (failures.length) {
  console.error(`\nPaused entrances gate FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('Decide for each: add its selector to the "One-shot entrances end" rule in globals.css and list it in ENDED; give it animation: none under html[data-motion="paused"] and list it in REMOVED; or list it in DECORATIVE if it carries no content.');
  process.exit(1);
}
console.log('Paused entrances gate passed: every entrance that starts invisible declares how it pauses.');
