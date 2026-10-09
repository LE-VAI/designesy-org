#!/usr/bin/env node
/**
 * Focus ring gate: every focus style resolves wherever its control renders.
 *
 * WHY THIS EXISTS
 * The segmented control and the "more" disclosure drew their focus outline
 * with --ctl-focus, a property declared only on the command bar. Both also
 * render outside a bar (the findings filter on every result page), and there
 * the property was undefined: the outline was invalid at computed-value time,
 * computed to `none`, and keyboard users tabbed onto a control with no
 * visible focus (WCAG 2.4.7). No build, lint or type check could see it,
 * because every rule was valid CSS.
 *
 * WHAT IT ASSERTS
 *   In every stylesheet under app/, a rule whose selector has :focus,
 *   :focus-visible or :focus-within may paint outline, outline-color,
 *   box-shadow or border-color only with custom properties that are either
 *   declared at the root (:root, html, or a theme block) or given a fallback,
 *   var(--x, ...). A property scoped to one component is only safe inside
 *   that component, and focus rules are where that assumption failed.
 *
 * Usage: node scripts/check-focus-rings.js        (exit 1 on any failure)
 */

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const APP = path.join(SITE, 'app');
const rel = (p) => path.relative(SITE, p).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ROOT_SELECTOR = /^(?::root|html|\[data-theme="(?:light|dark)"\]|:root\[data-theme="(?:light|dark)"\]|:root:not\(\[data-theme="light"\]\))$/;

const files = walk(APP);
const rootTokens = new Set();
for (const file of files) {
  const css = strip(fs.readFileSync(file, 'utf8'));
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (!selectors.some((s) => ROOT_SELECTOR.test(s))) continue;
    for (const d of m[2].matchAll(/--([\w-]+)\s*:/g)) rootTokens.add(d[1]);
  }
}

const failures = [];
let focusRules = 0;
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const css = strip(raw);
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].replace(/\s+/g, ' ').trim();
    if (!/:focus/.test(selector)) continue;
    focusRules++;
    for (const d of m[2].matchAll(/(outline(?:-color)?|box-shadow|border-color)\s*:([^;]*)/g)) {
      for (const v of d[2].matchAll(/var\(\s*--([\w-]+)\s*(,)?/g)) {
        if (v[2] || rootTokens.has(v[1])) continue;
        failures.push(`${rel(file)}: "${selector.slice(0, 70)}" ${d[1]} uses --${v[1]}, which no root block declares and which has no fallback`);
      }
    }
  }
}

console.log(`  ${focusRules} focus rules read; ${rootTokens.size} root custom properties`);
if (failures.length) {
  console.error(`\nFocus ring gate FAILED (${failures.length}):`);
  for (const f of [...new Set(failures)]) console.error(`  - ${f}`);
  console.error('Fix: give the var() a fallback, e.g. var(--ctl-focus, var(--signal-access)), or declare the property at the root.');
  process.exit(1);
}
console.log('Focus ring gate passed: every focus style resolves outside its component scope.');
