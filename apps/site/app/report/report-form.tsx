'use client';

import { useState } from 'react';
import { ShareButton } from '../lib/share-button';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
  detail: string;
  category?: string;
  engine?: string;
};

type SubEngineResult = {
  ok: boolean;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  checks?: CheckResult[];
  error?: string;
};

type ReportResponse = {
  ok: boolean;
  url?: string;
  compositeScore?: number;
  compositeGrade?: string;
  score?: SubEngineResult;
  drift?: SubEngineResult;
  readiness?: SubEngineResult;
  totalChecks?: number;
  totalPass?: number;
  totalWarn?: number;
  totalFail?: number;
  totalSkip?: number;
  totalManual?: number;
  checks?: Array<CheckResult & { engine: string }>;
  synthesis?: CheckResult[];
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

export function ReportForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<ReportResponse | null>(null);
  const [activeEngine, setActiveEngine] = useState<'score' | 'drift' | 'readiness' | 'synthesis'>('score');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const norm = normalizeInput(url);
    if (!norm) return;
    setStatus('loading');
    setResult(null);

    try {
      const resp = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: norm }),
      });
      const data: ReportResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        return;
      }
      setStatus('ok');
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the report engine.' });
    }
  }

  function shareUrl(u: string): string {
    return `/report?url=${encodeURIComponent(u)}`;
  }

  return (
    <div className="report-form">
      <form onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="16" y2="17" />
              </svg>
            </span>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter a URL to report on..."
              className="score-url-input-inner"
              aria-label="URL to report on"
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
                Running 3 engines in parallel…
              </span>
            ) : (
              'Generate report'
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
          {/* Composite grade header */}
          <div className="score-result-header" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <ScoreDial score={result.compositeScore || 0} grade={result.compositeGrade || 'F'} />
            <div className="score-summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Composite design-intelligence grade
              </p>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem' }}>
                {result.compositeGrade} · {result.compositeScore}/100
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                {result.totalPass} pass · {result.totalWarn} warn · {result.totalFail} fail · {result.totalManual || 0} manual · {result.totalSkip} N/A of {result.totalChecks} checks
              </p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <ShareButton
                url={shareUrl(result.url || '')}
                text={`Designesy composite report — ${result.url || ''}`}
                label="Share this report"
                compact
              />
            </div>
          </div>

          {/* Sub-engine scores */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            <SubEngineCard
              label="Score"
              weight="×0.5"
              result={result.score}
              description="40-check audit"
            />
            <SubEngineCard
              label="Drift"
              weight="×0.3"
              result={result.drift}
              description="12-check drift radar"
            />
            <SubEngineCard
              label="Readiness"
              weight="×0.2"
              result={result.readiness}
              description="10-check AI readiness"
            />
          </div>

          {/* Engine tabs */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem',
            borderBottom: '1px solid var(--line)',
            paddingBottom: '0.5rem',
            flexWrap: 'wrap',
          }}>
            {([
              { key: 'score', label: 'Score', count: result.score?.checks?.length || 0 },
              { key: 'drift', label: 'Drift', count: result.drift?.checks?.length || 0 },
              { key: 'readiness', label: 'Readiness', count: result.readiness?.checks?.length || 0 },
              { key: 'synthesis', label: 'Synthesis', count: result.synthesis?.length || 0 },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveEngine(tab.key)}
                style={{
                  fontSize: '0.8rem',
                  fontWeight: activeEngine === tab.key ? 600 : 400,
                  color: activeEngine === tab.key ? 'var(--ink)' : 'var(--muted)',
                  background: activeEngine === tab.key ? 'var(--surface-hover)' : 'transparent',
                  border: '1px solid',
                  borderColor: activeEngine === tab.key ? 'var(--line-strong)' : 'var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.4rem 0.8rem',
                  cursor: 'pointer',
                  transition: 'background-color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1)), color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1)), border-color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
                }}
                aria-pressed={activeEngine === tab.key}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeEngine === 'score' && (
            <EngineChecks
              checks={result.score?.checks || []}
              emptyText="Score engine did not return checks."
            />
          )}
          {activeEngine === 'drift' && (
            <EngineChecks
              checks={result.drift?.checks || []}
              emptyText="Drift engine did not return checks."
            />
          )}
          {activeEngine === 'readiness' && (
            <EngineChecks
              checks={result.readiness?.checks || []}
              emptyText="Readiness engine did not return checks."
            />
          )}
          {activeEngine === 'synthesis' && (
            <EngineChecks
              checks={result.synthesis || []}
              emptyText="Synthesis checks not available."
            />
          )}
        </div>
      )}
    </div>
  );
}

function ScoreDial({ score, grade }: { score: number; grade: string }) {
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
      aria-label={`Composite grade ${grade}, ${score} percent`}
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

function SubEngineCard({
  label,
  weight,
  result,
  description,
}: {
  label: string;
  weight: string;
  result?: SubEngineResult;
  description: string;
}) {
  const score = result?.ok ? result.score : undefined;
  const grade = result?.ok ? result.grade : undefined;
  const fillColor = score === undefined ? 'var(--muted-dim)' : score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--error)';

  return (
    <div style={{
      background: 'var(--surface-soft)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: '1rem 1.25rem',
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted-dim)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label} {weight}
      </p>
      {result?.ok && score !== undefined && grade ? (
        <>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: fillColor, margin: '0 0 0.25rem' }}>
            {grade} · {score}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>
            {result.pass} pass · {result.warn} warn · {result.fail} fail of {result.total}
          </p>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted-dim)', margin: '0.25rem 0 0' }}>
            {description}
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--muted-dim)', margin: '0 0 0.25rem' }}>
            —
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>
            {result?.error || 'Engine did not return a score'}
          </p>
        </>
      )}
    </div>
  );
}

function EngineChecks({ checks, emptyText }: { checks: CheckResult[]; emptyText: string }) {
  if (checks.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '1rem 0' }}>{emptyText}</p>;
  }
  return (
    <div className="row-stack" role="list">
      {checks.map((check, i) => (
        <div
          key={`${check.id}-${i}`}
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
                  color: check.status === 'PASS' ? 'var(--ok)' : check.status === 'FAIL' ? 'var(--error)' : check.status === 'WARN' ? 'var(--warn)' : 'var(--muted-dim)',
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
  );
}