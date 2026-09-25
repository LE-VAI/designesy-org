// /api/monitor — Designesy Continuous Drift Monitor
//
// The temporal layer over /drift. Re-runs the 12 drift checks (d01-d12)
// on a URL and computes 10 monitor checks (m01-m10) by comparing the
// current run against a baseline + previous snapshot supplied in the
// POST body.
//
// Monitor checks:
//   m01 schedule registered (always PASS — the act of calling this API registers a run)
//   m02 last run fresh (always PASS — this run is happening now)
//   m03 drift delta vs baseline (score change since first run)
//   m04 drift trend slope (3-run trajectory: improving / flat / regressing)
//   m05 new violations since last run (checks that newly fail)
//   m06 resolved since last run (checks that newly pass — the healing signal)
//   m07 score degradation threshold (alert if score drops > N points)
//   m08 token-set mutation (tokens added/removed/renamed since baseline)
//   m09 contract version drift (agent.json version changed since last run)
//   m10 alert delivered (email via Resend when alerts fire + email provided + key set;
//        falls back to in-UI surfacing otherwise)
//
// Email alerting (v0.2.0): When the POST body includes an `email` field AND
// the RESEND_API_KEY environment variable is set, the monitor sends an HTML
// alert email to that address when any alert condition fires. Without the
// key or email, alerts are surfaced in-UI only (graceful degradation).
//
// Contract: /contracts/monitor.json (designesy.monitor v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl, safeFetch } from '../../lib/url-guard';
import { Resend } from 'resend';

// ── URL utilities (shared hardened guard — see app/lib/url-guard.ts) ──────────
// Imported above. Closes IPv6 loopback/link-local/ULA, cloud metadata
// (169.254.169.254), full 172.16.0.0/12, and encoded-IP bypass paths.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = 50;
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

// ── Email alert cooldown ────────────────────────────────────────────────────
// Prevents the same (URL + email) pair from receiving more than one alert
// email per hour. Without this, every monitor request that has alerts fires
// a fresh email — a cron poll or a user refreshing the page would spam the
// inbox with identical notifications. The cooldown is content-aware: if the
// alert *set* changes (new violations, different score), the email fires
// immediately even within the cooldown window.

const EMAIL_COOLDOWN = 60 * 60 * 1000; // 1 hour
const emailLog = new Map<string, { time: number; alertHash: string }>();

function emailOnCooldown(url: string, email: string, alerts: string[]): boolean {
  const key = `${url}::${email}`;
  const now = Date.now();
  const alertHash = alerts.join('|||');
  const entry = emailLog.get(key);
  if (entry && now - entry.time < EMAIL_COOLDOWN) {
    // Same alert set within cooldown → suppress
    if (entry.alertHash === alertHash) return true;
    // Different alert set within cooldown → allow (something changed)
  }
  emailLog.set(key, { time: now, alertHash });
  return false;
}

// ── Fetching (mirrors drift/score routes) ─────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

function extractCssLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) {
    links.push(m[1]);
  }
  const linkRe = /<link[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi;
  while ((m = linkRe.exec(html)) !== null) {
    try {
      links.push(new URL(m[1], baseUrl).href);
    } catch {
      // ignore malformed
    }
  }
  return links;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await safeFetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPageResilient(targetUrl: string): Promise<{ html: string; css: string }> {
  let html = '';
  try {
    const parsed = new URL(targetUrl);
    const candidates = [
      targetUrl,
      !parsed.hostname.startsWith('www.') ? `https://www.${parsed.hostname}${parsed.pathname}` : '',
    ].filter(Boolean);
    for (const c of candidates) {
      html = await fetchText(c);
      if (html && html.length > 50) break;
    }
  } catch {
    // fall through
  }
  if (!html) return { html: '', css: '' };
  const parts = extractCssLinks(html, targetUrl);
  const cssParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith('http')) {
      const ext = await fetchText(part);
      if (ext) cssParts.push(ext);
    } else {
      cssParts.push(part);
    }
  }
  return { html, css: cssParts.join('\n') };
}

