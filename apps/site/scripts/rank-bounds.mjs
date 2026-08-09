#!/usr/bin/env node
/**
 * Rank-optimal weighting bounds for the Designesy leaderboard.
 *
 * Preempts the canonical next critique in the composite-indicator
 * literature: "rank-optimal weighting" (OECD Better Life Index analysis —
 * Springer Social Indicators Research: 19 of 36 countries can be ranked #1
 * by adversarial weights). If a critic can show our 30-site leaderboard
 * reshuffles under plausible weight scenarios, the rank is meaningless.
 *
 * Method (honest bounds, not a model):
 *   1. Pull real check statuses from the live /api/score for all 30 sites.
 *   2. For each site, compute its score under a GRID of weight scenarios:
 *        - uniform weights (all categories equal)
 *        - each single category weight ×2 (favor that category)
 *        - each single category weight ×0.5 (disfavor that category)
 *        - the published weight table (baseline)
 *   3. For each site, report the RANK BAND: best rank and worst rank it can
 *      achieve across the scenario grid. A narrow band = robust rank; a wide
 *      band = the rank is an artifact of the weight table.
 *   4. Report which sites are rank-robust vs rank-fragile, and whether the
 *      top of the leaderboard (the A/B/C boundary) is stable.
 *
 * Output: rank-bounds-report.json + rank-bounds-report.md (same dir).
 *
 * Usage: node scripts/rank-bounds.mjs [--base https://www.designesy.org]
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'https://www.designesy.org';
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));

// ── Engine constants (mirror of app/api/score/route.ts) ─────────────────────
const CATEGORY_WEIGHTS = {
  cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9,
  takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3,
  security: 5, spec: 4, copywriting: 8,
};
const WARN_CREDIT = 0.5;
const SLOP_CAP = 20;
const ORIGINALITY_CAP = 8;
const A11Y_FLOOR_PCT = 60;
const A11Y_FLOOR_CAP = 70;
const HARD_FAIL_CAPS = { v06: 65, v22: 70, v02: 70, v24: 75, v25: 75, v16: 70 };

function computeGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Recompute the composite from raw check statuses under a weight table. */
function recompute(checks, weights, slop, originality) {
  const scored = checks.filter((c) => c.status !== 'SKIP' && c.status !== 'MANUAL');
  const catCounts = {};
  for (const c of scored) catCounts[c.category] = (catCounts[c.category] || 0) + 1;

  let weightedPoints = 0;
  let weightedTotal = 0;
  for (const c of scored) {
    const catWeight = weights[c.category] ?? 5;
    const checkWeight = catWeight / (catCounts[c.category] || 1);
    weightedTotal += checkWeight;
    if (c.status === 'PASS') weightedPoints += checkWeight;
    else if (c.status === 'WARN') weightedPoints += checkWeight * WARN_CREDIT;
  }

  let score = weightedTotal === 0 ? 0 : Math.round((weightedPoints / weightedTotal) * 1000) / 10;
  if (slop > 0) score = Math.max(0, score - Math.min(slop, SLOP_CAP));
  if (originality > 0) score = Math.min(100, score + Math.min(originality, ORIGINALITY_CAP));

  const a11y = scored.filter((c) => c.category === 'accessibility');
  if (a11y.length > 0) {
    const pct = (a11y.filter((c) => c.status === 'PASS').length + a11y.filter((c) => c.status === 'WARN').length * WARN_CREDIT) / a11y.length * 100;
    if (pct < A11Y_FLOOR_PCT && score > A11Y_FLOOR_CAP) score = A11Y_FLOOR_CAP;
  }
  for (const c of scored) {
    if (c.status !== 'FAIL') continue;
    const cap = HARD_FAIL_CAPS[c.id];
    if (cap != null && score > cap) score = cap;
  }
  return score;
}

