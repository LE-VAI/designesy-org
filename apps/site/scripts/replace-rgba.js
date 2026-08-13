#!/usr/bin/env node
/**
 * RGBA → color-mix() replacement script.
 * Converts rgba() opacity variants of known token colors to
 * color-mix(in srgb, var(--token) X%, transparent).
 * This removes them from the drift engine's hardcoded color count
 * because they contain var().
 */
const fs = require('fs');
const path = require('path');

function findCssFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      findCssFiles(full, results);
    } else if (entry.name.endsWith('.css')) {
      results.push(full);
    }
  }
  return results;
}

// Map base RGB → CSS variable token
const rgbToToken = {
  '255,255,255': 'var(--ink)',           // white = --ink in dark theme
  '0,0,0': 'var(--paper)',              // black = --paper in dark theme
  '51,88,232': 'var(--signal-light)',   // #3358e8
  '1,51,203': 'var(--signal)',          // #0133cb
  '34,197,94': 'var(--grade-a)',        // #22c55e
  '239,68,68': 'var(--grade-f)',        // #ef4444
  '234,179,8': 'var(--grade-c)',        // #eab308
  '74,222,128': 'var(--ok)',            // #4ade80
  '248,113,113': 'var(--error)',        // #f87171
  '250,204,21': 'var(--warn)',          // #facc15
  '52,211,153': 'var(--signal-pos)',    // #34d399
  '132,204,22': 'var(--grade-b)',       // #84cc16
  '251,146,60': 'var(--grade-d)',       // #fb923c
  '10,10,12': 'var(--surface)',         // #0a0a0c
  '1,1,2': 'var(--paper)',              // #010102
  '245,245,247': 'var(--ink)',          // #f5f5f7
  '251,251,252': 'var(--paper)',        // #fbfbfc (light paper)
  '93,123,255': 'var(--signal-access)', // #5d7bff
  '42,76,216': 'var(--signal-access)',  // #2a4cd8 (light signal-access)
  '249,115,22': 'var(--grade-d-glow)',  // #f97316
};

const appDir = path.resolve(__dirname, '..', 'app');
const files = findCssFiles(appDir);

let totalReplacements = 0;

for (const file of files) {
  let css = fs.readFileSync(file, 'utf8');

  // For globals.css, skip :root and [data-theme] blocks
  let searchStart = 0;
  if (file.endsWith('globals.css')) {
    const lightStart = css.indexOf('[data-theme="light"] {');
    if (lightStart > -1) {
      let braceCount = 0;
      let lightEnd = lightStart;
      for (let i = css.indexOf('{', lightStart); i < css.length; i++) {
        if (css[i] === '{') braceCount++;
        else if (css[i] === '}') { braceCount--; if (braceCount === 0) { lightEnd = i + 1; break; } }
      }
      searchStart = lightEnd;
    }
  }

  const before = css.slice(0, searchStart);
  let after = css.slice(searchStart);

  // Replace rgba(r,g,b,a) with color-mix when base RGB matches a token
  // Match rgba(R, G, B, A) where R,G,B match a known token
  after = after.replace(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/gi,
    (match, r, g, b, a) => {
      const base = `${r},${g},${b}`;
      const token = rgbToToken[base];
      if (token) {
        const pct = Math.round(parseFloat(a) * 100);
        totalReplacements++;
        return `color-mix(in srgb, ${token} ${pct}%, transparent)`;
      }
      return match;
    }
  );

  // Also replace plain rgb(r,g,b) without alpha that match tokens
  after = after.replace(
    /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gi,
    (match, r, g, b) => {
      const base = `${r},${g},${b}`;
      const token = rgbToToken[base];
      if (token) {
        totalReplacements++;
        return token;
      }
      return match;
    }
  );

  css = before + after;
  fs.writeFileSync(file, css, 'utf8');
}

console.log('Total rgba/rgb → color-mix/var replacements:', totalReplacements);