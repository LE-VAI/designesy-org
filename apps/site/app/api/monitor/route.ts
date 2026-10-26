// /api/monitor — Designesy Continuous Drift Monitor
//
// The temporal layer over /drift. Re-runs the 12 drift checks (d01-d12)
// on a URL and computes 10 monitor checks (m01-m10) by comparing the
// current run against a baseline + previous snapshot supplied in the
// POST body.
//
// Monitor checks:
//   m01 history supplied (PASS when the request carries at least one earlier run,
//       SKIP otherwise: nothing is scheduled or stored server-side, the caller
//       supplies the history, so a first run has nothing to compare against)
//   m02 last run fresh (the gap since the newest run in the supplied history,
//       against the caller's cadence: daily, weekly (default) or monthly;
//       SKIP with no history. Computed per request, outside the cache)
//   m03 drift delta vs baseline (score change since first run)
//   m04 drift trend slope (3-run trajectory: improving / flat / regressing)
//   m05 new violations since last run (checks that newly fail)
//   m06 resolved since last run (checks that newly pass — the healing signal)
//   m07 score degradation threshold (alert if score drops > N points)
//   m08 token-set mutation (tokens added/removed/renamed since baseline)
//   m09 contract version (the design contract version this run is scored
//       against: CONTRACT_VERSION, the value /api/score reports as contractVersion)
//   m10 alert delivered (SKIP on every run since monitor contract 0.1.5, and not
//        scored: alerts are returned in the response, and the monitor sends no email)
//
// Alerts: every alert condition that fires is listed in the response's `alerts`.
// Email delivery was retired in monitor contract 0.1.5 (CHANGELOG): this route
// sends no mail under any setting, accepts an `email` field of any type and
// ignores it, and returns no address. The body is checked for shape and bounds
// first (lib/monitor-history).
//
// Contract: /contracts/monitor.json (designesy.monitor; the version is lib/monitor-contract's)

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { normalizeInputUrl, isValidUrl } from '../../lib/url-guard';
import { fetchPageResilient } from '../../lib/page-fetch';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import { clientKey } from '../../lib/rate-limit';
import { MONITOR_BODY_MAX_BYTES, M10_RETIRED_DETAIL, monitorRequestSchema, requestProblem, type PriorRun } from '../../lib/monitor-history';

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

// ── Fetching: app/lib/page-fetch.ts, shared by drift, guardrails, monitor and compare ──

import {
  runDriftChecks,
  extractRootTokens,
  extractVarRefs,
  extractVarChains,
  extractStyleAttributeCss,
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
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
};

type Snapshot = {
  timestamp: string;
  score: number;
  grade: string;
  tokensExtracted: number;
  checks: DriftCheckResult[];
};

