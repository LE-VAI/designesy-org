#!/usr/bin/env node
/**
 * Status and grade ink gate: text in a status or grade colour stays readable
 * in both themes, on every surface of the ladder.
 *
 * WHY THIS EXISTS
 * The status hues (--ok, --warn, --error), the grade hues (--grade-a ... -f)
 * and --activation are for icons, dots, bars, arcs and tints. In the light
 * theme several of them are under the 4.5:1 that text needs: --warn #b07d04
 * is 3.51:1 on --paper, --grade-b #65a30d 2.99:1, --grade-d #ea580c 3.44:1,
 * --activation #d4a017 2.30:1, and --ok and --error fall to 4.26:1 and 4.10:1
 * on --surface-lifted. Until 2026-10-08 the warn hue painted the WARN status
 * words; a contrast sweep of the live site then found the grade-B letter on
 * the home page at 3.09:1 and the badge table's B at 2.93:1, among others.
 * The fix is one text token per hue, --<hue>-ink, equal to the hue in the
 * dark theme and mixed toward --ink in the light theme.
 *
 * WHAT IT ASSERTS
 *   1. No stylesheet under app/ paints text (`color:` or
 *      `-webkit-text-fill-color:`) with a bare status or grade hue, or with
 *      one of those hues at reduced alpha (a color-mix() with transparent, or
 *      any value that uses the hue without mixing it toward --ink).
 *   2. No component does either: a `color:` style expression (including the
 *      branches of a ternary) and a `*COLOR*` map hold no bare hue literal.
 *   3. globals.css declares every ink token in the root (dark) block and in
 *      the light block.
 *   4. Computed from the declared values, every status and grade text token is
 *      at least 4.5:1 on --paper, --surface, --surface-raised and
 *      --surface-lifted in both themes. color-mix() is evaluated as CSS does
 *      (oklab or srgb, percentages read from the source) and the result is
 *      rounded to 8-bit sRGB, because that is the colour the browser paints:
 *      light --warn-ink is 5.79:1 unrounded and 5.76:1 as painted (#7f5e21).
 *   5. Every inline text mix of a hue toward --ink found in a stylesheet
 *      (`color: color-mix(in srgb, var(--warn) 70%, var(--ink))`) is measured
 *      the same way.
 *   6. --muted-dim, the dim text tier, is at least 4.5:1 on all four light
 *      surfaces, and on --paper, --surface and --surface-raised in dark. Dark
 *      --surface-lifted is excluded on purpose: dark scopes on that plane
 *      re-point --muted-dim to --muted (spring-validator.css does).
 *
 * WHAT IT DOES NOT CATCH
 *   A hue reached through a component-scoped alias (`--sv-hue: var(--warn)`
 *   then `color: var(--sv-hue)`), a colour held in a variable and applied
 *   elsewhere (`style={{ color: ink }}`), and opacity applied to text. A source
 *   scan cannot follow those; they are reviewed by hand.
 *
 * Usage: node scripts/check-warn-ink.js        (exit 1 on any failure)
 */

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const APP = path.join(SITE, 'app');
const GLOBALS = path.join(APP, 'globals.css');
const MIN = 4.5;

// Hues that are for marks, not text.
const HUES = ['ok', 'warn', 'error', 'grade-a', 'grade-b', 'grade-c', 'grade-d', 'grade-f', 'grade-d-glow', 'activation', 'signal-pos', 'live'];
// Text tokens: the -ink token of each hue used as text, and three text-only
// roles whose light values point at an ink token.
const INK = ['warn-ink', 'ok-ink', 'error-ink', 'grade-a-ink', 'grade-b-ink', 'grade-c-ink', 'grade-d-ink', 'grade-f-ink', 'activation-ink'];
const TEXT_ROLES = ['grade-b-light', 'error-text', 'amber-notice'];
const SURFACES = ['paper', 'surface', 'surface-raised', 'surface-lifted'];

