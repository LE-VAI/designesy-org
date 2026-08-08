'use client';

import { useState, useRef } from 'react';
import { ShareButton } from '../lib/share-button';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

type ReadinessResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
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

export function ReadinessForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<ReadinessResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeInput(url);
    if (!normalized) return;
    setStatus('loading');
    setResult(null);
    setScoredUrl(normalized);

    try {
      const resp = await fetch('/api/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
      });
      const data: ReadinessResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        return;
      }
      setStatus('ok');
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the readiness engine.' });
    }
  }

  function shareUrl(u: string): string {
    return `/readiness?url=${encodeURIComponent(u)}`;
  }

  return (
    <div className="readiness-form">
      <form onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                <path d="M12 2a10 10 0 0 1 10 10" />
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
              placeholder="Enter a URL to score AI readiness..."
              className="score-url-input-inner"
              aria-label="URL to score for AI readiness"
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
                Probing…
              </span>
            ) : (
              'Score readiness'
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
            <ReadinessDial score={result.score || 0} grade={result.grade || 'F'} />
            <div className="score-summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                AI Readiness score
              </p>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem' }}>
                {result.grade} · {result.score}/100
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                {result.pass} pass · {result.warn} warn · {result.fail} fail of {result.total} checks
              </p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <ShareButton
                url={shareUrl(scoredUrl)}
                text={`Designesy AI-readiness check — ${scoredUrl}`}
                label="Share this readiness result"
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
        </div>
      )}
    </div>
  );
}

function ReadinessDial({ score, grade }: { score: number; grade: string }) {
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
