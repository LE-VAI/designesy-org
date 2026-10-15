#!/usr/bin/env node
/**
 * badge grade tokens: the grade colours on the two score badges and on the
 * report's grade letter are grade tokens, never a brand colour, and the text
 * on or in them stays readable.
 *
 * WHY THIS EXISTS
 * The live badge (/api/badge?url=, also served at /score/badge) is an SVG
 * string, so it cannot read a CSS custom property: its colours are literals in
 * app/lib/badge/live-badge.ts. When identity v1 moved the tokens, the badge of
 * the time kept filling grades A and B with the retired brand blue #3358e8
 * and C, D and F with hues that were never grade tokens. A
 * token swap cannot see a literal, so this gate ties the literals back to the
 * tokens.
 *
 * The same rule covers two more surfaces that #260 left behind. The
 * shields endpoint at /api/badge passed shields' named colours (D was
 * 'orange', the brand's flame), and shields paints white text on every
 * one of them at 1.95 to 4.38:1. The report page coloured grade B with
 * --signal-light, a brand blue.
 *
 * WHAT IT ASSERTS
 * The live badge (app/lib/badge/live-badge.ts). It carries its own ground, a
 * dark one and a light one, and each colour on a ground is that theme's token
 * (the letter sits on the badge's ground, so it takes that ground's -ink):
 *   1. GRADE_INK has exactly the grades A, B, C, D, F for each ground.
 *   2. Each dark letter is the :root --grade-<g>-ink and each light letter the
 *      [data-theme="light"] --grade-<g>-ink in app/globals.css (resolved
 *      through var()), the grade's text token.
 *   3. BADGE_GROUND's grounds are the dark --paper and the light --surface,
 *      and its ink and muted are each theme's --ink and --muted.
 *   4. Every text colour on a ground (ink, muted, each grade letter) is at
 *      least 4.5:1 on it (WCAG 2.x), and so is the label of each static image
 *      (public/badge.svg on the dark ground, badge-light.svg on the light).
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
 *   7. NEUTRAL_COLOR (unreachable, not scored, not listed) is a neutral grey
 *      (equal channels), and shields' text on it is at least 4.5:1.
 *
 * The report page (app/score/report/score-report.tsx):
 *   8. No grade in GRADE_COLOR reads a brand token (--signal*, --action*,
 *      --activation*), a grade that reads a --grade-* token reads its own
 *      text token (--grade-<g>-ink: the grade letter is text), and B reads
 *      --grade-b-ink. Since the B′ result, the report draws its grade with the
 *      shared readout (score/result-parts.tsx), whose letter takes its colour
 *      from the .rs-readout[data-grade] rules in app/globals.css: then each
 *      grade's rule must set --tone-ink to its own --grade-<g>-ink (text) and
 *      --tone to its own --grade-<g> base (the scale's marks), never a brand
 *      token.
 *
 * Usage:  node scripts/check-badge-grade-tokens.js [--json]
 * Exits 1 on any finding.
 */

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const BADGE = path.join(APP, 'app', 'lib', 'badge', 'live-badge.ts');
const STATIC = { dark: path.join(APP, 'public', 'badge.svg'), light: path.join(APP, 'public', 'badge-light.svg') };
const SHIELDS_ROUTE = path.join(APP, 'app', 'api', 'badge', 'route.ts');
const REPORT = path.join(APP, 'app', 'score', 'report', 'score-report.tsx');
const CSS = path.join(APP, 'app', 'globals.css');
const GRADES = ['A', 'B', 'C', 'D', 'F'];
const TEXT_MIN = 4.5;
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

