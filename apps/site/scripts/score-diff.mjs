#!/usr/bin/env node
/**
 * Score-diff tool — explicit score diff across contract versions.
 *
 * Answers the CI half of the OECD/JRC critique: "pin the contract version
 * and make upgrades produce an explicit score diff, so a methodology release
 * cannot become a surprise regression."
 *
 * Method (honest reconstruction, not a model):
 *   1. Score the target URL(s) through the live /api/score (v0.4.0 engine,
 *      24h-cached) and capture the REAL per-check statuses.
 *   2. Recompute the composite under the v0.3.0 methodology profile,
 *      reconstructed from the changelog (apps/site/app/changelog/page.tsx):
 *        - check set: v0.4.0 minus the v0.4.0 additions (v37 spec layer,
 *          v38-v41 copywriting)
 *        - weight table: v0.3.0 (no security/spec/copywriting rows; fallback 5)
 *        - no a11y floor (added v0.4.0)
 *        - no anti-slop deduction (added v0.4.0)
 *        - no originality lift (added v0.4.0)
 *   3. Report the explicit diff: score delta, grade delta, which checks are
 *      new in v0.4.0 and how each site fared on them.
 *
 * Output: score-diff-report.json + score-diff-report.md (same dir).
 *
 * Usage:
 *   node scripts/score-diff.mjs --url https://stripe.com
 *   node scripts/score-diff.mjs --all
 *   node scripts/score-diff.mjs --all --base https://www.designesy.org
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'https://www.designesy.org';
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ALL = process.argv.includes('--all');
const URL_ARG = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1];

// ── v0.4.0 engine constants (mirror of app/api/score/route.ts) ──────────────
const W_040 = {
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

// ── v0.3.0 methodology profile (reconstructed from changelog) ────────────────
// v0.4.0 changelog: "Engine expanded from 36 to 40 checks. Copywriting category
// added (4 checks). Accessibility floor enforced... Twelve anti-slop rules now
// subtract up to 20 points. Seven originality signals add up to 8 points."
// Weight-table comment: "v0.4.0 additions: copywriting 8, security 5, spec 4".
const V040_ADDED_CHECKS = new Set(['v37', 'v38', 'v39', 'v40', 'v41']);
const W_030 = {
  cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9,
  takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3,
};

function computeGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Recompute the composite from raw check statuses under a methodology profile.
 * @param {Array<{id:string, category:string, status:string}>} checks
 * @param {object} profile { weights, warnCredit, slop, originality, a11yFloorPct, a11yFloorCap, hardFailCaps, excludeChecks }
 */
