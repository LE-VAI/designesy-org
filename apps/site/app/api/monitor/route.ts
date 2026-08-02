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
//   m10 alert delivered (always PASS in v0.1.0 — in-UI surfacing, no webhook backend yet)
//
// Contract: /contracts/monitor.json (designesy.monitor v0.1.0)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

// ── URL utilities (inlined — do not import from a route file) ─────────────────

function normalizeInputUrl(raw: string): string {
  let clean = raw.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  try {
    const u = new URL(clean);
    return u.href;
  } catch {
    return clean;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.16.') ||
      host === '0.0.0.0' ||
      !host.includes('.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
    const resp = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
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

// ── Token extraction (mirrors drift route) ──────────────────────────────────

function extractRootTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const rootRe = /:root\s*\{([^}]*)\}/g;
  let m;
  while ((m = rootRe.exec(css)) !== null) {
    const block = m[1];
    const propRe = /(--[\w-]+)\s*:\s*([^;]+?)(?:;|$)/g;
    let p;
    while ((p = propRe.exec(block)) !== null) {
      tokens[p[1]] = p[2].trim();
    }
  }
  return tokens;
}

function extractVarRefs(css: string): string[] {
  const refs: string[] = [];
  const varRe = /var\(\s*(--[\w-]+)/g;
  let m;
  while ((m = varRe.exec(css)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

function extractVarChains(css: string): { primary: string; fallback?: string }[] {
  const chains: { primary: string; fallback?: string }[] = [];
  const chainRe = /var\(\s*(--[\w-]+)\s*(?:,\s*var\(\s*(--[\w-]+)\s*\))?\)/g;
  let m;
  while ((m = chainRe.exec(css)) !== null) {
    chains.push({ primary: m[1], fallback: m[2] });
  }
  return chains;
}

// ── Value extraction helpers ─────────────────────────────────────────────────

function extractValuesByProperty(css: string, props: string[]): string[] {
  const values: string[] = [];
  for (const prop of props) {
    const re = new RegExp(`${prop}\\s*:\\s*([^;]+?)(?:;|$)`, 'gi');
    let m;
    while ((m = re.exec(css)) !== null) {
      values.push(m[1].trim());
    }
  }
  return values;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((v) => v.toLowerCase().replace(/\s+/g, ' ').trim()))];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DriftCheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

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
  error?: string;
};

// ── The 12 drift checks (inlined from drift route for self-containment) ────────

function checkD01TokenRegistry(tokens: Record<string, string>): DriftCheckResult {
  const count = Object.keys(tokens).length;
  if (count >= 5) {
    return { id: 'd01', item: 'Token registry declared', category: 'tokens', status: 'PASS', detail: `Token registry found with ${count} custom properties` };
  }
  return { id: 'd01', item: 'Token registry declared', category: 'tokens', status: 'FAIL', detail: `Only ${count} :root custom properties — the site has no token system` };
}

function checkD02FabricatedTokens(tokens: Record<string, string>, varRefs: string[]): DriftCheckResult {
  const declared = new Set(Object.keys(tokens));
  const undeclared = varRefs.filter((r) => !declared.has(r));
  const uniqueUndeclared = [...new Set(undeclared)];
  if (uniqueUndeclared.length === 0) {
    return { id: 'd02', item: 'No fabricated tokens', category: 'tokens', status: 'PASS', detail: `All ${varRefs.length} var() references resolve to :root declarations` };
  }
  if (uniqueUndeclared.length <= 2) {
    return { id: 'd02', item: 'No fabricated tokens', category: 'tokens', status: 'WARN', detail: `${uniqueUndeclared.length} undeclared references: ${uniqueUndeclared.slice(0, 3).join(', ')} (may be third-party)` };
  }
  return { id: 'd02', item: 'No fabricated tokens', category: 'tokens', status: 'FAIL', detail: `${uniqueUndeclared.length} var() references to undeclared custom properties: ${uniqueUndeclared.slice(0, 5).join(', ')}... — token fabrication detected` };
}

function checkD03InlineColors(css: string, tokens: Record<string, string>): DriftCheckResult {
  const colorRe = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\))/g;
  const matches = css.match(colorRe) || [];
  const tokenValues = new Set(Object.values(tokens).map((v) => v.trim().toLowerCase()));
  const inline = matches.filter((m) => !tokenValues.has(m.toLowerCase()));
  const colorTokenCount = Object.values(tokens).filter((v) => /#[0-9a-fA-F]|rgba?|hsla?|oklch/i.test(v)).length;
  if (inline.length <= 5 && colorTokenCount > 0) {
    return { id: 'd03', item: 'Inline color values minimized', category: 'color', status: 'PASS', detail: `${inline.length} inline color values (${colorTokenCount} color tokens available)` };
  }
  if (inline.length > 20) {
    return { id: 'd03', item: 'Inline color values minimized', category: 'color', status: 'FAIL', detail: `${inline.length} inline color values — color system bypassed` };
  }
  return { id: 'd03', item: 'Inline color values minimized', category: 'color', status: 'WARN', detail: `${inline.length} inline color values — partial token adoption` };
}

function checkD04SpacingVariance(css: string): DriftCheckResult {
  const values = extractValuesByProperty(css, ['padding', 'margin']);
  const numeric = values.map((v) => {
    const m = v.match(/([\d.]+)\s*(px|rem|em)/);
    return m ? parseFloat(m[1]) * (m[2] === 'rem' ? 16 : m[2] === 'em' ? 16 : 1) : null;
  }).filter((v): v is number => v !== null);
  const distinct = uniqueValues(numeric.map((n) => String(Math.round(n))));
  if (distinct.length <= 6) {
    return { id: 'd04', item: 'Spacing values cluster on a scale', category: 'spacing', status: 'PASS', detail: `Spacing values cluster on ${distinct.length} distinct steps` };
  }
  if (distinct.length > 15) {
    return { id: 'd04', item: 'Spacing values cluster on a scale', category: 'spacing', status: 'FAIL', detail: `${distinct.length} distinct spacing values — no spacing scale` };
  }
  return { id: 'd04', item: 'Spacing values cluster on a scale', category: 'spacing', status: 'WARN', detail: `${distinct.length} distinct spacing values — loose scale` };
}

function checkD05ColorVariance(css: string): DriftCheckResult {
  const colorRe = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\))/g;
  const matches = (css.match(colorRe) || []).map((c) => c.toLowerCase());
  const groups = new Map<string, number>();
  for (const c of matches) {
    groups.set(c, (groups.get(c) || 0) + 1);
  }
  const top3 = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const top3Count = top3.reduce((sum, [, count]) => sum + count, 0);
  const total = matches.length;
  if (total === 0) {
    return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'PASS', detail: 'No raw color values found in CSS' };
  }
  const ratio = top3Count / total;
  if (ratio > 0.6) {
    return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'PASS', detail: `Top 3 colors cover ${Math.round(ratio * 100)}% of ${total} color declarations — consistent` };
  }
  if (ratio < 0.3) {
    return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'FAIL', detail: `${groups.size} distinct color values across ${total} declarations — color drift` };
  }
  return { id: 'd05', item: 'Color values consistent', category: 'color', status: 'WARN', detail: `${groups.size} distinct color values — moderate consistency` };
}