/** A custom property's hex in a block, resolved through var() inside that block. */
function resolve(body, name, where, seen = new Set()) {
  if (seen.has(name)) throw new Error(`globals.css ${where}: ${name} refers to itself`);
  seen.add(name);
  const m = body.match(new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`globals.css ${where}: no ${name}`);
  const v = m[1].trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(body, ref[1], where, seen);
  throw new Error(`globals.css ${where}: ${name} is ${v}, not a hex or a var()`);
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

/** GRADE_INK's { A: '#hex', ... } per ground. */
function gradeInk(src) {
  const m = src.match(/export const GRADE_INK[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('live-badge.ts: GRADE_INK not found');
  const out = {};
  for (const ground of ['dark', 'light']) {
    const g = m[1].match(new RegExp(`${ground}:\\s*\\{([\\s\\S]*?)\\}`));
    if (!g) throw new Error(`live-badge.ts: GRADE_INK has no ${ground} ground`);
    out[ground] = {};
    const re = /([A-Z]):\s*'(#[0-9a-fA-F]{6})'/g;
    let e;
    while ((e = re.exec(g[1]))) out[ground][e[1]] = e[2].toLowerCase();
  }
  return out;
}

/** BADGE_GROUND's { ground, ink, muted } per ground. */
function badgeGround(src) {
  const out = {};
  for (const ground of ['dark', 'light']) {
    const m = src.match(new RegExp(`\\n\\s*${ground}: \\{ ground: '(#[0-9a-fA-F]{6})', rim: '[^']*', ink: '(#[0-9a-fA-F]{6})', muted: '(#[0-9a-fA-F]{6})'`));
    if (!m) throw new Error(`live-badge.ts: BADGE_GROUND has no ${ground} entry`);
    out[ground] = { ground: m[1].toLowerCase(), ink: m[2].toLowerCase(), muted: m[3].toLowerCase() };
  }
  return out;
}

/** A static image's label fill: the outlined label is its one transformed path. */
function staticLabel(svg, file) {
  const m = svg.match(/<path fill="(#[0-9a-fA-F]{6})" transform=/);
  if (!m) throw new Error(`${file}: no outlined label`);
  return m[1].toLowerCase();
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
function checkShields(src, bases, inks, findings) {
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
    rows.push({ grade: '-', colour, token: 'neutral', text, textOnColour: ratio });
    const [r, g, b] = [1, 3, 5].map((i) => colour.slice(i, i + 2));
    if (!(r === g && g === b)) findings.push(`shields endpoint: NEUTRAL_COLOR ${colour} is not a neutral grey`);
    if (ratio < TEXT_MIN) findings.push(`shields endpoint: shields text ${text} on NEUTRAL_COLOR ${colour} is ${ratio}:1, under ${TEXT_MIN}:1`);
  }
  return rows;
}

/** The report page: the grade letter is text in a grade token, never a brand colour. */
function checkReadoutRules(css, findings) {
  const rows = [];
  for (const g of GRADES) {
    const l = g.toLowerCase();
    const re = new RegExp(`:is\\(\\.rs-readout, \\.rs-track > span\\)\\[data-grade="${l}"\\]\\s*\\{([^}]*)\\}`);
    const m = css.match(re);
    if (!m) {
      findings.push(`report: no .rs-readout rule for grade ${g}`);
      continue;
    }
    const body = m[1].replace(/\s/g, '');
    rows.push({ grade: g, rule: body });
    if (!body.includes(`--tone-ink:var(--grade-${l}-ink)`)) findings.push(`report: grade ${g} letter is not --grade-${l}-ink`);
    if (!body.includes(`--tone:var(--grade-${l})`)) findings.push(`report: grade ${g} marks are not --grade-${l}`);
    const brand = [...body.matchAll(/var\((--[\w-]+)/g)].map((x) => x[1]).filter((t) => BRAND_TOKEN.test(t));
    if (brand.length) findings.push(`report: grade ${g} reads brand token ${brand.join(', ')} (a grade never takes a brand colour)`);
  }
  return rows;
}

function checkReport(src, findings, css) {
  if (!/const GRADE_COLOR/.test(src)) {
    if (!/<ResultReadout /.test(src)) findings.push('report: neither GRADE_COLOR nor the shared readout draws the grade');
    return checkReadoutRules(css, findings);
  }
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
    if (brand.length) findings.push(`report: grade ${g} reads brand token ${brand.join(', ')} (a grade never takes a brand colour)`);
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
  const badgeSrc = fs.readFileSync(BADGE, 'utf8');
  const darkBody = block(css, ':root');
  const lightBody = block(css, '[data-theme="light"]');
  if (!darkBody || !lightBody) throw new Error('globals.css: no :root or [data-theme="light"] block');
  const inks = { dark: {}, light: lightGradeTokens(css, '-ink') };
  for (const g of GRADES) inks.dark[g] = resolve(darkBody, `--grade-${g.toLowerCase()}-ink`, ':root');
  const want = {
    dark: { ground: resolve(darkBody, '--paper', ':root'), ink: resolve(darkBody, '--ink', ':root'), muted: resolve(darkBody, '--muted', ':root') },
    light: { ground: resolve(lightBody, '--surface', 'light'), ink: resolve(lightBody, '--ink', 'light'), muted: resolve(lightBody, '--muted', 'light') },
  };
  const letters = gradeInk(badgeSrc);
  const grounds = badgeGround(badgeSrc);
  const findings = [];
  const rows = [];

  for (const ground of ['dark', 'light']) {
    const have = grounds[ground];
    for (const k of ['ground', 'ink', 'muted']) {
      const token = k === 'ground' ? (ground === 'dark' ? '--paper' : '--surface') : `--${k}`;
      if (have[k] !== want[ground][k]) findings.push(`live badge ${ground}: ${k} ${have[k]} is not the ${ground} ${token} ${want[ground][k]}`);
    }
    const extra = Object.keys(letters[ground]).filter((g) => !GRADES.includes(g));
    if (extra.length) findings.push(`live badge ${ground}: GRADE_INK has grades outside A-F: ${extra.join(', ')}`);
    const texts = [
      ['ink', have.ink, '--ink'],
      ['muted', have.muted, '--muted'],
      ...GRADES.map((g) => [g, letters[ground][g], `--grade-${g.toLowerCase()}-ink`]),
    ];
    for (const [name, colour, token] of texts) {
      if (!colour) {
        findings.push(`live badge ${ground}: grade ${name} has no entry in GRADE_INK`);
        continue;
      }
      const ratio = +contrast(colour, have.ground).toFixed(2);
      rows.push({ ground, name, colour, token, onGround: ratio });
      if (GRADES.includes(name) && colour !== inks[ground][name]) {
        findings.push(`live badge ${ground}: grade ${name} letter ${colour} is not the ${ground} ${token} ${inks[ground][name]}`);
      }
      if (ratio < TEXT_MIN) findings.push(`live badge ${ground}: ${name} ${colour} on ${have.ground} is ${ratio}:1, under ${TEXT_MIN}:1`);
    }
    const file = path.basename(STATIC[ground]);
    const label = staticLabel(fs.readFileSync(STATIC[ground], 'utf8'), file);
    const ratio = +contrast(label, have.ground).toFixed(2);
    rows.push({ ground, name: 'static label', colour: label, token: file, onGround: ratio });
    if (ratio < TEXT_MIN) findings.push(`${file}: label ${label} on ${have.ground} is ${ratio}:1, under ${TEXT_MIN}:1`);
  }

  const shields = checkShields(fs.readFileSync(SHIELDS_ROUTE, 'utf8'), tokens, inks.light, findings);
  const report = checkReport(fs.readFileSync(REPORT, 'utf8'), findings, css);

  const ok = findings.length === 0;
  if (asJson) {
    console.log(JSON.stringify({ ok, rows, shields, report, findings }, null, 2));
  } else {
    console.log(`badge-grade-tokens: ${rows.length} badge text colours, ${shields.length} shields colours, ${report.length} report grades read, ${findings.length} findings`);
    console.log('  live badge (/api/badge?url=, /score/badge) and static images: text on the badge ground');
    console.log('  ground  text          colour   token                  ratio');
    for (const r of rows) {
      console.log(`  ${r.ground.padEnd(6)}  ${r.name.padEnd(12)}  ${r.colour}  ${r.token.padEnd(21)}  ${r.onGround.toFixed(2)}`);
    }
    console.log('  shields endpoint (/api/badge); text is the colour shields paints');
    console.log('  grade  colour        token           text     text/colour');
    for (const r of shields) {
      console.log(`  ${r.grade}      ${String(r.colour).padEnd(12)}  ${String(r.token ?? '-').padEnd(14)}  ${String(r.text ?? '-').padEnd(7)}  ${r.textOnColour == null ? '-' : r.textOnColour.toFixed(2)}`);
    }
    console.log('  report grade letter (/score/report)');
    for (const r of report) console.log(`  ${r.grade}      ${r.value ?? r.rule}`);
    for (const f of findings) console.log(`  FAIL ${f}`);
  }
  process.exit(ok ? 0 : 1);
}

main();
