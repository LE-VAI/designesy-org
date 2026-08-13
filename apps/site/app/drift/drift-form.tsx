'use client';

import { useState, useRef } from 'react';
import { ShareButton } from '../lib/share-button';
import { ScoreDial } from '../lib/score-dial';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
};

type DriftResponse = {
  ok: boolean;
  url?: string;
  scope?: 'contract' | 'universal';
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  skip?: number;
  total?: number;
  tokensExtracted?: number;
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

export function DriftForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<DriftResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [scopeMode, setScopeMode] = useState<'auto' | 'contract' | 'universal'>('auto');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeInput(url);
    if (!normalized) return;
    setStatus('loading');
    setResult(null);
    setScoredUrl(normalized);

    try {
      const resp = await fetch('/api/drift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized, scope: scopeMode }),
      });
      const data: DriftResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        return;
      }
      setStatus('ok');
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the drift engine.' });
    }
  }

  function shareUrl(u: string): string {
    return `/drift?url=${encodeURIComponent(u)}`;
  }

  return (
    <div className="drift-form">
      <form onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
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
              placeholder="Enter a URL to scan for drift..."
              className="score-url-input-inner"
              aria-label="URL to scan for drift"
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
                Scanning for drift…
              </span>
            ) : (
              'Scan for drift'
            )}
          </button>
        </div>
      </form>

      <div className="score-scope-toggle" role="radiogroup" aria-label="Drift scoring scope">
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
                ? 'Auto-detect: designesy.org → contract, everything else → universal'
                : mode === 'universal'
                  ? 'Universal: absence of CSS custom properties is SKIP, not FAIL (fair to external sites)'
                  : 'Contract: all 12 checks penalize absence (strictest, for designesy.org self-scan)'
            }
          >
            {mode}
          </button>
        ))}
      </div>

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
            <div className="score-dial-wrap">
              <ScoreDial score={result.score || 0} grade={result.grade || 'F'} />
            </div>
            <div className="score-summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Drift score
                {result.scope && (
                  <span className="score-scope-badge" style={{ marginLeft: '0.5rem' }}>
                    {result.scope}
                  </span>
                )}
              </p>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem' }}>
                {result.grade} · {result.score}/100
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                {result.pass} pass · {result.warn} warn · {result.fail} fail
                {result.skip ? ` · ${result.skip} skip` : ''} of {result.total} checks
              </p>
              {result.tokensExtracted !== undefined && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0.5rem 0 0' }}>
                  {result.tokensExtracted} custom properties extracted from :root
                </p>
              )}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <ShareButton
                url={shareUrl(scoredUrl)}
                text={`Designesy drift check — ${scoredUrl}`}
                label="Share this drift result"
                compact
              />
            </div>
          </div>

          <div className="row-stack" role="list">
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
                        color: check.status === 'PASS' ? 'var(--ok)' : check.status === 'FAIL' ? 'var(--error)' : check.status === 'SKIP' ? 'var(--muted-dim)' : 'var(--warn)',
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
        </div>
      )}
    </div>
  );
}

