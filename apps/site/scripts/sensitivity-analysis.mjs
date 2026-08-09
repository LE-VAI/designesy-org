#!/usr/bin/env node
/**
 * Sensitivity analysis for the Designesy 40-check scoring engine.
 *
 * Answers the OECD/JRC composite-indicator critique directly: "If modest
 * weight changes reshuffle the leaderboard, the dimension profile is more
 * informative than the letter grade."
 *
 * Method (honest perturbation, not a model):
 *   1. Pull the leaderboard seed URLs from the live /api/leaderboard.
 *   2. Score each URL through the live /api/score (24h-cached) and capture
 *      the REAL per-check statuses (PASS/WARN/FAIL/SKIP/MANUAL).
 *   3. Recompute the composite locally under perturbations, mirroring the
 *      engine's exact math (CATEGORY_WEIGHTS, WARN=0.5, slop deduction,
 *      originality lift, a11y floor, hard-fail ceilings, grade bands).
 *   4. Report per-knob sensitivity: which weight/threshold moves scores and
 *      grades the most, and whether the leaderboard reshuffles.
 *
 * Output: sensitivity-report.json + sensitivity-report.md (same dir).
 *
 * Usage: node scripts/sensitivity-analysis.mjs [--base https://www.designesy.org]
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
const GRADE_BANDS = [90, 80, 70, 60]; // A B C D F
const WARN_CREDIT = 0.5;
const SLOP_CAP = 20;
const ORIGINALITY_CAP = 8;
const A11Y_FLOOR_PCT = 60;
const A11Y_FLOOR_CAP = 70;
const HARD_FAIL_CAPS = { v06: 65, v22: 70, v02: 70, v24: 75, v25: 75, v16: 70 };

function computeGrade(score) {
  if (score >= GRADE_BANDS[0]) return 'A';
  if (score >= GRADE_BANDS[1]) return 'B';
  if (score >= GRADE_BANDS[2]) return 'C';
  if (score >= GRADE_BANDS[3]) return 'D';
  return 'F';
}

/**
 * Recompute the composite score from raw check statuses.
 * @param {Array<{id:string, category:string, status:string}>} checks
 * @param {object} opts perturbations: { weights, warnCredit, slop, originality, gradeBands, a11yFloorPct, a11yFloorCap, hardFailCaps }
 */
function recompute(checks, opts = {}) {
  const weights = opts.weights ?? CATEGORY_WEIGHTS;
  const warnCredit = opts.warnCredit ?? WARN_CREDIT;
  const slop = opts.slop ?? 0;          // flat deduction (0 = none)
  const originality = opts.originality ?? 0; // flat lift (0 = none)
  const bands = opts.gradeBands ?? GRADE_BANDS;
  const a11yFloorPct = opts.a11yFloorPct ?? A11Y_FLOOR_PCT;
  const a11yFloorCap = opts.a11yFloorCap ?? A11Y_FLOOR_CAP;
  const hardFailCaps = opts.hardFailCaps ?? HARD_FAIL_CAPS;

  // Per-check weight = category weight / scored checks in category
  const catCounts = {};
  for (const c of checks) {
    if (c.status === 'SKIP' || c.status === 'MANUAL') continue;
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
  }

  let weightedPoints = 0;
  let weightedTotal = 0;
  for (const c of checks) {
    if (c.status === 'SKIP' || c.status === 'MANUAL') continue;
    const catWeight = weights[c.category] ?? 5;
    const checkWeight = catWeight / (catCounts[c.category] || 1);
    weightedTotal += checkWeight;
    if (c.status === 'PASS') weightedPoints += checkWeight;
    else if (c.status === 'WARN') weightedPoints += checkWeight * warnCredit;
  }

  let score = weightedTotal === 0 ? 0 : Math.round((weightedPoints / weightedTotal) * 1000) / 10;

  // Slop deduction (flat, capped)
  if (slop > 0) score = Math.max(0, score - Math.min(slop, SLOP_CAP));
  // Originality lift (flat, capped)
  if (originality > 0) score = Math.min(100, score + Math.min(originality, ORIGINALITY_CAP));

  // A11y floor
  const a11yChecks = checks.filter((c) => c.category === 'accessibility' && c.status !== 'SKIP' && c.status !== 'MANUAL');
  const a11yScored = a11yChecks.length;
  let a11yFloorApplied = false;
  if (a11yScored > 0) {
    const a11yPct = (a11yChecks.filter((c) => c.status === 'PASS').length + a11yChecks.filter((c) => c.status === 'WARN').length * warnCredit) / a11yScored * 100;
    if (a11yPct < a11yFloorPct && score > a11yFloorCap) {
      score = a11yFloorCap;
      a11yFloorApplied = true;
    }
  }

  // Hard-fail ceilings
  let hardFailCeilingApplied = false;
  for (const c of checks) {
    if (c.status !== 'FAIL') continue;
    const cap = hardFailCaps[c.id];
    if (cap != null && score > cap) {
      score = cap;
      hardFailCeilingApplied = true;
    }
  }

  const grade = score >= bands[0] ? 'A' : score >= bands[1] ? 'B' : score >= bands[2] ? 'C' : score >= bands[3] ? 'D' : 'F';
  return { score, grade, a11yFloorApplied, hardFailCeilingApplied };
}

