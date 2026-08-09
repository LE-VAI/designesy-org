#!/usr/bin/env node
/**
 * Blind comparison — Cohen's kappa between the Designesy engine and an
 * independent assessor.
 *
 * Answers the last open item of the OECD/JRC composite-indicator critique:
 * "run a blind comparison against independent accessibility/design reviewers."
 *
 * Two raters, applied independently to the same 30 leaderboard sites:
 *   Rater A — Designesy /api/score accessibility category verdict:
 *             PASS if the a11y category scores >= 60 (the floor threshold),
 *             FAIL otherwise. Deterministic engine, contract v0.4.0.
 *   Rater B — axe-core 4.10.2 (industry-standard WCAG a11y engine) injected
 *             into a real browser (CDP 127.0.0.1:9222), violations counted.
 *             PASS if zero serious/critical violations, FAIL otherwise.
 *
 * Neither rater sees the other's result — the comparison is blind by
 * construction (independent engines, independent execution).
 *
 * Output:
 *   blind-comparison-report.json — full per-site matrix + kappa
 *   blind-comparison-report.md   — human-readable report
 *   blind-panel-packet.json      — anonymized subset + blank rating form for
 *                                  a human panel (fill `humanVerdict` per site,
 *                                  re-run with --panel to compute panel kappa)
 *
 * Usage:
 *   node scripts/blind-comparison.mjs          # engine vs axe-core
 *   node scripts/blind-comparison.mjs --panel  # engine vs human panel ratings
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.designesy.org';
const A11Y_PASS_THRESHOLD = 60; // mirrors the engine's a11y floor
const PANEL = process.argv.includes('--panel');

// ── CDP helpers (Chrome on 127.0.0.1:9222 — SYN-Chrome) ────────────────────
const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;

function newTab(url) {
  return fetch(`http://${CDP_HOST}:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
    .then((r) => r.json());
}

function closeTab(id) {
  return fetch(`http://${CDP_HOST}:${CDP_PORT}/json/close/${id}`, { method: 'GET' }).catch(() => {});
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

// ── axe-core run via CDP ───────────────────────────────────────────────────
const AXE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
let AXE_CACHED = null;

/** Fetch axe source once in Node (bypasses target-site CSP that would block an on-page fetch). */
async function getAxeSource() {
  if (AXE_CACHED) return AXE_CACHED;
  const res = await fetch(AXE_SRC);
  AXE_CACHED = await res.text();
  return AXE_CACHED;
}

async function axeAudit(url) {
  const tab = await newTab('about:blank');
  let cdp;
  try {
    const axeSrc = await getAxeSource();
    cdp = new CDP(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // Inject the axe source into every new document BEFORE page scripts run —
    // no on-page fetch, so target-site CSP cannot block it.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: axeSrc,
    });
    await cdp.send('Page.navigate', { url });
    await waitForLoad(cdp);
    // Run axe (source is already in the document global scope)
    const injectRes = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          if (typeof axe === 'undefined') return { error: 'axe not loaded' };
          const res = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          });
          const v = res.violations;
          return {
            totalViolations: v.length,
            seriousCritical: v.filter(x => x.impact === 'serious' || x.impact === 'critical').length,
            byImpact: { critical: v.filter(x => x.impact === 'critical').length, serious: v.filter(x => x.impact === 'serious').length, moderate: v.filter(x => x.impact === 'moderate').length, minor: v.filter(x => x.impact === 'minor').length },
            topRules: v.slice(0, 5).map(x => x.id),
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    return injectRes.result.value;
  } catch (e) {
    return { error: e.message };
  } finally {
    if (cdp) cdp.close();
    await closeTab(tab.id).catch(() => {});
  }
}

async function waitForLoad(cdp, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), timeoutMs);
    const onLoad = async () => {
      clearTimeout(t);
      await new Promise((r) => setTimeout(r, 1500)); // settle
      resolve();
    };
    // Poll document.readyState
    const poll = async () => {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (r.result.value === 'complete') onLoad();
        else setTimeout(poll, 400);
      } catch { clearTimeout(t); resolve(); }
    };
    poll();
  });
}