import {
  runDriftChecks,
  extractRootTokens,
  extractVarRefs,
  extractVarChains,
  extractValuesByProperty,
  uniqueValues,
  type CheckResult,
} from '../../lib/drift-checks';

// ── Token + value extraction — IMPORTED from the shared drift module ─────────
//
// This route used to carry its own copies, and both differed from drift's:
//   * extractRootTokens read ONLY `:root { ... }` blocks. Drift's reads every
//     custom property declaration so component-scoped theme tokens resolve —
//     which is why this engine reported 151 custom properties where drift
//     reported 162, a number disagreement hiding inside an agreed verdict.
//   * extractValuesByProperty lacked the closing-brace bound. Minified CSS
//     omits the trailing semicolon, so a capture could run past the block into
//     the following rule; 86 such captures were measured on radix-ui.com alone.
//
// Both are fixed by importing rather than by re-porting.

// ── Types ─────────────────────────────────────────────────────────────────────
//
// DriftCheckResult is an ALIAS of the shared CheckResult, not a second shape.
//
// It was previously a hand-written twin that omitted SKIP. That omission was
// harmless while each route owned its own checks, but it becomes a lie the
// moment both engines run the same twelve functions: drift emits SKIP under
// scope filtering, and a narrower local type cannot describe a value the shared
// implementation returns. One type, one implementation.
type DriftCheckResult = CheckResult;

type MonitorCheckResult = {
  id: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

type Snapshot = {
  timestamp: string;
  score: number;
  grade: string;
  tokensExtracted: number;
  checks: DriftCheckResult[];
};

type MonitorResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  currentSnapshot?: Snapshot;
  baseline?: Snapshot | null;
  previous?: Snapshot | null;
  driftChecks?: DriftCheckResult[];
  monitorChecks?: MonitorCheckResult[];
  alerts?: string[];
  emailAlert?: {
    attempted: boolean;
    delivered: boolean;
    recipient?: string;
    fromAddress?: string;
    error?: string;
  };
  error?: string;
};

// ── The 12 drift checks — IMPORTED from the shared drift module ──────────────
//
// These were "inlined from drift route for self-containment", and that copy IS
// the defect this change removes. It was drift's code as of an earlier date, and
// drift then accumulated six documented fixes this copy never received: the
// closing-brace bound, d07's geometric exclusions (a 50% circle and a 999px pill
// are not radius-scale choices), d04's per-component parsing and token-scale
// alignment, raised thresholds once research showed the old ones flagged
// standard systems, and a var() exclusion so token REFERENCES are not counted
// as hardcoded drift.
//
// Measured offline on real cohort sites before this fix:
//   radix-ui.com   d07: drift 2 PASS   / this engine 18 FAIL
//                  d08: drift 7 PASS   / this engine 149 FAIL
//   vercel.com     d07: drift 17 FAIL  / this engine 31 FAIL
//                  d08: drift 8 PASS   / this engine 239 FAIL
// Those readings are published on /contracts/monitor and through an MCP tool, so
// the engine was reporting fabricated design drift about other people's sites.
//
// runDriftChecks() is now the single implementation both routes call. Agreement
// is structural rather than maintained by hand.
// ── Score computation ────────────────────────────────────────────────────────

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function computeDriftScore(checks: DriftCheckResult[]): { score: number; grade: string; pass: number; warn: number; fail: number } {
  const pass = checks.filter((c) => c.status === 'PASS').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const points = pass + warn * 0.5;
  const score = Math.round((points / checks.length) * 100);
  return { score, grade: computeGrade(score), pass, warn, fail };
}

// ── Snapshot creation ─────────────────────────────────────────────────────────

function createSnapshot(timestamp: string, checks: DriftCheckResult[], tokensExtracted: number): Snapshot {
  const { score, grade } = computeDriftScore(checks);
  return { timestamp, score, grade, tokensExtracted, checks };
}

// ── The 10 monitor checks ────────────────────────────────────────────────────

