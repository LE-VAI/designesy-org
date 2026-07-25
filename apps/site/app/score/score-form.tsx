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

    let cleanUrl = url.trim();
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    if (!cleanUrl) return;

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
        body: JSON.stringify({ url: cleanUrl }),
      });
      const data: ScoreResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        return;
      }
      setStatus('ok');
      setScoredUrl(cleanUrl);
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the scoring server.' });
    }
  }

  const checks = useMemo(() => result?.checks || [], [result]);

  const filteredChecks = useMemo(() => {
    return checks.filter((c) => {
      // Status filter
      if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
      // Category filter
      if (selectedCategory !== 'ALL' && c.category !== selectedCategory) return false;
      // Search query
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
        <div className="score-input-row">
          <div className="score-input-wrapper">
            <span className="score-input-icon" aria-hidden="true">🌐</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://your-site.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={status === 'loading'}
              aria-label="Site URL to score"
              data-cuelume-hover="tick"
              className="score-url-input"
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
                <span className="score-spinner" aria-hidden="true" />
                Scoring…
              </span>
            ) : (
              'Score it'
            )}
          </button>
        </div>
      </form>

      {status === 'error' && result?.error && (
        <div className="score-error-card" role="alert">
          <span className="score-error-icon">⚠️</span>
          <div>
            <p className="score-error-title">Verification Failed</p>
            <p className="score-error-msg">{result.error}</p>
          </div>
        </div>
      )}

      {status === 'ok' && result && result.ok && (
        <div className="score-results fade-up">
          {/* Executive Score Hero Header */}
          <div className="score-hero-card">
            <div className="score-hero-top">
              <div className={`score-grade-emblem is-${result.grade?.toLowerCase()}`}>
                <span className="score-grade-letter">{result.grade}</span>
                <span className="score-grade-glow" aria-hidden="true" />
              </div>
              <div className="score-hero-meta">
                <div className="score-percent-badge">
                  <span className="score-percent-value">{result.score}%</span>
                  <span className="score-percent-label">Legitimacy Score</span>
                </div>
                <div className="score-site-url" title={scoredUrl}>
                  <span className="score-url-dot" />
                  <span className="score-url-text">{scoredUrl}</span>
                </div>
              </div>
            </div>

            {/* Metric Breakdown Grid */}
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
                className="score-action-btn secondary"
                data-cuelume-press="tick"
              >
                {copied ? '✓ Receipt Copied' : '📋 Copy Receipt'}
              </button>
              <span className="score-tokens-badge">
                ⚡ {result.tokensExtracted || 0} tokens extracted
              </span>
            </div>
          </div>

          {/* Interactive Filter & Search Controls */}
          <div className="score-controls-card">
            {/* Status Filter Segmented Bar */}
            <div className="score-filter-segmented" role="tablist" aria-label="Filter by status">
              <button
                type="button"
                role="tab"
                aria-selected={filterStatus === 'ALL'}
                className={`score-filter-tab ${filterStatus === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('ALL')}
              >
                All <span className="score-tab-count">{checks.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterStatus === 'PASS'}
                className={`score-filter-tab is-pass ${filterStatus === 'PASS' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('PASS')}
              >
                Pass <span className="score-tab-count">{result.pass}</span>
              </button>
              {result.fail! > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === 'FAIL'}
                  className={`score-filter-tab is-fail ${filterStatus === 'FAIL' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('FAIL')}
                >
                  Fail <span className="score-tab-count">{result.fail}</span>
                </button>
              )}
              {result.warn! > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === 'WARN'}
                  className={`score-filter-tab is-warn ${filterStatus === 'WARN' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('WARN')}
                >
                  Warn <span className="score-tab-count">{result.warn}</span>
                </button>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={filterStatus === 'SKIP'}
                className={`score-filter-tab is-skip ${filterStatus === 'SKIP' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('SKIP')}
              >
                Skip <span className="score-tab-count">{result.skip}</span>
              </button>
            </div>

            {/* Secondary Controls: Search & Category Pills */}
            <div className="score-controls-secondary">
              <div className="score-search-wrapper">
                <span className="score-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search checks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="score-search-input"
                  aria-label="Search checks"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="score-search-clear"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
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
                      {cat.label} <span className="score-chip-num">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Verification Cards Feed */}
          <div className="score-cards-feed">
            {filteredChecks.length === 0 ? (
              <div className="score-empty-feed">
                <p className="score-empty-title">No matching verification checks</p>
                <p className="score-empty-desc">Try adjusting your status filter or search term.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilterStatus('ALL');
                    setSelectedCategory('ALL');
                    setSearchQuery('');
                  }}
                  className="score-action-btn secondary"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredChecks.map((check) => {
                const isExpanded = expandedId === check.id;
                const statusClass = check.status.toLowerCase();
                return (
                  <div
                    key={check.id}
                    className={`score-card-item is-${statusClass} ${isExpanded ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : check.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : check.id);
                      }
                    }}
                  >
                    <div className="score-card-main">
                      <div className="score-card-badge-group">
                        <span className={`score-card-status-pill is-${statusClass}`}>
                          {check.status}
                        </span>
                        <span className="score-card-id">{check.id}</span>
                        <span className="score-card-cat">{check.category}</span>
                      </div>
                      <h4 className="score-card-title">{check.item}</h4>
                    </div>

                    <div className="score-card-right">
                      <span className="score-card-arrow" aria-hidden="true">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="score-card-drawer">
                        <p className="score-drawer-heading">Technical Finding & Rule Context</p>
                        <p className="score-drawer-detail">{check.detail}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p className="score-note">
            {result.total} checks evaluated against the Designesy design system contract v0.3.0.
            Full live browser telemetry (viewports, INP, LCP) available via the{' '}
            <a href="/open" className="text-link">MCP verification engine</a>.
          </p>
        </div>
      )}

      {status === 'idle' && (
        <div className="score-welcome-card">
          <p className="score-welcome-title">Legitimacy Audit Engine</p>
          <p className="score-hint">
            Enter any public website URL above. We fetch its CSS, extract design tokens, and evaluate 26 verification
            checks against the Designesy contract v0.3.0. No login. Real-time.
          </p>
        </div>
      )}
    </div>
  );
}