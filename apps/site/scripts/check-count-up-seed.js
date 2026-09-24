#!/usr/bin/env node
/**
 * count-up-seed gate — assert the SSR value survives hydration when the
 * counter is off-screen.
 *
 * WHY THIS EXISTS
 * `CountUp` renders the real value via SSR for SEO/no-JS, then reset it to 0
 * unconditionally in a layout effect so the count-up tween would start from
 * zero without flashing the final value first. That reset was correct only for
 * counters that are guaranteed to animate immediately. For a counter that is
 * OFF-SCREEN at mount, the reset still happened, and whether the number ever
 * came back depended entirely on an IntersectionObserver firing.
 *
 * Anything that reads the DOM without scrolling therefore saw the seed zero:
 *   - a screen reader, which reads document order, not visual scroll position,
 *     heard "0 of 0 sites scored / Self-score 0% / Lowest: 0% F" in the
 *     homepage hero proof block;
 *   - print and any automated capture at a scroll offset;
 *   - an element that never intersects at all.
 * Information had been gated behind motion, on a site whose own contract says
 * reduced-motion must never remove information.
 *
 * The failure was invisible to every existing check: the build passed, the
 * numbers were correct in both SSR HTML and the final DOM, types were sound,
 * and prose was clean. It only existed in the window between hydration and
 * observer-fire, which nothing was looking at.
 *
 * So this gate asserts the invariant directly, by READING THE COMPONENT SOURCE
 * rather than the built HTML — because the defect lives in a runtime ordering
 * the prerender cannot show. It is a structural assertion with a named reason
 * for each clause, in the same spirit as check-probe-backticks.js.
 *
 * Usage:  node scripts/check-count-up-seed.js [--json]
 * Exits 1 on any finding, so it can gate CI.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const SRC = path.join(APP, 'app', 'lib', 'count-up.tsx');

/** Strip comments so an assertion cannot be satisfied by prose ABOUT the rule. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CLAUSES = [
  {
    id: 'seed-reset-is-viewport-gated',
    // The layout effect must consult getBoundingClientRect before zeroing.
    // An unconditional setDisplay(0) inside useIsoLayoutEffect is the defect.
    //
    // The character class is DELIBERATELY bounded: `[^}]*` cannot cross a
    // closing brace, so the match can never walk out of the layout-effect block
    // and satisfy itself with the getBoundingClientRect that lives in the
    // useEffect below. An earlier version used `[\s\S]*?`, which span straight
    // across the block boundary and passed on the buggy code — a clause that
    // cannot fail is worse than no clause, because it advertises coverage it
    // does not have.
    test: (code) =>
      /useIsoLayoutEffect\(\(\)\s*=>\s*\{[^}]*getBoundingClientRect[^}]*setDisplay\(\s*0\s*\)[^}]*\}\s*,\s*\[/.test(code),
    why: 'The pre-paint reset to 0 must be gated on the counter being in the viewport at mount. Unconditional reset means an off-screen counter shows 0 to anything that does not scroll (screen reader, print, capture).',
    fix: 'Inside useIsoLayoutEffect, read el.getBoundingClientRect() and call setDisplay(0) only when the element is within the viewport.',
  },
  {
    id: 'no-unconditional-seed-reset',
    // The specific regression: a setDisplay(0) with no viewport test ahead of it.
    test: (code) => {
      const blocks = code.match(/useIsoLayoutEffect\([\s\S]*?\},\s*\[[^\]]*\]\s*\)/g) || [];
      return blocks.every((b) => !/setDisplay\(\s*0\s*\)/.test(b) || /getBoundingClientRect/.test(b));
    },
    why: 'A setDisplay(0) in a layout effect with no getBoundingClientRect guard is exactly the shipped defect: it zeroes an off-screen counter that may never be observed.',
    fix: 'Guard the reset with an in-view test, or drop the reset and seed from the real value.',
  },
  {
    id: 'reduced-motion-jumps-to-final',
    // Tier-1 reduced motion: remove the motion, KEEP the information.
    test: (code) => /prefers-reduced-motion:\s*reduce/.test(code) && /setDisplay\(value\)/.test(code),
    why: 'Tier-1 reduced-motion handling must set the FINAL value, not leave the seed. A counter that skips its tween and stays at 0 is the anti-pattern the motion contract forbids.',
    fix: 'On prefers-reduced-motion: reduce, call setDisplay(value) and return without animating.',
  },
  {
    id: 'observer-zeroes-before-tweening',
    // The companion risk to the viewport gate: an off-screen counter holds its
    // real value, so the tween must zero it at observer-fire or the first frame
    // drops real -> 0 and counts back up.
    test: (code) => {
      const idx = code.indexOf('new IntersectionObserver');
      if (idx === -1) return false;
      const body = code.slice(idx, idx + 900);
      return /setDisplay\(\s*0\s*\)/.test(body);
    },
    why: 'With the seed reset viewport-gated, a counter that was off-screen still holds its real value. If the tween starts without re-zeroing, the number visibly drops to 0 and counts back up.',
    fix: 'Call setDisplay(0) inside the IntersectionObserver callback, immediately before start().',
  },
];

function main() {
  const asJson = process.argv.includes('--json');

  if (!fs.existsSync(SRC)) {
    const msg = `count-up-seed: source not found at ${SRC}`;
    if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(msg);
    process.exit(1);
  }

  const code = stripComments(fs.readFileSync(SRC, 'utf8'));
  const findings = [];

  for (const clause of CLAUSES) {
    let pass = false;
    try {
      pass = Boolean(clause.test(code));
    } catch (err) {
      pass = false;
    }
    if (!pass) findings.push({ id: clause.id, why: clause.why, fix: clause.fix });
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: findings.length === 0, checked: SRC, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`count-up-seed: OK — ${CLAUSES.length} clause(s) hold against ${path.relative(APP, SRC)}`);
  } else {
    console.error(`count-up-seed: ${findings.length} finding(s) in ${path.relative(APP, SRC)}\n`);
    for (const f of findings) {
      console.error(`  [${f.id}]`);
      console.error(`    why: ${f.why}`);
      console.error(`    fix: ${f.fix}\n`);
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