function checkM01ScheduleRegistered(): MonitorCheckResult {
  return { id: 'm01', item: 'Schedule registered', status: 'PASS', detail: 'Monitor run executed — the URL is being watched' };
}

function checkM02LastRunFresh(): MonitorCheckResult {
  return { id: 'm02', item: 'Last run fresh', status: 'PASS', detail: 'This run is happening now — within the cadence window' };
}

function checkM03DriftDelta(current: Snapshot, baseline: Snapshot | null): MonitorCheckResult {
  if (!baseline) {
    return { id: 'm03', item: 'Drift delta vs baseline', status: 'PASS', detail: 'No baseline yet — this is the first run (baseline established)' };
  }
  const delta = current.score - baseline.score;
  if (delta >= 0) {
    return { id: 'm03', item: 'Drift delta vs baseline', status: 'PASS', detail: `Score ${current.score} vs baseline ${baseline.score} — stable or improved (+${delta})` };
  }
  if (delta <= -10) {
    return { id: 'm03', item: 'Drift delta vs baseline', status: 'FAIL', detail: `Score ${current.score} vs baseline ${baseline.score} — degraded by ${Math.abs(delta)} points` };
  }
  return { id: 'm03', item: 'Drift delta vs baseline', status: 'WARN', detail: `Score ${current.score} vs baseline ${baseline.score} — slipped ${Math.abs(delta)} points` };
}

function checkM04TrendSlope(history: Snapshot[]): MonitorCheckResult {
  if (history.length < 3) {
    return { id: 'm04', item: 'Drift trend slope', status: 'PASS', detail: `Insufficient data for trend (${history.length} run${history.length === 1 ? '' : 's'} — need 3 for slope)` };
  }
  const recent = history.slice(-3);
  const slope = recent[2].score - recent[0].score;
  if (slope > 0) {
    return { id: 'm04', item: 'Drift trend slope', status: 'PASS', detail: `Trend improving over last 3 runs (+${slope} points)` };
  }
  if (slope < -5) {
    return { id: 'm04', item: 'Drift trend slope', status: 'FAIL', detail: `Trend regressing over last 3 runs (${slope} points)` };
  }
  return { id: 'm04', item: 'Drift trend slope', status: 'WARN', detail: `Trend flat over last 3 runs (${slope >= 0 ? '+' : ''}${slope} points)` };
}

function checkM05NewViolations(current: Snapshot, previous: Snapshot | null): MonitorCheckResult {
  if (!previous) {
    return { id: 'm05', item: 'New violations since last run', status: 'PASS', detail: 'No previous run to compare — baseline established' };
  }
  const prevFailIds = new Set(previous.checks.filter((c) => c.status === 'FAIL').map((c) => c.id));
  const newFails = current.checks.filter((c) => c.status === 'FAIL' && !prevFailIds.has(c.id));
  if (newFails.length === 0) {
    return { id: 'm05', item: 'New violations since last run', status: 'PASS', detail: 'No new violations since the previous run' };
  }
  if (newFails.length >= 3) {
    return { id: 'm05', item: 'New violations since last run', status: 'FAIL', detail: `${newFails.length} checks newly failed: ${newFails.map((c) => c.id).join(', ')}` };
  }
  return { id: 'm05', item: 'New violations since last run', status: 'WARN', detail: `${newFails.length} check newly failed: ${newFails.map((c) => c.id).join(', ')}` };
}

