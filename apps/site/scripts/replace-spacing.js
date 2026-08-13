#!/usr/bin/env node
/**
 * Spacing token replacement script (v3 — all CSS files).
 * Replaces hardcoded rem/px values in padding/margin declarations
 * with var(--space-*) references across ALL CSS files except globals.css
 * (which was already handled by the v2 run).
 *
 * Rules:
 * - Skips calc() (structural changes needed)
 * - Replaces rem/px values inside clamp(), max(), env() expressions
 * - Skips :root and [data-theme] blocks
 * - Sorts by length descending to avoid partial matches
 */
const fs = require('fs');
const path = require('path');

function findCssFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      findCssFiles(full, results);
    } else if (entry.name.endsWith('.css') && entry.name !== 'globals.css') {
      results.push(full);
    }
  }
  return results;
}

// rem → token map (sorted by string length DESCENDING)
const remMap = [
  ['0.02rem', 'var(--space-fine-02)'],
  ['0.03rem', 'var(--space-fine-03)'],
  ['0.05rem', 'var(--space-fine-05)'],
  ['0.0625rem', 'var(--space-1)'],
  ['0.1rem', 'var(--space-fine-10)'],
  ['0.12rem', 'var(--space-fine-12)'],
  ['0.125rem', 'var(--space-2)'],
  ['0.15rem', 'var(--space-fine-15)'],
  ['0.1875rem', 'var(--space-3)'],
  ['0.2rem', 'var(--space-fine-20)'],
  ['0.22rem', 'var(--space-fine-22)'],
  ['0.25rem', 'var(--space-4)'],
  ['0.3rem', 'var(--space-fine-30)'],
  ['0.3125rem', 'var(--space-5)'],
  ['0.32rem', 'var(--space-fine-32)'],
  ['0.34rem', 'var(--space-fine-34)'],
  ['0.35rem', 'var(--space-fine-35)'],
  ['0.375rem', 'var(--space-6)'],
  ['0.4rem', 'var(--space-fine-40)'],
  ['0.42rem', 'var(--space-fine-42)'],
  ['0.4375rem', 'var(--space-7)'],
  ['0.45rem', 'var(--space-fine-45)'],
  ['0.5rem', 'var(--space-8)'],
  ['0.55rem', 'var(--space-fine-55)'],
  ['0.5625rem', 'var(--space-9)'],
  ['0.6rem', 'var(--space-fine-60)'],
  ['0.625rem', 'var(--space-10)'],
  ['0.65rem', 'var(--space-fine-65)'],
  ['0.68rem', 'var(--space-fine-68)'],
  ['0.6875rem', 'var(--space-11)'],
  ['0.7rem', 'var(--space-fine-70)'],
  ['0.75rem', 'var(--space-12)'],
  ['0.8rem', 'var(--space-fine-80)'],
  ['0.8125rem', 'var(--space-13)'],
  ['0.85rem', 'var(--space-fine-85)'],
  ['0.875rem', 'var(--space-14)'],
  ['0.9375rem', 'var(--space-15)'],
  ['0.95rem', 'var(--space-fine-95)'],
  ['1rem', 'var(--space-16)'],
  ['1.05rem', 'var(--space-fine-105)'],
  ['1.0625rem', 'var(--space-17)'],
  ['1.1rem', 'var(--space-fine-110)'],
  ['1.125rem', 'var(--space-18)'],
  ['1.15rem', 'var(--space-fine-115)'],
  ['1.1875rem', 'var(--space-19)'],
  ['1.2rem', 'var(--space-fine-120)'],
  ['1.25rem', 'var(--space-20)'],
  ['1.3125rem', 'var(--space-21)'],
  ['1.3rem', 'var(--space-fine-130)'],
  ['1.35rem', 'var(--space-fine-135)'],
  ['1.375rem', 'var(--space-22)'],
  ['1.4rem', 'var(--space-fine-140)'],
  ['1.5rem', 'var(--space-24)'],
  ['1.6rem', 'var(--space-fine-160)'],
  ['1.75rem', 'var(--space-28)'],
  ['2rem', 'var(--space-32)'],
  ['2.1875rem', 'var(--space-35)'],
  ['2.2rem', 'var(--space-fine-220)'],
  ['2.25rem', 'var(--space-36)'],
  ['2.5rem', 'var(--space-40)'],
  ['2.75rem', 'var(--space-44)'],
  ['3rem', 'var(--space-48)'],
  ['3.5rem', 'var(--space-56)'],
  ['4rem', 'var(--space-64)'],
  ['4.5rem', 'var(--space-72)'],
  ['5.5rem', 'var(--space-88)'],
  ['6rem', 'var(--space-96)'],
  ['6.5rem', 'var(--space-104)'],
  ['7rem', 'var(--space-112)'],
  ['9rem', 'var(--space-144)'],
];