// ── Perturbation matrix ─────────────────────────────────────────────────────
function perturbWeights(factor) {
  const w = {};
  for (const [k, v] of Object.entries(CATEGORY_WEIGHTS)) w[k] = Math.round(v * factor * 100) / 100;
  return w;
}

const KNOBS = [
  // { id, label, opts }
  { id: 'w-10pct', label: 'weights −10% (uniform)', opts: { weights: perturbWeights(0.9) } },
  { id: 'w+10pct', label: 'weights +10% (uniform)', opts: { weights: perturbWeights(1.1) } },
  { id: 'w-20pct', label: 'weights −20% (uniform)', opts: { weights: perturbWeights(0.8) } },
  { id: 'w+20pct', label: 'weights +20% (uniform)', opts: { weights: perturbWeights(1.2) } },
  { id: 'warn-0.25', label: 'WARN credit 0.5 → 0.25', opts: { warnCredit: 0.25 } },
  { id: 'warn-0.75', label: 'WARN credit 0.5 → 0.75', opts: { warnCredit: 0.75 } },
  { id: 'slop+5', label: 'slop deduction +5', opts: { slop: 5 } },
  { id: 'orig+5', label: 'originality lift +5', opts: { originality: 5 } },
  { id: 'bands-tight', label: 'grade bands tightened 2pts (92/82/72/62)', opts: { gradeBands: [92, 82, 72, 62] } },
  { id: 'bands-loose', label: 'grade bands loosened 2pts (88/78/68/58)', opts: { gradeBands: [88, 78, 68, 58] } },
  { id: 'a11y-50', label: 'a11y floor 60% → 50%', opts: { a11yFloorPct: 50 } },
  { id: 'a11y-70', label: 'a11y floor 60% → 70%', opts: { a11yFloorPct: 70 } },
  { id: 'nocaps', label: 'hard-fail ceilings removed', opts: { hardFailCaps: {} } },
  // ── Two-factor interactions (Saltelli et al. 2017: OAT alone "leaves the
  //    space of variation mostly unscathed" — interactions must be tested) ──
  { id: 'warn0.75×slop+5', label: 'INTERACTION: WARN 0.75 × slop +5', opts: { warnCredit: 0.75, slop: 5 } },
  { id: 'warn0.25×slop+5', label: 'INTERACTION: WARN 0.25 × slop +5', opts: { warnCredit: 0.25, slop: 5 } },
  { id: 'warn0.75×a11y70', label: 'INTERACTION: WARN 0.75 × a11y floor 70%', opts: { warnCredit: 0.75, a11yFloorPct: 70 } },
  { id: 'warn0.25×a11y70', label: 'INTERACTION: WARN 0.25 × a11y floor 70%', opts: { warnCredit: 0.25, a11yFloorPct: 70 } },
  { id: 'slop+5×orig+5', label: 'INTERACTION: slop +5 × originality +5', opts: { slop: 5, originality: 5 } },
  { id: 'warn0.75×orig+5', label: 'INTERACTION: WARN 0.75 × originality +5', opts: { warnCredit: 0.75, originality: 5 } },
  { id: 'warn0.75×nocaps', label: 'INTERACTION: WARN 0.75 × ceilings removed', opts: { warnCredit: 0.75, hardFailCaps: {} } },
  { id: 'slop+5×nocaps', label: 'INTERACTION: slop +5 × ceilings removed', opts: { slop: 5, hardFailCaps: {} } },
];

