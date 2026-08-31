// /api/report — Designesy Unified Design-Intelligence Report
//
// The synthesis capstone — fetch one URL, fire /api/score + /api/drift +
// /api/readiness in parallel, and produce a unified report with a single
// composite grade. One input, one output, one grade.
//
// Composite: score × 0.5 + drift × 0.3 + readiness × 0.2
//
// Contract: /contracts/report.json (designesy.report v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl } from '../../lib/url-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Report fires 3 internal API calls, each of which fetches the target URL.
// The effective external fetch is 3× — so the rate limit is tighter than
// the individual engines to account for the amplified fetch surface.

const RATE_LIMIT = 20; // requests per hour per IP (tighter — 3× fetch amplification)
const RATE_WINDOW = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = hits.get(ip) || [];
  const recent = arr.filter((t) => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckResult = {
  id: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
  detail: string;
  category?: string;
};

type SubEngineResult = {
  ok: boolean;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  manual?: number;
  total?: number;
  checks?: CheckResult[];
  error?: string;
};

type ReportResponse = {
  ok: boolean;
  url?: string;
  compositeScore?: number;
  compositeGrade?: string;
  score?: SubEngineResult;
  drift?: SubEngineResult;
  readiness?: SubEngineResult;
  totalChecks?: number;
  totalPass?: number;
  totalWarn?: number;
  totalFail?: number;
  totalSkip?: number;
  totalManual?: number;
  checks?: Array<CheckResult & { engine: string }>;
  synthesis?: CheckResult[];
  error?: string;
};

// ── Grade helper ──────────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.designesy.org';

async function runReportUncached(targetUrl: string): Promise<ReportResponse> {
  // rp01: URL validated — already passed by the POST handler, mark PASS
  const synthesis: CheckResult[] = [
    {
      id: 'rp01',
      item: 'Target URL fetched and validated',
      status: 'PASS',
      detail: `URL accepted: ${targetUrl}`,
    },
  ];

  // Fire all three engines in parallel
  const [scoreResp, driftResp, readinessResp] = await Promise.allSettled([
    fetch(new URL('/api/score', BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    }),
    fetch(new URL('/api/drift', BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    }),
    fetch(new URL('/api/readiness', BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    }),
  ]);

  // Parse results — each may be fulfilled (got a response) or rejected (network error)
  let scoreResult: SubEngineResult | null = null;
  let driftResult: SubEngineResult | null = null;
  let readinessResult: SubEngineResult | null = null;

  // Score engine
  if (scoreResp.status === 'fulfilled') {
    try {
      scoreResult = await scoreResp.value.json();
    } catch {
      scoreResult = { ok: false, error: 'Score engine returned invalid JSON' };
    }
  } else {
    scoreResult = { ok: false, error: 'Score engine network error' };
  }

  // Drift engine
  if (driftResp.status === 'fulfilled') {
    try {
      driftResult = await driftResp.value.json();
    } catch {
      driftResult = { ok: false, error: 'Drift engine returned invalid JSON' };
    }
  } else {
    driftResult = { ok: false, error: 'Drift engine network error' };
  }

  // Readiness engine
  if (readinessResp.status === 'fulfilled') {
    try {
      readinessResult = await readinessResp.value.json();
    } catch {
      readinessResult = { ok: false, error: 'Readiness engine returned invalid JSON' };
    }
  } else {
    readinessResult = { ok: false, error: 'Readiness engine network error' };
  }

  // rp02: Score engine completed
  if (scoreResult?.ok && typeof scoreResult.score === 'number') {
    const hasManual = (scoreResult.manual || 0) > 0;
    const hasSkips = (scoreResult.total || 0) - (scoreResult.pass || 0) - (scoreResult.warn || 0) - (scoreResult.fail || 0) - (scoreResult.manual || 0) > 0;
    const hasUnscored = hasManual || hasSkips;
    synthesis.push({
      id: 'rp02',
      item: 'Score engine completed — 42-check audit ran',
      status: hasUnscored ? 'WARN' : 'PASS',
      detail: `Score engine returned ${scoreResult.grade}/${scoreResult.score} (${scoreResult.pass} pass, ${scoreResult.warn} warn, ${scoreResult.fail} fail${hasManual ? `, ${scoreResult.manual} manual` : ''}${hasSkips ? `, some N/A` : ''})`,
    });
  } else {
    synthesis.push({
      id: 'rp02',
      item: 'Score engine completed — 42-check audit ran',
      status: 'FAIL',
      detail: scoreResult?.error || 'Score engine did not return a valid result',
    });
  }

  // rp03: Drift engine completed
  if (driftResult?.ok && typeof driftResult.score === 'number') {
    synthesis.push({
      id: 'rp03',
      item: 'Drift engine completed — 12-check drift radar ran',
      status: 'PASS',
      detail: `Drift engine returned ${driftResult.grade}/${driftResult.score} (${driftResult.pass} pass, ${driftResult.warn} warn, ${driftResult.fail} fail)`,
    });
  } else {
    synthesis.push({
      id: 'rp03',
      item: 'Drift engine completed — 12-check drift radar ran',
      status: 'FAIL',
      detail: driftResult?.error || 'Drift engine did not return a valid result',
    });
  }

  // rp04: Readiness engine completed
  if (readinessResult?.ok && typeof readinessResult.score === 'number') {
    synthesis.push({
      id: 'rp04',
      item: 'Readiness engine completed — 10-check readiness probe ran',
      status: 'PASS',
      detail: `Readiness engine returned ${readinessResult.grade}/${readinessResult.score} (${readinessResult.pass} pass, ${readinessResult.warn} warn, ${readinessResult.fail} fail)`,
    });
  } else {
    synthesis.push({
      id: 'rp04',
      item: 'Readiness engine completed — 10-check readiness probe ran',
      status: 'FAIL',
      detail: readinessResult?.error || 'Readiness engine did not return a valid result',
    });
  }

  // Compute composite score
  const scoreScore = scoreResult?.ok && typeof scoreResult.score === 'number' ? scoreResult.score : null;
  const driftScore = driftResult?.ok && typeof driftResult.score === 'number' ? driftResult.score : null;
  const readinessScore = readinessResult?.ok && typeof readinessResult.score === 'number' ? readinessResult.score : null;

  const validScores = [scoreScore, driftScore, readinessScore].filter((s): s is number => s !== null);

  // rp05: Composite score computed
  let compositeScore: number | null = null;
  if (scoreScore !== null && driftScore !== null && readinessScore !== null) {
    // Full composite — all three engines returned scores
    compositeScore = Math.round(scoreScore * 0.5 + driftScore * 0.3 + readinessScore * 0.2);
    synthesis.push({
      id: 'rp05',
      item: 'Composite score computed — weighted synthesis',
      status: 'PASS',
      detail: `Composite ${compositeScore}/100 = score(${scoreScore})×0.5 + drift(${driftScore})×0.3 + readiness(${readinessScore})×0.2`,
    });
  } else if (validScores.length > 0) {
    // Partial composite — some engines failed, compute from what we have
    // Re-weight: if score is missing, use drift 0.6 / readiness 0.4; if drift missing, score 0.7 / readiness 0.3; if readiness missing, score 0.6 / drift 0.4
    if (scoreScore !== null && driftScore !== null && readinessScore === null) {
      compositeScore = Math.round(scoreScore * 0.6 + driftScore * 0.4);
    } else if (scoreScore !== null && driftScore === null && readinessScore !== null) {
      compositeScore = Math.round(scoreScore * 0.7 + readinessScore * 0.3);
    } else if (scoreScore === null && driftScore !== null && readinessScore !== null) {
      compositeScore = Math.round(driftScore * 0.6 + readinessScore * 0.4);
    } else if (scoreScore !== null) {
      compositeScore = scoreScore;
    } else if (driftScore !== null) {
      compositeScore = driftScore;
    } else {
      compositeScore = readinessScore;
    }
    synthesis.push({
      id: 'rp05',
      item: 'Composite score computed — weighted synthesis',
      status: 'WARN',
      detail: `Composite ${compositeScore}/100 computed from partial results (${validScores.length}/3 engines returned scores) — re-weighted to compensate`,
    });
  } else {
    synthesis.push({
      id: 'rp05',
      item: 'Composite score computed — weighted synthesis',
      status: 'FAIL',
      detail: 'No sub-engine returned a score — composite cannot be computed',
    });
  }

  // rp06: Composite grade derived
  if (compositeScore !== null) {
    synthesis.push({
      id: 'rp06',
      item: 'Composite grade derived',
      status: 'PASS',
      detail: `Composite grade ${computeGrade(compositeScore)} from composite score ${compositeScore}/100`,
    });
  } else {
    synthesis.push({
      id: 'rp06',
      item: 'Composite grade derived',
      status: 'FAIL',
      detail: 'Composite score missing — cannot derive grade',
    });
  }

  // rp07: Check inventory aggregated
  const allChecks: Array<CheckResult & { engine: string }> = [];
  let totalPass = 0;
  let totalWarn = 0;
  let totalFail = 0;
  let totalSkip = 0;
  let totalManual = 0;

  for (const check of scoreResult?.checks || []) {
    allChecks.push({ ...check, engine: 'score' });
    if (check.status === 'PASS') totalPass++;
    else if (check.status === 'WARN') totalWarn++;
    else if (check.status === 'FAIL') totalFail++;
    else if (check.status === 'MANUAL') totalManual++;
    else if (check.status === 'SKIP') totalSkip++;
  }
  for (const check of driftResult?.checks || []) {
    allChecks.push({ ...check, engine: 'drift' });
    if (check.status === 'PASS') totalPass++;
    else if (check.status === 'WARN') totalWarn++;
    else if (check.status === 'FAIL') totalFail++;
    else if (check.status === 'MANUAL') totalManual++;
    else if (check.status === 'SKIP') totalSkip++;
  }
  for (const check of readinessResult?.checks || []) {
    allChecks.push({ ...check, engine: 'readiness' });
    if (check.status === 'PASS') totalPass++;
    else if (check.status === 'WARN') totalWarn++;
    else if (check.status === 'FAIL') totalFail++;
    else if (check.status === 'MANUAL') totalManual++;
    else if (check.status === 'SKIP') totalSkip++;
  }

  if (allChecks.length > 0) {
    synthesis.push({
      id: 'rp07',
      item: 'Check inventory aggregated — all checks across engines collected',
      status: 'PASS',
      detail: `${allChecks.length} checks aggregated (score: ${scoreResult?.checks?.length || 0}, drift: ${driftResult?.checks?.length || 0}, readiness: ${readinessResult?.checks?.length || 0}) — ${totalPass} pass, ${totalWarn} warn, ${totalFail} fail, ${totalManual} manual, ${totalSkip} N/A`,
    });
  } else {
    synthesis.push({
      id: 'rp07',
      item: 'Check inventory aggregated — all checks across engines collected',
      status: 'FAIL',
      detail: 'No checks returned from any engine — engine results are malformed',
    });
  }

  // rp08: Report coherence — no engine contradicts the composite
  if (compositeScore !== null && validScores.length > 0) {
    const maxDivergence = Math.max(...validScores.map((s) => Math.abs(s - compositeScore)));
    if (maxDivergence > 30) {
      synthesis.push({
        id: 'rp08',
        item: 'Report is coherent — no engine contradicts the composite',
        status: 'FAIL',
        detail: `Max divergence ${maxDivergence} points — one or more engine scores are more than 30 points from the composite (${compositeScore}). The grade is not defensible.`,
      });
    } else if (maxDivergence > 20) {
      synthesis.push({
        id: 'rp08',
        item: 'Report is coherent — no engine contradicts the composite',
        status: 'WARN',
        detail: `Max divergence ${maxDivergence} points — one engine score is 20–30 points from the composite (${compositeScore}). The grade is borderline.`,
      });
    } else {
      synthesis.push({
        id: 'rp08',
        item: 'Report is coherent — no engine contradicts the composite',
        status: 'PASS',
        detail: `Max divergence ${maxDivergence} points — all engine scores are within 20 points of the composite (${compositeScore}). The grade is defensible.`,
      });
    }
  } else {
    synthesis.push({
      id: 'rp08',
      item: 'Report is coherent — no engine contradicts the composite',
      status: 'FAIL',
      detail: 'Composite score or sub-scores missing — cannot assess coherence',
    });
  }

  // If no engine succeeded at all, return error
  if (!scoreResult?.ok && !driftResult?.ok && !readinessResult?.ok) {
    return {
      ok: false,
      url: targetUrl,
      error: 'All three engines failed — could not generate a report. Check that the URL is correct and publicly accessible.',
      synthesis,
    };
  }

  return {
    ok: true,
    url: targetUrl,
    compositeScore: compositeScore ?? undefined,
    compositeGrade: compositeScore !== null ? computeGrade(compositeScore) : undefined,
    score: scoreResult ?? undefined,
    drift: driftResult ?? undefined,
    readiness: readinessResult ?? undefined,
    totalChecks: allChecks.length,
    totalPass,
    totalWarn,
    totalFail,
    totalSkip,
    totalManual,
    checks: allChecks,
    synthesis,
  };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const REPORT_TTL = 60 * 60 * 24; // 24h

const runReport = unstable_cache(runReportUncached, ['designesy-report'], {
  revalidate: REPORT_TTL,
  tags: ['report'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 20 report scans per hour (report fires 3 engines per scan).' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const targetUrl = normalizeInputUrl(body.url || '');
  if (!isValidUrl(targetUrl)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Provide a public http(s) URL.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const result = await runReport(targetUrl);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}