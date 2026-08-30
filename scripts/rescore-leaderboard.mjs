#!/usr/bin/env node
// scripts/rescore-leaderboard.mjs
//
// Re-scores every leaderboard seed site against the live designesy.org
// /api/score engine, computes delta-since-last-week badges, and regenerates
// the seed.ts + snapshot.json files.
//
// Run by .github/workflows/rescore-leaderboard.yml every Monday 10:00 UTC.
// Can also be run locally: node scripts/rescore-leaderboard.mjs
//
// Output:
//   apps/site/app/leaderboard/seed.ts      — updated with new scores + prevScore
//   apps/site/app/leaderboard/snapshot.json — this week's scores (for next week's delta)
//
// The script reads the current seed.ts to extract the site list and the
// previous scores (prevScore), then writes the new scores as the current
// score and moves the old current score to prevScore.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEED_PATH = join(ROOT, 'apps/site/app/leaderboard/seed.ts');
const SNAPSHOT_PATH = join(ROOT, 'apps/site/app/leaderboard/snapshot.json');
const SCORE_API = process.env.SCORE_API || 'https://www.designesy.org/api/score';

// ── Extract the RAW_SEED array from seed.ts ──────────────────────────────
// We parse the TypeScript source text to extract the seed entries rather than
// importing the module (which would require a TS compiler). The RAW_SEED is
// a flat array of object literals — we regex-extract each entry's URL, name,
// tier, category, score, grade, pass, fail, warn, skip, tokens, seededBecause.

function extractSeedEntries(src) {
  // Find the RAW_SEED array bounds
  const arrayStart = src.indexOf('const RAW_SEED');
  if (arrayStart === -1) throw new Error('Could not find RAW_SEED in seed.ts');
  const arrayEnd = src.indexOf('];', arrayStart);
  const arrayText = src.slice(arrayStart, arrayEnd + 2);

  // Extract each object literal in the array
  const entries = [];
  const objRegex = /\{[^{}]*\burl:[^{}]*\}/gs;
  const matches = arrayText.match(objRegex) || [];

  for (const m of matches) {
    const extract = (key) => {
      const r = new RegExp(`${key}:\\s*([^,}]+)`);
      const match = m.match(r);
      if (!match) return null;
      let val = match[1].trim();
      // Handle strings (strip quotes)
      if (val.startsWith("'") || val.startsWith('"')) {
        val = val.slice(1, val.lastIndexOf(val[0]));
      }
      return val;
    };

    const url = extract('url');
    const name = extract('name');
    const tier = parseInt(extract('tier') || '0', 10);
    const category = extract('category');
    const score = parseFloat(extract('score') || 'null');
    const grade = extract('grade');
    const pass = parseInt(extract('pass') || '0', 10);
    const fail = parseInt(extract('fail') || '0', 10);
    const warn = parseInt(extract('warn') || '0', 10);
    const skip = parseInt(extract('skip') || '0', 10);
    const tokens = parseInt(extract('tokens') || '0', 10);
    const seededBecause = extract('seededBecause');

    if (url) {
      entries.push({ url, name, tier, category, score: isNaN(score) ? null : score, grade, pass, fail, warn, skip, tokens, seededBecause, prevScore: null });
    }
  }
  return entries;
}

// ── Load the previous snapshot for delta computation ────────────────────
function loadPrevSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