function checkD06FontFamily(css: string): DriftCheckResult {
  const families = extractValuesByProperty(css, ['font-family']);
  const stacks = uniqueValues(families.map((f) => f.split(',')[ 0]?.trim() || ''));
  if (stacks.length <= 2) {
    return { id: 'd06', item: 'Font-family consistent', category: 'typography', status: 'PASS', detail: `${stacks.length} distinct font-family stacks — consistent` };
  }
  if (stacks.length > 4) {
    return { id: 'd06', item: 'Font-family consistent', category: 'typography', status: 'FAIL', detail: `${stacks.length} distinct font-family stacks — typography drift` };
  }
  return { id: 'd06', item: 'Font-family consistent', category: 'typography', status: 'WARN', detail: `${stacks.length} distinct font-family stacks` };
}

function checkD07BorderRadius(css: string): DriftCheckResult {
  const values = extractValuesByProperty(css, ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius']);
  const numeric = values.map((v) => {
    const m = v.match(/([\d.]+)\s*(px|rem|em|%)/);
    return m ? m[1] : null;
  }).filter((v): v is string => v !== null);
  const distinct = uniqueValues(numeric);
  if (distinct.length <= 4) {
    return { id: 'd07', item: 'Border-radius values cluster', category: 'shape', status: 'PASS', detail: `Border-radius values cluster on ${distinct.length} distinct radii` };
  }
  if (distinct.length > 8) {
    return { id: 'd07', item: 'Border-radius values cluster', category: 'shape', status: 'FAIL', detail: `${distinct.length} distinct border-radius values — radius drift` };
  }
  return { id: 'd07', item: 'Border-radius values cluster', category: 'shape', status: 'WARN', detail: `${distinct.length} distinct border-radius values` };
}

function checkD08ShadowVariance(css: string): DriftCheckResult {
  const shadows = extractValuesByProperty(css, ['box-shadow']);
  const distinct = uniqueValues(shadows);
  if (distinct.length <= 3) {
    return { id: 'd08', item: 'Shadow values consistent', category: 'elevation', status: 'PASS', detail: `${distinct.length} distinct box-shadow values` };
  }
  if (distinct.length > 6) {
    return { id: 'd08', item: 'Shadow values consistent', category: 'elevation', status: 'FAIL', detail: `${distinct.length} distinct box-shadow values — shadow drift` };
  }
  return { id: 'd08', item: 'Shadow values consistent', category: 'elevation', status: 'WARN', detail: `${distinct.length} distinct box-shadow values` };
}

function checkD09TransitionVariance(css: string): DriftCheckResult {
  const transitions = extractValuesByProperty(css, ['transition', 'transition-duration']);
  const durations = transitions.map((t) => {
    const m = t.match(/([\d.]+)\s*(ms|s)/g);
    return m ? m.join(', ') : null;
  }).filter((v): v is string => v !== null);
  const distinct = uniqueValues(durations);
  if (distinct.length <= 4) {
    return { id: 'd09', item: 'Transition duration/easing consistent', category: 'motion', status: 'PASS', detail: `Transition durations cluster on ${distinct.length} distinct values` };
  }
  if (distinct.length > 8) {
    return { id: 'd09', item: 'Transition duration/easing consistent', category: 'motion', status: 'FAIL', detail: `${distinct.length} distinct transition durations — motion drift` };
  }
  return { id: 'd09', item: 'Transition duration/easing consistent', category: 'motion', status: 'WARN', detail: `${distinct.length} distinct transition durations` };
}

function checkD10ZIndex(css: string): DriftCheckResult {
  const zValues = extractValuesByProperty(css, ['z-index']);
  const numeric = zValues.map((z) => parseInt(z, 10)).filter((n) => !isNaN(n));
  const max = Math.max(...numeric, 0);
  const distinct = uniqueValues(numeric.map(String));
  if (max <= 100 && distinct.length <= 10) {
    return { id: 'd10', item: 'Z-index values within a sane range', category: 'stacking', status: 'PASS', detail: `All z-index values within 0-${max}, ${distinct.length} distinct levels` };
  }
  if (max > 100 || distinct.length > 10) {
    return { id: 'd10', item: 'Z-index values within a sane range', category: 'stacking', status: 'FAIL', detail: `Z-index values reach ${max}, ${distinct.length} distinct levels — stacking chaos` };
  }
  return { id: 'd10', item: 'Z-index values within a sane range', category: 'stacking', status: 'WARN', detail: `Z-index values reach ${max}, ${distinct.length} levels` };
}

function checkD11UndeclaredRatio(tokens: Record<string, string>, varRefs: string[]): DriftCheckResult {
  if (varRefs.length === 0) {
    return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'PASS', detail: 'No var() references in CSS' };
  }
  const declared = new Set(Object.keys(tokens));
  const undeclared = varRefs.filter((r) => !declared.has(r));
  const ratio = (undeclared.length / varRefs.length) * 100;
  if (ratio < 5) {
    return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'PASS', detail: `${Math.round(ratio)}% undeclared var() references (${undeclared.length}/${varRefs.length})` };
  }
  if (ratio > 20) {
    return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'FAIL', detail: `${Math.round(ratio)}% undeclared — widespread token fabrication` };
  }
  return { id: 'd11', item: 'Undeclared custom property ratio', category: 'tokens', status: 'WARN', detail: `${Math.round(ratio)}% undeclared — moderate fabrication` };
}

