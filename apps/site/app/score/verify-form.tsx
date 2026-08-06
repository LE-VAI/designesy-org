// Unified Verification Dashboard — the /score power surface.
//
// Fires /api/report (score + drift + readiness in parallel, composite grade)
// AND /api/guardrails (6-check emitter + bundle) in parallel — one URL,
// four engines, one composite grade, one tabbed cockpit.
//
// The report API stores the full score JSON (slop, originality, categoryScores)
// via `await scoreResp.value.json()` — even though its SubEngineResult type
// only declares a subset. We type the score result as a superset to access
// the rich score data through the report response without a separate fetch.
//
// Reuses the class-driven CSS vocabulary from ScoreForm: .score-input-*,
// .score-hero-card, .score-metrics-grid, .score-filter-segmented,
// .score-cards-feed, .score-signals-card, .score-history-panel.
// No new CSS classes needed — all exist in globals.css.
//
// A11y upgrades over ScoreForm:
// - role="tablist" / role="tab" / aria-selected on the engine switcher
//   (the codebase had zero ARIA tablists before this)
// - onKeyDown Enter/Space handler on .score-card-item (ScoreForm had
//   tabIndex=0 with no key handler — a latent a11y gap)

'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { CopyPrompt } from '../lib/copy-prompt';

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'ok' | 'error';
type Engine = 'score' | 'drift' | 'readiness' | 'guardrails';
type FilterStatus = 'ALL' | 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';

type CheckResult = {
  id: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
  detail: string;
  category?: string;
  remediation?: string;
};

type CategoryScore = {
  score: number | null;
  weight: number;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  manual?: number;
};

type SlopFinding = {
  id: string;
  label: string;
  severity: number;
  instances: number;
  evidence: string[];
  deduction: number;
};

type SlopResult = {
  total: number;
  findings: SlopFinding[];
  convergences: string | null;
};

type OriginalitySignal = {
  id: string;
  label: string;
  points: number;
  evidence: string;
};

type OriginalityResult = {
  points: number;
  signals: OriginalitySignal[];
  summary: string | null;
  slopGateApplied: boolean;
};

type SubEngineResult = {
  ok: boolean;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  checks?: CheckResult[];
  error?: string;
};

// The report API stores the full score JSON (via await scoreResp.value.json()),
// even though its SubEngineResult type only declares a subset. We type the
// score result as a superset to access slop/originality/categoryScores.
type ScoreEngineResult = SubEngineResult & {
  categoryScores?: Record<string, CategoryScore>;
  slop?: SlopResult;
  originality?: OriginalityResult;
  tokensExtracted?: number;
  a11yFloorApplied?: boolean;
  hardFailCeilingApplied?: boolean;
  hardFailCeilingReason?: string | null;
};

type ReportResponse = {
  ok: boolean;
  url?: string;
  compositeScore?: number;
  compositeGrade?: string;
  score?: ScoreEngineResult;
  drift?: SubEngineResult;
  readiness?: SubEngineResult;
  totalChecks?: number;
  totalPass?: number;
  totalWarn?: number;
  totalFail?: number;
  totalSkip?: number;
  totalManual?: number;
  synthesis?: CheckResult[];
  error?: string;
};

type GuardrailsBundle = {
  tokens: object;
  lintConfig: object;
  agentRules: string;
  componentContract: object;
  antiPatterns: object;
  designMd?: string;
};

type GuardrailsResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  tokensExtracted?: number;
  bundle?: GuardrailsBundle;
  checks?: CheckResult[];
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = { FAIL: 0, WARN: 1, MANUAL: 2, SKIP: 3, PASS: 4 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeInput(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function verdictLine(
  composite: number,
  totalPass: number,
  totalFail: number,
  totalWarn: number,
  total: number,
): string {
  if (totalFail === 0 && totalWarn <= Math.max(1, Math.floor(total * 0.15))) {
    return 'Strong conformance — this design reads as engineered, not assembled.';
  }
  if (totalFail > 0) {
    return `${totalFail} contract ${totalFail === 1 ? 'violation' : 'violations'} across 4 engines.`;
  }
  return 'Partial conformance — passes the floor, but the contract sees warnings the eye forgives.';
}

// ── History (lightweight localStorage, separate namespace from score-form) ───

type VerifyHistoryEntry = {
  url: string;
  score: number;
  grade: string;
  scoredAt: string;
  prevScore?: number;
};

const HISTORY_KEY = 'designesy.verify.history.v1';
const HISTORY_MAX = 5;
const HISTORY_RETENTION = 90 * 24 * 60 * 60 * 1000; // 90 days

function readHistory(): VerifyHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VerifyHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - HISTORY_RETENTION;
    return parsed.filter(
      (e) => Number.isFinite(Date.parse(e.scoredAt)) && Date.parse(e.scoredAt) >= cutoff,
    );
  } catch {
    return [];
  }
}

