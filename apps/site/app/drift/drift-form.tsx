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

type DriftResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  tokensExtracted?: number;
  checks?: CheckResult[];
  error?: string;
};

const STATUS_COLOR: Record<string, string> = {
  PASS: 'var(--signal-light)',
  WARN: 'var(--activation)',
  FAIL: '#ff4444',
};

export function DriftForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<DriftResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus('loading');
    setResult(null);
    setScoredUrl(url.trim());

    try {
      const resp = await fetch('/api/drift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
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
      <form onSubmit={handleSubmit} className="score-form" role="search">
        <div className="score-input-row">
          <span className="score-input-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter a URL to scan for drift..."
            className="score-input"
            aria-label="URL to scan for drift"
            autoFocus={!!initialUrl}
          />
          <button
            type="submit"
            className="button primary"
            disabled={status === 'loading'}
            data-cuelume-hover="tick"
            data-cuelume-press="tick"
          >
            {status === 'loading' ? 'Scanning…' : 'Scan for drift'}
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
            <div className="score-dial-wrap">
              <ScoreDial score={result.score || 0} grade={result.grade || 'F'} />
            </div>
            <div className="score-summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Drift score
              </p>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem' }}>
                {result.grade} · {result.score}/100
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                {result.pass} pass · {result.warn} warn · {result.fail} fail of {result.total} checks
              </p>
              {result.tokensExtracted !== undefined && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0.5rem 0 0' }}>
                  {result.tokensExtracted} custom properties extracted from :root
                </p>
              )}
            </div>
            <div style={{ marginLeft: 'auto' }}>
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
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: STATUS_COLOR[check.status],
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

function ScoreDial({ score, grade }: { score: number; grade: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? 'var(--signal-light)' : score >= 70 ? 'var(--activation)' : '#ff4444';

  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={color}
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