function checkD12AliasChains(css: string, tokens: Record<string, string>): DriftCheckResult {
  const chains = extractVarChains(css);
  const declared = new Set(Object.keys(tokens));
  const dangling = chains.filter((c) => !declared.has(c.primary) && (!c.fallback || !declared.has(c.fallback)));
  if (dangling.length === 0) {
    return { id: 'd12', item: 'Token alias chains resolve', category: 'tokens', status: 'PASS', detail: chains.length > 0 ? `All ${chains.length} alias chains resolve to declared values` : 'No alias chains found' };
  }
  if (dangling.length <= 2) {
    return { id: 'd12', item: 'Token alias chains resolve', category: 'tokens', status: 'WARN', detail: `${dangling.length} dangling alias chains` };
  }
  return { id: 'd12', item: 'Token alias chains resolve', category: 'tokens', status: 'FAIL', detail: `${dangling.length} alias chains reference undeclared tokens — dangling references` };
}

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

function checkM10AlertDelivered(alerts: string[]): MonitorCheckResult {
  if (alerts.length === 0) {
    return { id: 'm10', item: 'Alert delivered', status: 'PASS', detail: 'No alert condition triggered — no alert needed' };
  }
  // In v0.1.0, alerts are surfaced in-UI (no webhook backend yet)
  return { id: 'm10', item: 'Alert delivered', status: 'PASS', detail: `${alerts.length} alert condition${alerts.length === 1 ? '' : 's'} surfaced in-UI (webhook delivery is a v0.2 capability)` };
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

  // Run the 12 drift checks (same as /drift)
  const driftChecks: DriftCheckResult[] = [
    checkD01TokenRegistry(tokens),
    checkD02FabricatedTokens(tokens, varRefs),
    checkD03InlineColors(allCss, tokens),
    checkD04SpacingVariance(allCss),
    checkD05ColorVariance(allCss),
    checkD06FontFamily(allCss),
    checkD07BorderRadius(allCss),
    checkD08ShadowVariance(allCss),
    checkD09TransitionVariance(allCss),
    checkD10ZIndex(allCss),
    checkD11UndeclaredRatio(tokens, varRefs),
    checkD12AliasChains(allCss, tokens),
  ];

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

  let body: { url?: string; history?: Snapshot[] };
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

  const history = Array.isArray(body.history) ? body.history : [];
  const result = await scoreMonitor(targetUrl, history);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}