function saveHistory(url: string, score: number, grade: string): VerifyHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  const entry: VerifyHistoryEntry = {
    url,
    score: Math.round(score * 10) / 10,
    grade,
    scoredAt: new Date().toISOString(),
  };
  const current = readHistory();
  const prior = current.find((e) => e.url === url);
  if (prior && prior.score !== entry.score) entry.prevScore = prior.score;
  const withoutDupes = current.filter((e) => e.url !== url);
  const next = [entry, ...withoutDupes].slice(0, HISTORY_MAX);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded or storage disabled — silent no-op */
  }
  return next;
}

function clearHistoryFn(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* noop */
  }
}

function relativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 8) return `${wk}w ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

function truncateUrl(url: string, maxLen = 48): string {
  const clean = url.replace(/^https?:\/\//i, '');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

// ── ScoreDial (inline SVG — same pattern as all forms, r=52) ──────────────────

function ScoreDial({
  score,
  grade,
  size = 120,
}: {
  score: number;
  grade: string;
  size?: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const fill =
    score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--error)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Grade ${grade}, ${score} percent`}
    >
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      {/* Score-0 guard: a zero-length round-capped dash paints a phantom dot.
          Skip the arc entirely at 0 so a fully-failing URL reads as an empty
          ring, not a dot. (Lighthouse PR fix pattern.) */}
      {score > 0 && (
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={fill}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 0.8s var(--ease-out)' }}
        />
      )}
      <text
        x="60"
        y="58"
        textAnchor="middle"
        style={{ fontSize: '2rem', fontWeight: 700, fill: 'var(--ink)' }}
      >
        {grade}
      </text>
      <text
        x="60"
        y="78"
        textAnchor="middle"
        style={{ fontSize: '0.8rem', fill: 'var(--muted-dim)' }}
      >
        {score}/100
      </text>
    </svg>
  );
}

// ── EngineTile (clickable engine summary — doubles as a tab) ──────────────────
//
// Replaces the old EngineCard that hijacked .score-filter-tab (a pill class)
// with inline column overrides. This uses the new .score-engine-tile class —
// a proper left-aligned tile with a 2px top accent bar (not left-border, which
// is the #1 AI-tell per the 2026 design research).