// Per-category one-at-a-time (OAT): which single category weight matters most?
function oatKnobs() {
  return Object.keys(CATEGORY_WEIGHTS).map((cat) => ({
    id: `oat-${cat}`,
    label: `OAT: ${cat} weight ×1.5`,
    opts: { weights: { ...CATEGORY_WEIGHTS, [cat]: Math.round(CATEGORY_WEIGHTS[cat] * 1.5 * 100) / 100 } },
  }));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[sensitivity] base: ${BASE}`);
  const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
  const urls = lb.sites.map((s) => s.url);
  console.log(`[sensitivity] ${urls.length} leaderboard sites`);

  // Score each site once (24h-cached server-side) and keep the real checks.
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
      if (!d.checks) throw new Error(`no checks: ${JSON.stringify(d).slice(0, 120)}`);
      // Capture the engine's REAL slop deduction + originality lift so the
      // baseline recompute matches the live score exactly (fidelity check).
      const realSlop = d.slop?.total ?? 0;
      const realOrig = d.originality?.points ?? 0;
      const baseline = recompute(d.checks, { slop: realSlop, originality: realOrig });
      sites.push({ url, checks: d.checks, realScore: d.score, realGrade: d.grade, realSlop, realOrig, baseline });
      const drift = Math.abs(baseline.score - d.score);
      const flag = drift > 0.5 ? '  ⚠ DRIFT' : '';
      console.log(`[${i + 1}/${urls.length}] ${url}  api=${d.score} (${d.grade})  recomputed=${baseline.score}${flag}`);
    } catch (e) {
      console.log(`[${i + 1}/${urls.length}] ${url}  ERROR ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 300)); // polite to the API
  }

  function baselineScore(s) { return s.baseline.score; }

  // Run every knob against every site.
  const allKnobs = [...KNOBS, ...oatKnobs()];
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    contractVersion: 'v0.4.0',
    method: 'Real check statuses from live /api/score; composite recomputed locally under each perturbation, mirroring engine math.',
    sites: sites.length,
    knobs: allKnobs.length,
    perSite: [],
    leaderboard: {},
  };

  for (const s of sites) {
    const row = { url: s.url, baseline: s.baseline, realScore: s.realScore, realGrade: s.realGrade, knobs: {} };
    for (const k of allKnobs) {
      // Every perturbation inherits the site's REAL slop/originality values
      // (unless the knob itself perturbs them) so we measure the knob's
      // effect on the true baseline, not on a stripped-down one.
      const opts = {
        ...k.opts,
        slop: k.opts.slop ?? s.realSlop,
        originality: k.opts.originality ?? s.realOrig,
      };
      row.knobs[k.id] = recompute(s.checks, opts);
    }
    report.perSite.push(row);
  }

  // Leaderboard-level: grade stability + reshuffle under each knob.
  const lbReport = {};
  for (const k of allKnobs) {
    const grades = report.perSite.map((r) => ({ base: r.baseline.grade, pert: r.knobs[k.id].grade }));
    const gradeChanges = grades.filter((g) => g.base !== g.pert).length;
    const scoreDeltas = report.perSite.map((r) => Math.abs(r.knobs[k.id].score - r.baseline.score));
    const maxDelta = Math.max(...scoreDeltas, 0);
    const meanDelta = scoreDeltas.reduce((a, b) => a + b, 0) / (scoreDeltas.length || 1);
    // Ranking reshuffle: sort by baseline score vs perturbed score, count position changes
    const baseRank = [...report.perSite].sort((a, b) => b.baseline.score - a.baseline.score).map((r) => r.url);
    const pertRank = [...report.perSite].sort((a, b) => b.knobs[k.id].score - a.knobs[k.id].score).map((r) => r.url);
    const moved = baseRank.filter((u, i) => pertRank[i] !== u).length;
    lbReport[k.id] = {
      label: k.label,
      gradeChanges,
      maxScoreDelta: Math.round(maxDelta * 10) / 10,
      meanScoreDelta: Math.round(meanDelta * 100) / 100,
      rankPositionsMoved: moved,
    };
  }
  report.leaderboard = lbReport;

  // Most sensitive knobs (by grade changes, then max delta)
  report.mostSensitive = Object.entries(lbReport)
    .sort((a, b) => b[1].gradeChanges - a[1].gradeChanges || b[1].maxScoreDelta - a[1].maxScoreDelta)
    .slice(0, 8)
    .map(([id, v]) => ({ id, ...v }));

  // Write outputs
  const jsonPath = path.join(OUT_DIR, 'sensitivity-report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n[sensitivity] WROTE ${path.relative(process.cwd(), jsonPath)}`);

  const md = renderMarkdown(report);
  const mdPath = path.join(OUT_DIR, 'sensitivity-report.md');
  writeFileSync(mdPath, md);
  console.log(`[sensitivity] WROTE ${path.relative(process.cwd(), mdPath)}`);
}

