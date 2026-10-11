#!/usr/bin/env node
/**
 * badge grade tokens: the grade colours on the two score badges and on the
 * report's grade letter are grade tokens, never a brand colour, and the text
 * on or in them stays readable.
 *
 * WHY THIS EXISTS
 * The badge at /score/badge is an SVG string, so it cannot read a CSS custom
 * property: its colours are literals in app/score/badge/route.ts. When
 * identity v1 moved the tokens, the badge kept filling grades A and B with
 * the retired brand blue #3358e8 and C, D and F with hues that were never
 * grade tokens (brand ledger D37). A token swap cannot see a literal, so this
 * gate ties the literals back to the tokens.
 *
 * The same ruling covers two more surfaces that #260 left behind. The
 * shields endpoint at /api/badge passed shields' named colours (D was
 * 'orange', the brand's flame, D5), and shields paints white text on every
 * one of them at 1.95 to 4.38:1. The report page coloured grade B with
 * --signal-light, a brand blue.
 *
 * WHAT IT ASSERTS
 * The SVG badge (app/score/badge/route.ts):
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
 * The shields endpoint (app/api/badge/route.ts):
 *   5. GRADE_COLOR has exactly the grades A, B, C, D, F, each a bare six-digit
 *      hex, and no string in the route is a shields named colour.
 *   6. Each colour is that grade's light --grade-* base, unless shields' text
 *      on the base is under 4.5:1, in which case it is the grade's light
 *      --grade-*-ink. Shields picks the text itself and the endpoint cannot
 *      set it: white (#fff) when (299r + 587g + 114b) / 255000 is at most
 *      0.69, else #333 (badge-maker's colorsForBackground; every colour here
 *      was checked against a real img.shields.io render). That text is at
 *      least 4.5:1 on the colour.
 *   7. NEUTRAL_COLOR (unreachable, not scored, not listed) is the SVG badge's
 *      NEUTRAL_FILL, and shields' text on it is at least 4.5:1.
 *
 * The report page (app/score/report/score-report.tsx):
 *   8. No grade in GRADE_COLOR reads a brand token (--signal*, --action*,
 *      --activation*), a grade that reads a --grade-* token reads its own
 *      text token (--grade-<g>-ink: the grade letter is text), and B reads
 *      --grade-b-ink.
 *
 * Usage:  node scripts/check-badge-grade-tokens.js [--json]
 * Exits 1 on any finding.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const ROUTE = path.join(APP, 'app', 'score', 'badge', 'route.ts');
const SHIELDS_ROUTE = path.join(APP, 'app', 'api', 'badge', 'route.ts');
const REPORT = path.join(APP, 'app', 'score', 'report', 'score-report.tsx');
const CSS = path.join(APP, 'app', 'globals.css');
const GRADES = ['A', 'B', 'C', 'D', 'F'];
const LETTER_COLOURS = ['#ffffff', '#010102'];
const HOSTS = ['#ffffff', '#010102'];
const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;
// shields' named colours (badge-maker), with its semantic aliases.
const SHIELDS_NAMED = [
  'brightgreen', 'green', 'yellowgreen', 'yellow', 'orange', 'red', 'blue', 'grey', 'gray',
  'lightgrey', 'lightgray', 'blueviolet', 'success', 'important', 'critical', 'informational', 'inactive',
];
const BRAND_TOKEN = /^--(signal|action|activation)/;

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

/** The light block's hex --grade-<g><suffix> for each grade ('' bases, '-ink' text). */
function lightGradeTokens(css, suffix = '') {
  const body = block(css, '[data-theme="light"]');
  if (!body) throw new Error('globals.css: no [data-theme="light"] block');
  const out = {};
  for (const g of GRADES) {
    const name = `--grade-${g.toLowerCase()}${suffix}`;
    const m = body.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
    if (!m) throw new Error(`globals.css: light block declares no hex ${name}`);
    out[g] = m[1].toLowerCase();
  }
  return out;
}