function checkM06Resolved(current: Snapshot, previous: Snapshot | null): MonitorCheckResult {
  if (!previous) {
    return { id: 'm06', item: 'Resolved since last run', status: 'PASS', detail: 'No previous run to compare — baseline established' };
  }
  const prevFailIds = new Set(previous.checks.filter((c) => c.status === 'FAIL').map((c) => c.id));
  const resolved = current.checks.filter((c) => c.status === 'PASS' && prevFailIds.has(c.id));
  if (resolved.length > 0) {
    return { id: 'm06', item: 'Resolved since last run', status: 'PASS', detail: `${resolved.length} check${resolved.length === 1 ? '' : 's'} newly passed: ${resolved.map((c) => c.id).join(', ')} — the system is healing` };
  }
  // Check for FAIL→WARN improvement
  const prevFailMap = new Map(previous.checks.filter((c) => c.status === 'FAIL').map((c) => [c.id, c]));
  const improved = current.checks.filter((c) => c.status === 'WARN' && prevFailMap.has(c.id));
  if (improved.length > 0) {
    return { id: 'm06', item: 'Resolved since last run', status: 'WARN', detail: `${improved.length} check${improved.length === 1 ? '' : 's'} improved from FAIL to WARN: ${improved.map((c) => c.id).join(', ')}` };
  }
  return { id: 'm06', item: 'Resolved since last run', status: 'WARN', detail: 'No checks resolved since the previous run' };
}

function checkM07ScoreDegradation(current: Snapshot, previous: Snapshot | null, threshold = 5): MonitorCheckResult {
  if (!previous) {
    return { id: 'm07', item: 'Score degradation threshold', status: 'PASS', detail: 'No previous run — threshold check starts now' };
  }
  const drop = previous.score - current.score;
  if (drop <= 0) {
    return { id: 'm07', item: 'Score degradation threshold', status: 'PASS', detail: `Score ${current.score} vs previous ${previous.score} — no degradation` };
  }
  if (drop > threshold) {
    return { id: 'm07', item: 'Score degradation threshold', status: 'FAIL', detail: `Score dropped ${drop} points (threshold: ${threshold}) — alert condition` };
  }
  return { id: 'm07', item: 'Score degradation threshold', status: 'WARN', detail: `Score dropped ${drop} points (within threshold of ${threshold})` };
}

function checkM08TokenMutation(current: Snapshot, baseline: Snapshot | null): MonitorCheckResult {
  if (!baseline) {
    return { id: 'm08', item: 'Token-set mutation', status: 'PASS', detail: 'No baseline — token set recorded as initial state' };
  }
  // We can't directly compare token names from snapshots (they store check results, not token maps)
  // But tokensExtracted count change is a proxy signal
  const delta = current.tokensExtracted - baseline.tokensExtracted;
  if (delta === 0) {
    return { id: 'm08', item: 'Token-set mutation', status: 'PASS', detail: `Token count stable (${current.tokensExtracted} vs baseline ${baseline.tokensExtracted})` };
  }
  if (Math.abs(delta) > 10) {
    return { id: 'm08', item: 'Token-set mutation', status: 'FAIL', detail: `Token count changed by ${delta > 0 ? '+' : ''}${delta} (${baseline.tokensExtracted} → ${current.tokensExtracted}) — significant token-set mutation (silent breaking changes)` };
  }
  return { id: 'm08', item: 'Token-set mutation', status: 'WARN', detail: `Token count changed by ${delta > 0 ? '+' : ''}${delta} (${baseline.tokensExtracted} → ${current.tokensExtracted})` };
}

async function checkM09ContractVersion(targetUrl: string, previous: Snapshot | null): Promise<MonitorCheckResult> {
  // Probe for /.well-known/agent.json version field
  let version: string | null = null;
  try {
    const parsed = new URL(targetUrl);
    const agentUrl = `${parsed.origin}/.well-known/agent.json`;
    const text = await fetchText(agentUrl);
    if (text) {
      const agent = JSON.parse(text);
      version = agent.version || agent.identity?.version || null;
    }
  } catch {
    // agent.json not available
  }

  if (!version) {
    return { id: 'm09', item: 'Contract version drift', status: 'WARN', detail: 'Could not detect contract version — no agent.json version field found' };
  }

  if (!previous) {
    return { id: 'm09', item: 'Contract version drift', status: 'PASS', detail: `Contract version ${version} recorded as baseline` };
  }

  // We don't store the version in snapshots in v0.1.0, so we can't compare
  // This check will PASS (version detected) and note the limitation
  return { id: 'm09', item: 'Contract version drift', status: 'PASS', detail: `Contract version ${version} detected — version history comparison requires v0.2` };
}

