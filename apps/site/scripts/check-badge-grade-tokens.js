#!/usr/bin/env node
/**
 * badge grade tokens: the embeddable score badge paints each grade with its
 * own grade token, and the letter stays readable on it.
 *
 * WHY THIS EXISTS
 * The badge at /score/badge is an SVG string, so it cannot read a CSS custom
 * property: its colours are literals in app/score/badge/route.ts. When
 * identity v1 moved the tokens, the badge kept filling grades A and B with
 * the retired brand blue #3358e8 and C, D and F with hues that were never
 * grade tokens (brand ledger D37). A token swap cannot see a literal, so this
 * gate ties the literals back to the tokens.
 *
 * WHAT IT ASSERTS
 *   1. GRADE_FILL in the badge route has exactly the grades A, B, C, D, F.
 *   2. Each fill equals that grade's --grade-* base in the light block of
 *      app/globals.css. The badge sits on other people's pages and does not
 *      follow their theme, and the light bases are the set built to hold 3:1
 *      against white.
 *   3. Each letter colour is white or ink (#010102) and is at least 4.5:1 on
 *      its fill (WCAG 2.x).
 *   4. Each fill is at least 3:1 against a white (#ffffff) and a near-black
 *      (#010102) host page.
 *
 * Usage:  node scripts/check-badge-grade-tokens.js [--json]
 * Exits 1 on any finding.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const ROUTE = path.join(APP, 'app', 'score', 'badge', 'route.ts');
const CSS = path.join(APP, 'app', 'globals.css');
const GRADES = ['A', 'B', 'C', 'D', 'F'];
const LETTER_COLOURS = ['#ffffff', '#010102'];
const HOSTS = ['#ffffff', '#010102'];
const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;

function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The body of the first rule whose selector is exactly `selector`. */
function block(css, selector) {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return null;
}

function lightGradeTokens(css) {
  const body = block(css, '[data-theme="light"]');
  if (!body) throw new Error('globals.css: no [data-theme="light"] block');
  const out = {};
  for (const g of GRADES) {
    const m = body.match(new RegExp(`--grade-${g.toLowerCase()}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
    if (!m) throw new Error(`globals.css: light block declares no hex --grade-${g.toLowerCase()}`);
    out[g] = m[1].toLowerCase();
  }
  return out;
}

function badgeFills(src) {
  const m = src.match(/const GRADE_FILL[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('badge route: GRADE_FILL not found');
  const out = {};
  const re = /^\s*([A-Z]):\s*\{\s*fill:\s*'(#[0-9a-fA-F]{6})',\s*text:\s*'(#[0-9a-fA-F]{6})'\s*\},?\s*$/gm;
  let e;
  while ((e = re.exec(m[1]))) out[e[1]] = { fill: e[2].toLowerCase(), text: e[3].toLowerCase() };
  return out;
}

function selfTest() {
  // The ratio function against values every WCAG calculator agrees on.
  const cases = [
    ['#ffffff', '#000000', 21],
    ['#777777', '#ffffff', 4.48],
    ['#15803d', '#ffffff', 5.02],
  ];
  return cases.every(([a, b, want]) => Math.abs(contrast(a, b) - want) < 0.01);
}

function main() {
  const asJson = process.argv.includes('--json');
  if (!selfTest()) {
    console.log('badge-grade-tokens: contrast self-test failed');
    process.exit(1);
  }
  const tokens = lightGradeTokens(fs.readFileSync(CSS, 'utf8'));
  const fills = badgeFills(fs.readFileSync(ROUTE, 'utf8'));
  const findings = [];
  const rows = [];

  const extra = Object.keys(fills).filter((g) => !GRADES.includes(g));
  if (extra.length) findings.push(`GRADE_FILL has grades outside A-F: ${extra.join(', ')}`);

  for (const g of GRADES) {
    const f = fills[g];
    if (!f) {
      findings.push(`grade ${g}: no { fill, text } entry in GRADE_FILL`);
      continue;
    }
    const row = {
      grade: g,
      fill: f.fill,
      token: tokens[g],
      text: f.text,
      textOnFill: +contrast(f.text, f.fill).toFixed(2),
      vsWhite: +contrast(f.fill, HOSTS[0]).toFixed(2),
      vsInk: +contrast(f.fill, HOSTS[1]).toFixed(2),
    };
    rows.push(row);
    if (f.fill !== tokens[g]) findings.push(`grade ${g}: fill ${f.fill} is not light --grade-${g.toLowerCase()} ${tokens[g]}`);
    if (!LETTER_COLOURS.includes(f.text)) findings.push(`grade ${g}: letter ${f.text} is neither white nor ink #010102`);
    if (row.textOnFill < TEXT_MIN) findings.push(`grade ${g}: letter ${f.text} on ${f.fill} is ${row.textOnFill}:1, under ${TEXT_MIN}:1`);
    if (row.vsWhite < GRAPHIC_MIN) findings.push(`grade ${g}: fill ${f.fill} on a white page is ${row.vsWhite}:1, under ${GRAPHIC_MIN}:1`);
    if (row.vsInk < GRAPHIC_MIN) findings.push(`grade ${g}: fill ${f.fill} on a near-black page is ${row.vsInk}:1, under ${GRAPHIC_MIN}:1`);
  }

  const ok = findings.length === 0;
  if (asJson) {
    console.log(JSON.stringify({ ok, rows, findings }, null, 2));
  } else {
    console.log(`badge-grade-tokens: ${rows.length} grades read, ${findings.length} findings`);
    console.log('  grade  fill     letter   letter/fill  fill/#ffffff  fill/#010102');
    for (const r of rows) {
      console.log(`  ${r.grade}      ${r.fill}  ${r.text}  ${r.textOnFill.toFixed(2).padEnd(11)}  ${r.vsWhite.toFixed(2).padEnd(12)}  ${r.vsInk.toFixed(2)}`);
    }
    for (const f of findings) console.log(`  FAIL ${f}`);
  }
  process.exit(ok ? 0 : 1);
}

main();
