// v2026-07-25-clean-rewrite — no inline styles, CSS-class driven
// v2026-07-25-history — free-tier local score history (5 most-recent per browser)
'use client';

import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import {
  readScoreHistory,
  saveScore,
  clearScoreHistory,
  relativeTime,
  truncateUrl,
  type ScoreHistoryEntry,
} from '../lib/score-history';
import { LottieHint, LottieTip } from '../lib/lottie-hint';
import { playGradeReveal, playExtended } from '../lib/cuelume-extend';

/**
 * Sound gate — mirrors the preference logic in use-sound.tsx.
 * Returns false under reduced-motion or when the user has muted via toggle.
 * Prevents score-reveal sounds from firing when sound is off.
 */
function soundIsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const stored = localStorage.getItem('designesy:sound');
    if (stored === 'false') return false;
  } catch {
    return false;
  }
  return true;
}

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
  detail: string;
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

type ScoreResponse = {
  ok: boolean;
  score?: number;
  grade?: string;
  pass?: number;
  fail?: number;
  warn?: number;
  skip?: number;
  manual?: number;
  total?: number;
  scope?: 'contract' | 'universal';
  a11yFloorApplied?: boolean;
  hardFailCeilingApplied?: boolean;
  hardFailCeilingReason?: string | null;
  categoryScores?: Record<string, CategoryScore>;
  checks?: CheckResult[];
  tokensExtracted?: number;
  slop?: SlopResult;
  originality?: OriginalityResult;
  error?: string;
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

type AuditResponse = {
  ok: boolean;
  url?: string;
  checks?: CheckResult[];
  error?: string;
};

type FilterStatus = 'ALL' | 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'tokens', label: 'Tokens' },
  { key: 'responsive', label: 'Responsive' },
  { key: 'interaction', label: 'Interaction' },
  { key: 'poise', label: 'Poise' },
  { key: 'motion', label: 'Motion' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'identity', label: 'Identity' },
  { key: 'takt', label: 'Takt' },
  { key: 'cadence', label: 'Cadence' },
  { key: 'performance', label: 'Performance' },
  { key: 'semantic', label: 'Semantic' },
];

// ── Constellation geometry ────────────────────────────────────────────────
// The category constellation replaces the radar/wheel idiom (Observable's
// 2025 radar critique: axis-order illusion undermines exactly the legitimacy
// a scoring tool must earn). Categories sit on a FIXED ring indexed by
// contract weight — heaviest (cadence) at 12 o'clock, descending clockwise.
// Fixed order = no axis-order manipulation. The center circle r=26 leaves
// room for the grade letter + percent; nodes render at r=48 as small arcs
// whose fill length = category score.
const CONSTELLATION_ORDER = [
  'cadence', 'accessibility', 'semantic', 'motion', 'tokens',
  'takt', 'poise', 'identity', 'interaction', 'performance', 'responsive',
];
const CONSTEL_C = 50;      // viewBox center (0 0 100 100)
const CONSTEL_RING_R = 26; // main-score ring radius (circumference ≈ 163.36)
const CONSTEL_NODE_R = 48; // category node ring radius
const MAIN_CIRC = 2 * Math.PI * CONSTEL_RING_R; // 163.3628
const NODE_ARC_R = 7;      // category micro-arc stroke radius
const NODE_ARC_CIRC = 2 * Math.PI * NODE_ARC_R; // 43.9823

function constellationPoint(index: number, total: number, r: number): { x: number; y: number } {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // 12 o'clock start
  return { x: CONSTEL_C + r * Math.cos(angle), y: CONSTEL_C + r * Math.sin(angle) };
}

// Verdict line — PSI "Core Web Vitals Assessment: Passed" pattern: the
// one-line human verdict leads, in words not color, before the number.
function verdictLine(r: ScoreResponse): string {
  const total = r.total ?? 0;
  const fails = r.fail ?? 0;
  if (fails === 0 && (r.warn ?? 0) <= Math.max(1, Math.floor(total * 0.15))) {
    return 'Strong conformance — this design system reads as engineered, not assembled.';
  }
  if (fails > 0) {
    const worst = topCategories(r, 'worst');
    return `${fails} contract ${fails === 1 ? 'violation' : 'violations'}${worst.label ? ` — weakest in ${worst.label}` : ''}.`;
  }
  return 'Partial conformance — passes the floor, but the contract sees warnings the eye forgives.';
}

// Strongest / weakest scored categories for the hero meta line.
function topCategories(r: ScoreResponse, mode: 'best' | 'worst'): { label: string; score: number | null } {
  const entries = Object.entries(r.categoryScores || {}).filter(([, v]) => v.score !== null);
  if (entries.length === 0) return { label: '', score: null };
  const sorted = entries.sort((a, b) => (mode === 'best' ? (b[1].score! - a[1].score!) : (a[1].score! - b[1].score!)));
  const [key, val] = sorted[0];
  const label = CATEGORIES.find((c) => c.key === key)?.label
    || key.charAt(0).toUpperCase() + key.slice(1);
  return { label, score: val.score };
}

// Sort order for check cards — failures and warnings first, passes/skips last.
// This surfaces "what to fix first" without a separate quick-wins block, per
// the Lighthouse pattern (Opportunities/Diagnostics before Passed checks).
// Central percentage formatter. Scores arrive as numbers that can carry
// floating-point tails (weighted WARN paths produce e.g. 68.99999999999999,
// or long-history/API values like 68.9). Always render through fmtPct so a
// raw float never truncates mid-cell. Integers stay integers (100, not 100.0);
// fractions keep one decimal (68.9). The "%" glyph is appended by the caller
// where markup needs it as a separate node.
function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const STATUS_ORDER: Record<string, number> = { FAIL: 0, WARN: 1, MANUAL: 2, SKIP: 3, PASS: 4 };

function normalizeInput(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}

