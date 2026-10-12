#!/usr/bin/env node
/**
 * Type scale gate: text sizes stay on the brand's type scale.
 *
 * WHY THIS EXISTS (brand ledger D59, amended by D68, 2026-10-11)
 * The live home page rendered 45 distinct text sizes and set 394 of its 794
 * text nodes under 12px, and /score, /work and /compare were the same. No
 * floor existed and every component picked its own size, so the sizes
 * multiplied and the small ones kept getting smaller. D59 set a floor and a
 * scale. D68 named the scale: a Major Third (x1.25) on a 16px root.
 *
 *   0.8rem    12.8px   label: labels, meta, captions, mono uppercase. The floor.
 *   1rem      16px     body: reading and UI text. The reading floor.
 *   1.25rem   20px     lead
 *   1.563rem  25px     h3
 *   1.953rem  31.25px  h2
 *   2.441rem  39px     h1, the in-content floor
 *
 * The names (--text-label, --text-body, --text-lead, --text-h3, --text-h2,
 * --text-h1) arrive in :root and in the contract at the next contract version.
 * Until then the sizes are rem literals with exactly these values, so the swap
 * to tokens is mechanical.
 *
 * WHAT IT ASSERTS
 * In every stylesheet in COVERED (the sheets the D56-D59 brand PR moved onto
 * the scale), every font-size and every size inside a font shorthand is:
 *   - with ENFORCE_LADDER (D68): one of the six steps;
 *   - without it (the D59 floor alone, the owner's "labels only" fallback): a
 *     rem size of 0.8rem or more, or max(0.8rem, <n>em);
 * or, either way, a clamp() (display titles keep their fluid sizes), a var(),
 * or `inherit`. Two kinds of rule are exempt, each listed below with its
 * reason: display numerals, a type specimen whose sizes are its content, and
 * home-page rules that the home rebuild (D60) owns. Sheets outside COVERED are legacy until they are moved, so the gate
 * does not fail on pages nobody has touched yet.
 *
 * A gate that cannot fail proves nothing: every run first feeds the parser
 * known-good and known-bad CSS and fails if it misjudges either.
 *
 * Usage: node scripts/check-type-scale.js        (exit 1 on any failure)
 */

const fs = require('node:fs');
const path = require('node:path');

const SITE = path.join(__dirname, '..');

/** The six steps of the scale, in rem. */
const LADDER = ['0.8rem', '1rem', '1.25rem', '1.563rem', '1.953rem', '2.441rem'];

/** On: sizes must be one of the six steps (D68). Off: the floor alone (D59). */
const ENFORCE_LADDER = true;

/** The sheets on the scale. Add a sheet here once its sizes are moved. */
const COVERED = [
  'app/badge/badge.css',
  'app/changelog/changelog.css',
  'app/continuity/continuity.css',
  'app/contracts/contracts.css',
  'app/contracts/design-system/design-system.css',
  'app/data.css',
  'app/docs/docs.css',
  'app/engine.css',
  'app/globals.css',
  'app/graph/graph.css',
  'app/kits/kits.css',
  'app/labs/acoustics/acoustics.css',
  'app/labs/adopted-tally.css',
  'app/labs/cadence/cadence.css',
  'app/labs/labs.css',
  'app/labs/poise/orb/orb.css',
  'app/labs/poise/poise.css',
  'app/labs/takt/takt.css',
  'app/learn/design-verification-vs-linting-vs-visual-regression/compare.css',
  'app/lib/engine/command-bar.css',
  'app/lib/preference-switch.css',
  'app/lib/review-prompt.css',
  'app/pricing/pricing.css',
  'app/pricing/review/review.css',
  'app/spring-validator/spring-validator.css',
  'app/work/work.css',
];

/** Display numerals: a readout set as one large figure, not running text.
    They keep their size, as display titles keep their clamps (D68). */
const DISPLAY = new Map([
  ['.eg-grade', 'the engine verdict letter'],
  ['.rs-readout', 'the score readout (results Tier 2, D48)'],
  ['.cs-glyph', 'the case study grade glyph'],
  ['.cs-big', 'the case study headline figure'],
]);

/** Specimens: text whose size is the content. The Cadence lab's rem-scale
    demo prints "0.75rem", "1rem", "1.5rem" and "2rem" beside four samples
    set at exactly those sizes, so its sizes stay as printed. */
const SPECIMEN = new Map([
  ['.demo-scale-spec', 'the Cadence lab rem-scale specimen (/labs/cadence)'],
]);

/** Home-page rules in globals.css. The home rebuild (brand ledger D60) moves
    them; this PR leaves them alone so the two do not collide. */
const HOME = new Map([
  ['.state-marquee-header', 'home System status header (D60)'],
  ['.state-marquee-pill', 'home System status pills (D60)'],
  ['.field-card-status', 'home card status (D60)'],
  ['.section-heading-badge-label', 'home section badge (D60)'],
  ['.section-heading-badge-unit', 'home section badge (D60)'],
]);

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