// What the monitor checks read from a run: this run's snapshot, or an earlier
// run as the request carries it (lib/monitor-history requires only these).
type Run = {
  timestamp?: string;
  score: number;
  tokensExtracted: number;
  checks: { id: string; status: string }[];
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
  baseline?: PriorRun | null;
  previous?: PriorRun | null;
  driftChecks?: DriftCheckResult[];
  monitorChecks?: MonitorCheckResult[];
  alerts?: string[];
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

// m01 used to PASS on every call ("Monitor run executed: the URL is being
// watched"), but this route schedules nothing and stores nothing: the caller
// supplies the earlier runs. It now says what the run had to compare against,
// and a first run, with nothing to compare, is not scored.
function checkM01HistorySupplied(history: Run[]): MonitorCheckResult {
  if (history.length === 0) {
    return { id: 'm01', item: 'History supplied', status: 'SKIP', detail: 'No history: drift needs a previous run. This run is the baseline; pass it back as history next time.' };
  }
  return { id: 'm01', item: 'History supplied', status: 'PASS', detail: `${history.length} earlier run${history.length === 1 ? '' : 's'} supplied: drift is measured against ${history.length === 1 ? 'it' : 'them'}` };
}

// m02 used to PASS on every call ("This run is happening now: within the
// cadence window"), which measured nothing: the run asking is always fresh.
// What goes stale is the watch, the gap since the newest run the caller kept.
// PASS within one cadence window, WARN within two (a run was missed), FAIL past
// two (the watch may have stopped). It runs per request, outside the 24-hour
// cache, because the gap keeps growing while a cached result stands still.
const CADENCE_DAYS = { daily: 1, weekly: 7, monthly: 30 } as const;
type Cadence = keyof typeof CADENCE_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

function checkM02LastRunFresh(history: Run[], cadence: Cadence, now: number): MonitorCheckResult {
  const item = 'Last run fresh';
  if (history.length === 0) {
    return { id: 'm02', item, status: 'SKIP', detail: 'No earlier run: freshness is measured from the newest run in the history you pass.' };
  }
  const last = Date.parse(String(history[history.length - 1]?.timestamp ?? ''));
  if (!Number.isFinite(last) || last > now + 5 * 60 * 1000) {
    return { id: 'm02', item, status: 'SKIP', detail: 'The newest run in the history has no usable timestamp, so its age cannot be measured.' };
  }
  const gap = Math.max(0, now - last);
  const ago = gap < DAY_MS ? `${Math.round(gap / (60 * 60 * 1000))} h` : `${(gap / DAY_MS).toFixed(1)} days`;
  const days = CADENCE_DAYS[cadence];
  const window = `the ${cadence} window (${days} day${days === 1 ? '' : 's'})`;
  if (gap <= days * DAY_MS) {
    return { id: 'm02', item, status: 'PASS', detail: `Previous run ${ago} ago, within ${window}` };
  }
  if (gap <= 2 * days * DAY_MS) {
    return { id: 'm02', item, status: 'WARN', detail: `Previous run ${ago} ago, past ${window}: a run was missed` };
  }
  return { id: 'm02', item, status: 'FAIL', detail: `Previous run ${ago} ago, more than two ${cadence} windows: the watch may have stopped` };
}

function checkM03DriftDelta(current: Snapshot, baseline: Run | null): MonitorCheckResult {
  if (!baseline) {
    return { id: 'm03', item: 'Drift delta vs baseline', status: 'PASS', detail: 'No baseline yet: this is the first run (baseline established)' };
  }
  const delta = current.score - baseline.score;
  if (delta >= 0) {
    return { id: 'm03', item: 'Drift delta vs baseline', status: 'PASS', detail: `Score ${current.score} vs baseline ${baseline.score}: stable or improved (+${delta})` };
  }
  if (delta <= -10) {
    return { id: 'm03', item: 'Drift delta vs baseline', status: 'FAIL', detail: `Score ${current.score} vs baseline ${baseline.score}: degraded by ${Math.abs(delta)} points` };
  }
  return { id: 'm03', item: 'Drift delta vs baseline', status: 'WARN', detail: `Score ${current.score} vs baseline ${baseline.score}: slipped ${Math.abs(delta)} points` };
}

function checkM04TrendSlope(history: Run[]): MonitorCheckResult {
  if (history.length < 3) {
    return { id: 'm04', item: 'Drift trend slope', status: 'PASS', detail: `Insufficient data for trend (${history.length} run${history.length === 1 ? '' : 's'}: need 3 for slope)` };
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

function checkM05NewViolations(current: Snapshot, previous: Run | null): MonitorCheckResult {
  if (!previous) {
    return { id: 'm05', item: 'New violations since last run', status: 'PASS', detail: 'No previous run to compare: baseline established' };
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

function checkM06Resolved(current: Snapshot, previous: Run | null): MonitorCheckResult {
  if (!previous) {
    return { id: 'm06', item: 'Resolved since last run', status: 'PASS', detail: 'No previous run to compare: baseline established' };
  }
  const prevFailIds = new Set(previous.checks.filter((c) => c.status === 'FAIL').map((c) => c.id));
  const resolved = current.checks.filter((c) => c.status === 'PASS' && prevFailIds.has(c.id));
  if (resolved.length > 0) {
    return { id: 'm06', item: 'Resolved since last run', status: 'PASS', detail: `${resolved.length} check${resolved.length === 1 ? '' : 's'} newly passed: ${resolved.map((c) => c.id).join(', ')}; the system is healing` };
  }
  // Check for FAIL→WARN improvement
  const prevFailMap = new Map(previous.checks.filter((c) => c.status === 'FAIL').map((c) => [c.id, c]));
  const improved = current.checks.filter((c) => c.status === 'WARN' && prevFailMap.has(c.id));
  if (improved.length > 0) {
    return { id: 'm06', item: 'Resolved since last run', status: 'WARN', detail: `${improved.length} check${improved.length === 1 ? '' : 's'} improved from FAIL to WARN: ${improved.map((c) => c.id).join(', ')}` };
  }
  return { id: 'm06', item: 'Resolved since last run', status: 'WARN', detail: 'No checks resolved since the previous run' };
}

function checkM07ScoreDegradation(current: Snapshot, previous: Run | null, threshold = 5): MonitorCheckResult {
  if (!previous) {
    return { id: 'm07', item: 'Score degradation threshold', status: 'PASS', detail: 'No previous run: threshold check starts now' };
  }
  const drop = previous.score - current.score;
  if (drop <= 0) {
    return { id: 'm07', item: 'Score degradation threshold', status: 'PASS', detail: `Score ${current.score} vs previous ${previous.score}: no degradation` };
  }
  if (drop > threshold) {
    return { id: 'm07', item: 'Score degradation threshold', status: 'FAIL', detail: `Score dropped ${drop} points (threshold: ${threshold}), an alert condition` };
  }
  return { id: 'm07', item: 'Score degradation threshold', status: 'WARN', detail: `Score dropped ${drop} points (within threshold of ${threshold})` };
}

function checkM08TokenMutation(current: Snapshot, baseline: Run | null): MonitorCheckResult {
  if (!baseline) {
    return { id: 'm08', item: 'Token-set mutation', status: 'PASS', detail: 'No baseline: token set recorded as initial state' };
  }
  // We can't directly compare token names from snapshots (they store check results, not token maps)
  // But tokensExtracted count change is a proxy signal
  const delta = current.tokensExtracted - baseline.tokensExtracted;
  if (delta === 0) {
    return { id: 'm08', item: 'Token-set mutation', status: 'PASS', detail: `Token count stable (${current.tokensExtracted} vs baseline ${baseline.tokensExtracted})` };
  }
  if (Math.abs(delta) > 10) {
    return { id: 'm08', item: 'Token-set mutation', status: 'FAIL', detail: `Token count changed by ${delta > 0 ? '+' : ''}${delta} (${baseline.tokensExtracted} → ${current.tokensExtracted}): significant token-set mutation (silent breaking changes)` };
  }
  return { id: 'm08', item: 'Token-set mutation', status: 'WARN', detail: `Token count changed by ${delta > 0 ? '+' : ''}${delta} (${baseline.tokensExtracted} → ${current.tokensExtracted})` };
}

// m09 reports the design contract version the run is measured against, read
// from the module /api/score reads (CONTRACT_VERSION, which designesy_score
// returns as contractVersion), never written here as a literal.
//
// It used to read the scanned site's /.well-known/agent.json `version`, which
// on www.designesy.org is the catalog's version (0.1.7), so m09 said
// "Contract version 0.1.7" while designesy_score reported CONTRACT_VERSION for
// the same page.
// Snapshots do not record a contract version yet, so a run with history says
// so instead of comparing.
function checkM09ContractVersion(previous: Run | null): MonitorCheckResult {
  if (!previous) {
    return { id: 'm09', item: 'Contract version drift', status: 'PASS', detail: `Contract version ${CONTRACT_VERSION} recorded as baseline` };
  }
  return { id: 'm09', item: 'Contract version drift', status: 'PASS', detail: `Contract version ${CONTRACT_VERSION} detected: version history comparison requires v0.2` };
}

// m10 is not scored since monitor contract 0.1.5: alerts are returned in the
// response and email delivery was retired, so m10 has nothing left to measure.
// The id stays so m01-m10 keep their meaning.
function checkM10AlertDelivered(): MonitorCheckResult {
  return { id: 'm10', item: 'Alert delivered', status: 'SKIP', detail: M10_RETIRED_DETAIL };
}

// ── Main scoring function ────────────────────────────────────────────────────

async function scoreMonitorUncached(targetUrl: string, history: PriorRun[]): Promise<MonitorResponse> {
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
  // Custom properties a style="..." attribute declares count as declared for
  // d02, d11 and d12, as they do in /api/drift, so the two engines agree about
  // a property a React style object sets (designesy.org sets five that way).
  const attrCss = extractStyleAttributeCss(html);

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
  const driftChecks: CheckResult[] = runDriftChecks(allCss, tokens, varRefs, attrCss);

  const { score, grade, pass, warn, fail } = computeDriftScore(driftChecks);
  const now = new Date().toISOString();
  const currentSnapshot = createSnapshot(now, driftChecks, Object.keys(tokens).length);

  // Determine baseline (first in history) and previous (last in history)
  const baseline = history.length > 0 ? history[0] : null;
  const previous = history.length > 0 ? history[history.length - 1] : null;

  // Collect alerts as we run checks
  const alerts: string[] = [];

  // Run the 10 monitor checks
  const m01 = checkM01HistorySupplied(history);
  // Placeholder: POST replaces it per request (the gap is time-dependent and
  // this function's result is cached for 24 hours).
  const m02 = checkM02LastRunFresh(history, 'weekly', Date.now());
  const m03 = checkM03DriftDelta(currentSnapshot, baseline);
  const m04 = checkM04TrendSlope([...history, currentSnapshot]);
  const m05 = checkM05NewViolations(currentSnapshot, previous);
  const m06 = checkM06Resolved(currentSnapshot, previous);
  const m07 = checkM07ScoreDegradation(currentSnapshot, previous);
  const m08 = checkM08TokenMutation(currentSnapshot, baseline);
  const m09 = checkM09ContractVersion(previous);

  // Collect alerts from FAIL conditions
  if (m03.status === 'FAIL') alerts.push(m03.detail);
  if (m04.status === 'FAIL') alerts.push(m04.detail);
  if (m05.status === 'FAIL') alerts.push(m05.detail);
  if (m07.status === 'FAIL') alerts.push(m07.detail);
  if (m08.status === 'FAIL') alerts.push(m08.detail);

  const m10 = checkM10AlertDelivered();

  const monitorChecks: MonitorCheckResult[] = [m01, m02, m03, m04, m05, m06, m07, m08, m09, m10];

  return {
    ok: true,
    url: targetUrl,
    ...tallyMonitor(monitorChecks),
    currentSnapshot,
    baseline,
    previous,
    driftChecks,
    monitorChecks,
    alerts,
  };
}

// Monitor score = governance health, not design quality. A SKIP (m10 on every
// run, m01 and m02 on a first run) is not scored, as in every other Designesy
// score. POST calls this again after it replaces m02, so the score always
// matches the checks it is returned with (until 0.1.3 an m10 that changed after
// the cache left the cached score and counts in place). Line comments, as in the rest of
// this file: the drift-agreement gates strip block comments with a regex, and
// the Accept header's any-type wildcard would open one that a block comment
// here closes.
function tallyMonitor(checks: MonitorCheckResult[]) {
  const pass = checks.filter((c) => c.status === 'PASS').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const scored = pass + warn + fail;
  const score = scored === 0 ? 0 : Math.round(((pass + warn * 0.5) / scored) * 100);
  return { score, grade: computeGrade(score), pass, warn, fail, total: checks.length };
}

// ── Cached wrapper ───────────────────────────────────────────────────────────

const MONITOR_TTL = 60 * 60 * 24; // 24h

// The key part request-body-deadline keeps out every result cached before
// the URL guard stopped ending a read given a deadline early and page-fetch
// bounded a page's stylesheets to 20 s in all. Before, a page or stylesheet
// whose server was quiet for between Node's idle timeout (5 s, or as little
// as 1 s on a kept-alive connection) and its 8 s deadline was not read, and
// a page's stylesheets were read however long they took. The cached
// function is unchanged by that work, so its source, which Next.js 16.4.2
// puts in the key, does not keep such a result out.
const scoreMonitor = unstable_cache(scoreMonitorUncached, ['designesy-monitor', 'request-body-deadline'], {
  revalidate: MONITOR_TTL,
  tags: ['monitor'],
});

// ── Request body ─────────────────────────────────────────────────────────────

// The body as text, as Request.text() decodes it (UTF-8, a leading byte order
// mark dropped, U+FFFD for a malformed sequence), or null when it is larger
// than maxBytes. A Content-Length over the limit is refused before a byte is
// read, and a body without one stops being read at the first chunk past the
// limit, so an oversized body is never held whole.
async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    if (read > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join('');
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const caller = await clientKey(request.headers);
  if (rateLimited(caller)) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Maximum 50 monitor scans per hour.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // The body is read up to the limit before it is parsed (readBodyCapped). The
  // checks read only the first run in the history (m03, m08) and the last two
  // (m04; m02, m05, m06, m07 and m09 read the last), so a caller near the limit
  // can send those.
  const noStore = { 'Cache-Control': 'no-store' };
  let raw: string | null;
  try {
    raw = await readBodyCapped(request, MONITOR_BODY_MAX_BYTES);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400, headers: noStore });
  }
  if (raw === null) {
    return NextResponse.json(
      { ok: false, error: 'Request body is larger than 512 KB. The checks compare against only the first run in the history and the last two, so send those.' },
      { status: 413, headers: noStore },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400, headers: noStore });
  }
  // Shape and bounds (lib/monitor-history): a malformed field is a 400 that
  // names it. An `email` of any type is accepted and never read. The schema
  // checks each array's length before its elements; anything it throws is
  // still a 400 naming the body, not a 500.
  let checked: ReturnType<typeof monitorRequestSchema.safeParse>;
  try {
    checked = monitorRequestSchema.safeParse(parsed);
  } catch {
    return NextResponse.json({ ok: false, path: 'body', error: 'body: the request could not be checked.' }, { status: 400, headers: noStore });
  }
  if (!checked.success) {
    return NextResponse.json({ ok: false, ...requestProblem(checked.error) }, { status: 400, headers: noStore });
  }
  const body = checked.data;

  const targetUrl = normalizeInputUrl(body.url ?? '');
  if (!isValidUrl(targetUrl)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid URL. Provide a public http(s) URL.' },
      { status: 400, headers: noStore },
    );
  }

  const cadenceRaw = typeof body.cadence === 'string' ? body.cadence.trim().toLowerCase() : 'weekly';
  if (!Object.prototype.hasOwnProperty.call(CADENCE_DAYS, cadenceRaw)) {
    return NextResponse.json(
      { ok: false, error: 'cadence must be daily, weekly or monthly.' },
      { status: 400, headers: noStore },
    );
  }
  const cadence = cadenceRaw as Cadence;

  const history: PriorRun[] = body.history ?? [];
  const result = await scoreMonitor(targetUrl, history);

  // m02 is time-dependent, so it is measured now, not read from the cache.
  if (result.ok && result.monitorChecks) {
    const i = result.monitorChecks.findIndex((c) => c.id === 'm02');
    if (i >= 0) result.monitorChecks[i] = checkM02LastRunFresh(history, cadence, Date.now());
  }

  if (result.ok && result.monitorChecks) Object.assign(result, tallyMonitor(result.monitorChecks));

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'no-store' },
  });
}