export function ScoreForm({ initialUrl = '' }: { initialUrl?: string } = {}) {
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState(initialUrl);
  const [scopeMode, setScopeMode] = useState<'auto' | 'contract' | 'universal'>('auto');
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [badgeCopied, setBadgeCopied] = useState(false);
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [auditError, setAuditError] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [animatedCatScores, setAnimatedCatScores] = useState<Record<string, number>>({});
  const [animatedCounts, setAnimatedCounts] = useState({ pass: 0, fail: 0, warn: 0, manual: 0, skip: 0, total: 0, origPoints: 0, slopTotal: 0 });
  const [delta, setDelta] = useState<number | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const filterSegmentedRef = useRef<HTMLDivElement>(null);

  // Sliding indicator: measure the active filter tab and position a
  // highlight pill behind it. The ::before pseudo-element on
  // .score-filter-segmented reads --indicator-x / --indicator-w.
  // Runs on layout (before paint) so the indicator never flashes at 0,0.
  useLayoutEffect(() => {
    const container = filterSegmentedRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('.score-filter-tab.is-active');
    if (!active) return;
    container.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
    container.style.setProperty('--indicator-w', `${active.offsetWidth}px`);
  }, [filterStatus, result]);

  // Load history on mount (client-only). SSR-safe via the guards inside
  // readScoreHistory.
  useEffect(() => {
    setHistory(readScoreHistory());
  }, []);

  // Animate the score gauge + progress bar when results arrive.
  // The "snazzy" detail Lighthouse reviewers loved — an animated fill from 0
  // to the final score turns a static verdict into a moment. Uses requestAnimationFrame
  // with an ease-out curve over 800ms. Reduced-motion: jumps to final value instantly.
  useEffect(() => {
    if (!result?.score || result.score === 0) {
      setAnimatedScore(0);
      setAnimatedCatScores({});
      setAnimatedCounts({ pass: 0, fail: 0, warn: 0, manual: 0, skip: 0, total: 0, origPoints: 0, slopTotal: 0 });
      return;
    }
    // Build target integer counts for simultaneous count-up
    const countTargets = {
      pass: result.pass || 0,
      fail: result.fail || 0,
      warn: result.warn || 0,
      manual: result.manual || 0,
      skip: result.skip || 0,
      total: result.total || 0,
      origPoints: result.originality?.points || 0,
      slopTotal: result.slop?.total || 0,
    };
    // Respect reduced-motion: skip the animation, show final values
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimatedScore(result.score);
      const finalCats: Record<string, number> = {};
      if (result.categoryScores) {
        for (const [k, v] of Object.entries(result.categoryScores)) {
          if (v.score !== null) finalCats[k] = v.score;
        }
      }
      setAnimatedCatScores(finalCats);
      setAnimatedCounts(countTargets);
      return;
    }
    const target = result.score;
    // Build target category scores for simultaneous count-up
    const catTargets: Record<string, number> = {};
    if (result.categoryScores) {
      for (const [k, v] of Object.entries(result.categoryScores)) {
        if (v.score !== null) catTargets[k] = v.score;
      }
    }
    const duration = 1200; // Lighthouse PR 17045 "earned" window — long enough to watch the arc fill
    const start = performance.now();
    let rafId: number;
    // Track previous pass/fail counts so we can fire check-pass/check-fail
    // micro-ticks as each check "lands" during the count-up animation.
    let prevPass = 0;
    let prevFail = 0;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnimatedScore(target * eased);
      // Animate category scores in sync
      const cats: Record<string, number> = {};
      for (const [k, v] of Object.entries(catTargets)) {
        cats[k] = v * eased;
      }
      setAnimatedCatScores(cats);
      // Animate integer counts in sync — Math.floor so they tick up, not float
      const curPass = Math.floor(countTargets.pass * eased);
      const curFail = Math.floor(countTargets.fail * eased);
      // Fire micro-tick cues as each check lands (only if sound is enabled).
      // These are intentionally very quiet (gain 0.03, 40-60ms) — they sit
      // beneath the processing loop as texture, not compete with it.
      if (soundIsEnabled()) {
        if (curPass > prevPass) {
          playExtended('check-pass');
          prevPass = curPass;
        }
        if (curFail > prevFail) {
          playExtended('check-fail');
          prevFail = curFail;
        }
      }
      setAnimatedCounts({
        pass: curPass,
        fail: curFail,
        warn: Math.floor(countTargets.warn * eased),
        manual: Math.floor(countTargets.manual * eased),
        skip: Math.floor(countTargets.skip * eased),
        total: Math.floor(countTargets.total * eased),
        origPoints: Math.floor(countTargets.origPoints * eased),
        slopTotal: Math.floor(countTargets.slopTotal * eased),
      });
      if (t < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        setAnimatedScore(target);
        setAnimatedCatScores(catTargets);
        setAnimatedCounts(countTargets);
        // Grade-reveal arpeggio — the hero acoustic moment.
        // Fires when the score animation reaches its final value.
        // Respects sound preference + reduced-motion via soundIsEnabled().
        if (soundIsEnabled() && result?.grade) {
          playGradeReveal(result.grade);
        }
      }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [result?.score]);

  // Auto-run the score once on mount when an initialUrl is provided via a
  // deep link (e.g. /score?url=stripe.com). Normalizes and fires runScore.
  // Runs once on mount only — intentional empty dependency array.
  useEffect(() => {
    const clean = normalizeInput(initialUrl);
    if (clean) {
      setUrl(initialUrl);
      void runScore(clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runScore(targetUrl: string) {
    if (status === 'loading') return;
    if (!targetUrl) return;

    setStatus('loading');
    setResult(null);
    setExpandedId(null);
    setCollapsedGroups({});
    setFilterStatus('ALL');
    setSelectedCategory('ALL');
    setSearchQuery('');
    setAuditStatus('idle');
    setAuditError(null);
    setDelta(null);

    // Start the processing sound loop — a gentle pulse while checks run.
    // Fires only if sound is enabled (respects reduced-motion + toggle).
    if (soundIsEnabled()) playExtended('processing-start');

    try {
      const resp = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, scope: scopeMode }),
      });
      const data: ScoreResponse = await resp.json();
      // Stop the processing loop regardless of outcome.
      playExtended('processing-stop');
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        // Play a feedback cue matched to the error type:
        // - blocked: rate limit / access denied (HTTP 403/429 analogues)
        // - warning: soft errors (invalid URL, unknown format)
        // - retry: fetch failures (502 — could not reach target)
        const errMsg = typeof data.error === 'string' ? data.error : '';
        if (soundIsEnabled()) {
          if (/rate limit|access|forbidden/i.test(errMsg)) {
            playExtended('blocked');
          } else if (/could not reach|fetch|timeout/i.test(errMsg)) {
            playExtended('retry');
          } else {
            playExtended('warning');
          }
        }
        return;
      }
      setStatus('ok');
      setScoredUrl(targetUrl);
      setResult(data);
      // Persist to free-tier local history. saveScore is SSR-safe and
      // dedupes by URL (most-recent wins), caps at 5 entries. The entry
      // carries prevScore so we can show a delta chip ("▲ +3.8 since last").
      if (typeof data.score === 'number' && typeof data.grade === 'string') {
        const next = saveScore(targetUrl, data);
        setHistory(next);
        setHistoryCleared(false);
        const mine = next.find((e) => e.url === targetUrl);
        if (mine && typeof mine.prevScore === 'number') {
          setDelta(Math.round((data.score - mine.prevScore) * 10) / 10);
        }
      }
    } catch {
      playExtended('processing-stop');
      if (soundIsEnabled()) playExtended('error');
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the scoring server.' });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runScore(normalizeInput(url));
  }

  const checks = useMemo(() => result?.checks || [], [result]);

  const filteredChecks = useMemo(() => {
    return checks
      .filter((c) => {
        if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
        if (selectedCategory !== 'ALL' && c.category !== selectedCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchId = c.id.toLowerCase().includes(q);
          const matchItem = c.item.toLowerCase().includes(q);
          const matchDetail = c.detail.toLowerCase().includes(q);
          const matchCategory = c.category.toLowerCase().includes(q);
          if (!matchId && !matchItem && !matchDetail && !matchCategory) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Fail-first sort: FAIL → WARN → SKIP → PASS. When the user picks a
        // specific status filter the sort is stable within that status (preserves
        // the engine's check order). Only "ALL" re-orders to surface failures.
        if (filterStatus !== 'ALL') return 0;
        const orderDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (orderDiff !== 0) return orderDiff;
        return 0;
      });
  }, [checks, filterStatus, selectedCategory, searchQuery]);

  // Collapsible status groups — same pattern as verify-form. FAIL is expanded
  // by default (you need to see what broke); PASS is collapsed by default (it's
  // confirmation noise when you're fixing); MANUAL is expanded (actionable —
  // run the audit to resolve); SKIP (N/A) is collapsed (nothing to do —
  // convention not met). This keeps the feed scannable instead of a wall of 40
  // cards, following the Lighthouse "fail-first, pass-last" pattern.
  const groupedChecks = useMemo(() => {
    const groups: { status: FilterStatus; checks: CheckResult[] }[] = [];
    const order: FilterStatus[] = ['FAIL', 'WARN', 'MANUAL', 'SKIP', 'PASS'];
    for (const s of order) {
      const groupChecks = filteredChecks.filter((c) => c.status === s);
      if (groupChecks.length > 0) groups.push({ status: s, checks: groupChecks });
    }
    return groups;
  }, [filteredChecks]);

  function isGroupCollapsed(status: FilterStatus): boolean {
    // PASS and SKIP (N/A) collapse by default — PASS is confirmation noise,
    // N/A means "convention not met, nothing to do." Everything else is
    // expanded by default so you see what needs attention.
    const key = status;
    if (key in collapsedGroups) return collapsedGroups[key];
    return status === 'PASS' || status === 'SKIP';
  }

  function toggleGroup(status: FilterStatus) {
    const key = status;
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !isGroupCollapsed(status),
    }));
  }

  function copyReceipt() {
    if (!result || !scoredUrl) return;
    const lines = [
      `# Designesy Verification Receipt`,
      `Site: ${scoredUrl}`,
      `Scope: ${result.scope || 'contract'}`,
      `Verdict: ${verdictLine(result)}`,
      `Grade: ${result.grade} (${fmtPct(result.score)}%)`,
      ...(delta !== null ? [`Delta: ${delta > 0 ? '+' : ''}${delta} pts vs previous score`] : []),
      `Assessed: ${new Date().toISOString()}`,
      `Pass: ${result.pass} | Fail: ${result.fail} | Warn: ${result.warn} | Manual: ${result.manual || 0} | N/A: ${result.skip}`,
      `Tokens Extracted: ${result.tokensExtracted || 0}`,
      `Contract: Designesy Design System Contract v0.4.0`,
      `Scoring: weighted per category (PASS 1.0 / WARN 0.5 / FAIL 0, MANUAL and N/A excluded), weights below; accessibility < 60% caps grade at C.`,
    ];
    const cats = result.categoryScores || {};
    const catKeys = CONSTELLATION_ORDER.filter((k) => cats[k]);
    if (catKeys.length > 0) {
      lines.push(``, `## Category Breakdown`);
      for (const k of catKeys) {
        const v = cats[k];
        const label = CATEGORIES.find((c) => c.key === k)?.label || k;
        lines.push(`${label} (weight ${v.weight}%): ${v.score === null ? 'unscored' : fmtPct(v.score) + '%'} — ${v.pass}p/${v.fail}f/${v.warn}w/${v.manual || 0}m/${v.skip}s`);
      }
    }
    lines.push(``, `## Check Summary`);
    for (const c of checks) {
      lines.push(`[${c.status}] ${c.id}: ${c.item} — ${c.detail}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Deep link to this score result — the shareable URL.
  const shareUrl = typeof window !== 'undefined' && scoredUrl
    ? `${window.location.origin}/score?url=${encodeURIComponent(scoredUrl)}`
    : '';
  // Share text: lead with the Designesy score. The scored URL is intentionally
  // omitted from the text — the shareable link (shareUrl) already carries it as
  // the url param in the X/LinkedIn intent URLs. Including the bare scored URL
  // in the text causes X's crawler to attach a card for the scored brand instead
  // of the Designesy grade card.
  const shareText = result?.grade
    ? `Designesy score: Grade ${result.grade} (${fmtPct(result.score)}%) — see the full design-system audit`
    : `Score any site against the Designesy design system contract`;

  function copyShareLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }

  // Copy the embeddable badge snippet — an <a><img></a> block ready to paste
  // into a README, docs page, or site footer. Each embed is a backlink to
  // designesy.org and carries the live grade.
  const badgeSrc = typeof window !== 'undefined' && scoredUrl
    ? `${window.location.origin}/score/badge?url=${encodeURIComponent(scoredUrl)}`
    : '';
  const badgeEmbed = badgeSrc
    ? `<a href="${shareUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeSrc}" alt="Designesy design legitimacy score" /></a>`
    : '';

  function copyBadgeEmbed() {
    if (!badgeEmbed) return;
    navigator.clipboard.writeText(badgeEmbed);
    setBadgeCopied(true);
    setTimeout(() => setBadgeCopied(false), 2500);
  }

  function handleClearHistory() {
    clearScoreHistory();
    setHistory([]);
    setHistoryCleared(true);
    setTimeout(() => setHistoryCleared(false), 2500);
  }

  // Run the full browser audit: calls /api/score/audit which hits PageSpeed
  // Insights for Core Web Vitals (v21) and — when Playwright is enabled on
  // the deployment — viewport overflow (v02) + sound toggle (v04). Results
  // merge into the existing checks array, replacing the SKIP entries.
  async function handleRunAudit() {
    if (auditStatus === 'loading' || !scoredUrl) return;
    setAuditStatus('loading');
    setAuditError(null);
    try {
      const resp = await fetch('/api/score/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scoredUrl, scope: scopeMode }),
      });
      const data: AuditResponse = await resp.json();
      if (!data.ok || !data.checks) {
        setAuditStatus('error');
        setAuditError(data.error || 'Audit failed.');
        return;
      }
      // Merge audit checks into result.checks, replacing by id. Re-derives
      // composite score + categoryScores client-side with the same weight
      // table and a11y floor as the server (the audit endpoint returns
      // checks only, so the merge recomputes — same math, one place in the
      // file, verified against route.ts).
      setResult((prev) => {
        if (!prev) return prev;
        const auditById = new Map(data.checks!.map((c) => [c.id, c]));
        const merged = (prev.checks || []).map((c) => auditById.get(c.id) || c);
        const pass = merged.filter((c) => c.status === 'PASS').length;
        const fail = merged.filter((c) => c.status === 'FAIL').length;
        const warn = merged.filter((c) => c.status === 'WARN').length;
        const skip = merged.filter((c) => c.status === 'SKIP').length;
        const manual = merged.filter((c) => c.status === 'MANUAL').length;
        const total = merged.length;
        // Weighted scoring (matches server-side CATEGORY_WEIGHTS in route.ts)
        const CATEGORY_WEIGHTS: Record<string, number> = {
          cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9,
          takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3,
        };
        const catCounts: Record<string, number> = {};
        for (const c of merged) {
          if (c.status === 'SKIP' || c.status === 'MANUAL') continue;
          catCounts[c.category] = (catCounts[c.category] || 0) + 1;
        }
        let wp = 0, wt = 0;
        const catAgg: Record<string, { wp: number; wt: number; pass: number; fail: number; warn: number; skip: number; manual: number }> = {};
        for (const c of merged) {
          const agg = catAgg[c.category] || (catAgg[c.category] = { wp: 0, wt: 0, pass: 0, fail: 0, warn: 0, skip: 0, manual: 0 });
          if (c.status === 'SKIP') { agg.skip += 1; continue; }
          if (c.status === 'MANUAL') { agg.manual += 1; continue; }
          const cw = (CATEGORY_WEIGHTS[c.category] || 5) / (catCounts[c.category] || 1);
          wt += cw; agg.wt += cw;
          if (c.status === 'PASS') { wp += cw; agg.wp += cw; agg.pass += 1; }
          else if (c.status === 'WARN') { wp += cw * 0.5; agg.wp += cw * 0.5; agg.warn += 1; }
          else agg.fail += 1;
        }
        let score = wt === 0 ? 0 : Math.round((wp / wt) * 1000) / 10;
        const categoryScores: Record<string, CategoryScore> = {};
        for (const [cat, agg] of Object.entries(catAgg)) {
          categoryScores[cat] = {
            score: agg.wt === 0 ? null : Math.round((agg.wp / agg.wt) * 1000) / 10,
            weight: CATEGORY_WEIGHTS[cat] || 5,
            pass: agg.pass, fail: agg.fail, warn: agg.warn, skip: agg.skip, manual: agg.manual,
          };
        }
        // a11y floor (matches server)
        const a11yChecks = merged.filter((c) => c.category === 'accessibility' && c.status !== 'SKIP' && c.status !== 'MANUAL');
        const a11yPct = a11yChecks.length === 0 ? 100 : ((a11yChecks.filter((c) => c.status === 'PASS').length + a11yChecks.filter((c) => c.status === 'WARN').length * 0.5) / a11yChecks.length) * 100;
        let a11yFloorApplied = false;
        if (a11yChecks.length > 0 && a11yPct < 60 && score > 70) { score = 70; a11yFloorApplied = true; }
        // hard-fail ceilings (matches server)
        let hardFailCeilingApplied = false;
        let hardFailCeilingReason: string | null = null;
        for (const c of merged.filter((c) => c.status === 'FAIL')) {
          let cap: number | null = null;
          let reason: string | null = null;
          if (c.id === 'v06') { cap = 65; reason = 'Contrast below WCAG minimum — text is unreadable for many users.'; }
          if (c.id === 'v22') { cap = 70; reason = 'Primary CTA contrast below WCAG AA — the most important interaction on the page is hard to read.'; }
          if (c.id === 'v02') { cap = 70; reason = 'Horizontal overflow detected — content is cut off or scrolls sideways on smaller viewports.'; }
          if (c.id === 'v24') { cap = 75; reason = 'Interactive elements below the 44px minimum touch target — inaccessible on touch devices.'; }
          if (c.id === 'v25') { cap = 75; reason = 'Multiple h1 elements or skipped heading levels — document outline is broken.'; }
          if (c.id === 'v16') { cap = 70; reason = 'Root font-size below 16px — triggers iOS Safari auto-zoom, breaks mobile UX.'; }
          if (cap !== null && score > cap) { score = cap; hardFailCeilingApplied = true; hardFailCeilingReason = reason; }
        }
        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
        return { ...prev, checks: merged, pass, fail, warn, skip, manual, total, score, grade, a11yFloorApplied, hardFailCeilingApplied, hardFailCeilingReason, categoryScores };
      });
      setAuditStatus('ok');
    } catch {
      setAuditStatus('error');
      setAuditError('Network error — could not reach the audit server.');
    }
  }

  return (
    <div className="score-form">
      <form ref={formRef} onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              aria-label="Site URL to score"
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
                Evaluating 40 Contract Checks…
              </span>
            ) : (
              'Score it'
            )}
          </button>
        </div>

        {/* Scope toggle — controls how absence is treated.
            auto: designesy.org → contract, everything else → universal (default)
            contract: all 40 checks penalize absence (strictest, for self-scoring)
            universal: optional features SKIP on absence (fair to external sites) */}
        <div className="score-scope-toggle" role="radiogroup" aria-label="Scoring scope">
          <span className="score-scope-label">Scope:</span>
          {(['auto', 'universal', 'contract'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={scopeMode === mode}
              className={`score-scope-option ${scopeMode === mode ? 'is-active' : ''}`}
              onClick={() => setScopeMode(mode)}
              disabled={status === 'loading'}
              data-cuelume-hover="tick"
              title={
                mode === 'auto'
                  ? 'Auto-detect: designesy.org uses contract scope, all other sites use universal scope'
                  : mode === 'universal'
                    ? 'Universal: optional features (sound, font-synthesis, text-wrap, etc.) are SKIP on absence. Only universal requirements (accessibility, semantics) are penalized.'
                    : 'Contract: all 40 checks penalize absence. The strictest mode — Designesy patterns are mandatory.'
              }
            >
              {mode}
            </button>
          ))}
        </div>
      </form>

      {status === 'idle' && !result && (
        <LottieTip text="No login needed — enter any URL and get a 40-check score in seconds" className="score-tip-hint" />
      )}

      {status === 'error' && result?.error && (
        <div className="score-error-card">
          <span className="score-error-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <div>
            <p className="score-error-title">Verification Notice</p>
            <p className="score-error-msg">{result.error}</p>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="score-verify-log" role="status" aria-live="polite" aria-label="Verification in progress">
          <p className="score-verify-log-title">Legitimacy engine running</p>
          <ol className="score-verify-log-list">
            {['Fetching live CSS + tokens', 'Evaluating contract checks', 'Weighting 14 categories', 'Composing verdict'].map((step, i) => (
              <li key={step} className="score-verify-log-step" style={{ animationDelay: `${i * 900}ms` }}>
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

      {status === 'ok' && result && result.ok && (
        <div className="score-results fade-up">
          {/* Score Dashboard Card */}
          <div className={`score-hero-card is-${result.grade?.toLowerCase()}`}>
            {/* Verdict line — leads before the number (PSI verdict-first pattern).
                The LottieHint check draws a one-shot confirmation when results
                arrive — subtle, 0.4s, removed under reduced-motion. */}
            <p className="score-verdict-line">
              <LottieHint type="check" size={20} trigger="visible" className="score-verdict-check" />
              {verdictLine(result)}
            </p>

            <div className="score-hero-top">
              {/* Constellation gauge — the contract's 10 categories as a fixed
                  weight-ordered ring around the main score arc. NOT a radar
                  chart: fixed axis order kills the axis-order illusion; the
                  arcs decompose the composite like Lighthouse's explodey
                  gauge. Categories with all checks skipped render unscored. */}
              <div className="score-constellation" role="img" aria-label={`Grade ${result.grade}, ${result.score} percent legitimacy score. Category breakdown available in the feed below.`}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  {/* connector spokes — faint, weight-indexed */}
                  <g className="constel-spokes">
                    {(result.categoryScores ? CONSTELLATION_ORDER.filter((k) => result.categoryScores![k]) : []).map((key, i, arr) => {
                      const p = constellationPoint(i, arr.length, CONSTEL_NODE_R - NODE_ARC_R - 3);
                      return <line key={key} x1={CONSTEL_C} y1={CONSTEL_C} x2={p.x} y2={p.y} className="constel-spoke" />;
                    })}
                  </g>
                  {/* main score ring */}
                  <circle className="constel-track" cx={CONSTEL_C} cy={CONSTEL_C} r={CONSTEL_RING_R} fill="none" />
                  <circle
                    className={`constel-main-fill is-${result.grade?.toLowerCase()}`}
                    cx={CONSTEL_C}
                    cy={CONSTEL_C}
                    r={CONSTEL_RING_R}
                    fill="none"
                    strokeDasharray={`${(animatedScore / 100) * MAIN_CIRC} ${MAIN_CIRC}`}
                    transform={`rotate(-90 ${CONSTEL_C} ${CONSTEL_C})`}
                  />
                  {/* category nodes */}
                  {(result.categoryScores ? CONSTELLATION_ORDER.filter((k) => result.categoryScores![k]) : []).map((key, i, arr) => {
                    const cat = result.categoryScores![key];
                    const scored = cat.score !== null;
                    const p = constellationPoint(i, arr.length, CONSTEL_NODE_R);
                    const frac = scored ? cat.score! / 100 : 0;
                    return (
                      <g
                        key={key}
                        className={`constel-node ${scored ? '' : 'is-unscored'} ${selectedCategory === key ? 'is-active' : ''}`}
                        onClick={() => setSelectedCategory(selectedCategory === key ? 'ALL' : key)}
                        style={{ animationDelay: `${200 + i * 70}ms` }}
                      >
                        <circle className="constel-node-track" cx={p.x} cy={p.y} r={NODE_ARC_R} fill="none" />
                        {scored && (
                          <circle
                            className="constel-node-fill"
                            cx={p.x}
                            cy={p.y}
                            r={NODE_ARC_R}
                            fill="none"
                            strokeDasharray={`${frac * NODE_ARC_CIRC * (animatedScore / (result.score || 100))} ${NODE_ARC_CIRC}`}
                            transform={`rotate(-90 ${p.x} ${p.y})`}
                          />
                        )}
                        <text className="constel-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
                          {scored ? Math.round(cat.score!) : '–'}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="constel-center">
                  <span className={`constel-grade is-${result.grade?.toLowerCase()}`}>{result.grade}</span>
                  <span className="constel-pct">{Math.round(animatedScore * 10) / 10}%</span>
                </div>
              </div>

              <div className="score-hero-meta">
                <div className="score-percent-badge">
                  <span className="score-percent-value">{Math.round(animatedScore * 10) / 10}%</span>
                  <span className="score-percent-label">Legitimacy Score</span>
                  {delta !== null && delta !== 0 && (
                    <span className={`score-delta-chip ${delta > 0 ? 'is-up' : 'is-down'}`} title="Change vs your previous score for this site (this browser)">
                      {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta}
                    </span>
                  )}
                </div>

                <p className="score-strong-weak">
                  {(() => {
                    const best = topCategories(result, 'best');
                    const worst = topCategories(result, 'worst');
                    if (!best.label) return null;
                    return (
                      <>
                        Strongest: <strong>{best.label} {fmtPct(best.score)}%</strong>
                        {worst.label && worst.label !== best.label && (
                          <> · Weakest: <strong>{worst.label} {fmtPct(worst.score)}%</strong></>
                        )}
                      </>
                    );
                  })()}
                </p>

                <div className="score-site-url">
                  <span className="score-url-dot" />
                  <span className="score-url-text">{scoredUrl}</span>
                  <span className="score-url-time">{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
                  {result.scope && (
                    <span className="score-scope-badge" title={
                      result.scope === 'universal'
                        ? 'Universal scope: optional features SKIP on absence. Only universal requirements (accessibility, semantics) are penalized.'
                        : 'Contract scope: all 40 checks penalize absence. Designesy patterns are mandatory.'
                    }>
                      {result.scope} scope
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Category legend — the accessible text mirror of the SVG
                constellation (screen readers can navigate SVG text poorly).
                Doubles as a second filter affordance: clicking a row filters
                the feed, same as the nodes and chips. */}
            <ul className="score-cat-legend">
              {(result.categoryScores ? CONSTELLATION_ORDER.filter((k) => result.categoryScores![k]) : []).map((k, i) => {
                const cat = result.categoryScores![k];
                const label = CATEGORIES.find((c) => c.key === k)?.label || (k.charAt(0).toUpperCase() + k.slice(1));
                const active = selectedCategory === k;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      className={`score-cat-legend-row ${active ? 'is-active' : ''} ${cat.score === null ? 'is-unscored' : ''}`}
                      onClick={() => setSelectedCategory(active ? 'ALL' : k)}
                      aria-pressed={active}
                      data-cuelume-hover="tick"
                    >
                      <span className="score-cat-legend-name">{label}</span>
                      <span className="score-cat-legend-bar" aria-hidden="true">
                        <span
                          className={`score-cat-legend-fill ${cat.score !== null && cat.score < 60 ? 'is-weak' : ''}`}
                          style={{ width: `${Math.round(animatedCatScores[k] ?? 0)}%`, ['--bar-i' as string]: i }}
                        />
                      </span>
                      <span className="score-cat-legend-score">{cat.score === null ? '—' : `${Math.round(animatedCatScores[k] ?? 0)}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Score-scale legend — per Lighthouse PR #8121: never show a
                colored gauge without a legend so users can verify the bands. */}
            <div className="score-scale-legend" aria-hidden="true">
              <span className="score-scale-band is-fail"><span className="score-scale-dot" />0–49 Fail</span>
              <span className="score-scale-band is-warn"><span className="score-scale-dot" />50–69 Needs work</span>
              <span className="score-scale-band is-pass"><span className="score-scale-dot" />70–89 Good</span>
              <span className="score-scale-band is-a"><span className="score-scale-dot" />90–100 Excellent</span>
            </div>

            {/* Scoring rubric — Socket.dev published-math pattern. The exact
                weight function is visible on the same page as the number so
                the composite can never read as arbitrary. */}
            <div className="score-rubric">
              <button
                type="button"
                className="score-rubric-toggle"
                onClick={() => setRubricOpen((v) => !v)}
                aria-expanded={rubricOpen}
                aria-controls="score-rubric-body"
                data-cuelume-press="tick"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: rubricOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-fast) var(--ease-out)' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                How this is scored
              </button>
              {rubricOpen && (
                <div className="score-rubric-body" id="score-rubric-body">
                  <p className="score-rubric-formula">
                    score = Σ (category<sub>earned</sub> / category<sub>weight</sub>) × 100 —
                    PASS 1.0 · WARN 0.5 · FAIL 0, MANUAL + N/A excluded. Each category contributes its
                    full contract weight, split evenly across its checks. Accessibility &lt; 60% caps the grade at C.
                  </p>
                  <ol className="score-rubric-weights">
                    {(result.categoryScores
                      ? CONSTELLATION_ORDER.filter((k) => result.categoryScores![k])
                      : CONSTELLATION_ORDER.slice(0, 11)
                    ).map((k) => {
                      const cat = result.categoryScores?.[k];
                      const label = CATEGORIES.find((c) => c.key === k)?.label || (k.charAt(0).toUpperCase() + k.slice(1));
                      const w = cat?.weight ?? 5;
                      return (
                        <li key={k} className="score-rubric-weight-row">
                          <span className="score-rubric-weight-label">{label}</span>
                          <span className="score-rubric-weight-bar" aria-hidden="true">
                            <span className="score-rubric-weight-fill" style={{ width: `${(w / 18) * 100}%` }} />
                          </span>
                          <span className="score-rubric-weight-num">{w}%</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>

            {/* 4 Metrics Cell Grid */}
            <div className="score-metrics-grid">
              <div className="score-metric-tile is-pass">
                <span className="score-metric-val">{animatedCounts.pass}</span>
                <span className="score-metric-lbl">Passed</span>
              </div>
              <div className="score-metric-tile is-fail">
                <span className="score-metric-val">{animatedCounts.fail}</span>
                <span className="score-metric-lbl">Failed</span>
              </div>
              <div className="score-metric-tile is-warn">
                <span className="score-metric-val">{animatedCounts.warn}</span>
                <span className="score-metric-lbl">Warnings</span>
              </div>
              <div className="score-metric-tile is-manual">
                <span className="score-metric-val">{animatedCounts.manual}</span>
                <span className="score-metric-lbl">Manual</span>
              </div>
              <div className="score-metric-tile is-skip">
                <span className="score-metric-val">{animatedCounts.skip}</span>
                <span className="score-metric-lbl">N/A</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="score-hero-actions">
              <button
                type="button"
                onClick={copyReceipt}
                className="score-action-btn"
                data-cuelume-press="tick"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copied ? 'Receipt Copied!' : 'Copy Verification Receipt'}
              </button>

              <button
                type="button"
                onClick={handleRunAudit}
                disabled={auditStatus === 'loading' || !scoredUrl}
                className="score-action-btn score-audit-btn"
                data-cuelume-press="tick"
                title="Run the full browser audit: Core Web Vitals (LCP/INP/CLS) via PageSpeed Insights, plus responsive overflow + sound toggle when browser audit is enabled."
              >
                {auditStatus === 'loading' ? (
                  <span className="score-loading-state">
                    <span className="audit-dots" aria-hidden="true">
                      <span className="audit-dot" />
                      <span className="audit-dot" />
                      <span className="audit-dot" />
                    </span>
                    Running browser audit…
                  </span>
                ) : auditStatus === 'ok' ? (
                  'Audit complete ✓'
                ) : auditStatus === 'error' ? (
                  'Audit failed — retry'
                ) : (
                  'Run full browser audit'
                )}
              </button>

              <a
                href={`/score/report?url=${encodeURIComponent(scoredUrl)}`}
                className="score-action-btn"
                data-cuelume-press="tick"
                title="Open the full verification report — shareable URL, print-friendly."
              >
                View full report →
              </a>

              <button
                type="button"
                onClick={copyShareLink}
                className="score-action-btn score-share-btn"
                data-cuelume-press="tick"
                disabled={!shareUrl}
                title="Copy the shareable link to this score result"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {linkCopied ? 'Link copied!' : 'Copy link'}
              </button>

              {shareUrl && (
                <>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="score-action-btn score-share-btn"
                    data-cuelume-press="tick"
                    title="Share this score on X / Twitter"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    Share on X
                  </a>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="score-action-btn score-share-btn"
                    data-cuelume-press="tick"
                    title="Share this score on LinkedIn"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    Share on LinkedIn
                  </a>
                  <button
                    type="button"
                    onClick={copyBadgeEmbed}
                    className="score-action-btn score-share-btn"
                    data-cuelume-press="tick"
                    disabled={!badgeEmbed}
                    title="Copy an embeddable <img> badge for your README or site footer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="18" height="12" rx="2" />
                      <path d="M9 10h6M9 14h4" />
                    </svg>
                    {badgeCopied ? 'Badge copied!' : 'Copy badge'}
                  </button>
                </>
              )}

              <span className="score-tokens-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {result.tokensExtracted || 0} CSS tokens extracted
              </span>
            </div>

            {auditStatus === 'loading' && (
              <div className="audit-progress-panel" role="status" aria-live="polite" aria-label="Browser audit in progress">
                <p className="audit-progress-title">Browser audit running</p>
                <ol className="audit-progress-list">
                  {[
                    'Fetching live CSS + computed styles',
                    'Probing Core Web Vitals (LCP · INP · CLS)',
                    'Testing responsive overflow at 375 / 720 / 860 / 1080px',
                    'Merging audit checks into score',
                  ].map((step, i) => (
                    <li key={step} className="audit-progress-step" style={{ animationDelay: `${i * 700}ms` }}>
                      <span className="audit-progress-dot" aria-hidden="true" />
                      {step}
                    </li>
                  ))}
                </ol>
                <div className="audit-progress-bar" aria-hidden="true">
                  <div className="audit-progress-bar-fill" />
                </div>
              </div>
            )}

            {auditStatus === 'error' && auditError && (
              <p className="score-audit-error">{auditError}</p>
            )}
          </div>

          {/* Signals panel — the taste-separation audit. Two independent layers
              that sit AROUND the weighted compliance score: the slop detector
              (docks points for generic/template patterns) and the originality
              detector (lifts points for bespoke craft signals). Surfacing both
              with evidence makes the composite auditable — "compliant" and
              "distinctive" are scored separately, never conflated. */}
          {((result.originality && result.originality.signals.length > 0) || (result.slop && result.slop.findings.length > 0)) && (
            <div className="score-signals-card">
              <div className="score-signals-head">
                <span className="score-signals-eyebrow">Craft signals & anti-slop audit</span>
                <span className="score-signals-net">
                  {result.originality && result.originality.points > 0 && (
                    <span className="score-signals-net-pos">+{animatedCounts.origPoints}</span>
                  )}
                  {result.slop && result.slop.total > 0 && (
                    <span className="score-signals-net-neg">−{animatedCounts.slopTotal}</span>
                  )}
                </span>
              </div>

              {result.originality && result.originality.signals.length > 0 && (
                <div className="score-signals-group">
                  <p className="score-signals-group-title is-originality">
                    Originality — positive craft signals
                    <span className="score-signals-group-chip">+{animatedCounts.origPoints}pt{result.originality.points !== 1 ? 's' : ''}{result.originality.slopGateApplied ? ' · slop-gated ×0.5' : ''}</span>
                  </p>
                  <ul className="score-signals-list">
                    {result.originality.signals.map((s) => (
                      <li key={s.id} className="score-signal-row is-originality">
                        <span className="score-signal-points">+{s.points}</span>
                        <span className="score-signal-body">
                          <span className="score-signal-label">{s.label}</span>
                          <span className="score-signal-evidence">{s.evidence}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.slop && result.slop.findings.length > 0 && (
                <div className="score-signals-group">
                  <p className="score-signals-group-title is-slop">
                    Anti-slop — generic/template patterns
                    <span className="score-signals-group-chip is-neg">−{animatedCounts.slopTotal}pt{result.slop.total !== 1 ? 's' : ''}</span>
                  </p>
                  <ul className="score-signals-list">
                    {result.slop.findings.map((f) => (
                      <li key={f.id} className="score-signal-row is-slop">
                        <span className="score-signal-points is-neg">−{f.deduction}</span>
                        <span className="score-signal-body">
                          <span className="score-signal-label">{f.label}</span>
                          {f.evidence && f.evidence.length > 0 && (
                            <span className="score-signal-evidence">{f.evidence.slice(0, 3).join(' · ')}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Interactive Filter & Search Controls */}
          <div className="score-controls-card">
            <div className="score-filter-segmented" ref={filterSegmentedRef}>
              <button
                type="button"
                className={`score-filter-tab ${filterStatus === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('ALL')}
              >
                All <span className="score-tab-count">{animatedCounts.total}</span>
              </button>
              <button
                type="button"
                className={`score-filter-tab is-pass ${filterStatus === 'PASS' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('PASS')}
              >
                Pass <span className="score-tab-count">{animatedCounts.pass}</span>
              </button>
              {result.fail! > 0 && (
                <button
                  type="button"
                  className={`score-filter-tab is-fail ${filterStatus === 'FAIL' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('FAIL')}
                >
                  Fail <span className="score-tab-count">{animatedCounts.fail}</span>
                </button>
              )}
              {result.warn! > 0 && (
                <button
                  type="button"
                  className={`score-filter-tab is-warn ${filterStatus === 'WARN' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('WARN')}
                >
                  Warn <span className="score-tab-count">{animatedCounts.warn}</span>
                </button>
              )}
              {(result.manual || 0) > 0 && (
                <button
                  type="button"
                  className={`score-filter-tab is-manual ${filterStatus === 'MANUAL' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('MANUAL')}
                >
                  Manual <span className="score-tab-count">{result.manual}</span>
                </button>
              )}
              <button
                type="button"
                className={`score-filter-tab is-skip ${filterStatus === 'SKIP' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('SKIP')}
              >
                N/A <span className="score-tab-count">{result.skip}</span>
              </button>
            </div>

            <div className="score-search-wrapper">
              <span className="score-search-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                placeholder="Search 40 verification checks…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="score-category-chips">
              <button
                type="button"
                className={`score-category-chip ${selectedCategory === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory('ALL')}
              >
                All Categories
              </button>
              {CATEGORIES.map((cat) => {
                const count = checks.filter((c) => c.category === cat.key).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    className={`score-category-chip ${selectedCategory === cat.key ? 'is-active' : ''}`}
                    onClick={() => setSelectedCategory(cat.key)}
                  >
                    {cat.label}
                    <span className="score-chip-num">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Check Cards Feed — collapsible by status group, same pattern as
              the /score verify dashboard. FAIL expands by default (what to
              fix), PASS + N/A collapse by default (noise / nothing to do). */}
          <div className="score-cards-feed">
            {filteredChecks.length === 0 ? (
              <div className="score-empty-feed">
                <p className="score-empty-title">No matching verification checks</p>
                <p className="score-empty-desc">Try adjusting your search query or status filter.</p>
                <button
                  type="button"
                  className="score-action-btn"
                  onClick={() => {
                    setFilterStatus('ALL');
                    setSelectedCategory('ALL');
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
                      aria-controls={`group-${group.status}`}
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
                        id={`group-${group.status}`}
                        className="score-check-group-body"
                      >
                        {group.checks.map((check, idx) => {
                          const isExpanded = expandedId === check.id;
                          return (
                            <div
                              key={check.id}
                              className={`score-card-item ${isExpanded ? 'is-expanded' : ''}`}
                              onClick={() => setExpandedId(isExpanded ? null : check.id)}
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
                                  <span className={`score-card-status-pill is-${check.status.toLowerCase()}`}>
                                    {check.status === 'MANUAL' ? 'Manual' :
                                     check.status === 'SKIP' ? 'N/A' :
                                     check.status}
                                  </span>
                                  <span className="score-card-id">{check.id}</span>
                                  <span className="score-card-cat">{check.category}</span>
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
                                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </span>

                              {isExpanded && (
                                <div className="score-card-drawer">
                                  <p className="score-drawer-heading">Technical Finding</p>
                                  <p className="score-drawer-detail">{check.detail}</p>
                                  {check.remediation && (check.status === 'FAIL' || check.status === 'WARN') && (
                                    <>
                                      <p className="score-drawer-heading score-drawer-remediation-heading">How to fix this</p>
                                      <p className="score-drawer-detail score-drawer-remediation">{check.remediation}</p>
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

          <p className="score-note">
            {animatedCounts.total} checks evaluated against Designesy design system contract v0.4.0.
            {result.a11yFloorApplied && (
              <span className="score-a11y-floor-notice"> · Accessibility floor applied: score capped at C (70) because accessibility &lt; 60%.</span>
            )}
            {result.hardFailCeilingApplied && (
              <span className="score-a11y-floor-notice"> · Hard-fail ceiling applied: {result.hardFailCeilingReason || 'A critical check failed, capping the overall score.'}</span>
            )}
            {result.slop && result.slop.total > 0 && (
              <span className="score-a11y-floor-notice"> · Anti-slop: −{result.slop.total}pt{result.slop.total !== 1 ? 's' : ''} ({result.slop.findings.length} pattern{result.slop.findings.length !== 1 ? 's' : ''} detected)</span>
            )}
            {result.originality && result.originality.points > 0 && (
              <span className="score-originality-notice"> · Originality: +{result.originality.points}pt{result.originality.points !== 1 ? 's' : ''} — {result.originality.summary}{result.originality.slopGateApplied ? ' (halved by anti-slop gate)' : ''}</span>
            )}
          </p>
        </div>
      )}

      {status === 'idle' && (
        <div className="score-welcome-card">
          <p className="score-welcome-title">Legitimacy Audit Engine</p>
          <p className="score-hint">
            Enter any public website URL above — no https:// needed. We fetch its CSS,
            extract design tokens, and evaluate 40 verification checks against the Designesy
            contract v0.4.0. Real-time. No login required.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <section className="score-history-panel fade-up" aria-label="Recent scores">
          <div className="score-history-head">
            <p className="score-history-title">Recent scores</p>
            <button
              type="button"
              className="score-history-clear"
              onClick={handleClearHistory}
              data-cuelume-press="tick"
              aria-label="Clear recent scores"
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
                <div className={`score-history-emblem is-${entry.grade.toLowerCase()}`}>
                  {entry.grade}
                </div>
                <div className="score-history-body">
                  <span className="score-history-url" title={entry.url}>
                    {truncateUrl(entry.url)}
                  </span>
                  <span className="score-history-meta">
                    {fmtPct(entry.score)}% · {entry.pass} pass · {entry.fail} fail · {relativeTime(entry.scoredAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="score-history-rerun"
                  onClick={() => {
                    setUrl(entry.url);
                    void runScore(entry.url);
                  }}
                  data-cuelume-hover="tick"
                  aria-label={`Re-score ${truncateUrl(entry.url)}`}
                >
                  Re-score
                </button>
              </li>
            ))}
          </ul>
          <p className="score-history-foot">
            Free tier keeps your last 5 scores in this browser.{' '}
            <a href="/pricing" className="text-link">Score Pass</a> unlocks 90-day history + export.
          </p>
        </section>
      )}
    </div>
  );
}