/** The text colour shields paints on a background (badge-maker colorsForBackground). */
function shieldsText(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const brightness = +((r * 299 + g * 587 + b * 114) / 255000).toFixed(2);
  return brightness <= 0.69 ? '#ffffff' : '#333333';
}

/** `const NAME ... = { K: 'v', ... };` as { K: 'v' }, each value as written. */
function stringMap(src, name, file) {
  const m = src.match(new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`${file}: ${name} not found`);
  const out = {};
  const re = /^\s*([A-Z]):\s*'([^']*)',?/gm;
  let e;
  while ((e = re.exec(m[1]))) out[e[1]] = e[2];
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
  // shields' text rule against what img.shields.io rendered on 2026-10-11:
  // #c0c0c0 drew #333 text, #b0b0b0 (brightness 0.69, the threshold) and
  // #d8b800 (its 'yellow') drew white.
  const shields = [
    ['#c0c0c0', '#333333'],
    ['#b0b0b0', '#ffffff'],
    ['#d8b800', '#ffffff'],
  ];
  return (
    cases.every(([a, b, want]) => Math.abs(contrast(a, b) - want) < 0.01) &&
    shields.every(([bg, want]) => shieldsText(bg) === want)
  );
}

/** The shields endpoint: grade colours are grade tokens, and the text shields
 *  paints on them is readable. */
function checkShields(src, bases, inks, neutralFill, findings) {
  const rows = [];
  const literals = [...src.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]);
  const named = [...new Set(literals.filter((v) => SHIELDS_NAMED.includes(v.toLowerCase())))];
  if (named.length) findings.push(`shields endpoint: passes shields named colours ${named.map((n) => `'${n}'`).join(', ')}`);

  const colours = stringMap(src, 'GRADE_COLOR', 'api/badge route');
  const extra = Object.keys(colours).filter((g) => !GRADES.includes(g));
  if (extra.length) findings.push(`shields endpoint: GRADE_COLOR has grades outside A-F: ${extra.join(', ')}`);
  for (const g of GRADES) {
    const raw = colours[g];
    if (raw === undefined) {
      findings.push(`shields endpoint: grade ${g} has no entry in GRADE_COLOR`);
      continue;
    }
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
      findings.push(`shields endpoint: grade ${g} colour '${raw}' is not a bare six-digit hex`);
      rows.push({ grade: g, colour: raw, token: null, text: null, textOnColour: null });
      continue;
    }
    const colour = `#${raw.toLowerCase()}`;
    const baseText = shieldsText(bases[g]);
    const baseOk = contrast(baseText, bases[g]) >= TEXT_MIN;
    const want = baseOk ? bases[g] : inks[g];
    const wantName = `--grade-${g.toLowerCase()}${baseOk ? '' : '-ink'}`;
    const text = shieldsText(colour);
    const row = {
      grade: g,
      colour,
      token: colour === bases[g] ? `--grade-${g.toLowerCase()}` : colour === inks[g] ? `--grade-${g.toLowerCase()}-ink` : null,
      text,
      textOnColour: +contrast(text, colour).toFixed(2),
    };
    rows.push(row);
    if (colour !== want) {
      findings.push(
        `shields endpoint: grade ${g} colour ${colour} is not light ${wantName} ${want}` +
          (baseOk ? '' : ` (shields paints ${baseText} on the base ${bases[g]} at ${contrast(baseText, bases[g]).toFixed(2)}:1)`),
      );
    }
    if (row.textOnColour < TEXT_MIN) findings.push(`shields endpoint: grade ${g}: shields text ${text} on ${colour} is ${row.textOnColour}:1, under ${TEXT_MIN}:1`);
  }

  const neutral = src.match(/const NEUTRAL_COLOR\s*=\s*'([^']*)'/);
  if (!neutral) {
    findings.push('shields endpoint: NEUTRAL_COLOR not found');
  } else {
    const colour = `#${neutral[1].toLowerCase()}`;
    const text = shieldsText(colour);
    const ratio = +contrast(text, colour).toFixed(2);
    rows.push({ grade: '-', colour, token: 'NEUTRAL_FILL', text, textOnColour: ratio });
    if (colour !== neutralFill) findings.push(`shields endpoint: NEUTRAL_COLOR ${colour} is not the SVG badge's NEUTRAL_FILL ${neutralFill}`);
    if (ratio < TEXT_MIN) findings.push(`shields endpoint: shields text ${text} on NEUTRAL_COLOR ${colour} is ${ratio}:1, under ${TEXT_MIN}:1`);
  }
  return rows;
}