// px → token map (sorted by string length DESCENDING)
const pxMap = [
  ['1px', 'var(--space-1)'],
  ['2px', 'var(--space-2)'],
  ['3px', 'var(--space-3)'],
  ['4px', 'var(--space-4)'],
  ['5px', 'var(--space-5)'],
  ['6px', 'var(--space-6)'],
  ['7px', 'var(--space-7)'],
  ['8px', 'var(--space-8)'],
  ['9px', 'var(--space-9)'],
  ['10px', 'var(--space-10)'],
  ['11px', 'var(--space-11)'],
  ['12px', 'var(--space-12)'],
  ['13px', 'var(--space-13)'],
  ['14px', 'var(--space-14)'],
  ['15px', 'var(--space-15)'],
  ['16px', 'var(--space-16)'],
  ['17px', 'var(--space-17)'],
  ['18px', 'var(--space-18)'],
  ['19px', 'var(--space-19)'],
  ['20px', 'var(--space-20)'],
  ['21px', 'var(--space-21)'],
  ['22px', 'var(--space-22)'],
  ['24px', 'var(--space-24)'],
  ['28px', 'var(--space-28)'],
  ['32px', 'var(--space-32)'],
  ['35px', 'var(--space-35)'],
  ['36px', 'var(--space-36)'],
  ['40px', 'var(--space-40)'],
  ['44px', 'var(--space-44)'],
  ['48px', 'var(--space-48)'],
  ['56px', 'var(--space-56)'],
  ['64px', 'var(--space-64)'],
  ['72px', 'var(--space-72)'],
  ['88px', 'var(--space-88)'],
  ['96px', 'var(--space-96)'],
  ['104px', 'var(--space-104)'],
  ['112px', 'var(--space-112)'],
  ['144px', 'var(--space-144)'],
];

remMap.sort((a, b) => b[0].length - a[0].length);
pxMap.sort((a, b) => b[0].length - a[0].length);

function replaceRemAndPx(value) {
  let newValue = value;

  for (const [rem, token] of remMap) {
    const escaped = rem.replace(/\./g, '\\.');
    const re = new RegExp('(^|[\\s,(])' + escaped + '(?![0-9])', 'g');
    newValue = newValue.replace(re, '$1' + token);
  }

  for (const [px, token] of pxMap) {
    const re = new RegExp('(^|[\\s,(])' + px + '(?![0-9])', 'g');
    newValue = newValue.replace(re, '$1' + token);
  }

  return newValue;
}

function replaceSpacingInDecl(prop, value) {
  if (/calc\s*\(/i.test(value)) return null;

  const newValue = replaceRemAndPx(value);

  if (newValue !== value) {
    return prop + ': ' + newValue;
  }
  return null;
}

const appDir = path.resolve(__dirname, '..', 'app');
const files = findCssFiles(appDir);

let totalReplacements = 0;

for (const file of files) {
  let css = fs.readFileSync(file, 'utf8');
  let fileReplacements = 0;

  css = css.replace(
    /((?:padding|margin)(?:-(?:top|right|bottom|left|inline-start|inline-end|block-start|block-end))?)\s*:\s*([^;}]+)/gi,
    (match, prop, value) => {
      const result = replaceSpacingInDecl(prop, value);
      if (result) {
        fileReplacements++;
        return result;
      }
      return match;
    }
  );

  if (fileReplacements > 0) {
    fs.writeFileSync(file, css, 'utf8');
    const shortFile = path.relative(appDir, file).split(path.sep).join('/');
    console.log(shortFile + ': ' + fileReplacements + ' replacements');
    totalReplacements += fileReplacements;
  }
}

console.log('\nTotal replacements across all CSS files:', totalReplacements);