const rel = (p) => path.relative(SITE, p).split(path.sep).join('/');
const HUE_VAR = new RegExp(`var\\(--(${HUES.join('|')})(?![\\w-])`);
const HUE_LITERAL = new RegExp(`(['"\`])var\\(--(${HUES.join('|')})\\)\\1`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;
const failures = [];
const inlineMixes = [];

// ── 1 and 2. Text painted with a bare or alpha-reduced hue ───────────────────
function scanCss(file) {
  // Blank out comments but keep their newlines, so line numbers hold.
  const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const re = /(?<![-\w])(color|-webkit-text-fill-color)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const value = m[2].trim();
    const hue = HUE_VAR.exec(value);
    if (!hue) continue;
    const where = `${rel(file)}:${lineOf(src, m.index)}`;
    if (/var\(--ink\)/.test(value)) {
      inlineMixes.push({ where, value: value.replace(/\s*!important$/, '') });
      continue;
    }
    failures.push(`${where} paints text with the --${hue[1]} hue (${value}); use var(--${hue[1]}-ink)`);
  }
}

// The expression after `color:` up to its top-level end (`,` `}` or `;`).
function expressionAt(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      if (depth === 0) return src.slice(start, i);
      depth--;
    } else if ((ch === ',' || ch === ';') && depth === 0) return src.slice(start, i);
  }
  return src.slice(start);
}

function scanTsx(file) {
  const src = fs.readFileSync(file, 'utf8');
  const colorRe = /(?<![-\w])color\s*:\s*/g;
  let m;
  while ((m = colorRe.exec(src))) {
    const expr = expressionAt(src, m.index + m[0].length);
    const hue = HUE_LITERAL.exec(expr);
    if (hue) failures.push(`${rel(file)}:${lineOf(src, m.index)} sets a text colour to var(--${hue[2]}); use var(--${hue[2]}-ink)`);
  }
  const mapRe = /\b(?:const|let|var)\s+(\w*COLOR\w*)\b[^=]*=\s*\{/g;
  while ((m = mapRe.exec(src))) {
    const body = expressionAt(src, m.index + m[0].length);
    const hue = HUE_LITERAL.exec(body);
    if (hue) failures.push(`${rel(file)}:${lineOf(src, m.index)} colour map ${m[1]} holds var(--${hue[2]}); use var(--${hue[2]}-ink)`);
  }
}

for (const file of walk(APP)) (file.endsWith('.css') ? scanCss : scanTsx)(file);

// ── 3. The tokens, in both themes ──────────────────────────────────────────
const css = fs.readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector) {
  const m = selector.exec(css);
  if (!m) return null;
  const open = css.indexOf('{', m.index);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j);
  }
  return null;
}

function decl(body, name) {
  const m = new RegExp(`(?:^|[;{\\s])--${name}\\s*:\\s*([^;]+);`).exec(body || '');
  return m ? m[1].trim() : null;
}

const themes = {
  dark: block(/^:root\s*\{/m),
  light: block(/^\[data-theme="light"\]\s*\{/m),
};

// ── 4. Measure ─────────────────────────────────────────────────────────────
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c) => Math.min(1, Math.max(0, c));
// The browser paints 8-bit sRGB: measure the colour it paints, not the float.
const to8bit = (rgb) => rgb.map((c) => Math.round(clamp(c) * 255) / 255);

function oklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(toGamma(clamp(c))));
}

function mix(space, a, b, p) {
  if (space === 'srgb') return to8bit(a.map((c, i) => c * p + b[i] * (1 - p)));
  const [x, y] = [oklab(a), oklab(b)];
  return to8bit(fromOklab(x.map((c, i) => c * p + y[i] * (1 - p))));
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x, y) => {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
};
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;