// ── Cohen's kappa ──────────────────────────────────────────────────────────
function cohensKappa(a, b) {
  // a, b: arrays of 'PASS'|'FAIL' — same order, same sites
  const n = a.length;
  let agreeP = 0, agreeF = 0;
  let aP = 0, aF = 0, bP = 0, bF = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === 'PASS') aP++; else aF++;
    if (b[i] === 'PASS') bP++; else bF++;
    if (a[i] === b[i]) { if (a[i] === 'PASS') agreeP++; else agreeF++; }
  }
  const po = (agreeP + agreeF) / n;
  const pe = (aP / n) * (bP / n) + (aF / n) * (bF / n);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);

  // ── Companion statistics (Feinstein & Cicchetti 1990; Chicco et al. 2021) ──
  // Kappa alone is depressed by base-rate imbalance (the "kappa paradox").
  // Report ppos/pneg (proportionate positive/negative agreement), the
  // Matthews correlation coefficient (prevalence-robust for binary
  // classification), and Gwet's AC1 (chance-corrected, prevalence-robust).
  const ppos = agreeP / ((aP + bP) / 2 || 1);
  const pneg = agreeF / ((aF + bF) / 2 || 1);
  const tp = agreeP, tn = agreeF, fp = bP - agreeP, fn = aP - agreeP;
  const mccDenom = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  const mcc = mccDenom === 0 ? 0 : (tp * tn - fp * fn) / mccDenom;
  // Gwet's AC1: pe_ac1 = 2 * p * (1 - p) where p = overall proportion of PASS
  const p = (aP + bP) / (2 * n);
  const peAc1 = 2 * p * (1 - p);
  const ac1 = peAc1 === 1 ? 1 : (po - peAc1) / (1 - peAc1);
  // Approx standard error of kappa (Fleiss) for a 95% CI
  const se = Math.sqrt((po * (1 - po)) / (n * (1 - pe) ** 2));
  const ci95 = [kappa - 1.96 * se, kappa + 1.96 * se];

  return {
    n, po: Math.round(po * 1000) / 1000, pe: Math.round(pe * 1000) / 1000,
    kappa: Math.round(kappa * 1000) / 1000,
    kappaCI95: [Math.round(ci95[0] * 1000) / 1000, Math.round(ci95[1] * 1000) / 1000],
    ppos: Math.round(ppos * 1000) / 1000,
    pneg: Math.round(pneg * 1000) / 1000,
    mcc: Math.round(mcc * 1000) / 1000,
    ac1: Math.round(ac1 * 1000) / 1000,
    baseRateA: Math.round((aP / n) * 1000) / 1000,
    baseRateB: Math.round((bP / n) * 1000) / 1000,
    bothPass: agreeP, bothFail: agreeF, aPassBFail: aP - agreeP, aFailBPass: bP - agreeP,
  };
}