function renderMarkdown(r) {
  const lines = [];
  lines.push(`# Designesy Score Sensitivity Analysis`);
  lines.push('');
  lines.push(`- Generated: ${r.generatedAt}`);
  lines.push(`- Base: ${r.base}`);
  lines.push(`- Contract: ${r.contractVersion}`);
  lines.push(`- Sites: ${r.sites} · Knobs: ${r.knobs}`);
  lines.push(`- Method: real check statuses from the live engine; composite recomputed locally under each perturbation (engine math mirrored exactly).`);
  lines.push('');
  lines.push(`## Leaderboard-level stability`);
  lines.push('');
  lines.push(`| Knob | Grade changes | Max Δscore | Mean Δscore | Rank positions moved |`);
  lines.push(`|---|---|---|---|---|`);
  for (const [id, v] of Object.entries(r.leaderboard)) {
    lines.push(`| ${v.label} | ${v.gradeChanges} | ${v.maxScoreDelta} | ${v.meanScoreDelta} | ${v.rankPositionsMoved} |`);
  }
  lines.push('');
  lines.push(`## Most sensitive knobs`);
  lines.push('');
  for (const k of r.mostSensitive) {
    lines.push(`- **${k.label}**: ${k.gradeChanges} grade changes, max Δ${k.maxScoreDelta} pts, ${k.rankPositionsMoved} rank positions moved`);
  }
  lines.push('');
  lines.push(`## Per-site detail`);
  lines.push('');
  lines.push(`| Site | Base | Grade | Score range across knobs | Grade range |`);
  lines.push(`|---|---|---|---|---|`);
  for (const s of r.perSite) {
    const scores = Object.values(s.knobs).map((k) => k.score);
    const grades = Object.values(s.knobs).map((k) => k.grade);
    const min = Math.min(...scores), max = Math.max(...scores);
    const gmin = [...new Set(grades)].sort()[0], gmax = [...new Set(grades)].sort().at(-1);
    lines.push(`| ${s.url} | ${s.baseline.score} | ${s.baseline.grade} | ${min}–${max} | ${gmin}–${gmax} |`);
  }
  lines.push('');
  return lines.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