function EngineTile({
  label,
  checkCount,
  result,
  active,
  onClick,
}: {
  label: string;
  checkCount: string;
  result: SubEngineResult | null;
  active: boolean;
  onClick: () => void;
}) {
  const ok = result?.ok && typeof result.score === 'number';
  const score = ok ? result.score! : 0;
  const grade = ok ? result.grade || 'F' : '—';
  const fill = !ok
    ? 'var(--muted-dim)'
    : score >= 90
      ? 'var(--ok)'
      : score >= 70
        ? 'var(--warn)'
        : 'var(--error)';
  const pass = result?.pass || 0;
  const warn = result?.warn || 0;
  const fail = result?.fail || 0;

  return (
    <button
      type="button"
      className={`score-engine-tile ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-selected={active}
      role="tab"
      aria-label={`${label} ${checkCount}: ${ok ? `grade ${grade}, ${score} out of 100, ${pass} pass, ${warn} warn, ${fail} fail` : 'not yet run'}`}
    >
      <span className="score-engine-tile-top" style={{ background: ok ? fill : 'var(--line)' }} />
      <span className="score-engine-tile-head">
        <span className="score-engine-tile-label">{label}</span>
        <span className="score-engine-tile-count">{checkCount}</span>
      </span>
      {ok ? (
        <>
          <span className="score-engine-tile-grade" style={{ color: fill }}>
            {grade}<span className="score-engine-tile-score"> · {score}</span>
          </span>
          <span className="score-engine-tile-pwf">
            <b className="is-pass">{pass}</b>p{' · '}
            <b className="is-warn">{warn}</b>w{' · '}
            <b className="is-fail">{fail}</b>f
          </span>
        </>
      ) : (
        <span className="score-engine-tile-grade is-empty">
          {result?.error ? 'Failed' : '—'}
        </span>
      )}
    </button>
  );
}

// ── VerifyForm ────────────────────────────────────────────────────────────────

export function VerifyForm({ initialUrl = '' }: { initialUrl?: string } = {}) {
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState(initialUrl);
  const [reportResult, setReportResult] = useState<ReportResponse | null>(null);
  const [guardrailsResult, setGuardrailsResult] =
    useState<GuardrailsResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [activeEngine, setActiveEngine] = useState<Engine>('score');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [history, setHistory] = useState<VerifyHistoryEntry[]>([]);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [delta, setDelta] = useState<number | null>(null);
  const [activeBundleTab, setActiveBundleTab] = useState('tokens');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Load history on mount (client-only, SSR-safe).
  useEffect(() => {
    setHistory(readHistory());
  }, []);

  // Animate the composite score dial — same rAF ease-out as ScoreForm.
  useEffect(() => {
    const target = reportResult?.compositeScore;
    if (!target || target === 0) {
      setAnimatedScore(0);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setAnimatedScore(target);
      return;
    }
    const duration = 1200;
    const start = performance.now();
    let rafId: number;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(target * eased);
      if (t < 1) rafId = requestAnimationFrame(animate);
      else setAnimatedScore(target);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [reportResult?.compositeScore]);

  // Auto-run on mount when deep-linked via ?url= (same pattern as ScoreForm).
  useEffect(() => {
    const clean = normalizeInput(initialUrl);
    if (clean) {
      setUrl(initialUrl);
      void runVerify(clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runVerify(targetUrl: string) {
    if (status === 'loading') return;
    if (!targetUrl) return;

    setStatus('loading');
    setReportResult(null);
    setGuardrailsResult(null);
    setExpandedId(null);
    setFilterStatus('ALL');
    setSearchQuery('');
    setActiveEngine('score');
    setDelta(null);

    // Fire both APIs in parallel — report synthesizes score+drift+readiness,
    // guardrails is the 4th engine. Each can independently succeed or fail.
    const [reportResp, guardrailsResp] = await Promise.allSettled([
      fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      }),
      fetch('/api/guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      }),
    ]);

    let report: ReportResponse | null = null;
    let guardrails: GuardrailsResponse | null = null;

    if (reportResp.status === 'fulfilled') {
      try {
        report = (await reportResp.value.json()) as ReportResponse;
      } catch {
        report = { ok: false, error: 'Report engine returned invalid JSON' };
      }
    } else {
      report = { ok: false, error: 'Report engine network error' };
    }

    if (guardrailsResp.status === 'fulfilled') {
      try {
        guardrails = (await guardrailsResp.value.json()) as GuardrailsResponse;
      } catch {
        guardrails = { ok: false, error: 'Guardrails engine returned invalid JSON' };
      }
    } else {
      guardrails = { ok: false, error: 'Guardrails engine network error' };
    }

    // Both failed → error state
    if (!report?.ok && !guardrails?.ok) {
      setStatus('error');
      setReportResult(report);
      setGuardrailsResult(guardrails);
      return;
    }

    setStatus('ok');
    setScoredUrl(targetUrl);
    setReportResult(report);
    setGuardrailsResult(guardrails);

    // Save to history using the composite score (or guardrails score if
    // report failed but guardrails succeeded).
    const compositeScore = report?.ok
      ? report.compositeScore
      : guardrails?.score;
    const compositeGrade = report?.ok
      ? report.compositeGrade
      : guardrails?.grade;
    if (typeof compositeScore === 'number' && typeof compositeGrade === 'string') {
      const next = saveHistory(targetUrl, compositeScore, compositeGrade);
      setHistory(next);
      setHistoryCleared(false);
      const mine = next.find((e) => e.url === targetUrl);
      if (mine && typeof mine.prevScore === 'number') {
        setDelta(
          Math.round((compositeScore - mine.prevScore) * 10) / 10,
        );
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runVerify(normalizeInput(url));
  }

  // Get the checks for the active engine.
  const activeChecks = useMemo(() => {
    if (activeEngine === 'score') return reportResult?.score?.checks || [];
    if (activeEngine === 'drift') return reportResult?.drift?.checks || [];
    if (activeEngine === 'readiness')
      return reportResult?.readiness?.checks || [];
    if (activeEngine === 'guardrails') return guardrailsResult?.checks || [];
    return [];
  }, [activeEngine, reportResult, guardrailsResult]);

  const filteredChecks = useMemo(() => {
    return activeChecks
      .filter((c) => {
        if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (
            !c.id.toLowerCase().includes(q) &&
            !c.item.toLowerCase().includes(q) &&
            !c.detail.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Fail-first sort only when on "ALL" — surface what to fix first.
        if (filterStatus !== 'ALL') return 0;
        return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      });
  }, [activeChecks, filterStatus, searchQuery]);

  // Group filtered checks by status — FAIL / WARN / MANUAL / SKIP / PASS sections.
  // Each group is collapsible. FAIL is expanded by default (you need to see
  // what broke); PASS is collapsed by default (it's noise when you're fixing).
  // MANUAL is expanded by default (actionable — run the audit to resolve).
  // SKIP (N/A) is collapsed by default (nothing to do — convention not met).
  const groupedChecks = useMemo(() => {
    const groups: { status: FilterStatus; checks: CheckResult[] }[] = [];
    const order: FilterStatus[] = ['FAIL', 'WARN', 'MANUAL', 'SKIP', 'PASS'];
    for (const s of order) {
      const checks = filteredChecks.filter((c) => c.status === s);
      if (checks.length > 0) groups.push({ status: s, checks });
    }
    return groups;
  }, [filteredChecks]);

  function isGroupCollapsed(status: FilterStatus): boolean {
    // PASS and SKIP (N/A) collapse by default — PASS is confirmation noise,
    // N/A means "convention not met, nothing to do." Everything else is
    // expanded by default so you see what needs attention.
    const key = `${activeEngine}:${status}`;
    if (key in collapsedGroups) return collapsedGroups[key];
    return status === 'PASS' || status === 'SKIP';
  }

  function toggleGroup(status: FilterStatus) {
    const key = `${activeEngine}:${status}`;
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !isGroupCollapsed(status),
    }));
  }

  // Active engine result (for the note line below the feed).
  const activeEngineResult: SubEngineResult | null = useMemo(() => {
    if (activeEngine === 'score') return reportResult?.score || null;
    if (activeEngine === 'drift') return reportResult?.drift || null;
    if (activeEngine === 'readiness')
      return reportResult?.readiness || null;
    if (activeEngine === 'guardrails') return guardrailsResult || null;
    return null;
  }, [activeEngine, reportResult, guardrailsResult]);

  // Score engine's slop/originality (only when score tab is active).
  const scoreData = reportResult?.score as ScoreEngineResult | undefined;

  function copyReceipt() {
    if (!reportResult && !guardrailsResult) return;
    const lines = [
      `# Designesy Unified Verification Receipt`,
      `Site: ${scoredUrl}`,
      `Assessed: ${new Date().toISOString()}`,
    ];
    if (reportResult?.ok) {
      lines.push(
        ``,
        `## Composite Score`,
        `Grade: ${reportResult.compositeGrade} (${fmtPct(reportResult.compositeScore)}%)`,
        `Formula: score×0.5 + drift×0.3 + readiness×0.2`,
        `Totals: ${reportResult.totalPass || 0} pass · ${reportResult.totalWarn || 0} warn · ${reportResult.totalFail || 0} fail · ${reportResult.totalManual || 0} manual · ${reportResult.totalSkip || 0} N/A of ${reportResult.totalChecks || 0}`,
      );
    }
    const engines: [string, SubEngineResult | null | undefined][] = [
      ['Score (40-check)', reportResult?.score],
      ['Drift (12-check)', reportResult?.drift],
      ['Readiness (10-check)', reportResult?.readiness],
      ['Guardrails (6-check)', guardrailsResult],
    ];
    for (const [label, res] of engines) {
      if (res?.ok && typeof res.score === 'number') {
        lines.push(
          ``,
          `## ${label}`,
          `Grade: ${res.grade} · ${res.score}/100 — ${res.pass || 0}p · ${res.warn || 0}w · ${res.fail || 0}f`,
        );
      }
    }
    if (activeChecks.length > 0) {
      lines.push(``, `## ${activeEngine} checks`);
      for (const c of activeChecks) {
        lines.push(`[${c.status}] ${c.id}: ${c.item} — ${c.detail}`);
      }
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const shareUrl =
    typeof window !== 'undefined' && scoredUrl
      ? `${window.location.origin}/score?url=${encodeURIComponent(scoredUrl)}`
      : '';

  function copyShareLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }

  function handleClearHistory() {
    clearHistoryFn();
    setHistory([]);
    setHistoryCleared(true);
    setTimeout(() => setHistoryCleared(false), 2500);
  }

  // Bundle tab content for guardrails.
  const bundle = guardrailsResult?.bundle;
  function getBundleContent(tab: string): string {
    if (!bundle) return '';
    switch (tab) {
      case 'tokens':
        return JSON.stringify(bundle.tokens, null, 2);
      case 'lintConfig':
        return JSON.stringify(bundle.lintConfig, null, 2);
      case 'agentRules':
        return bundle.agentRules || '';
      case 'componentContract':
        return JSON.stringify(bundle.componentContract, null, 2);
      case 'antiPatterns':
        return JSON.stringify(bundle.antiPatterns, null, 2);
      case 'designMd':
        return bundle.designMd || '';
      default:
        return '';
    }
  }

  const bundleTabs = [
    { id: 'tokens', label: 'Tokens (DTCG)' },
    { id: 'lintConfig', label: 'Stylelint' },
    { id: 'agentRules', label: 'Agent Rules' },
    { id: 'componentContract', label: 'Components' },
    { id: 'antiPatterns', label: 'Anti-Patterns' },
    ...(bundle?.designMd ? [{ id: 'designMd', label: 'DESIGN.md' }] : []),
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="score-form">
      {/* Input — same chrome as ScoreForm, all forms share this. */}
      <form ref={formRef} onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10z" />
              </svg>
            </span>
            <input
              type="text"
              inputMode="url"
              enterKeyHint="go"
              autoComplete="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Enter any website URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={status === 'loading'}
              aria-label="Site URL to verify"
              data-cuelume-hover="tick"
              className="score-url-input-inner"
            />
          </div>
          <button
            type="submit"
            disabled={status === 'loading' || !url.trim()}
            data-cuelume-press="sparkle"
            data-firework="true"
            className="button primary score-submit"
          >
            {status === 'loading' ? (
              <span className="score-loading-state">
                <span className="score-spinner" />
                Running 4 engines…
              </span>
            ) : (
              'Verify it'
            )}
          </button>
        </div>
      </form>

      {/* Error state */}
      {status === 'error' && (
        <div className="score-error-card">
          <span className="score-error-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <div>
            <p className="score-error-title">Verification Notice</p>
            <p className="score-error-msg">
              {reportResult?.error ||
                guardrailsResult?.error ||
                'All engines failed — check that the URL is correct and publicly accessible.'}
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {status === 'loading' && (
        <div
          className="score-verify-log"
          role="status"
          aria-live="polite"
          aria-label="Verification in progress"
        >
          <p className="score-verify-log-title">
            Running 4 engines in parallel
          </p>
          <ol className="score-verify-log-list">
            {[
              'Score engine (40 checks)',
              'Drift radar (12 checks)',
              'AI readiness (10 checks)',
              'Guardrails emitter (6 checks)',
            ].map((step, i) => (
              <li
                key={step}
                className="score-verify-log-step"
                style={{ animationDelay: `${i * 900}ms` }}
              >
                <span className="score-verify-dot" aria-hidden="true" />
                {step}
              </li>
            ))}
          </ol>
          <div className="score-skeleton-feed" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="score-skeleton-row" />
            ))}
          </div>
        </div>
      )}

      {/* OK state — the unified dashboard */}
      {status === 'ok' && (reportResult?.ok || guardrailsResult?.ok) && (
        <div className="score-results fade-up">
          {/* Composite hero card — grade dial, composite score, formula, totals */}
          {reportResult?.ok &&
            typeof reportResult.compositeScore === 'number' && (
              <div
                className={`score-hero-card is-${reportResult.compositeGrade?.toLowerCase()}`}
              >
                <p className="score-verdict-line">
                  {verdictLine(
                    reportResult.compositeScore,
                    reportResult.totalPass || 0,
                    reportResult.totalFail || 0,
                    reportResult.totalWarn || 0,
                    reportResult.totalChecks || 0,
                  )}
                </p>

                <div className="score-hero-top">
                  <ScoreDial
                    score={Math.round(animatedScore)}
                    grade={reportResult.compositeGrade || 'F'}
                  />
                  <div className="score-hero-meta">
                    <div className="score-percent-badge">
                      <span className="score-percent-value">
                        {fmtPct(animatedScore)}%
                      </span>
                      <span className="score-percent-label">
                        Composite Score
                      </span>
                      {delta !== null && delta !== 0 && (
                        <span
                          className={`score-delta-chip ${delta > 0 ? 'is-up' : 'is-down'}`}
                          title="Change vs your previous composite score for this site"
                        >
                          {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}
                          {delta}
                        </span>
                      )}
                    </div>
                    <p className="score-strong-weak">
                      score×0.5 + drift×0.3 + readiness×0.2
                    </p>
                    <div className="score-site-url">
                      <span className="score-url-dot" />
                      <a
                        href={scoredUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="score-url-link"
                        title={`Open ${scoredUrl} in a new tab`}
                      >
                        {scoredUrl.replace(/^https?:\/\//i, '')}
                      </a>
                      <span className="score-url-time">
                        {new Date()
                          .toISOString()
                          .slice(0, 16)
                          .replace('T', ' ')}{' '}
                        UTC
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total metrics across all engines */}
                <div className="score-metrics-grid">
                  <div className="score-metric-tile is-pass">
                    <span className="score-metric-val">
                      {reportResult.totalPass || 0}
                    </span>
                    <span className="score-metric-lbl">Passed</span>
                  </div>
                  <div className="score-metric-tile is-fail">
                    <span className="score-metric-val">
                      {reportResult.totalFail || 0}
                    </span>
                    <span className="score-metric-lbl">Failed</span>
                  </div>
                  <div className="score-metric-tile is-warn">
                    <span className="score-metric-val">
                      {reportResult.totalWarn || 0}
                    </span>
                    <span className="score-metric-lbl">Warnings</span>
                  </div>
                  <div className="score-metric-tile is-manual">
                    <span className="score-metric-val">
                      {reportResult.totalManual || 0}
                    </span>
                    <span className="score-metric-lbl">Manual</span>
                  </div>
                  <div className="score-metric-tile is-skip">
                    <span className="score-metric-val">
                      {reportResult.totalSkip || 0}
                    </span>
                    <span className="score-metric-lbl">N/A</span>
                  </div>
                </div>

                {/* Actions — ordered by natural next-step priority.
                    Open site is first (most common desire after scoring),
                    then copy receipt, then share/deep-link actions. */}
                <div className="score-hero-actions">
                  <a
                    href={scoredUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="score-action-btn score-open-site-btn"
                    data-cuelume-press="tick"
                    title={`Open ${scoredUrl} in a new tab`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Open site
                  </a>
                  <button
                    type="button"
                    onClick={() => runVerify(scoredUrl)}
                    className="score-action-btn"
                    data-cuelume-press="tick"
                    title="Re-run all 4 engines against this URL"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Re-run
                  </button>
                  <button
                    type="button"
                    onClick={copyReceipt}
                    className="score-action-btn"
                    data-cuelume-press="tick"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {copied ? 'Receipt Copied!' : 'Copy Receipt'}
                  </button>
                  <a
                    href={`/report?url=${encodeURIComponent(scoredUrl)}`}
                    className="score-action-btn"
                    data-cuelume-press="tick"
                    title="Open the full synthesis report — 8 synthesis checks, MCP App, export."
                  >
                    Open /report →
                  </a>
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="score-action-btn score-share-btn"
                    data-cuelume-press="tick"
                    disabled={!shareUrl}
                    title="Copy the shareable link"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    {linkCopied ? 'Link copied!' : 'Copy link'}
                  </button>
                  {shareUrl && (
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                        `Designesy composite: Grade ${reportResult.compositeGrade} (${fmtPct(reportResult.compositeScore)}%) — ${scoredUrl}`,
                      )}&url=${encodeURIComponent(shareUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="score-action-btn score-share-btn"
                      data-cuelume-press="tick"
                      title="Share on X"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Share on X
                    </a>
                  )}
                </div>
              </div>
            )}

          {/* Engine tiles row — 4 clickable tiles that double as the tablist.
              ARIA tablist: the first proper tablist in the codebase.
              Uses a responsive grid (not a flex row) so tiles wrap cleanly. */}
          <div
            className="score-engine-grid"
            role="tablist"
            aria-label="Verification engines"
          >
            <EngineTile
              label="Score"
              checkCount="(40)"
              result={reportResult?.score || null}
              active={activeEngine === 'score'}
              onClick={() => {
                setActiveEngine('score');
                setExpandedId(null);
                setCollapsedGroups({});
              }}
            />
            <EngineTile
              label="Drift"
              checkCount="(12)"
              result={reportResult?.drift || null}
              active={activeEngine === 'drift'}
              onClick={() => {
                setActiveEngine('drift');
                setExpandedId(null);
                setCollapsedGroups({});
              }}
            />
            <EngineTile
              label="Readiness"
              checkCount="(10)"
              result={reportResult?.readiness || null}
              active={activeEngine === 'readiness'}
              onClick={() => {
                setActiveEngine('readiness');
                setExpandedId(null);
                setCollapsedGroups({});
              }}
            />
            <EngineTile
              label="Guardrails"
              checkCount="(6)"
              result={guardrailsResult || null}
              active={activeEngine === 'guardrails'}
              onClick={() => {
                setActiveEngine('guardrails');
                setExpandedId(null);
                setCollapsedGroups({});
              }}
            />
          </div>

          {/* Score tab extras — slop + originality signals.
              The report API carries the full score JSON (slop, originality,
              categoryScores) through the score sub-engine result. */}
          {activeEngine === 'score' &&
            scoreData &&
            ((scoreData.originality &&
              scoreData.originality.signals.length > 0) ||
              (scoreData.slop && scoreData.slop.findings.length > 0)) && (
              <div className="score-signals-card">
                <div className="score-signals-head">
                  <span className="score-signals-eyebrow">
                    Craft signals &amp; anti-slop audit
                  </span>
                  <span className="score-signals-net">
                    {scoreData.originality &&
                      scoreData.originality.points > 0 && (
                        <span className="score-signals-net-pos">
                          +{scoreData.originality.points}
                        </span>
                      )}
                    {scoreData.slop && scoreData.slop.total > 0 && (
                      <span className="score-signals-net-neg">
                        −{scoreData.slop.total}
                      </span>
                    )}
                  </span>
                </div>

                {scoreData.originality &&
                  scoreData.originality.signals.length > 0 && (
                    <div className="score-signals-group">
                      <p className="score-signals-group-title is-originality">
                        Originality — positive craft signals
                        <span className="score-signals-group-chip">
                          +{scoreData.originality.points}pt
                          {scoreData.originality.points !== 1 ? 's' : ''}
                          {scoreData.originality.slopGateApplied
                            ? ' · slop-gated ×0.5'
                            : ''}
                        </span>
                      </p>
                      <ul className="score-signals-list">
                        {scoreData.originality.signals.map((s) => (
                          <li
                            key={s.id}
                            className="score-signal-row is-originality"
                          >
                            <span className="score-signal-points">
                              +{s.points}
                            </span>
                            <span className="score-signal-body">
                              <span className="score-signal-label">
                                {s.label}
                              </span>
                              <span className="score-signal-evidence">
                                {s.evidence}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {scoreData.slop && scoreData.slop.findings.length > 0 && (
                  <div className="score-signals-group">
                    <p className="score-signals-group-title is-slop">
                      Anti-slop — generic/template patterns
                      <span className="score-signals-group-chip is-neg">
                        −{scoreData.slop.total}pt
                        {scoreData.slop.total !== 1 ? 's' : ''}
                      </span>
                    </p>
                    <ul className="score-signals-list">
                      {scoreData.slop.findings.map((f) => (
                        <li
                          key={f.id}
                          className="score-signal-row is-slop"
                        >
                          <span className="score-signal-points is-neg">
                            −{f.deduction}
                          </span>
                          <span className="score-signal-body">
                            <span className="score-signal-label">
                              {f.label}
                            </span>
                            {f.evidence && f.evidence.length > 0 && (
                              <span className="score-signal-evidence">
                                {f.evidence.slice(0, 3).join(' · ')}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          {/* Guardrails tab extras — bundle output (tabbed code block).
              Rendered below the checks feed, not above — checks come first
              (consistent with other tabs), bundle is the bonus section. */}
          {activeEngine === 'guardrails' &&
            guardrailsResult?.ok &&
            bundle && (
              <div className="score-controls-card">
                <div
                  className="score-filter-segmented"
                  role="tablist"
                  aria-label="Guardrails bundle sections"
                >
                  {bundleTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`score-filter-tab ${activeBundleTab === tab.id ? 'is-active' : ''}`}
                      onClick={() => setActiveBundleTab(tab.id)}
                      aria-selected={activeBundleTab === tab.id}
                      role="tab"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <CopyPrompt label={`${activeBundleTab} bundle`}>
                  {getBundleContent(activeBundleTab)}
                </CopyPrompt>
              </div>
            )}

          {/* Filter + search controls */}
          <div className="score-controls-card">
            <div className="score-filter-segmented">
              <button
                type="button"
                className={`score-filter-tab ${filterStatus === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('ALL')}
              >
                All{' '}
                <span className="score-tab-count">
                  {activeChecks.length}
                </span>
              </button>
              <button
                type="button"
                className={`score-filter-tab is-pass ${filterStatus === 'PASS' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('PASS')}
              >
                Pass{' '}
                <span className="score-tab-count">
                  {activeChecks.filter((c) => c.status === 'PASS').length}
                </span>
              </button>
              {activeChecks.some((c) => c.status === 'FAIL') && (
                <button
                  type="button"
                  className={`score-filter-tab is-fail ${filterStatus === 'FAIL' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('FAIL')}
                >
                  Fail{' '}
                  <span className="score-tab-count">
                    {activeChecks.filter((c) => c.status === 'FAIL').length}
                  </span>
                </button>
              )}
              {activeChecks.some((c) => c.status === 'WARN') && (
                <button
                  type="button"
                  className={`score-filter-tab is-warn ${filterStatus === 'WARN' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('WARN')}
                >
                  Warn{' '}
                  <span className="score-tab-count">
                    {activeChecks.filter((c) => c.status === 'WARN').length}
                  </span>
                </button>
              )}
              {activeChecks.some((c) => c.status === 'MANUAL') && (
                <button
                  type="button"
                  className={`score-filter-tab is-manual ${filterStatus === 'MANUAL' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('MANUAL')}
                >
                  Manual{' '}
                  <span className="score-tab-count">
                    {activeChecks.filter((c) => c.status === 'MANUAL').length}
                  </span>
                </button>
              )}
              {activeChecks.some((c) => c.status === 'SKIP') && (
                <button
                  type="button"
                  className={`score-filter-tab is-skip ${filterStatus === 'SKIP' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('SKIP')}
                >
                  N/A{' '}
                  <span className="score-tab-count">
                    {activeChecks.filter((c) => c.status === 'SKIP').length}
                  </span>
                </button>
              )}
            </div>

            <div className="score-search-wrapper">
              <span className="score-search-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="score-search-input"
                placeholder={`Search ${activeChecks.length} ${activeEngine} checks…`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Check cards feed — grouped by status (FAIL/WARN/SKIP/PASS),
              each group collapsible. FAIL expanded by default; PASS collapsed.
              This mirrors Lighthouse's Passed/Failed/Manual/NA bucketing. */}
          <div className="score-cards-feed">
            {filteredChecks.length === 0 ? (
              <div className="score-empty-feed">
                <p className="score-empty-title">No matching checks</p>
                <p className="score-empty-desc">
                  Try adjusting your search query or status filter.
                </p>
                <button
                  type="button"
                  className="score-action-btn"
                  onClick={() => {
                    setFilterStatus('ALL');
                    setSearchQuery('');
                  }}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              groupedChecks.map((group) => {
                const collapsed = isGroupCollapsed(group.status);
                const statusLower = group.status.toLowerCase();
                return (
                  <div
                    key={group.status}
                    className={`score-check-group is-${statusLower}`}
                  >
                    <button
                      type="button"
                      className="score-check-group-header"
                      onClick={() => toggleGroup(group.status)}
                      aria-expanded={!collapsed}
                      aria-controls={`group-${activeEngine}-${group.status}`}
                    >
                      <span
                        className={`score-check-group-dot is-${statusLower}`}
                        aria-hidden="true"
                      />
                      <span className="score-check-group-label">
                        {group.status === 'PASS' ? 'Passing' :
                         group.status === 'FAIL' ? 'Failing' :
                         group.status === 'WARN' ? 'Warnings' :
                         group.status === 'MANUAL' ? 'Manual checks' : 'Not applicable'}
                      </span>
                      <span className="score-check-group-count">
                        {group.checks.length}
                      </span>
                      <svg
                        className="score-check-group-chevron"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{
                          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s var(--ease-out)',
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {!collapsed && (
                      <div
                        id={`group-${activeEngine}-${group.status}`}
                        className="score-check-group-body"
                      >
                        {group.checks.map((check, idx) => {
                          const isExpanded = expandedId === check.id;
                          return (
                            <div
                              key={check.id}
                              className={`score-card-item ${isExpanded ? 'is-expanded' : ''}`}
                              onClick={() =>
                                setExpandedId(isExpanded ? null : check.id)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setExpandedId(isExpanded ? null : check.id);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              style={{ animationDelay: `${Math.min(idx * 40, 600)}ms` }}
                            >
                              <div className="score-card-main">
                                <div className="score-card-badge-group">
                                  <span
                                    className={`score-card-status-pill is-${check.status.toLowerCase()}`}
                                  >
                                    {check.status === 'MANUAL' ? 'Manual' :
                                     check.status === 'SKIP' ? 'N/A' :
                                     check.status}
                                  </span>
                                  <span className="score-card-id">{check.id}</span>
                                  {check.category && (
                                    <span className="score-card-cat">
                                      {check.category}
                                    </span>
                                  )}
                                </div>
                                <h4 className="score-card-title">{check.item}</h4>
                              </div>

                              <span className="score-card-right">
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  style={{
                                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s',
                                  }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </span>

                              {isExpanded && (
                                <div className="score-card-drawer">
                                  <p className="score-drawer-heading">
                                    Technical Finding
                                  </p>
                                  <p className="score-drawer-detail">{check.detail}</p>
                                  {check.remediation &&
                                    (check.status === 'FAIL' ||
                                      check.status === 'WARN') && (
                                      <>
                                        <p className="score-drawer-heading score-drawer-remediation-heading">
                                          How to fix this
                                        </p>
                                        <p className="score-drawer-detail score-drawer-remediation">
                                          {check.remediation}
                                        </p>
                                      </>
                                    )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Note line */}
          <p className="score-note">
            {activeChecks.length} {activeEngine} checks ·{' '}
            {activeEngineResult?.ok
              ? `${activeEngineResult.grade}/${activeEngineResult.score}`
              : 'engine failed'}{' '}
            · Designesy design system contract v0.4.0
            {scoreData?.a11yFloorApplied && (
              <span className="score-a11y-floor-notice">
                {' '}
                · Accessibility floor applied: score capped at C (70).
              </span>
            )}
            {scoreData?.hardFailCeilingApplied && (
              <span className="score-a11y-floor-notice">
                {' '}
                · Hard-fail ceiling:{' '}
                {scoreData.hardFailCeilingReason ||
                  'A critical check failed, capping the score.'}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Idle state */}
      {status === 'idle' && (
        <div className="score-welcome-card">
          <p className="score-welcome-title">Unified Verification Cockpit</p>
          <p className="score-hint">
            Enter any public website URL above — no https:// needed. Four
            engines fire in parallel: Score (40 checks), Drift (12 checks), AI
            Readiness (10 checks), and Guardrails (6 checks). One composite
            grade. No login required.
          </p>
        </div>
      )}

      {/* History — separate namespace from score-form's history */}
      {history.length > 0 && (
        <section
          className="score-history-panel fade-up"
          aria-label="Recent verifications"
        >
          <div className="score-history-head">
            <p className="score-history-title">Recent verifications</p>
            <button
              type="button"
              className="score-history-clear"
              onClick={handleClearHistory}
              data-cuelume-press="tick"
              aria-label="Clear recent verifications"
            >
              {historyCleared ? 'Cleared' : 'Clear'}
            </button>
          </div>
          <ul className="score-history-list">
            {history.map((entry) => (
              <li
                key={`${entry.url}-${entry.scoredAt}`}
                className={`score-history-item is-${entry.grade.toLowerCase()}`}
              >
                <div
                  className={`score-history-emblem is-${entry.grade.toLowerCase()}`}
                >
                  {entry.grade}
                </div>
                <div className="score-history-body">
                  <span
                    className="score-history-url"
                    title={entry.url}
                  >
                    {truncateUrl(entry.url)}
                  </span>
                  <span className="score-history-meta">
                    {fmtPct(entry.score)}% · {relativeTime(entry.scoredAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="score-history-rerun"
                  onClick={() => {
                    setUrl(entry.url);
                    void runVerify(entry.url);
                  }}
                  data-cuelume-hover="tick"
                  aria-label={`Re-verify ${truncateUrl(entry.url)}`}
                >
                  Re-verify
                </button>
              </li>
            ))}
          </ul>
          <p className="score-history-foot">
            Free tier keeps your last 5 verifications in this browser.{' '}
            <a href="/pricing" className="text-link">
              Score Pass
            </a>{' '}
            unlocks 90-day history + export.
          </p>
        </section>
      )}
    </div>
  );
}