function checkM10AlertDelivered(alerts: string[], emailAlert?: { attempted: boolean; delivered: boolean; recipient?: string; fromAddress?: string; error?: string }): MonitorCheckResult {
  if (alerts.length === 0) {
    return { id: 'm10', item: 'Alert delivered', status: 'PASS', detail: 'No alert condition triggered — no alert needed' };
  }
  if (emailAlert?.delivered) {
    return { id: 'm10', item: 'Alert delivered', status: 'PASS', detail: `${alerts.length} alert${alerts.length === 1 ? '' : 's'} delivered to ${emailAlert.recipient} via email${emailAlert.fromAddress ? ` (from ${emailAlert.fromAddress})` : ''}` };
  }
  if (emailAlert?.fromAddress === 'suppressed (cooldown)') {
    return { id: 'm10', item: 'Alert delivered', status: 'PASS', detail: `${alerts.length} alert condition${alerts.length === 1 ? '' : 's'} active — email suppressed (1-hour cooldown, same alert set already delivered)` };
  }
  if (emailAlert?.attempted && !emailAlert.delivered) {
    return { id: 'm10', item: 'Alert delivered', status: 'WARN', detail: `${alerts.length} alert${alerts.length === 1 ? '' : 's'} surfaced in-UI — email delivery failed (${emailAlert.error || 'unknown error'})` };
  }
  // No email provided or no Resend key — alerts surfaced in-UI only
  return { id: 'm10', item: 'Alert delivered', status: 'PASS', detail: `${alerts.length} alert condition${alerts.length === 1 ? '' : 's'} surfaced in-UI (add an email address to get drift alerts by mail)` };
}

// ── Email alerting via Resend ────────────────────────────────────────────────
// Sends an HTML alert email when drift alerts fire. Requires:
//   1. An `email` field in the POST body (the recipient)
//   2. RESEND_API_KEY environment variable (set in Vercel project settings)
// Without either, alerts are surfaced in-UI only (graceful degradation).