/** The report page: the grade letter is text in a grade token, never a brand colour. */
function checkReport(src, findings) {
  const colours = stringMap(src, 'GRADE_COLOR', 'score-report.tsx');
  const rows = [];
  for (const g of GRADES) {
    const value = colours[g];
    rows.push({ grade: g, value: value ?? null });
    if (value === undefined) {
      findings.push(`report: grade ${g} has no entry in GRADE_COLOR`);
      continue;
    }
    const tokens = [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    const brand = tokens.filter((t) => BRAND_TOKEN.test(t));
    if (brand.length) findings.push(`report: grade ${g} reads brand token ${brand.join(', ')} (a grade never takes a brand colour, D5)`);
    for (const t of tokens.filter((x) => x.startsWith('--grade-'))) {
      const own = `--grade-${g.toLowerCase()}-ink`;
      if (t !== own) findings.push(`report: grade ${g} reads ${t}; the grade letter is text, so a grade token here is ${own}`);
    }
  }
  if (colours.B !== undefined && colours.B.replace(/\s/g, '') !== 'var(--grade-b-ink)') {
    findings.push(`report: grade B is ${colours.B}, not var(--grade-b-ink)`);
  }
  return rows;
}

function main() {
  const asJson = process.argv.includes('--json');
  if (!selfTest()) {
    console.log('badge-grade-tokens: contrast self-test failed');
    process.exit(1);
  }
  const css = fs.readFileSync(CSS, 'utf8');
  const tokens = lightGradeTokens(css);
  const inks = lightGradeTokens(css, '-ink');
  const badgeSrc = fs.readFileSync(ROUTE, 'utf8');
  const fills = badgeFills(badgeSrc);
  const neutralFill = (badgeSrc.match(/const NEUTRAL_FILL\s*=\s*\{\s*fill:\s*'(#[0-9a-fA-F]{6})'/) || [])[1];
  if (!neutralFill) throw new Error('badge route: NEUTRAL_FILL not found');
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

  const shields = checkShields(fs.readFileSync(SHIELDS_ROUTE, 'utf8'), tokens, inks, neutralFill.toLowerCase(), findings);
  const report = checkReport(fs.readFileSync(REPORT, 'utf8'), findings);

  const ok = findings.length === 0;
  if (asJson) {
    console.log(JSON.stringify({ ok, rows, shields, report, findings }, null, 2));
  } else {
    console.log(`badge-grade-tokens: ${rows.length} SVG badge grades, ${shields.length} shields colours, ${report.length} report grades read, ${findings.length} findings`);
    console.log('  SVG badge (/score/badge)');
    console.log('  grade  fill     letter   letter/fill  fill/#ffffff  fill/#010102');
    for (const r of rows) {
      console.log(`  ${r.grade}      ${r.fill}  ${r.text}  ${r.textOnFill.toFixed(2).padEnd(11)}  ${r.vsWhite.toFixed(2).padEnd(12)}  ${r.vsInk.toFixed(2)}`);
    }
    console.log('  shields endpoint (/api/badge); text is the colour shields paints');
    console.log('  grade  colour        token           text     text/colour');
    for (const r of shields) {
      console.log(`  ${r.grade}      ${String(r.colour).padEnd(12)}  ${String(r.token ?? '-').padEnd(14)}  ${String(r.text ?? '-').padEnd(7)}  ${r.textOnColour == null ? '-' : r.textOnColour.toFixed(2)}`);
    }
    console.log('  report grade letter (/score/report)');
    for (const r of report) console.log(`  ${r.grade}      ${r.value}`);
    for (const f of findings) console.log(`  FAIL ${f}`);
  }
  process.exit(ok ? 0 : 1);
}

main();
