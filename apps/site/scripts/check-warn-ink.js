#!/usr/bin/env node
/**
 * Warn ink gate: text in the warn hue stays readable in both themes.
 *
 * WHY THIS EXISTS
 * --warn is a hue for icons, dots, bars and tints. In the light theme it is
 * #b07d04, 3.51:1 on --paper: enough for a UI component (3:1), not for text
 * (4.5:1). Until 2026-10-08 fourteen stylesheet rules and four components
 * painted text with it, so every WARN status word on the engine's findings
 * rows read at 3.51:1 in light mode, on the site that scores contrast. The fix
 * is a text token, --warn-ink, which the light theme mixes toward --ink (the
 * pattern work.css --cs-warn-ink already used).
 *
 * WHAT IT ASSERTS
 *   1. No stylesheet under app/ paints text with the bare hue
 *      (`color: var(--warn)` or `-webkit-text-fill-color: var(--warn)`), and
 *      no component sets a `color:` style straight to 'var(--warn)'.
 *   2. globals.css declares --warn-ink in the root (dark) block and in the
 *      light block.
 *   3. Computed from the declared values, --warn-ink is at least 4.5:1 on
 *      --paper and on --surface in both themes. The light value is a
 *      color-mix(); its space and percentage are read from the source and
 *      mixed the same way, so changing either re-measures.
 *
 * WHAT IT DOES NOT CATCH
 *   A colour map in a component (`{ C: 'var(--warn)' }`) that is applied as a
 *   text colour somewhere else. A source scan cannot follow a map to the
 *   place it is applied; the four that existed were fixed by hand.
 *
 * Usage: node scripts/check-warn-ink.js        (exit 1 on any failure)
 */

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const APP = path.join(SITE, 'app');
const GLOBALS = path.join(APP, 'globals.css');
const MIN = 4.5;

const rel = (p) => path.relative(SITE, p).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const failures = [];

// ── 1. Text painted with the bare hue ──────────────────────────────────────
const CSS_TEXT = /(?<![-\w])(?:color|-webkit-text-fill-color)\s*:\s*var\(--warn\)/;
const TSX_TEXT = /\bcolor\s*:\s*['"]var\(--warn\)['"]/;
for (const file of walk(APP)) {
  const re = file.endsWith('.css') ? CSS_TEXT : TSX_TEXT;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (re.test(line)) {
      failures.push(`${rel(file)}:${i + 1} paints text with var(--warn); use var(--warn-ink)`);
    }
  });
}

// ── 2. The token, in both themes ───────────────────────────────────────────
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

// ── 3. Measure ─────────────────────────────────────────────────────────────
function hex(value) {
  const m = /^#([0-9a-f]{6})$/i.exec(value || '');
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c) => Math.min(1, Math.max(0, c));

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
  if (space === 'srgb') return a.map((c, i) => c * p + b[i] * (1 - p));
  const [x, y] = [oklab(a), oklab(b)];
  return fromOklab(x.map((c, i) => c * p + y[i] * (1 - p)));
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

function resolve(theme, value) {
  const own = (name) => decl(themes[theme], name) || decl(themes.dark, name);
  if (value === 'var(--warn)') return hex(own('warn'));
  const m = /^color-mix\(in (srgb|oklab),\s*var\(--warn\)\s+(\d+(?:\.\d+)?)%,\s*var\(--ink\)\)$/.exec(value || '');
  if (m) {
    const [warn, ink] = [hex(own('warn')), hex(own('ink'))];
    return warn && ink ? mix(m[1], warn, ink, Number(m[2]) / 100) : null;
  }
  return hex(value);
}

const lines = [];
for (const theme of ['dark', 'light']) {
  if (!themes[theme]) {
    failures.push(`globals.css: no ${theme} token block found`);
    continue;
  }
  const value = decl(themes[theme], 'warn-ink');
  if (!value) {
    failures.push(`globals.css: --warn-ink is not declared in the ${theme} block`);
    continue;
  }
  const ink = resolve(theme, value);
  if (!ink) {
    failures.push(`globals.css: cannot measure ${theme} --warn-ink "${value}"`);
    continue;
  }
  for (const surface of ['paper', 'surface']) {
    const bg = hex(decl(themes[theme], surface) || decl(themes.dark, surface));
    if (!bg) {
      failures.push(`globals.css: cannot read ${theme} --${surface}`);
      continue;
    }
    const ratio = contrast(ink, bg);
    lines.push(`${theme} --warn-ink ${toHex(ink)} on --${surface} ${toHex(bg)}: ${ratio.toFixed(2)}:1`);
    if (ratio < MIN) {
      failures.push(`${theme} --warn-ink ${toHex(ink)} is ${ratio.toFixed(2)}:1 on --${surface}, under ${MIN}:1`);
    }
  }
}

for (const line of lines) console.log(`  ${line}`);
if (failures.length) {
  console.error(`\nWarn ink gate FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Warn ink gate passed: warn text uses --warn-ink, at least 4.5:1 in both themes.');
