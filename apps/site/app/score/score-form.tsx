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
      {/* Left-Aligned Input Card */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="score-input-card"
      >
        <div className="score-input-col">
          <div className="score-input-wrapper">
            <span className="score-input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4 10z" />
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
              className="score-url-input"
              style={{
                width: '100%',
                height: '52px',
                padding: '0 16px 0 64px',
                background: '#0a0a0e',
                border: '1px solid #22222e',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '15px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
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
        <div className="score-error-card" style={{ marginTop: '20px', padding: '16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: '#f87171' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
          <div>
            <p style={{ fontWeight: 600, color: '#f87171', margin: '0 0 4px 0', fontSize: '14px' }}>Verification Notice</p>
            <p style={{ fontSize: '13px', color: '#aaaabb', margin: 0 }}>{result.error}</p>
          </div>
        </div>
      )}

      {status === 'ok' && result && result.ok && (
        <div className="score-results fade-up" style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Score Dashboard Card */}
          <div
            className="score-hero-card"
            style={{
              background: 'linear-gradient(135deg, #13131a 0%, #0a0a0e 100%)',
              border: '1px solid #22222e',
              borderRadius: '18px',
              padding: '24px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              position: 'relative',
              overflow: 'hidden',
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
                  border:
                    result.grade === 'A' ? '2px solid #4ade80' :
                    result.grade === 'B' ? '2px solid #a3e635' :
                    result.grade === 'C' ? '2px solid #facc15' :
                    result.grade === 'D' ? '2px solid #fb923c' : '2px solid #f87171',
                  background:
                    result.grade === 'A' ? 'rgba(34,197,94,0.12)' :
                    result.grade === 'B' ? 'rgba(132,204,22,0.12)' :
                    result.grade === 'C' ? 'rgba(234,179,8,0.12)' :
                    result.grade === 'D' ? 'rgba(249,115,22,0.12)' : 'rgba(239,68,68,0.12)',
                  color:
                    result.grade === 'A' ? '#4ade80' :
                    result.grade === 'B' ? '#a3e635' :
                    result.grade === 'C' ? '#facc15' :
                    result.grade === 'D' ? '#fb923c' : '#f87171',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '44px', fontWeight: 900, lineHeight: 1 }}>
                  {result.grade}
                </span>
              </div>

              <div className="score-hero-meta" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 220px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontSize: '38px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {result.score}%
                  </span>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888899', fontWeight: 700 }}>
                    Legitimacy Score
                  </span>
                </div>

                <div style={{ width: '100%', height: '6px', background: '#1c1c28', borderRadius: '99px', overflow: 'hidden', margin: '2px 0' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${result.score}%`,
                      background:
                        result.score! >= 80 ? 'linear-gradient(90deg, #3358e8, #4ade80)' :
                        result.score! >= 60 ? 'linear-gradient(90deg, #3358e8, #facc15)' :
                        'linear-gradient(90deg, #f87171, #fb923c)',
                      borderRadius: '99px',
                    }}
                  />
                </div>

                <div
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
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', flexShrink: 0, boxShadow: '0 0 8px #4ade80' }} />
                  <span style={{ fontSize: '13px', color: '#aaaabb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scoredUrl}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Metrics Cell Grid */}
            <div className="score-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>{result.pass}</span>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#4ade80', marginTop: '4px' }}>PASSED CHECKS</span>
              </div>

              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#f87171', lineHeight: 1 }}>{result.fail}</span>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>FAILED CHECKS</span>
              </div>

              <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '12px', padding: '14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#facc15', lineHeight: 1 }}>{result.warn}</span>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#facc15', marginTop: '4px' }}>WARNINGS</span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #22222e', borderRadius: '12px', padding: '14px 10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#888899', lineHeight: 1 }}>{result.skip}</span>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#666677', marginTop: '4px' }}>SKIPPED (MCP)</span>
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid #22222e', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={copyReceipt}
                className="score-action-btn secondary"
                data-cuelume-press="tick"
                style={{
                  height: '38px',
                  padding: '0 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: '#181822',
                  border: '1px solid #28283a',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copied ? 'Receipt Copied to Clipboard!' : 'Copy Verification Receipt'}
              </button>

              <span style={{ fontSize: '12px', color: '#888899', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3358e8" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {result.tokensExtracted || 0} CSS tokens extracted
              </span>
            </div>
          </div>

          {/* Interactive Filter & Search Controls */}
          <div className="score-controls-card" style={{ background: '#111116', border: '1px solid #22222e', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="score-filter-segmented" style={{ display: 'flex', background: '#0a0a0e', padding: '4px', borderRadius: '10px', border: '1px solid #22222e', gap: '4px', overflowX: 'auto' }}>
              <button
                type="button"
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

            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '12px', color: '#888899', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search 26 verification checks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  paddingLeft: '38px',
                  paddingRight: '16px',
                  background: '#0a0a0e',
                  border: '1px solid #22222e',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              <button
                type="button"
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

          <div className="score-cards-feed" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredChecks.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', background: '#111116', border: '1px solid #22222e', borderRadius: '16px' }}>
                <p style={{ fontWeight: 600, color: '#ffffff', margin: '0 0 4px 0' }}>No matching verification checks</p>
                <p style={{ fontSize: '13px', color: '#888899', margin: '0 0 16px 0' }}>Try adjusting your search query or status filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilterStatus('ALL');
                    setSelectedCategory('ALL');
                    setSearchQuery('');
                  }}
                  style={{ height: '36px', padding: '0 16px', fontSize: '13px', borderRadius: '8px', background: '#181822', border: '1px solid #28283a', color: '#fff', cursor: 'pointer' }}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredChecks.map((check) => {
                const isExpanded = expandedId === check.id;
                const badgeBg =
                  check.status === 'PASS' ? 'rgba(34,197,94,0.15)' :
                  check.status === 'FAIL' ? 'rgba(239,68,68,0.15)' :
                  check.status === 'WARN' ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)';
                const badgeColor =
                  check.status === 'PASS' ? '#4ade80' :
                  check.status === 'FAIL' ? '#f87171' :
                  check.status === 'WARN' ? '#facc15' : '#888899';
                const badgeBorder =
                  check.status === 'PASS' ? '1px solid rgba(34,197,94,0.3)' :
                  check.status === 'FAIL' ? '1px solid rgba(239,68,68,0.3)' :
                  check.status === 'WARN' ? '1px solid rgba(234,179,8,0.3)' : '1px solid #22222e';

                return (
                  <div
                    key={check.id}
                    onClick={() => setExpandedId(isExpanded ? null : check.id)}
                    role="button"
                    tabIndex={0}
                    style={{
                      background: '#111116',
                      border: isExpanded ? '1px solid #3358e8' : '1px solid #1c1c26',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '3px 8px',
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

                      <span style={{ fontSize: '12px', color: '#666677', display: 'flex', alignItems: 'center' }}>
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
                    </div>

                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', margin: 0, lineHeight: 1.45 }}>{check.item}</h4>

                    {isExpanded && (
                      <div style={{ marginTop: '4px', paddingTop: '12px', borderTop: '1px dashed #22222e' }}>
                        <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#3358e8', fontWeight: 700, margin: '0 0 4px 0' }}>Technical Finding & Rule Context</p>
                        <p style={{ fontSize: '13px', color: '#aaaabb', margin: 0, lineHeight: 1.5 }}>{check.detail}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p className="score-note" style={{ fontSize: '12px', color: '#666677', textAlign: 'left', marginTop: '12px' }}>
            {result.total} checks evaluated against Designesy design system contract v0.3.0.
          </p>
        </div>
      )}

      {status === 'idle' && (
        <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid #22222e', borderRadius: '14px', textAlign: 'left' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3358e8', margin: '0 0 6px 0' }}>Legitimacy Audit Engine</p>
          <p style={{ fontSize: '13.5px', color: '#888899', lineHeight: 1.55, margin: 0 }}>
            Enter any public website URL above (e.g. designesy.org or nike.com). We fetch its CSS, extract design tokens, and evaluate 26 verification checks against the Designesy contract v0.3.0. Real-time. No login required.
          </p>
        </div>
      )}
    </div>
  );
}