// ── Weight scenario grid ────────────────────────────────────────────────────
function buildScenarios() {
  const cats = Object.keys(CATEGORY_WEIGHTS);
  const scenarios = [{ id: 'baseline', label: 'published weights', weights: { ...CATEGORY_WEIGHTS } }];
  scenarios.push({ id: 'uniform', label: 'uniform weights (all equal)', weights: Object.fromEntries(cats.map((c) => [c, 10])) });
  for (const cat of cats) {
    const w2 = { ...CATEGORY_WEIGHTS, [cat]: CATEGORY_WEIGHTS[cat] * 2 };
    scenarios.push({ id: `fav-${cat}`, label: `favor ${cat} (×2)`, weights: w2 });
    const w05 = { ...CATEGORY_WEIGHTS, [cat]: CATEGORY_WEIGHTS[cat] * 0.5 };
    scenarios.push({ id: `disfav-${cat}`, label: `disfavor ${cat} (×0.5)`, weights: w05 });
  }
  return scenarios;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[rank-bounds] base: ${BASE}`);
  const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
  const urls = lb.sites.map((s) => s.url);
  console.log(`[rank-bounds] ${urls.length} leaderboard sites`);

  const scenarios = buildScenarios();
  console.log(`[rank-bounds] ${scenarios.length} weight scenarios`);

  // Score each site once, keep real checks + slop/originality
  const sites = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = await fetch(`${BASE}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const d = await res.json();
      if (!d.checks) throw new Error(`no checks`);
      sites.push({ url, checks: d.checks, slop: d.slop?.total ?? 0, originality: d.originality?.points ?? 0 });
      console.log(`[${i + 1}/${urls.length}] ${url}`);
    } catch (e) {
      console.log(`[${i + 1}/${urls.length}] ${url}  ERROR ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // Score every site under every scenario
  const scores = {}; // scenarioId -> { url -> score }
  for (const sc of scenarios) {
    scores[sc.id] = {};
    for (const s of sites) {
      scores[sc.id][s.url] = recompute(s.checks, sc.weights, s.slop, s.originality);
    }
  }

  // Rank per scenario (descending score)
  const ranks = {}; // scenarioId -> { url -> rank (1-based) }
  for (const sc of scenarios) {
    const sorted = [...sites].sort((a, b) => scores[sc.id][b.url] - scores[sc.id][a.url]);
    ranks[sc.id] = {};
    sorted.forEach((s, idx) => { ranks[sc.id][s.url] = idx + 1; });
  }

  // Per-site rank band across scenarios
  const perSite = sites.map((s) => {
    const allRanks = scenarios.map((sc) => ranks[sc.id][s.url]);
    const allScores = scenarios.map((sc) => scores[sc.id][s.url]);
    const bestRank = Math.min(...allRanks);
    const worstRank = Math.max(...allRanks);
    const baselineRank = ranks.baseline[s.url];
    const baselineScore = scores.baseline[s.url];
    return {
      url: s.url,
      baselineScore: Math.round(baselineScore * 10) / 10,
      baselineGrade: computeGrade(baselineScore),
      baselineRank,
      bestRank,
      worstRank,
      bandWidth: worstRank - bestRank,
      scoreRange: [Math.round(Math.min(...allScores) * 10) / 10, Math.round(Math.max(...allScores) * 10) / 10],
      // Which scenario gives best/worst rank
      bestScenario: scenarios[allRanks.indexOf(bestRank)].id,
      worstScenario: scenarios[allRanks.indexOf(worstRank)].id,
    };
  });

  // Leaderboard-level: is the top stable?
  const top5Baseline = [...perSite].sort((a, b) => a.baselineRank - b.baselineRank).slice(0, 5).map((s) => s.url);
  const top5AnyScenario = new Set();
  for (const sc of scenarios) {
    const sorted = [...sites].sort((a, b) => scores[sc.id][b.url] - scores[sc.id][a.url]).slice(0, 5);
    sorted.forEach((s) => top5AnyScenario.add(s.url));
  }
  const top5Stable = top5Baseline.filter((u) => top5AnyScenario.has(u));
  const top5Fragile = top5Baseline.filter((u) => !top5AnyScenario.has(u));

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    method: 'Real check statuses from live /api/score; composite recomputed under 29 weight scenarios (baseline, uniform, per-category ×2 and ×0.5). Rank band = best to worst rank across scenarios.',
    scenarios: scenarios.length,
    sites: sites.length,
    top5Stable,
    top5Fragile,
    perSite,
  };

  const jsonPath = path.join(OUT_DIR, 'rank-bounds-report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n[rank-bounds] WROTE ${path.relative(process.cwd(), jsonPath)}`);

  const md = renderMarkdown(report);
  writeFileSync(path.join(OUT_DIR, 'rank-bounds-report.md'), md);
  console.log(`[rank-bounds] WROTE rank-bounds-report.md`);
}

function renderMarkdown(r) {
  const lines = [];
  lines.push('# Designesy Leaderboard — Rank-Optimal Weighting Bounds');
  lines.push('');
  lines.push(`- Generated: ${r.generatedAt}`);
  lines.push(`- Base: ${r.base}`);
  lines.push(`- Method: ${r.method}`);
  lines.push('');
  lines.push(`## Top-5 stability`);
  lines.push('');
  lines.push(`- Sites that stay in the top 5 under EVERY weight scenario: ${r.top5Stable.length ? r.top5Stable.join(', ') : 'none'}`);
  lines.push(`- Sites in the baseline top 5 that can be pushed out: ${r.top5Fragile.length ? r.top5Fragile.join(', ') : 'none'}`);
  lines.push('');
  lines.push(`## Per-site rank bands`);
  lines.push('');
  lines.push(`| Site | Baseline | Rank | Best rank | Worst rank | Band | Score range |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const s of [...r.perSite].sort((a, b) => a.baselineRank - b.baselineRank)) {
    lines.push(`| ${s.url} | ${s.baselineScore} (${s.baselineGrade}) | ${s.baselineRank} | ${s.bestRank} | ${s.worstRank} | ${s.bandWidth} | ${s.scoreRange[0]}–${s.scoreRange[1]} |`);
  }
  lines.push('');
  lines.push(`## Reading this`);
  lines.push('');
  lines.push(`A narrow rank band means the site's position is robust to weight choices; a wide band means the rank is an artifact of the weight table. The OECD Better Life Index analysis (Springer Social Indicators Research) showed 19/36 countries can be ranked #1 by adversarial weights — this report applies the same test to our 30-site leaderboard and publishes the result.`);
  lines.push('');
  return lines.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