// ── Fetch a live score from the engine ───────────────────────────────────
async function fetchScore(url) {
  const res = await fetch(SCORE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  const data = await res.json();
  return {
    score: data.score ?? null,
    grade: data.grade ?? null,
    pass: data.pass ?? 0,
    fail: data.fail ?? 0,
    warn: data.warn ?? 0,
    skip: data.skip ?? 0,
    tokens: data.tokensExtracted ?? 0,
    categoryScores: data.categoryScores ?? null,
  };
}

// ── Generate the updated seed.ts ─────────────────────────────────────────
//
// SURGICAL REWRITE — the 2026-08-30 run proved the previous full-file
// regeneration approach wrong: it rebuilt seed.ts from a hardcoded template
// that predates fields added since the last successful run (liveScoreUrl,
// coiDisclosure), stripping them and breaking page.tsx's typecheck
// (TS2339). The template also held a stale LEADERBOARD_VERSION.
//
// Instead: keep the file as-is and rewrite ONLY the fields this script
// owns — per-entry score fields + prevScore, the header comment's re-score
// date, LEADERBOARD_LAST_SCORED, and the count in LEADERBOARD_POLICY.
// Unknown present or FUTURE fields pass through untouched, so schema
// additions no longer break the weekly re-score.
function generateSeedTS(src, entries, lastScored) {
  let out = src;

  // 1. Header comment: "All N sites re-scored DATE with the 40-check engine"
  out = out.replace(
    /(\/\/ All \d+ sites re-scored )\d{4}-\d{2}-\d{2}( with the 40-check engine)/,
    `$1${lastScored}$2`
  );

  // 2. Each entry: rewrite the fields we own inside its object literal.
  //    Match each RAW_SEED entry by its url: '...' anchor, then swap the
  //    owned scalar fields inside that literal only.
  for (const e of entries) {
    const anchor = e.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Locate the entry's object literal via its unique url anchor.
    const entryRegex = new RegExp(`(\\{[^{}]*url: '${anchor}'[^{}]*\\})`);
    const m = out.match(entryRegex);
    if (!m) {
      throw new Error(`generateSeedTS: could not locate entry for ${e.url} in seed.ts`);
    }
    let entryText = m[1];

    const swap = (key, value) => {
      const re = new RegExp(`${key}:\\s*('[^']*'|null|\\d+(?:\\.\\d+)?)`);
      if (re.test(entryText)) {
        entryText = entryText.replace(re, `${key}: ${value}`);
        return true;
      }
      return false;
    };

    const num = (v) => (v === null || v === undefined ? 'null' : String(v));
    const swapRequired = (key, value) => {
      if (!swap(key, value)) {
        throw new Error(`generateSeedTS: field ${key} missing on entry ${e.url} — seed schema and script disagree`);
      }
    };

    swapRequired('score', num(e.score));
    swapRequired('grade', e.grade ? `'${e.grade}'` : 'null');
    swapRequired('pass', num(e.pass));
    swapRequired('fail', num(e.fail));
    swapRequired('warn', num(e.warn));
    swapRequired('skip', num(e.skip));
    swapRequired('tokens', num(e.tokens));
    // prevScore is optional in the schema (older entries lack it) — swap when
    // present, skip silently when absent rather than failing the whole run.
    swap('prevScore', num(e.prevScore));

    out = out.replace(m[0], entryText);
  }

  // 3. LEADERBOARD_LAST_SCORED = '...'
  out = out.replace(
    /(LEADERBOARD_LAST_SCORED = ')\d{4}-\d{2}-\d{2}(')/,
    `$1${lastScored}$2`
  );

  // 4. LEADERBOARD_POLICY count: "Curated seed (N sites)"
  out = out.replace(
    /(Curated seed \()\d+( sites)/,
    `$1${entries.length}$2`
  );

  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('Reading current seed.ts...');
  const src = readFileSync(SEED_PATH, 'utf-8');
  const entries = extractSeedEntries(src);
  console.log(`Found ${entries.length} seed sites.`);

  // Load previous snapshot for delta computation
  const prevSnapshot = loadPrevSnapshot();
  const prevCount = Object.keys(prevSnapshot).length;
  console.log(`Loaded previous snapshot (${prevCount} entries).`);

  // Set prevScore from the snapshot (the previous week's scores)
  for (const entry of entries) {
    if (prevSnapshot[entry.url] && prevSnapshot[entry.url].score !== null) {
      entry.prevScore = prevSnapshot[entry.url].score;
    }
  }

  // Re-score every site
  console.log(`Scoring ${entries.length} sites against ${SCORE_API}...`);
  let success = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    try {
      console.log(`  [${i + 1}/${entries.length}] ${entry.url} ...`);
      const result = await fetchScore(entry.url);
      entry.score = result.score;
      entry.grade = result.grade;
      entry.pass = result.pass;
      entry.fail = result.fail;
      entry.warn = result.warn;
      entry.skip = result.skip;
      entry.tokens = result.tokens;
      success++;

      const delta = entry.prevScore !== null ? ` (prev ${entry.prevScore}, Δ${(entry.score - entry.prevScore).toFixed(1)})` : '';
      console.log(`    → ${result.score} ${result.grade}${delta}`);
    } catch (e) {
      errors++;
      console.log(`    → ERROR: ${e.message}`);
      // Keep the existing score on error
    }

    // Be polite to the API (the 24h cache means most hits are instant,
    // but cold scores take 3-8s — this delay prevents burst rate-limiting)
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nRe-score complete: ${success} scored, ${errors} errors.`);

  // Generate the date string
  const now = new Date();
  const lastScored = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Write the updated seed.ts
  console.log(`Writing updated seed.ts (last scored ${lastScored})...`);
  const newSeedTS = generateSeedTS(src, entries, lastScored);
  writeFileSync(SEED_PATH, newSeedTS, 'utf-8');

  // Write this week's snapshot (for next week's delta)
  const snapshot = {};
  for (const entry of entries) {
    snapshot[entry.url] = {
      score: entry.score,
      grade: entry.grade,
      pass: entry.pass,
      fail: entry.fail,
      warn: entry.warn,
      skip: entry.skip,
      tokens: entry.tokens,
      scoredAt: lastScored,
    };
  }
  console.log('Writing snapshot.json...');
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');

  // Summary
  const deltas = entries
    .filter((e) => e.prevScore !== null && e.score !== null)
    .map((e) => ({ name: e.name, delta: e.score - e.prevScore }))
    .filter((d) => d.delta !== 0);

  console.log(`\nDelta summary: ${deltas.length} site(s) changed score since last week.`);
  for (const d of deltas) {
    const arrow = d.delta > 0 ? '↑' : '↓';
    console.log(`  ${arrow} ${d.name}: ${d.delta > 0 ? '+' : ''}${d.delta.toFixed(1)}`);
  }
  if (deltas.length === 0) {
    console.log('  (no changes — all sites scored the same as last week)');
  }

  console.log('\nDone. Commit the updated files to deploy.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});