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
    <div className="score-form" style={{ width: '100%', maxWidth: '760px', margin: '0 auto' }}>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="score-input-card"
        style={{
          background: '#111116',
          border: '1px solid #22222e',
          borderRadius: '16px',
          padding: '12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div className="score-input-row" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="score-input-wrapper" style={{ position: 'relative', flex: '1 1 240px', display: 'flex', alignItems: 'center' }}>
            <span className="score-input-icon" style={{ position: 'absolute', left: '14px', fontSize: '16px', opacity: 0.7, pointerEvents: 'none' }}>🌐</span>
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
              style={{
                width: '100%',
                height: '52px',
                paddingLeft: '44px',
                paddingRight: '16px',
                background: '#0a0a0e',
                border: '1px solid #22222e',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '15px',
                outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={status === 'loading' || !url.trim()}
            data-cuelume-press="sparkle"
            data-firework="true"
            className="button primary score-submit"
            style={{
              height: '52px',
              padding: '0 24px',
              fontWeight: 600,
              fontSize: '15px',
              borderRadius: '10px',
              whiteSpace: 'nowrap',
              flex: '0 0 auto',
            }}
          >
            {status === 'loading' ? (
              <span className="score-loading-state" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="score-spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
                Scoring…
              </span>
            ) : (
              'Score it'
            )}
          </button>
        </div>
      </form>

      {status === 'error' && result?.error && (
        <div className="score-error-card" style={{ marginTop: '20px', padding: '16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', display: 'flex', gap: '12px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <div>
            <p style={{ fontWeight: 600, color: '#f87171', margin: '0 0 4px 0' }}>Verification Failed</p>
            <p style={{ fontSize: '13px', color: '#aaaabb', margin: 0 }}>{result.error}</p>
          </div>
        </div>
      )}

      {status === 'ok' && result && result.ok && (
        <div className="score-results fade-up" style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Executive Score Hero Header */}
          <div
            className="score-hero-card"
            style={{
              background: 'linear-gradient(135deg, rgba(20,20,26,0.95) 0%, rgba(10,10,14,0.98) 100%)',
              border: '1px solid #22222e',
              borderRadius: '18px',
              padding: '24px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div className="score-hero-top" style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div
                className={`score-grade-emblem is-${result.grade?.toLowerCase()}`}
                style={{
                  width: '84px',
                  height: '84px',
                  display: 'flex',
                  alignItems: 'center',
                  justify-content: 'center',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                <span className="score-grade-letter" style={{ fontSize: '44px', fontWeight: 900, lineHeight: 1 }}>
                  {result.grade}
                </span>
              </div>
              <div className="score-hero-meta" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 200px' }}>
                <div className="score-percent-badge" style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span className="score-percent-value" style={{ fontSize: '36px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                    {result.score}%
                  </span>
                  <span className="score-percent-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888899', fontWeight: 700 }}>
                    Legitimacy Score
                  </span>
                </div>
                <div
                  className="score-site-url"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid #22222e',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    width: 'fit-content',
                    maxWidth: '100%',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#aaaabb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scoredUrl}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Metric Tiles */}
            <div className="score-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              <div className="score-metric-tile is-pass" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="score-metric-val" style={{ fontSize: '22px', fontWeight: 700, color: '#4ade80', lineHeight: 1 }}>{result.pass}</span>
                <span className="score-metric-lbl" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: '#4ade80', marginTop: '4px' }}>Passed</span>
              </div>
              <div className="score-metric-tile is-fail" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="score-metric-val" style={{ fontSize: '22px', fontWeight: 700, color: '#f87171', lineHeight: 1 }}>{result.fail}</span>
                <span className="score-metric-lbl" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>Failed</span>
              </div>
              <div className="score-metric-tile is-warn" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="score-metric-val" style={{ fontSize: '22px', fontWeight: 700, color: '#facc15', lineHeight: 1 }}>{result.warn}</span>
                <span className="score-metric-lbl" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: '#facc15', marginTop: '4px' }}>Warnings</span>
              </div>
              <div className="score-metric-tile is-skip" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #22222e', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="score-metric-val" style={{ fontSize: '22px', fontWeight: 700, color: '#888899', lineHeight: 1 }}>{result.skip}</span>
                <span className="score-metric-lbl" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: '#666677', marginTop: '4px' }}>Skipped</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="score-hero-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid #22222e', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={copyReceipt}
                className="score-action-btn secondary"
                data-cuelume-press="tick"
                style={{ height: '36px', padding: '0 16px', fontSize: '13px', fontWeight: 600, borderRadius: '8px', background: '#181822', border: '1px solid #28283a', color: '#ffffff', cursor: 'pointer' }}
              >
                {copied ? '✓ Receipt Copied' : '📋 Copy Receipt'}
              </button>
              <span className="score-tokens-badge" style={{ fontSize: '12px', color: '#888899', fontWeight: 500 }}>
                ⚡ {result.tokensExtracted || 0} tokens extracted
              </span>
            </div>
          </div>

          {/* Interactive Filter & Search Controls */}
          <div className="score-controls-card" style={{ background: '#111116', border: '1px solid #22222e', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Status Filter Segmented Bar */}
            <div className="score-filter-segmented" style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', padding: '4px', borderRadius: '10px', border: '1px solid #22222e', gap: '4px', overflowX: 'auto' }}>
              <button
                type="button"
                role="tab"
                aria-selected={filterStatus === 'ALL'}
                className={`score-filter-tab ${filterStatus === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('ALL')}
                style={{
                  flex: 1,
                  minWidth: '60px',
                  height: '36px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justify-content: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: filterStatus === 'ALL' ? '#ffffff' : '#888899',
                  background: filterStatus === 'ALL' ? '#1c1c28' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                All <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '99px', background: 'rgba(255,255,255,0.1)' }}>{checks.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterStatus === 'PASS'}
                className={`score-filter-tab is-pass ${filterStatus === 'PASS' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('PASS')}
                style={{
                  flex: 1,
                  minWidth: '60px',
                  height: '36px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justify-content: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: filterStatus === 'PASS' ? '#4ade80' : '#888899',
                  background: filterStatus === 'PASS' ? 'rgba(34,197,94,0.15)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Pass <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '99px', background: 'rgba(34,197,94,0.2)' }}>{result.pass}</span>
              </button>
              {result.fail! > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === 'FAIL'}
                  className={`score-filter-tab is-fail ${filterStatus === 'FAIL' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('FAIL')}
                  style={{
                    flex: 1,
                    minWidth: '60px',
                    height: '36px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justify-content: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: filterStatus === 'FAIL' ? '#f87171' : '#888899',
                    background: filterStatus === 'FAIL' ? 'rgba(239,68,68,0.15)' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Fail <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '99px', background: 'rgba(239,68,68,0.2)' }}>{result.fail}</span>
                </button>
              )}
              {result.warn! > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === 'WARN'}
                  className={`score-filter-tab is-warn ${filterStatus === 'WARN' ? 'is-active' : ''}`}
                  onClick={() => setFilterStatus('WARN')}
                  style={{
                    flex: 1,
                    minWidth: '60px',
                    height: '36px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justify-content: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: filterStatus === 'WARN' ? '#facc15' : '#888899',
                    background: filterStatus === 'WARN' ? 'rgba(234,179,8,0.15)' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Warn <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '99px', background: 'rgba(234,179,8,0.2)' }}>{result.warn}</span>
                </button>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={filterStatus === 'SKIP'}
                className={`score-filter-tab is-skip ${filterStatus === 'SKIP' ? 'is-active' : ''}`}
                onClick={() => setFilterStatus('SKIP')}
                style={{
                  flex: 1,
                  minWidth: '60px',
                  height: '36px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justify-content: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: filterStatus === 'SKIP' ? '#cccccc' : '#888899',
                  background: filterStatus === 'SKIP' ? '#1c1c28' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Skip <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '99px', background: 'rgba(255,255,255,0.1)' }}>{result.skip}</span>
              </button>
            </div>

            {/* Secondary Controls: Search & Category Pills */}
            <div className="score-controls-secondary" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="score-search-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span className="score-search-icon" style={{ position: 'absolute', left: '12px', fontSize: '13px', opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search 26 verification checks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="score-search-input"
                  aria-label="Search checks"
                  style={{
                    width: '100%',
                    height: '38px',
                    paddingLeft: '34px',
                    paddingRight: '16px',
                    background: '#0a0a0e',
                    border: '1px solid #22222e',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div className="score-category-chips" style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                <button
                  type="button"
                  className={`score-category-chip ${selectedCategory === 'ALL' ? 'is-active' : ''}`}
                  onClick={() => setSelectedCategory('ALL')}
                  style={{
                    height: '28px',
                    padding: '0 12px',
                    borderRadius: '99px',
                    background: selectedCategory === 'ALL' ? 'rgba(1,51,203,0.2)' : 'rgba(255,255,255,0.03)',
                    border: selectedCategory === 'ALL' ? '1px solid #0133cb' : '1px solid #22222e',
                    color: selectedCategory === 'ALL' ? '#ffffff' : '#888899',
                    fontSize: '12px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  All Categories
                </button>
                {CATEGORIES.map((cat) => {
                  const count = checks.filter((c) => c.category === cat.key).length;
                  if (count === 0) return null;
                  const isActive = selectedCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      className={`score-category-chip ${isActive ? 'is-active' : ''}`}
                      onClick={() => setSelectedCategory(cat.key)}
                      style={{
                        height: '28px',
                        padding: '0 10px',
                        borderRadius: '99px',
                        background: isActive ? 'rgba(1,51,203,0.2)' : 'rgba(255,255,255,0.03)',
                        border: isActive ? '1px solid #0133cb' : '1px solid #22222e',
                        color: isActive ? '#ffffff' : '#888899',
                        fontSize: '12px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>{cat.label}</span>
                      <span style={{ opacity: 0.6, fontSize: '10px' }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Verification Cards Feed */}
          <div className="score-cards-feed" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredChecks.length === 0 ? (
              <div className="score-empty-feed" style={{ padding: '36px 16px', textAlign: 'center', background: '#111116', border: '1px solid #22222e', borderRadius: '16px' }}>
                <p className="score-empty-title" style={{ fontWeight: 600, color: '#ffffff', margin: '0 0 4px 0' }}>No matching verification checks</p>
                <p className="score-empty-desc" style={{ fontSize: '13px', color: '#888899', margin: '0 0 16px 0' }}>Try adjusting your status filter or search query.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilterStatus('ALL');
                    setSelectedCategory('ALL');
                    setSearchQuery('');
                  }}
                  className="score-action-btn secondary"
                  style={{ height: '36px', padding: '0 16px', fontSize: '13px', borderRadius: '8px', background: '#181822', border: '1px solid #28283a', color: '#fff' }}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredChecks.map((check) => {
                const isExpanded = expandedId === check.id;
                const statusClass = check.status.toLowerCase();
                const badgeBg =
                  check.status === 'PASS'
                    ? 'rgba(34,197,94,0.15)'
                    : check.status === 'FAIL'
                    ? 'rgba(239,68,68,0.15)'
                    : check.status === 'WARN'
                    ? 'rgba(234,179,8,0.15)'
                    : 'rgba(255,255,255,0.06)';
                const badgeColor =
                  check.status === 'PASS'
                    ? '#4ade80'
                    : check.status === 'FAIL'
                    ? '#f87171'
                    : check.status === 'WARN'
                    ? '#facc15'
                    : '#888899';
                const badgeBorder =
                  check.status === 'PASS'
                    ? '1px solid rgba(34,197,94,0.3)'
                    : check.status === 'FAIL'
                    ? '1px solid rgba(239,68,68,0.3)'
                    : check.status === 'WARN'
                    ? '1px solid rgba(234,179,8,0.3)'
                    : '1px solid #22222e';

                return (
                  <div
                    key={check.id}
                    className={`score-card-item is-${statusClass} ${isExpanded ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : check.id)}
                    role="button"
                    tabIndex={0}
                    style={{
                      background: '#111116',
                      border: isExpanded ? '1px solid #0133cb' : '1px solid #1c1c26',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          className={`score-card-status-pill is-${statusClass}`}
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            background: badgeBg,
                            color: badgeColor,
                            border: badgeBorder,
                            display: 'inline-block',
                          }}
                        >
                          {check.status}
                        </span>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#888899', fontWeight: 600 }}>{check.id}</span>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666677', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px' }}>
                          {check.category}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#666677' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: 0, lineHeight: 1.4 }}>{check.item}</h4>

                    {isExpanded && (
                      <div style={{ marginTop: '6px', paddingTop: '10px', borderTop: '1px dashed #22222e' }}>
                        <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#3358e8', fontWeight: 700, margin: '0 0 4px 0' }}>Technical Finding & Rule Context</p>
                        <p style={{ fontSize: '13px', color: '#aaaabb', margin: 0, lineHeight: 1.5 }}>{check.detail}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p className="score-note" style={{ fontSize: '12px', color: '#666677', textAlign: 'center', marginTop: '12px' }}>
            {result.total} checks evaluated against Designesy design system contract v0.3.0.
          </p>
        </div>
      )}

      {status === 'idle' && (
        <div className="score-welcome-card" style={{ marginTop: '20px', padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid #22222e', borderRadius: '14px', textAlign: 'center' }}>
          <p className="score-welcome-title" style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3358e8', margin: '0 0 6px 0' }}>Legitimacy Audit Engine</p>
          <p className="score-hint" style={{ fontSize: '13.5px', color: '#888899', lineHeight: 1.55, margin: 0 }}>
            Enter any public website URL above. We fetch its CSS, extract design tokens, and evaluate 26 verification checks against the Designesy contract v0.3.0. Real-time. No login required.
          </p>
        </div>
      )}
    </div>
  );
}