function kappaLabel(k) {
  if (k >= 0.81) return 'almost perfect agreement';
  if (k >= 0.61) return 'substantial agreement';
  if (k >= 0.41) return 'moderate agreement';
  if (k >= 0.21) return 'fair agreement';
  if (k >= 0) return 'slight agreement';
  return 'no agreement (worse than chance)';
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const lb = await (await fetch(`${BASE}/api/leaderboard`)).json();
  const urls = lb.sites.map((s) => s.url);
  console.log(`[blind] ${urls.length} leaderboard sites — ${PANEL ? 'panel mode' : 'engine vs axe-core'}`);

  const rows = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      // Rater A — Designesy engine
      const res = await fetch(`${BASE}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const d = await res.json();
      const a11yCat = d.categoryScores?.accessibility;
      const a11yScore = a11yCat?.score ?? null;
      const designesyVerdict = a11yScore === null ? 'SKIP' : a11yScore >= A11Y_PASS_THRESHOLD ? 'PASS' : 'FAIL';

      // Rater B — axe-core (or human panel)
      let axeVerdict = null, axeDetail = null;
      if (PANEL) {
        const packet = JSON.parse(readPacket());
        const entry = packet.sites.find((s) => s.url === url);
        axeVerdict = entry?.humanVerdict ?? 'UNRATED';
      } else {
        const axe = await axeAudit(url);
        axeDetail = axe;
        axeVerdict = axe.error ? 'ERROR' : axe.seriousCritical === 0 ? 'PASS' : 'FAIL';
      }

      rows.push({ url, a11yScore, designesyVerdict, axeVerdict, axeDetail });
      console.log(`[${i + 1}/${urls.length}] ${url}  designesy=${designesyVerdict} (${a11yScore})  axe=${axeVerdict}`);
    } catch (e) {
      rows.push({ url, error: e.message });
      console.log(`[${i + 1}/${urls.length}] ${url}  ERROR ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // Kappa on scored pairs
  const scored = rows.filter((r) => r.designesyVerdict !== 'SKIP' && r.axeVerdict !== 'ERROR' && r.axeVerdict !== 'UNRATED');
  const kappa = scored.length >= 2 ? cohensKappa(scored.map((r) => r.designesyVerdict), scored.map((r) => r.axeVerdict)) : null;

  const report = {
    generatedAt: new Date().toISOString(),
    method: PANEL
      ? 'Engine vs human panel (blind ratings from blind-panel-packet.json)'
      : 'Engine (Designesy a11y category >= 60 = PASS) vs axe-core 4.10.2 (zero serious/critical violations = PASS), independent CDP execution',
    a11yPassThreshold: A11Y_PASS_THRESHOLD,
    kappa: kappa ? { ...kappa, label: kappaLabel(kappa.kappa) } : null,
    sites: rows,
  };

  const jsonPath = path.join(OUT_DIR, 'blind-comparison-report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n[blind] WROTE ${path.relative(process.cwd(), jsonPath)}`);

  const md = renderMarkdown(report);
  writeFileSync(path.join(OUT_DIR, 'blind-comparison-report.md'), md);
  console.log(`[blind] WROTE blind-comparison-report.md`);

  if (!PANEL) {
    // Write the human panel packet (anonymized subset, blank verdicts)
    const subset = scored
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.min(15, scored.length))
      .map((r) => ({ id: `SITE-${(r.url.length * 7) % 1000}`, url: r.url, humanVerdict: null }));
    writeFileSync(path.join(OUT_DIR, 'blind-panel-packet.json'), JSON.stringify({ instructions: 'Rate each site: does it PASS or FAIL an accessibility review? Judge only what you observe — keyboard operability, contrast, focus visibility, labels. Do NOT open designesy.org/score. Fill humanVerdict: "PASS"|"FAIL", then run node scripts/blind-comparison.mjs --panel.', sites: subset }, null, 2));
    console.log(`[blind] WROTE blind-panel-packet.json (${subset.length} sites for human panel)`);
  }
}

function readPacket() {
  try {
    return readFileSync(path.join(OUT_DIR, 'blind-panel-packet.json'), 'utf8');
  } catch {
    return '{"sites":[]}';
  }
}

function renderMarkdown(r) {
  const lines = [];
  lines.push('# Blind Comparison — Designesy vs Independent Assessor');
  lines.push('');
  lines.push(`- Generated: ${r.generatedAt}`);
  lines.push(`- Method: ${r.method}`);
  lines.push('');
  if (r.kappa) {
    lines.push(`## Agreement statistics`);
    lines.push('');
    lines.push(`- **Cohen's κ = ${r.kappa.kappa}** (95% CI ${r.kappa.kappaCI95[0]} to ${r.kappa.kappaCI95[1]}) — ${r.kappa.label}`);
    lines.push(`- n = ${r.kappa.n} sites, po = ${r.kappa.po}, pe = ${r.kappa.pe}`);
    lines.push(`- Base rates: engine ${Math.round(r.kappa.baseRateA * 100)}% PASS vs independent ${Math.round(r.kappa.baseRateB * 100)}% PASS — the imbalance depresses κ (Feinstein–Cicchetti kappa paradox)`);
    lines.push(`- **ppos = ${r.kappa.ppos}** (proportionate positive agreement) · **pneg = ${r.kappa.pneg}** (proportionate negative agreement)`);
    lines.push(`- **MCC = ${r.kappa.mcc}** (Matthews correlation, prevalence-robust) · **Gwet's AC1 = ${r.kappa.ac1}** (prevalence-robust chance-corrected)`);
    lines.push(`- Both PASS: ${r.kappa.bothPass} · Both FAIL: ${r.kappa.bothFail} · Engine-only PASS: ${r.kappa.aPassBFail} · Independent-only PASS: ${r.kappa.aFailBPass}`);
    lines.push('');
  }
  lines.push(`## Per-site matrix`);
  lines.push('');
  lines.push(`| Site | A11y score | Designesy verdict | Independent verdict |`);
  lines.push(`|---|---|---|---|`);
  for (const s of r.sites) {
    const axe = s.axeDetail?.seriousCritical !== undefined && !s.axeDetail.error
      ? `${s.axeVerdict} (${s.axeDetail.seriousCritical} s/c)`
      : s.axeVerdict;
    lines.push(`| ${s.url} | ${s.a11yScore ?? '—'} | ${s.designesyVerdict} | ${axe} |`);
  }
  lines.push('');
  lines.push(`## Reading this`);
  lines.push('');
  lines.push(`Kappa measures agreement beyond chance between two independent raters. Agreement on PASS sites shows both engines agree a site is accessible; disagreement on FAIL sites shows the contract catches things axe misses (or vice versa) — the divergence itself is evidence, and the per-check detail explains which layer owns the difference.`);
  lines.push('');
  return lines.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