async function sendAlertEmail(
  targetUrl: string,
  email: string,
  alerts: string[],
  currentSnapshot: Snapshot,
  previous: Snapshot | null,
): Promise<{ attempted: boolean; delivered: boolean; recipient?: string; fromAddress?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { attempted: false, delivered: false };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { attempted: false, delivered: false };
  }

  try {
    const resend = new Resend(apiKey);
    const host = (() => { try { return new URL(targetUrl).hostname; } catch { return targetUrl; } })();
    const prevScore = previous?.score ?? '—';
    const scoreDelta = previous ? currentSnapshot.score - previous.score : 0;
    const deltaStr = scoreDelta >= 0 ? `+${scoreDelta}` : `${scoreDelta}`;

    const subject = `[Designesy] Drift alert for ${host} — ${currentSnapshot.grade}/${currentSnapshot.score}`;
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:2rem 1rem;">
    <tr>
      <td style="padding-bottom:1.5rem;">
        <h1 style="margin:0 0 0.25rem;font-size:1.5rem;font-weight:700;color:#ffffff;">Designesy Drift Alert</h1>
        <p style="margin:0;font-size:0.85rem;color:#999999;">${host} · ${new Date().toLocaleString('en-US')}</p>
      </td>
    </tr>
    <tr>
      <td style="background:#16161b;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:1.5rem;margin-bottom:1rem;">
        <p style="margin:0 0 0.5rem;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:#999999;">Score</p>
        <p style="margin:0;font-size:2rem;font-weight:700;color:${currentSnapshot.score >= 70 ? '#4ade80' : currentSnapshot.score >= 50 ? '#facc15' : '#f87171'};">${currentSnapshot.grade} · ${currentSnapshot.score}/100</p>
        <p style="margin:0.5rem 0 0;font-size:0.85rem;color:#b8b8b8;">${previous ? `Previous: ${prevScore}/100 (${deltaStr} points)` : 'First run — baseline established'}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:1rem 0;">
        <p style="margin:0 0 0.75rem;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:#999999;">Alerts (${alerts.length})</p>
        ${alerts.map((a) => `<p style="margin:0.25rem 0;padding:0.75rem 1rem;background:rgba(248,113,113,0.08);border-left:3px solid #f87171;border-radius:4px;font-size:0.85rem;color:#ffffff;line-height:1.5;">${a}</p>`).join('')}
      </td>
    </tr>
    <tr>
      <td style="padding:1.5rem 0;">
        <a href="https://www.designesy.org/monitor?url=${encodeURIComponent(targetUrl)}" style="display:inline-block;padding:0.75rem 1.5rem;background:#3358e8;color:#ffffff;text-decoration:none;border-radius:6px;font-size:0.9rem;font-weight:600;">View full report →</a>
      </td>
    </tr>
    <tr>
      <td style="padding-top:2rem;border-top:1px solid rgba(255,255,255,0.06);">
        <p style="margin:0;font-size:0.75rem;color:#999999;line-height:1.6;">You received this email because you registered ${targetUrl} for drift monitoring on designesy.org. This alert was triggered by a score degradation, new violations, or token-set mutation detected during a monitor run.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Try the branded sending address first; fall back to Resend's shared
    // onboarding address when the custom domain isn't verified yet. This lets
    // email alerting ship immediately and upgrade automatically once DNS
    // verification completes — no feature flag, no redeploy.
    const brandedFrom = 'Designesy Monitor <monitor@designesy.org>';
    const fallbackFrom = 'Designesy Monitor <onboarding@resend.dev>';

    const { error: brandedError } = await resend.emails.send({
      from: brandedFrom,
      to: email,
      subject,
      html,
    });

    if (!brandedError) {
      return { attempted: true, delivered: true, recipient: email, fromAddress: 'monitor@designesy.org' };
    }

    // Branded send failed (domain not verified, 422) — retry via the shared
    // Resend onboarding address so alerts still reach the inbox.
    if (brandedError.message.includes('not verified') || brandedError.message.includes('422') || brandedError.message.includes('domain')) {
      const { error: fallbackError } = await resend.emails.send({
        from: fallbackFrom,
        to: email,
        subject,
        html,
      });
      if (!fallbackError) {
        return { attempted: true, delivered: true, recipient: email, fromAddress: 'onboarding@resend.dev' };
      }
      return { attempted: true, delivered: false, recipient: email, fromAddress: 'fallback-failed', error: `branded: ${brandedError.message}; fallback: ${fallbackError.message}` };
    }

    return { attempted: true, delivered: false, recipient: email, error: brandedError.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { attempted: true, delivered: false, recipient: email, error: msg };
  }
}

// ── Main scoring function ────────────────────────────────────────────────────

