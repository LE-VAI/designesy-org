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

type ScoreResponse = {
  ok: boolean;
  score?: number;
  grade?: string;
  pass?: number;
  fail?: number;
  warn?: number;
  skip?: number;
  total?: number;
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
  const formRef = useRef<HTMLFormElement>(null);

  // Load history on mount (client-only). SSR-safe via the guards inside
  // readScoreHistory.
  useEffect(() => {
    setHistory(readScoreHistory());
  }, []);

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
      // dedupes by URL (most-recent wins), caps at 5 entries.
      if (typeof data.score === 'number' && typeof data.grade === 'string') {
        const next = saveScore(targetUrl, data);
        setHistory(next);
        setHistoryCleared(false);
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
    return checks.filter((c) => {
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
    });
  }, [checks, filterStatus, selectedCategory, searchQuery]);

  function copyReceipt() {
    if (!result || !scoredUrl) return;
    const lines = [
      `# Designesy Verification Receipt`,
      `Site: ${scoredUrl}`,
      `Grade: ${result.grade} (${result.score}%)`,
      `Pass: ${result.pass} | Fail: ${result.fail} | Warn: ${result.warn} | Skip: ${result.skip}`,
      `Tokens Extracted: ${result.tokensExtracted || 0}`,
      `Contract: Designesy Design System Contract v0.3.0`,
      ``,
      `## Check Summary`,
      ...checks.map((c) => `[${c.status}] ${c.id}: ${c.item} — ${c.detail}`),
    ];
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
      // Merge audit checks into result.checks, replacing by id.
      setResult((prev) => {
        if (!prev) return prev;
        const auditById = new Map(data.checks!.map((c) => [c.id, c]));
        const merged = (prev.checks || []).map((c) => auditById.get(c.id) || c);
        const pass = merged.filter((c) => c.status === 'PASS').length;
        const fail = merged.filter((c) => c.status === 'FAIL').length;
        const warn = merged.filter((c) => c.status === 'WARN').length;
        const skip = merged.filter((c) => c.status === 'SKIP').length;
        const total = merged.length;
        const scored = total - skip;
        const score = scored === 0 ? 0 : Math.round(((pass + warn * 0.5) / scored) * 1000) / 10;
        const grade =
          score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
        return { ...prev, checks: merged, pass, fail, warn, skip, total, score, grade };
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
                Evaluating 26 Contract Checks…
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

      {status === 'ok' && result && result.ok && (
        <div className="score-results fade-up">
          {/* Score Dashboard Card */}
          <div className={`score-hero-card is-${result.grade?.toLowerCase()}`}>
            <div className="score-hero-top">
              <div className={`score-grade-emblem is-${result.grade?.toLowerCase()}`}>
                <span className="score-grade-glow" />
                <span className="score-grade-letter">{result.grade}</span>
              </div>

              <div className="score-hero-meta">
                <div className="score-percent-badge">
                  <span className="score-percent-value">{result.score}%</span>
                  <span className="score-percent-label">Legitimacy Score</span>
                </div>

                <div className="score-progress-bar">
                  <div
                    className="score-progress-fill"
                    style={{ width: `${result.score}%` }}
                  />
                </div>

                <div className="score-site-url">
                  <span className="score-url-dot" />
                  <span className="score-url-text">{scoredUrl}</span>
                </div>
              </div>
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
                placeholder="Search 26 verification checks…"
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
              filteredChecks.map((check) => {
                const isExpanded = expandedId === check.id;
                return (
                  <div
                    key={check.id}
                    className={`score-card-item ${isExpanded ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : check.id)}
                    role="button"
                    tabIndex={0}
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
          </p>
        </div>
      )}

      {status === 'idle' && (
        <div className="score-welcome-card">
          <p className="score-welcome-title">Legitimacy Audit Engine</p>
          <p className="score-hint">
            Enter any public website URL above — no https:// needed. We fetch its CSS,
            extract design tokens, and evaluate 26 verification checks against the Designesy
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
                    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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