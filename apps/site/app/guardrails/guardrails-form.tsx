'use client';

import { useState, useRef } from 'react';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
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
  bundle?: {
    tokens: object;
    lintConfig: object;
    agentRules: string;
    componentContract: object;
    antiPatterns: {
      inlineColors: { count: number; examples: string[]; rule: string };
      magicNumbers: { count: number; examples: string[]; rule: string };
      fabricatedTokens: { count: number; examples: string[]; rule: string };
    };
  };
  checks?: CheckResult[];
  error?: string;
};

function normalizeInput(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}

const STATUS_TOKENS: Record<string, string> = {
  PASS: 'var(--ok)',
  WARN: 'var(--warn)',
  FAIL: 'var(--error)',
};

type Tab = 'tokens' | 'lint' | 'rules' | 'contract' | 'anti';

export function GuardrailsForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<GuardrailsResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeInput(url);
    if (!normalized) return;
    setStatus('loading');
    setResult(null);
    setScoredUrl(normalized);

    try {
      const resp = await fetch('/api/guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
      });
      const data: GuardrailsResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        return;
      }
      setStatus('ok');
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the guardrails engine.' });
    }
  }

  function shareUrl(u: string): string {
    return `/guardrails?url=${encodeURIComponent(u)}`;
  }

  function getTabContent(tab: Tab): string {
    if (!result?.bundle) return '';
    switch (tab) {
      case 'tokens':
        return JSON.stringify(result.bundle.tokens, null, 2);
      case 'lint':
        return JSON.stringify(result.bundle.lintConfig, null, 2);
      case 'rules':
        return result.bundle.agentRules;
      case 'contract':
        return JSON.stringify(result.bundle.componentContract, null, 2);
      case 'anti':
        return JSON.stringify(result.bundle.antiPatterns, null, 2);
    }
  }

  async function copyToClipboard() {
    const content = getTabContent(activeTab);
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  function downloadBundle() {
    if (!result?.bundle) return;
    const blob = new Blob([JSON.stringify(result.bundle, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'designesy-guardrails-bundle.json';
    a.click();
    URL.revokeObjectURL(u);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tokens', label: 'Tokens' },
    { id: 'lint', label: 'Stylelint' },
    { id: 'rules', label: 'AGENTS.md' },
    { id: 'contract', label: 'Contract' },
    { id: 'anti', label: 'Anti-patterns' },
  ];

  return (
    <div className="guardrails-form">
      <form onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter a URL to generate guardrails..."
              className="score-url-input-inner"
              aria-label="URL to generate guardrails for"
              disabled={status === 'loading'}
            />
          </div>
          <button
            type="submit"
            className="button primary score-submit"
            disabled={status === 'loading' || !url.trim()}
            data-cuelume-press="sparkle"
            data-firework="true"
          >
            {status === 'loading' ? (
              <span className="score-loading-state">
                <span className="score-spinner" />
                Emitting…
              </span>
            ) : (
              'Generate guardrails'
            )}
          </button>
        </div>
      </form>

      {status === 'error' && result && (
        <div className="score-result" style={{ marginTop: '2rem' }}>
          <div className="score-result-error" style={{ color: 'var(--muted)' }}>
            <p style={{ fontSize: '0.9rem', margin: 0 }}>{result.error || 'An error occurred.'}</p>
          </div>
        </div>
      )}

      {status === 'ok' && result && (
        <div className="score-result" style={{ marginTop: '2rem' }}>
          <div className="score-result-header" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <GuardrailsDial score={result.score || 0} grade={result.grade || 'F'} />
            <div className="score-summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Guardrails emission
              </p>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem' }}>
                {result.grade} · {result.score}/100 · {result.tokensExtracted} tokens
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                {result.pass} pass · {result.warn} warn · {result.fail} fail of {result.total} checks
              </p>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={downloadBundle}
                className="button ghost"
                style={{ fontSize: '0.8rem' }}
                data-cuelume-hover="tick"
                data-cuelume-press="tick"
              >
                Download bundle ↓
              </button>
              <a
                href={shareUrl(scoredUrl)}
                className="button ghost"
                style={{ fontSize: '0.8rem' }}
                data-cuelume-hover="tick"
                data-cuelume-press="tick"
              >
                Share →
              </a>
            </div>
          </div>

          {/* Checks summary */}
          <div className="row-stack" role="list" style={{ marginBottom: '2rem' }}>
            {result.checks?.map((check, i) => (
              <div
                key={check.id}
                className="row"
                role="listitem"
                style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}
              >
                <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-body">
                  <span className="row-title">
                    {check.id} · {check.item}{' '}
                    <span
                      className={`check-status is-${check.status.toLowerCase()}`}
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: STATUS_TOKENS[check.status] || 'var(--warn)',
                        marginLeft: '0.5rem',
                      }}
                    >
                      {check.status}
                    </span>
                  </span>
                  <span className="row-meta">{check.detail}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Bundle output — tabbed */}
          {result.bundle && (
            <div className="guardrails-bundle">
              <div className="bundle-tabs" style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--line)', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveTab(tab.id); setCopied(false); }}
                    className="bundle-tab"
                    style={{
                      padding: '0.5rem 1rem',
                      background: activeTab === tab.id ? 'var(--surface-2)' : 'transparent',
                      border: 'none',
                      borderBottom: activeTab === tab.id ? '2px solid var(--ink)' : '2px solid transparent',
                      color: activeTab === tab.id ? 'var(--ink)' : 'var(--muted)',
                      fontSize: '0.85rem',
                      fontWeight: activeTab === tab.id ? 600 : 400,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background-color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1)), color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1)), border-color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="bundle-tab"
                  style={{
                    marginLeft: 'auto',
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    color: 'var(--muted)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <pre
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: '1.25rem',
                  overflow: 'auto',
                  fontSize: '0.8rem',
                  lineHeight: 1.6,
                  color: 'var(--ink)',
                  maxHeight: '500px',
                }}
              >
                <code>{getTabContent(activeTab)}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GuardrailsDial({ score, grade }: { score: number; grade: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const fillColor = score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--error)';

  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Grade ${grade}, ${score} percent`}
    >
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={fillColor}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 0.6s var(--ease, cubic-bezier(0.22,0.61,0.36,1))' }}
      />
      <text x="60" y="58" textAnchor="middle" style={{ fontSize: '2rem', fontWeight: 700, fill: 'var(--ink)' }}>
        {grade}
      </text>
      <text x="60" y="78" textAnchor="middle" style={{ fontSize: '0.8rem', fill: 'var(--muted-dim)' }}>
        {score}/100
      </text>
    </svg>
  );
}
