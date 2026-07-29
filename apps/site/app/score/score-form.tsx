// v2026-07-25-clean-rewrite — no inline styles, CSS-class driven
// v2026-07-25-history — free-tier local score history (5 most-recent per browser)
'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import {
  readScoreHistory,
  saveScore,
  clearScoreHistory,
  relativeTime,
  truncateUrl,
  type ScoreHistoryEntry,
} from '../lib/score-history';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
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
};

type ScoreResponse = {
  ok: boolean;
  score?: number;
  grade?: string;
  pass?: number;
  fail?: number;
  warn?: number;
  skip?: number;
  total?: number;
  a11yFloorApplied?: boolean;
  categoryScores?: Record<string, CategoryScore>;
  checks?: CheckResult[];
  tokensExtracted?: number;
  error?: string;
};

type AuditResponse = {
  ok: boolean;
  url?: string;
  checks?: CheckResult[];
  error?: string;
};

type FilterStatus = 'ALL' | 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

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
const STATUS_ORDER: Record<string, number> = { FAIL: 0, WARN: 1, SKIP: 2, PASS: 3 };

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
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [badgeCopied, setBadgeCopied] = useState(false);
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [auditError, setAuditError] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [delta, setDelta] = useState<number | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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
      return;
    }
    // Respect reduced-motion: skip the animation, show final value
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimatedScore(result.score);
      return;
    }
    const target = result.score;
    const duration = 1200; // Lighthouse PR 17045 "earned" window — long enough to watch the arc fill
    const start = performance.now();
    let rafId: number;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnimatedScore(target * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        setAnimatedScore(target);
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
    setFilterStatus('ALL');
    setSelectedCategory('ALL');
    setSearchQuery('');
    setAuditStatus('idle');
    setAuditError(null);
    setDelta(null);

    try {
      const resp = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data: ScoreResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
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

  function copyReceipt() {
    if (!result || !scoredUrl) return;
    const lines = [
      `# Designesy Verification Receipt`,
      `Site: ${scoredUrl}`,
      `Verdict: ${verdictLine(result)}`,
      `Grade: ${result.grade} (${result.score}%)`,
      ...(delta !== null ? [`Delta: ${delta > 0 ? '+' : ''}${delta} pts vs previous score`] : []),
      `Assessed: ${new Date().toISOString()}`,
      `Pass: ${result.pass} | Fail: ${result.fail} | Warn: ${result.warn} | Skip: ${result.skip}`,
      `Tokens Extracted: ${result.tokensExtracted || 0}`,
      `Contract: Designesy Design System Contract v0.3.0`,
      `Scoring: weighted per category (PASS 1.0 / WARN 0.5 / FAIL 0, SKIP excluded), weights below; accessibility < 60% caps grade at C.`,
    ];
    const cats = result.categoryScores || {};
    const catKeys = CONSTELLATION_ORDER.filter((k) => cats[k]);
    if (catKeys.length > 0) {
      lines.push(``, `## Category Breakdown`);
      for (const k of catKeys) {
        const v = cats[k];
        const label = CATEGORIES.find((c) => c.key === k)?.label || k;
        lines.push(`${label} (weight ${v.weight}%): ${v.score === null ? 'unscored' : v.score + '%'} — ${v.pass}p/${v.fail}f/${v.warn}w/${v.skip}s`);
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
  const shareText = result?.grade
    ? `Designesy score: Grade ${result.grade} (${result.score}%) — ${scoredUrl}`
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
        body: JSON.stringify({ url: scoredUrl }),
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
        const total = merged.length;
        // Weighted scoring (matches server-side CATEGORY_WEIGHTS in route.ts)
        const CATEGORY_WEIGHTS: Record<string, number> = {
          cadence: 18, accessibility: 15, semantic: 12, motion: 10, tokens: 9,
          takt: 8, poise: 7, identity: 6, interaction: 6, performance: 6, responsive: 3,
        };
        const catCounts: Record<string, number> = {};
        for (const c of merged) {
          if (c.status === 'SKIP') continue;
          catCounts[c.category] = (catCounts[c.category] || 0) + 1;
        }
        let wp = 0, wt = 0;
        const catAgg: Record<string, { wp: number; wt: number; pass: number; fail: number; warn: number; skip: number }> = {};
        for (const c of merged) {
          const agg = catAgg[c.category] || (catAgg[c.category] = { wp: 0, wt: 0, pass: 0, fail: 0, warn: 0, skip: 0 });
          if (c.status === 'SKIP') { agg.skip += 1; continue; }
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
            pass: agg.pass, fail: agg.fail, warn: agg.warn, skip: agg.skip,
          };
        }
        // a11y floor (matches server)
        const a11yChecks = merged.filter((c) => c.category === 'accessibility' && c.status !== 'SKIP');
        const a11yPct = a11yChecks.length === 0 ? 100 : ((a11yChecks.filter((c) => c.status === 'PASS').length + a11yChecks.filter((c) => c.status === 'WARN').length * 0.5) / a11yChecks.length) * 100;
        let a11yFloorApplied = false;
        if (a11yChecks.length > 0 && a11yPct < 60 && score > 70) { score = 70; a11yFloorApplied = true; }
        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
        return { ...prev, checks: merged, pass, fail, warn, skip, total, score, grade, a11yFloorApplied, categoryScores };
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
            <span className="score-input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10z" />
              </svg>
            </span>
            <input
              type="text"
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
                Evaluating 32 Contract Checks…
              </span>
            ) : (
              'Score it'
            )}
          </button>
        </div>
      </form>

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
            {['Fetching live CSS + tokens', 'Evaluating contract checks', 'Weighting 10 categories', 'Composing verdict'].map((step, i) => (
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
            {/* Verdict line — leads before the number (PSI verdict-first pattern) */}
            <p className="score-verdict-line">{verdictLine(result)}</p>

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
                  <span className="score-percent-value">{result.score}%</span>
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
                        Strongest: <strong>{best.label} {best.score}%</strong>
                        {worst.label && worst.label !== best.label && (
                          <> · Weakest: <strong>{worst.label} {worst.score}%</strong></>
                        )}
                      </>
                    );
                  })()}
                </p>

                <div className="score-site-url">
                  <span className="score-url-dot" />
                  <span className="score-url-text">{scoredUrl}</span>
                  <span className="score-url-time">{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
                </div>
              </div>
            </div>

            {/* Category legend — the accessible text mirror of the SVG
                constellation (screen readers can navigate SVG text poorly).
                Doubles as a second filter affordance: clicking a row filters
                the feed, same as the nodes and chips. */}
            <ul className="score-cat-legend">
              {(result.categoryScores ? CONSTELLATION_ORDER.filter((k) => result.categoryScores![k]) : []).map((k) => {
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
                          style={{ width: `${cat.score ?? 0}%` }}
                        />
                      </span>
                      <span className="score-cat-legend-score">{cat.score === null ? '—' : `${Math.round(cat.score!)}`}</span>
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
                    PASS 1.0 · WARN 0.5 · FAIL 0, SKIP excluded. Each category contributes its
                    full contract weight, split evenly across its checks. Accessibility &lt; 60% caps the grade at C.
                  </p>
                  <ol className="score-rubric-weights">
                    {(result.categoryScores
                      ? CONSTELLATION_ORDER.filter((k) => result.categoryScores![k])
                      : CONSTELLATION_ORDER.slice(0, 10)
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
                <span className="score-metric-val">{result.pass}</span>
                <span className="score-metric-lbl">Passed</span>
              </div>
              <div className="score-metric-tile is-fail">
                <span className="score-metric-val">{result.fail}</span>
                <span className="score-metric-lbl">Failed</span>
              </div>
              <div className="score-metric-tile is-warn">
                <span className="score-metric-val">{result.warn}</span>
                <span className="score-metric-lbl">Warnings</span>
              </div>
              <div className="score-metric-tile is-skip">
                <span className="score-metric-val">{result.skip}</span>
                <span className="score-metric-lbl">Skipped</span>
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
                    <span className="score-spinner" />
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
                href={`/score?url=${encodeURIComponent(scoredUrl)}`}
                className="score-action-btn"
                data-cuelume-press="tick"
                title="Open the full report on the dedicated Score page — shareable URL."
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

            {auditStatus === 'error' && auditError && (
              <p className="score-audit-error">{auditError}</p>
            )}
          </div>

          {/* Interactive Filter & Search Controls */}
          <div className="score-controls-card">
            <div className="score-filter-segmented">
              <button
                type="button"
                className={`score-filter-tab ${filterStatus === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('ALL')}
              >
                All <span className="score-tab-count">{checks.length}</span>
              </button>
              <button
                type="button"
                className={`score-filter-tab is-pass ${filterStatus === 'PASS' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('PASS')}
              >
                Pass <span className="score-tab-count">{result.pass}</span>
              </button>
              {result.fail! > 0 && (
                <button
                  type="button"
                  className={`score-filter-tab is-fail ${filterStatus === 'FAIL' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('FAIL')}
                >
                  Fail <span className="score-tab-count">{result.fail}</span>
                </button>
              )}
              {result.warn! > 0 && (
                <button
                  type="button"
                  className={`score-filter-tab is-warn ${filterStatus === 'WARN' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('WARN')}
                >
                  Warn <span className="score-tab-count">{result.warn}</span>
                </button>
              )}
              <button
                type="button"
                className={`score-filter-tab is-skip ${filterStatus === 'SKIP' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('SKIP')}
              >
                Skip <span className="score-tab-count">{result.skip}</span>
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
                type="text"
                className="score-search-input"
                placeholder="Search 32 verification checks…"
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

          {/* Check Cards Feed */}
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
              filteredChecks.map((check, idx) => {
                const isExpanded = expandedId === check.id;
                return (
                  <div
                    key={check.id}
                    className={`score-card-item ${isExpanded ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : check.id)}
                    role="button"
                    tabIndex={0}
                    style={{ animationDelay: `${Math.min(idx * 40, 600)}ms` }}
                  >
                    <div className="score-card-main">
                      <div className="score-card-badge-group">
                        <span className={`score-card-status-pill is-${check.status.toLowerCase()}`}>
                          {check.status}
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
              })
            )}
          </div>

          <p className="score-note">
            {result.total} checks evaluated against Designesy design system contract v0.3.0.
            {result.a11yFloorApplied && (
              <span className="score-a11y-floor-notice"> · Accessibility floor applied: score capped at C (70) because accessibility &lt; 60%.</span>
            )}
          </p>
        </div>
      )}

      {status === 'idle' && (
        <div className="score-welcome-card">
          <p className="score-welcome-title">Legitimacy Audit Engine</p>
          <p className="score-hint">
            Enter any public website URL above — no https:// needed. We fetch its CSS,
            extract design tokens, and evaluate 32 verification checks against the Designesy
            contract v0.3.0. Real-time. No login required.
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
                    {entry.score}% · {entry.pass} pass · {entry.fail} fail · {relativeTime(entry.scoredAt)}
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