function recompute(checks, profile) {
  const weights = profile.weights;
  const warnCredit = profile.warnCredit ?? WARN_CREDIT;
  const slop = profile.slop ?? 0;
  const originality = profile.originality ?? 0;
  const a11yFloorPct = profile.a11yFloorPct ?? A11Y_FLOOR_PCT;
  const a11yFloorCap = profile.a11yFloorCap ?? A11Y_FLOOR_CAP;
  const hardFailCaps = profile.hardFailCaps ?? HARD_FAIL_CAPS;
  const exclude = profile.excludeChecks ?? new Set();

  const scored = checks.filter((c) => !exclude.has(c.id) && c.status !== 'SKIP' && c.status !== 'MANUAL');
  const catCounts = {};
  for (const c of scored) catCounts[c.category] = (catCounts[c.category] || 0) + 1;

  let weightedPoints = 0;
  let weightedTotal = 0;
  for (const c of scored) {
    const catWeight = weights[c.category] ?? 5;
    const checkWeight = catWeight / (catCounts[c.category] || 1);
    weightedTotal += checkWeight;
    if (c.status === 'PASS') weightedPoints += checkWeight;
    else if (c.status === 'WARN') weightedPoints += checkWeight * warnCredit;
  }

  let score = weightedTotal === 0 ? 0 : Math.round((weightedPoints / weightedTotal) * 1000) / 10;

  if (slop > 0) score = Math.max(0, score - Math.min(slop, SLOP_CAP));
  if (originality > 0) score = Math.min(100, score + Math.min(originality, ORIGINALITY_CAP));

  if (a11yFloorPct != null) {
    const a11y = scored.filter((c) => c.category === 'accessibility');
    if (a11y.length > 0) {
      const pct = (a11y.filter((c) => c.status === 'PASS').length + a11y.filter((c) => c.status === 'WARN').length * warnCredit) / a11y.length * 100;
      if (pct < a11yFloorPct && score > a11yFloorCap) score = a11yFloorCap;
    }
  }

  for (const c of scored) {
    if (c.status !== 'FAIL') continue;
    const cap = hardFailCaps[c.id];
    if (cap != null && score > cap) score = cap;
  }

  return { score, grade: computeGrade(score) };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!ALL && !URL_ARG) {
    console.error('Usage: node scripts/score-diff.mjs --url <url> | --all [--base <url>]');
    process.exit(1);
  }

  let urls;
  if (ALL) {
    const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
    urls = lb.sites.map((s) => s.url);
    console.log(`[score-diff] ${urls.length} leaderboard sites`);
  } else {
    urls = [URL_ARG];
    console.log(`[score-diff] single URL: ${URL_ARG}`);
  }

  const rows = [];
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

      // v0.4.0: real engine score (includes slop/originality from the API)
      const v040 = { score: d.score, grade: d.grade };

      // v0.3.0: recompute excluding v0.4.0 additions, no floor/slop/originality
      const v030 = recompute(d.checks, {
        weights: W_030,
        excludeChecks: V040_ADDED_CHECKS,
        a11yFloorPct: null,
        slop: 0,
        originality: 0,
      });

      // New-in-v0.4.0 checks and their statuses for this site
      const newChecks = d.checks
        .filter((c) => V040_ADDED_CHECKS.has(c.id))
        .map((c) => ({ id: c.id, status: c.status, detail: c.detail?.slice(0, 80) }));

      const delta = Math.round((v040.score - v030.score) * 10) / 10;
      rows.push({ url, v030, v040, delta, newChecks });
      console.log(`[${i + 1}/${urls.length}] ${url}  v0.3.0=${v030.score}(${v030.grade})  v0.4.0=${v040.score}(${v040.grade})  Δ${delta}`);
    } catch (e) {
      rows.push({ url, error: e.message });
      console.log(`[${i + 1}/${urls.length}] ${url}  ERROR ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  const ok = rows.filter((r) => !r.error);
  const gradeUp = ok.filter((r) => r.delta > 0.05);
  const gradeDown = ok.filter((r) => r.delta < -0.05);
  const gradeFlips = ok.filter((r) => r.v030.grade !== r.v040.grade);

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    method: 'Live v0.4.0 check statuses; v0.3.0 profile reconstructed from changelog (excludes v37/v38-v41, no a11y floor, no slop, no originality, v0.3.0 weight table).',
    summary: {
      sites: ok.length,
      meanDelta: Math.round(ok.reduce((a, r) => a + r.delta, 0) / (ok.length || 1) * 100) / 100,
      maxUp: Math.max(...ok.map((r) => r.delta), 0),
      maxDown: Math.min(...ok.map((r) => r.delta), 0),
      gradeFlips: gradeFlips.length,
      gradeUp: gradeUp.length,
      gradeDown: gradeDown.length,
    },
    rows,
  };

  const jsonPath = path.join(OUT_DIR, 'score-diff-report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n[score-diff] WROTE ${path.relative(process.cwd(), jsonPath)}`);

  const md = renderMarkdown(report);
  const mdPath = path.join(OUT_DIR, 'score-diff-report.md');
  writeFileSync(mdPath, md);
  console.log(`[score-diff] WROTE ${path.relative(process.cwd(), mdPath)}`);
}

function renderMarkdown(r) {
  const lines = [];
  lines.push('# Designesy Score Diff — v0.3.0 → v0.4.0');
  lines.push('');
  lines.push(`- Generated: ${r.generatedAt}`);
  lines.push(`- Base: ${r.base}`);
  lines.push(`- Method: ${r.method}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- Sites: ${r.summary.sites}`);
  lines.push(`- Mean score delta: ${r.summary.meanDelta}`);
  lines.push(`- Max up: +${r.summary.maxUp} · Max down: ${r.summary.maxDown}`);
  lines.push(`- Grade flips: ${r.summary.gradeFlips} (${r.summary.gradeUp} up, ${r.summary.gradeDown} down)`);
  lines.push('');
  lines.push(`## Per-site diff`);
  lines.push('');
  lines.push(`| Site | v0.3.0 | v0.4.0 | Δ | Grade | New checks (v0.4.0) |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const row of r.rows) {
    if (row.error) {
      lines.push(`| ${row.url} | error: ${row.error} | | | | |`);
      continue;
    }
    const newChecks = row.newChecks.map((c) => `${c.id}:${c.status}`).join(', ') || '—';
    lines.push(`| ${row.url} | ${row.v030.score} (${row.v030.grade}) | ${row.v040.score} (${row.v040.grade}) | ${row.delta > 0 ? '+' : ''}${row.delta} | ${row.v030.grade}→${row.v040.grade} | ${newChecks} |`);
  }
  lines.push('');
  lines.push(`## What this means`);
  lines.push('');
  lines.push(`The v0.4.0 methodology release added 5 checks (v37 DESIGN.md spec layer, v38-v41 copywriting), the a11y floor, anti-slop deduction, and originality lift. A site's grade change between versions is the EXPLICIT score diff of that methodology release — not a surprise regression.`);
  lines.push('');
  return lines.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