function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Resolve a declared value in one theme: hex, var() (the light block falls
// back to the root block, as the cascade does) and color-mix() with an opaque
// pair. Anything else returns null and is reported as unmeasurable.
function resolve(theme, value, depth = 0) {
  if (!value || depth > 12) return null;
  const v = value.replace(/\s*!important$/, '').trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255);
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) return resolve(theme, decl(themes[theme], ref[1]) || decl(themes.dark, ref[1]), depth + 1);
  const cm = /^color-mix\(\s*in\s+(srgb|oklab)\s*,(.*)\)$/s.exec(v);
  if (cm) {
    const parts = splitTop(cm[2]).map((part) => {
      const pm = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(part);
      return pm ? { color: pm[1], p: Number(pm[2]) / 100 } : { color: part, p: null };
    });
    if (parts.length !== 2) return null;
    const [a, b] = parts.map((x) => resolve(theme, x.color, depth + 1));
    if (!a || !b) return null;
    let [p1, p2] = [parts[0].p, parts[1].p];
    if (p1 === null && p2 === null) [p1, p2] = [0.5, 0.5];
    else if (p1 === null) p1 = 1 - p2;
    else if (p2 === null) p2 = 1 - p1;
    if (Math.abs(p1 + p2 - 1) > 1e-9) return null; // alpha-reducing mix: not a text colour
    return mix(cm[1], a, b, p1);
  }
  return null;
}

const lines = [];
function measure(label, theme, color, surfaces) {
  for (const surface of surfaces) {
    const bg = resolve(theme, `var(--${surface})`);
    if (!bg) {
      failures.push(`globals.css: cannot read ${theme} --${surface}`);
      continue;
    }
    const ratio = contrast(color, bg);
    lines.push({ label, theme, surface, color: toHex(color), ratio });
    if (ratio < MIN) failures.push(`${theme} ${label} ${toHex(color)} is ${ratio.toFixed(3)}:1 on --${surface}, under ${MIN}:1`);
  }
}

for (const theme of ['dark', 'light']) {
  if (!themes[theme]) {
    failures.push(`globals.css: no ${theme} token block found`);
    continue;
  }
  for (const name of [...INK, ...TEXT_ROLES, 'muted-dim']) {
    const own = decl(themes[theme], name);
    if (!own && INK.includes(name)) {
      failures.push(`globals.css: --${name} is not declared in the ${theme} block`);
      continue;
    }
    const value = own || decl(themes.dark, name);
    const color = resolve(theme, value);
    if (!color) {
      failures.push(`globals.css: cannot measure ${theme} --${name} "${value}"`);
      continue;
    }
    const surfaces = name === 'muted-dim' && theme === 'dark' ? SURFACES.slice(0, 3) : SURFACES;
    measure(`--${name}`, theme, color, surfaces);
  }
  for (const { where, value } of inlineMixes) {
    const color = resolve(theme, value);
    if (!color) {
      failures.push(`${where}: cannot measure ${theme} "${value}"`);
      continue;
    }
    measure(`${where} ${value}`, theme, color, SURFACES);
  }
}

// One line per token and theme: its painted colour and the ratio on each surface.
const rows = new Map();
for (const l of lines) {
  const key = `${l.theme} ${l.label}`;
  if (!rows.has(key)) rows.set(key, `${l.theme.padEnd(5)} ${l.label} ${l.color}:`);
  // Three decimals near the floor, where two would print a failing 4.498 as 4.50.
  const shown = Math.abs(l.ratio - MIN) < 0.01 ? l.ratio.toFixed(3) : l.ratio.toFixed(2);
  rows.set(key, `${rows.get(key)} ${l.surface} ${shown}`);
}
for (const row of rows.values()) console.log(`  ${row}`);
if (failures.length) {
  console.error(`\nStatus and grade ink gate FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Ink gate passed: no text in a bare or alpha-reduced status or grade hue; ${INK.length} ink tokens, ${TEXT_ROLES.length} text roles, --muted-dim and ${inlineMixes.length} inline ink mixes are at least ${MIN}:1 on every surface in both themes.`);
