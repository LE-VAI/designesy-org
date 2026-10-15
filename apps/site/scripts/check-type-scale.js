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
 * The six steps are tokens, --text-label, --text-body, --text-lead,
 * --text-h3, --text-h2 and --text-h1, declared once on :root in globals.css
 * and named in the design-system contract (typography.scale, v0.4.5).
 *
 * WHAT IT ASSERTS
 * 1. globals.css :root declares the six tokens with exactly the values above,
 *    and each step is 1.25 times the one below (1.25^n rem, rounded to three
 *    decimals), so no two adjacent steps are closer than the Major Third.
 * 2. In every stylesheet in COVERED (the sheets on the scale), every font-size
 *    and every size inside a font shorthand is:
 *   - with ENFORCE_LADDER (D68): one of the six tokens, var(--text-*). A rem
 *     literal with a step's value fails too: the token is the scale, so a
 *     literal is a copy that would not move with it. A var() of a local
 *     custom property passes only when every value that property is given in
 *     the covered sheets passes (a size hidden behind a local property is
 *     still a size), and a var() fallback must pass as well;
 *   - without it (the D59 floor alone, the owner's "labels only" fallback): a
 *     rem size of 0.8rem or more, max(0.8rem, <n>em), or a token;
 * or, either way, a clamp() (display titles keep their fluid sizes) or
 * `inherit`. Three kinds of rule are exempt, each listed below with its
 * reason: display numerals, a type specimen whose sizes are its content, and
 * home-page rules that the home rebuild (D60) owns. Sheets outside COVERED are
 * legacy until they are moved, so the gate does not fail on pages nobody has
 * touched yet.
 *
 * A gate that cannot fail proves nothing: every run first feeds the parser
 * known-good and known-bad CSS and fails if it misjudges either.
 *
 * Usage: node scripts/check-type-scale.js        (exit 1 on any failure)
 */

const fs = require('node:fs');
const path = require('node:path');

const SITE = path.join(__dirname, '..');

/** The six steps of the scale: token and value (rem). */
const LADDER = [
  ['--text-label', '0.8rem'],
  ['--text-body', '1rem'],
  ['--text-lead', '1.25rem'],
  ['--text-h3', '1.563rem'],
  ['--text-h2', '1.953rem'],
  ['--text-h1', '2.441rem'],
];
const TOKENS = new Set(LADDER.map(([t]) => t));

/** On: sizes must be one of the six steps (D68). Off: the floor alone (D59). */
const ENFORCE_LADDER = true;

/** The sheets on the scale. Add a sheet here once its sizes are moved. */
const COVERED = [
  'app/badge/badge.css',
  'app/brand/brand.css',
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
  'app/score/contract/contract.css',
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

/** Home-page rules in globals.css that the home rebuild (brand ledger D60,
    #290) kept: they style only the home page's "This site, by category" badge,
    and home.css (D60's sheet) sets its size at the label step. They move with
    the home page's next change, not this gate's. */
const HOME = new Map([
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

/** Values each local custom property is given in the sheets being checked. */
let LOCAL = new Map();
function locals(cssList) {
  const map = new Map();
  for (const css of cssList) {
    for (const r of rules(css)) {
      for (const m of r.body.matchAll(/(?<![-\w])(--[\w-]+)\s*:\s*([^;]+)/g)) {
        if (!map.has(m[1])) map.set(m[1], []);
        map.get(m[1]).push(m[2].trim());
      }
    }
  }
  return map;
}

function onScale(v, depth = 0) {
  if (/^clamp\(/.test(v) || v === 'inherit') return true;
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (ref) {
    const [, name, fallback] = ref;
    if (fallback !== undefined && !onScale(fallback.trim(), depth + 1)) return false;
    if (TOKENS.has(name)) return true;
    const given = LOCAL.get(name);
    if (!given || !given.length || depth > 3) return false;
    return given.every((g) => onScale(g, depth + 1));
  }
  if (ENFORCE_LADDER) return false;
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
  ['.a { font-size: var(--text-label); } .b { font: 500 var(--text-body)/1.5 var(--mono); }', 0, 0],
  ['.a { font-size: 0.8rem; } .b { font: 500 1rem/1.5 var(--mono); }', 2, 0],
  ['.a { font-size: clamp(2rem, 1.45rem + 2.9vw, 4.25rem); } .b { font: inherit; }', 0, 0],
  ['/* .a { font-size: 9px; } */ .b { font-size: var(--text-lead); }', 0, 0],
  ['.a code { font-size: max(0.8rem, 0.88em); }', 1, 0],
  ['.eg-grade { font-size: 3.6rem; }', 0, 0],
  ['.a { --a-size: 0.98rem; font-size: var(--a-size); }', 1, 0],
  ['.a { --a-size: var(--text-body); font-size: var(--a-size, var(--text-body)); }', 0, 0],
  ['.a { --a-size: var(--text-body); font-size: var(--a-size, 0.98rem); }', 1, 0],
  ['.a { font-size: var(--undeclared-size); }', 1, 1],
];
const misjudged = CANARIES.filter(([css, ladder, floor]) => {
  LOCAL = locals([css]);
  return check('canary', css).length !== (ENFORCE_LADDER ? ladder : floor);
});
if (misjudged.length) {
  console.error('[check-type-scale] the parser misjudged its canaries:');
  for (const [css, ladder, floor] of misjudged) console.error(`  expected ${ENFORCE_LADDER ? ladder : floor} failure(s): ${css}`);
  process.exit(1);
}

const failures = [];

// 1. The tokens: on :root in globals.css, at exactly the ladder's values, and
// each step 1.25 times the last (1.25^n rem to three decimals).
{
  const css = fs.readFileSync(path.join(SITE, 'app/globals.css'), 'utf8');
  const declared = new Map();
  for (const r of rules(css)) {
    if (r.selector !== ':root') continue;
    for (const m of r.body.matchAll(/(--text-[\w-]+)\s*:\s*([^;]+)/g)) declared.set(m[1], m[2].trim());
  }
  LADDER.forEach(([token, value], i) => {
    if (declared.get(token) !== value) failures.push(`app/globals.css :root ${token} is ${declared.get(token) ?? 'missing'}, expected ${value} (D68)`);
    const nominal = Math.round(Math.pow(1.25, i - 1) * 1000) / 1000;
    if (Math.abs(parseFloat(value) - nominal) > 1e-9) failures.push(`${token} ${value} is not 1.25^${i - 1} rem (${nominal}rem): the steps must stay a Major Third apart`);
  });
}

// 2. The sizes in every covered sheet.
const sheets = [];
for (const file of COVERED) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) {
    failures.push(`${file}: listed in COVERED but missing`);
    continue;
  }
  sheets.push([file, fs.readFileSync(p, 'utf8')]);
}
LOCAL = locals(sheets.map(([, css]) => css));
let declarations = 0;
for (const [file, css] of sheets) {
  for (const r of rules(css)) declarations += sizes(r.body).length;
  failures.push(...check(file, css));
}

if (failures.length) {
  const rule = ENFORCE_LADDER ? `the D68 scale (${LADDER.map(([t, v]) => `var(${t}) ${v}`).join(', ')})` : 'the D59 floor (0.8rem, rem only)';
  console.error(`[check-type-scale] ${failures.length} failure(s) against ${rule}; a size must be a token, a clamp() or inherit:`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`[check-type-scale] OK: the six --text-* tokens on :root, a Major Third apart; ${declarations} sizes in ${COVERED.length} sheets ${ENFORCE_LADDER ? 'on the D68 scale tokens' : 'at or above the D59 floor'} (${DISPLAY.size} display numerals, ${SPECIMEN.size} specimen and ${HOME.size} home rules exempt, each with its reason).`);