/** Leaf rules as { selector, body, line }. At-rule blocks are descended. */
function rules(css) {
  const clean = strip(css);
  const out = [];
  let pos = 0;
  const depth = [];
  while (pos < clean.length) {
    const o = clean.indexOf('{', pos);
    const c = clean.indexOf('}', pos);
    if (o === -1 && c === -1) break;
    if (o !== -1 && (c === -1 || o < c)) {
      const head = clean.slice(pos, o).trim();
      const nextO = clean.indexOf('{', o + 1);
      const nextC = clean.indexOf('}', o + 1);
      const container = (head.startsWith('@') && !/^@(font-face|page)\b/.test(head)) || (nextO !== -1 && nextO < nextC);
      if (container) {
        depth.push(head);
        pos = o + 1;
        continue;
      }
      out.push({ selector: head.replace(/\s+/g, ' '), body: clean.slice(o + 1, nextC), line: clean.slice(0, o).split('\n').length });
      pos = nextC + 1;
    } else {
      depth.pop();
      pos = c + 1;
    }
  }
  return out;
}

const SIZE_IN_FONT = /(?:^|\s)((?:clamp|min|max|calc)\((?:[^()]|\([^()]*\))*\)|[\d.]+(?:rem|px|em|%)|var\([^)]+\))(?:\s*\/\s*\S+)?\s+\S/;

/** Every size a rule body declares. */
function sizes(body) {
  const found = [];
  for (const m of body.matchAll(/(?<![-\w])font-size\s*:\s*([^;]+)/g)) found.push(m[1].replace(/!important/, '').trim());
  for (const m of body.matchAll(/(?<![-\w])font\s*:\s*([^;]+)/g)) {
    const v = m[1].trim();
    if (/^(var\(|inherit|initial|unset)/.test(v)) continue;
    const s = (' ' + v).match(SIZE_IN_FONT);
    if (s) found.push(s[1]);
  }
  return found;
}

function onScale(v) {
  if (/^(clamp|var)\(/.test(v) || v === 'inherit') return true;
  if (ENFORCE_LADDER) return LADDER.includes(v);
  const rem = v.match(/^([\d.]+)rem$/);
  if (rem) return parseFloat(rem[1]) >= 0.8;
  return /^max\(0\.8rem, [\d.]+em\)$/.test(v);
}

function exempt(selector) {
  const first = selector.split(',')[0].trim();
  for (const [s, why] of DISPLAY) if (first === s || first.startsWith(s + ' ') || first.startsWith(s + '[')) return why;
  for (const [s, why] of SPECIMEN) if (first === s || first.startsWith(s + '.') || first.startsWith(s + ' ')) return why;
  for (const [s, why] of HOME) if (selector.split(',').every((x) => x.trim().startsWith(s))) return why;
  return null;
}

function check(file, css) {
  const bad = [];
  for (const r of rules(css)) {
    if (exempt(r.selector)) continue;
    for (const v of sizes(r.body)) if (!onScale(v)) bad.push(`${file}:${r.line} ${r.selector.slice(0, 80)}  font size ${v} is off the scale`);
  }
  return bad;
}

// The gate must be able to fail: misjudging any canary fails the run.
// Each canary: [css, failures with the ladder on, failures with the floor alone].
const CANARIES = [
  ['.a { font-size: 0.75rem; }', 1, 1],
  ['.a { font: 600 0.875rem/1.4 var(--sans); }', 1, 0],
  ['@media (min-width: 40rem) { .a { font-size: 11px; } }', 1, 1],
  ['.a { font-size: 0.8rem; } .b { font: 500 1rem/1.5 var(--mono); }', 0, 0],
  ['.a { font-size: clamp(2rem, 1.45rem + 2.9vw, 4.25rem); } .b { font: inherit; }', 0, 0],
  ['/* .a { font-size: 9px; } */ .b { font-size: 1.25rem; }', 0, 0],
  ['.a code { font-size: max(0.8rem, 0.88em); }', 1, 0],
  ['.eg-grade { font-size: 3.6rem; }', 0, 0],
];
const misjudged = CANARIES.filter(([css, ladder, floor]) => check('canary', css).length !== (ENFORCE_LADDER ? ladder : floor));
if (misjudged.length) {
  console.error('[check-type-scale] the parser misjudged its canaries:');
  for (const [css, ladder, floor] of misjudged) console.error(`  expected ${ENFORCE_LADDER ? ladder : floor} failure(s): ${css}`);
  process.exit(1);
}

const failures = [];
let declarations = 0;
for (const file of COVERED) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) {
    failures.push(`${file}: listed in COVERED but missing`);
    continue;
  }
  const css = fs.readFileSync(p, 'utf8');
  for (const r of rules(css)) declarations += sizes(r.body).length;
  failures.push(...check(file, css));
}

if (failures.length) {
  const rule = ENFORCE_LADDER ? `the D68 scale (${LADDER.join(', ')})` : 'the D59 floor (0.8rem, rem only)';
  console.error(`[check-type-scale] ${failures.length} size(s) off ${rule}, and not a clamp/var/inherit:`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`[check-type-scale] OK: ${declarations} sizes in ${COVERED.length} sheets ${ENFORCE_LADDER ? 'on the D68 scale' : 'at or above the D59 floor'} (${DISPLAY.size} display numerals, ${SPECIMEN.size} specimen and ${HOME.size} home rules exempt, each with its reason).`);