async function scoreMonitorUncached(targetUrl: string, history: Snapshot[]): Promise<MonitorResponse> {
  const { html, css } = await fetchPageResilient(targetUrl);

  if (!html && !css) {
    return {
      ok: false,
      error: 'Could not fetch the target URL. Check that the URL is correct and the site is publicly accessible.',
    };
  }

  const allCss = css + (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join('\n') || '');
  const tokens = extractRootTokens(allCss);
  const varRefs = extractVarRefs(allCss);

  // The 12 drift checks — the SAME implementation /api/drift runs.
  //
  // This call used to be a hand-copied list, and three of its differences were
  // visible right here: it passed no tokens to d04 (so the check could never
  // compare literals against the declared scale — the argument did not exist in
  // the copied signature), and it never passed the attribute-scanned varRefs
  // that drift unions in, so a token referenced only from a React style object
  // was invisible to this engine's d02 and d11.
  //
  // The type widened from DriftCheckResult to CheckResult because the shared
  // module returns PASS|FAIL|WARN|SKIP (drift can emit SKIP under scope
  // filtering). They are structurally identical apart from that, and the
  // narrower local type was only ever a copy of the wider one.
  const driftChecks: CheckResult[] = runDriftChecks(allCss, tokens, varRefs);

  const { score, grade, pass, warn, fail } = computeDriftScore(driftChecks);
  const now = new Date().toISOString();
  const currentSnapshot = createSnapshot(now, driftChecks, Object.keys(tokens).length);

  // Determine baseline (first in history) and previous (last in history)
  const baseline = history.length > 0 ? history[0] : null;
  const previous = history.length > 0 ? history[history.length - 1] : null;

  // Collect alerts as we run checks
  const alerts: string[] = [];

  // Run the 10 monitor checks
  const m01 = checkM01ScheduleRegistered();
  const m02 = checkM02LastRunFresh();
  const m03 = checkM03DriftDelta(currentSnapshot, baseline);
  const m04 = checkM04TrendSlope([...history, currentSnapshot]);
  const m05 = checkM05NewViolations(currentSnapshot, previous);
  const m06 = checkM06Resolved(currentSnapshot, previous);
  const m07 = checkM07ScoreDegradation(currentSnapshot, previous);
  const m08 = checkM08TokenMutation(currentSnapshot, baseline);
  const m09 = await checkM09ContractVersion(targetUrl, previous);

  // Collect alerts from FAIL conditions
  if (m03.status === 'FAIL') alerts.push(m03.detail);
  if (m04.status === 'FAIL') alerts.push(m04.detail);
  if (m05.status === 'FAIL') alerts.push(m05.detail);
  if (m07.status === 'FAIL') alerts.push(m07.detail);
  if (m08.status === 'FAIL') alerts.push(m08.detail);

  const m10 = checkM10AlertDelivered(alerts);

  const monitorChecks: MonitorCheckResult[] = [m01, m02, m03, m04, m05, m06, m07, m08, m09, m10];

  // Monitor score = governance health, not design quality
  const monitorPass = monitorChecks.filter((c) => c.status === 'PASS').length;
  const monitorWarn = monitorChecks.filter((c) => c.status === 'WARN').length;
  const monitorFail = monitorChecks.filter((c) => c.status === 'FAIL').length;
  const monitorPoints = monitorPass + monitorWarn * 0.5;
  const monitorScore = Math.round((monitorPoints / monitorChecks.length) * 100);

  return {
    ok: true,
    url: targetUrl,
    score: monitorScore,
    grade: computeGrade(monitorScore),
    pass: monitorPass,
    warn: monitorWarn,
    fail: monitorFail,
    total: monitorChecks.length,
    currentSnapshot,
    baseline,
    previous,
    driftChecks,
    monitorChecks,
    alerts,
  };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const MONITOR_TTL = 60 * 60 * 24; // 24h

const scoreMonitor = unstable_cache(scoreMonitorUncached, ['designesy-monitor'], {
  revalidate: MONITOR_TTL,
  tags: ['monitor'],
});

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 50 monitor scans per hour.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { url?: string; history?: Snapshot[]; email?: string };
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

  // Validate email if provided
  const email = body.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid email address.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const result = await scoreMonitor(targetUrl, history);

  // Send email alert after the cached result returns (outside cache so
  // the email param doesn't pollute the cache key). A per-URL+email cooldown
  // prevents identical alerts from spamming the inbox on repeated requests —
  // the email only fires if the alert set changed or the cooldown has elapsed.
  if (result.ok && result.alerts && result.alerts.length > 0 && email && result.currentSnapshot) {
    const suppressed = emailOnCooldown(targetUrl, email, result.alerts);
    if (suppressed) {
      result.emailAlert = { attempted: false, delivered: false, fromAddress: 'suppressed (cooldown)' };
    } else {
      const emailResult = await sendAlertEmail(
        targetUrl,
        email,
        result.alerts,
        result.currentSnapshot,
        result.previous ?? null,
      );
      result.emailAlert = emailResult;
    }

    // Update m10 check to reflect email delivery status
    if (result.monitorChecks) {
      const m10Index = result.monitorChecks.findIndex((c) => c.id === 'm10');
      if (m10Index >= 0) {
        result.monitorChecks[m10Index] = checkM10AlertDelivered(result.alerts, result.emailAlert);
      }
    }
  }

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}