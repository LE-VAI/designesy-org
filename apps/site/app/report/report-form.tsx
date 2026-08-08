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
        <div className="score-result report-composite" style={{ marginTop: '2rem' }}>
          {/* Composite grade header */}
          <div className="report-composite-header">
            <ScoreDial score={result.compositeScore || 0} grade={result.compositeGrade || 'F'} />
            <div className="score-summary report-composite-summary">
              <p className="report-composite-eyebrow">
                Composite design-intelligence grade
              </p>
              <p className="report-composite-grade-line">
                {result.compositeGrade} · {result.compositeScore}/100
              </p>
              <p className="report-composite-counts">
                {result.totalPass} pass · {result.totalWarn} warn · {result.totalFail} fail · {result.totalManual || 0} manual · {result.totalSkip} N/A of {result.totalChecks} checks
              </p>
            </div>
            <div className="report-composite-share">
              <ShareButton
                url={shareUrl(result.url || '')}
                text={`Designesy composite report — ${result.url || ''}`}
                label="Share this report"
                compact
              />
            </div>
          </div>

          {/* Sub-engine scores */}
          <div className="report-sub-engines">
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
          <div className="report-engine-tabs">
            {([
              { key: 'score', label: 'Score', count: result.score?.checks?.length || 0 },
              { key: 'drift', label: 'Drift', count: result.drift?.checks?.length || 0 },
              { key: 'readiness', label: 'Readiness', count: result.readiness?.checks?.length || 0 },
              { key: 'synthesis', label: 'Synthesis', count: result.synthesis?.length || 0 },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveEngine(tab.key)}
                className={`report-engine-tab${activeEngine === tab.key ? ' active' : ''}`}
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
    <div className="report-sub-engine-card">
      <p className="report-sub-engine-label">
        {label} {weight}
      </p>
      {result?.ok && score !== undefined && grade ? (
        <>
          <p className="report-sub-engine-grade" style={{ color: fillColor }}>
            {grade} · {score}
          </p>
          <p className="report-sub-engine-counts">
            {result.pass} pass · {result.warn} warn · {result.fail} fail of {result.total}
          </p>
          <p className="report-sub-engine-desc">
            {description}
          </p>
        </>
      ) : (
        <>
          <p className="report-sub-engine-grade report-sub-engine-grade--null">
            —
          </p>
          <p className="report-sub-engine-counts">
            {result?.error || 'Engine did not return a score'}
          </p>
        </>
      )}
    </div>
  );
}

function EngineChecks({ checks, emptyText }: { checks: CheckResult[]; emptyText: string }) {
  if (checks.length === 0) {
    return <p className="report-empty">{emptyText}</p>;
  }

  // Separate actionable checks from SKIP/MANUAL
  const actionable = checks.filter((c) => c.status !== 'SKIP' && c.status !== 'MANUAL');
  const skipped = checks.filter((c) => c.status === 'SKIP');
  const manual = checks.filter((c) => c.status === 'MANUAL');

  // Sort: FAIL first, then WARN, then PASS
  const statusOrder: Record<string, number> = { FAIL: 0, WARN: 1, PASS: 2 };
  const sorted = [...actionable].sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );

  return (
    <div className="report-engine-content">
      {/* Status summary bar */}
      <StatusSummaryBar checks={checks} />

      {/* Actionable checks as collapsible cards */}
      <div className="report-check-list">
        {sorted.map((check) => (
          <details
            key={check.id}
            className={`report-check report-check--${check.status.toLowerCase()}`}
          >
            <summary className="report-check-summary">
              <span
                className={`report-check-status report-check-status--${check.status.toLowerCase()}`}
              >
                {check.status}
              </span>
              <span className="report-check-id">{check.id}</span>
              <span className="report-check-item">{check.item}</span>
              <span className="report-check-detail">{check.detail}</span>
            </summary>
            <div className="report-check-body">
              <p className="report-check-body-detail">{check.detail}</p>
            </div>
          </details>
        ))}
      </div>

      {/* Manual checks (collapsed by default) */}
      {manual.length > 0 && (
        <details className="report-skipped">
          <summary>
            {manual.length} check{manual.length !== 1 ? 's' : ''} manual (require live browser — run the audit)
          </summary>
          <div className="report-check-list">
            {manual.map((check) => (
              <div key={check.id} className="report-check report-check--manual">
                <span className="report-check-status report-check-status--manual">MANUAL</span>
                <span className="report-check-id">{check.id}</span>
                <span className="report-check-item">{check.item}</span>
                <span className="report-check-detail">{check.detail}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Skipped checks (collapsed by default) */}
      {skipped.length > 0 && (
        <details className="report-skipped">
          <summary>
            {skipped.length} check{skipped.length !== 1 ? 's' : ''} not applicable (convention not met)
          </summary>
          <div className="report-check-list">
            {skipped.map((check) => (
              <div key={check.id} className="report-check report-check--skip">
                <span className="report-check-status report-check-status--skip">N/A</span>
                <span className="report-check-id">{check.id}</span>
                <span className="report-check-item">{check.item}</span>
                <span className="report-check-detail">{check.detail}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function StatusSummaryBar({ checks }: { checks: CheckResult[] }) {
  const pass = checks.filter((c) => c.status === 'PASS').length;
  const warn = checks.filter((c) => c.status === 'WARN').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;
  const manual = checks.filter((c) => c.status === 'MANUAL').length;
  const total = checks.length;

  if (total === 0) return null;

  return (
    <div className="report-status-bar" role="status" aria-label={`${total} checks: ${pass} passed, ${warn} warnings, ${fail} failed`}>
      <span className="report-status-bar-total">{total} checks</span>
      <div className="report-status-bar-pills">
        {pass > 0 && <span className="report-status-pill report-status-pill--pass">{pass} pass</span>}
        {warn > 0 && <span className="report-status-pill report-status-pill--warn">{warn} warn</span>}
        {fail > 0 && <span className="report-status-pill report-status-pill--fail">{fail} fail</span>}
        {manual > 0 && <span className="report-status-pill report-status-pill--manual">{manual} manual</span>}
        {skip > 0 && <span className="report-status-pill report-status-pill--skip">{skip} N/A</span>}
      </div>
    </div>
  );
}