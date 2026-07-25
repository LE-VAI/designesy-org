// v2026-07-25-clean-rewrite — no inline styles, CSS-class driven
'use client';

import { useState, useRef, useMemo } from 'react';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
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

export function ScoreForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;

    const targetUrl = normalizeInput(url);
    if (!targetUrl) return;

    setStatus('loading');
    setResult(null);
    setExpandedId(null);
    setFilterStatus('ALL');
    setSelectedCategory('ALL');
    setSearchQuery('');

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
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the scoring server.' });
    }
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
              placeholder="designesy.org or nike.com"
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

              <span className="score-tokens-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {result.tokensExtracted || 0} CSS tokens extracted
              </span>
            </div>
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
            Enter any public website URL above (e.g. designesy.org or nike.com). We fetch its CSS,
            extract design tokens, and evaluate 26 verification checks against the Designesy
            contract v0.3.0. Real-time. No login required.
          </p>
        </div>
      )}
    </div>
  );
}