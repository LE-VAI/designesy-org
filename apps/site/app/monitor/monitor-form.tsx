'use client';

import { useState, useRef, useEffect } from 'react';
import { ShareButton } from '../lib/share-button';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type DriftCheck = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

type MonitorCheck = {
  id: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

type Snapshot = {
  timestamp: string;
  score: number;
  grade: string;
  tokensExtracted: number;
  checks: DriftCheck[];
};

type MonitorResponse = {
  ok: boolean;
  url?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  currentSnapshot?: Snapshot;
  baseline?: Snapshot | null;
  previous?: Snapshot | null;
  driftChecks?: DriftCheck[];
  monitorChecks?: MonitorCheck[];
  alerts?: string[];
  emailAlert?: {
    attempted: boolean;
    delivered: boolean;
    recipient?: string;
    fromAddress?: string;
    error?: string;
  };
  error?: string;
};

const STORAGE_KEY = 'designesy:monitor-history';
const MAX_HISTORY = 50;

function normalizeInput(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}

function loadHistory(url: string): Snapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${url}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(url: string, snapshots: Snapshot[]) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = snapshots.slice(-MAX_HISTORY);
    localStorage.setItem(`${STORAGE_KEY}:${url}`, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function MonitorForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<MonitorResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [showDriftChecks, setShowDriftChecks] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history + saved email when url changes (client-only)
  useEffect(() => {
    if (scoredUrl) {
      setHistory(loadHistory(scoredUrl));
    }
    // Restore saved email
    if (typeof window !== 'undefined') {
      const savedEmail = localStorage.getItem('designesy:monitor-email');
      if (savedEmail) setEmail(savedEmail);
    }
  }, [scoredUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeInput(url);
    if (!normalized) return;
    setStatus('loading');
    setResult(null);
    setScoredUrl(normalized);

    // Save email for next run
    if (typeof window !== 'undefined' && email.trim()) {
      localStorage.setItem('designesy:monitor-email', email.trim());
    }

    const existingHistory = loadHistory(normalized);

    try {
      const resp = await fetch('/api/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: normalized,
          history: existingHistory,
          ...(email.trim() ? { email: email.trim() } : {}),
        }),
      });
      const data: MonitorResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        return;
      }
      // Save the new snapshot to history
      if (data.currentSnapshot) {
        const updated = [...existingHistory, data.currentSnapshot];
        saveHistory(normalized, updated);
        setHistory(updated);
      }
      setStatus('ok');
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the monitor engine.' });
    }
  }

  function clearHistory() {
    if (scoredUrl) {
      localStorage.removeItem(`${STORAGE_KEY}:${scoredUrl}`);
      setHistory([]);
    }
  }

  function shareUrl(u: string): string {
    return `/monitor?url=${encodeURIComponent(u)}`;
  }

  return (
    <div className="monitor-form">
      <form onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l3 9 4-18 3 9h4" />
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
              placeholder="Enter a URL to monitor for drift..."
              className="score-url-input-inner"
              aria-label="URL to monitor for drift"
              disabled={status === 'loading'}
            />
          </div>
          <div className="score-input-flex-box" style={{ marginTop: '0.5rem' }}>
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="M22 6l-10 7L2 6" />
              </svg>
            </span>
            <input
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email for drift alerts (optional)..."
              className="score-url-input-inner"
              aria-label="Email address to receive drift alerts"
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
                Monitoring drift…
              </span>
            ) : (
              'Monitor it'
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
          {/* Score header */}
          <div className="score-result-header" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <div className="score-dial-wrap">
              <ScoreDial score={result.score || 0} grade={result.grade || 'F'} />
            </div>
            <div className="score-summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Monitor score (governance health)
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
                text={`Designesy continuous monitoring — ${scoredUrl}`}
                label="Share this monitor result"
                compact
              />
            </div>
          </div>

          {/* Alerts */}
          {result.alerts && result.alerts.length > 0 && (
            <div style={{
              background: 'var(--surface-soft)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--radius)',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
            }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--error)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Alerts ({result.alerts.length})
              </p>
              {result.alerts.map((alert, i) => (
                <p key={i} style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.25rem 0' }}>
                  {alert}
                </p>
              ))}
              {result.emailAlert && (
                <p style={{ fontSize: '0.8rem', color: result.emailAlert.delivered ? 'var(--ok)' : result.emailAlert.fromAddress === 'suppressed (cooldown)' ? 'var(--text-dim)' : 'var(--warn)', margin: '0.75rem 0 0', paddingTop: '0.5rem', borderTop: '1px solid var(--line)' }}>
                  {result.emailAlert.delivered
                    ? `✉ Drift alert sent to ${result.emailAlert.recipient}${result.emailAlert.fromAddress ? ` (from ${result.emailAlert.fromAddress})` : ''}`
                    : result.emailAlert.fromAddress === 'suppressed (cooldown)'
                      ? '⏸ Alert active — email suppressed (1-hour cooldown, same alert set already delivered)'
                      : result.emailAlert.attempted
                        ? `⚠ Email delivery failed — ${result.emailAlert.error || 'unknown error'}`
                        : '💡 Add an email above to get drift alerts by mail'}
                </p>
              )}
            </div>
          )}

          {/* Trend sparkline */}
          {history.length > 1 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Score trend ({history.length} runs)
              </p>
              <TrendSparkline snapshots={history} />
            </div>
          )}

          {/* Monitor checks */}
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Monitor checks (governance)
          </p>
          <div className="row-stack" role="list" style={{ marginBottom: '1.5rem' }}>
            {result.monitorChecks?.map((check, i) => (
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
                        color: check.status === 'PASS' ? 'var(--ok)' : check.status === 'FAIL' ? 'var(--error)' : 'var(--warn)',
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

          {/* History table */}
          {history.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Snapshot history ({history.length})
                </p>
                <button
                  onClick={clearHistory}
                  className="button ghost"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                  data-cuelume-hover="tick"
                  data-cuelume-press="tick"
                >
                  Clear
                </button>
              </div>
              <div className="row-stack" role="list">
                {history.slice().reverse().map((snap, i) => {
                  const prevSnap = history.length - 1 - i < history.length - 1 ? history[history.length - 2 - i] : null;
                  const delta = prevSnap ? snap.score - prevSnap.score : 0;
                  return (
                    <div key={`${snap.timestamp}-${i}`} className="row" role="listitem" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem' }}>
                      <span className="row-index">{String(history.length - i).padStart(2, '0')}</span>
                      <span className="row-body" style={{ flex: 1 }}>
                        <span className="row-title">{formatTimestamp(snap.timestamp)}</span>
                        <span className="row-meta">Score {snap.score} · Grade {snap.grade} · {snap.tokensExtracted} tokens</span>
                      </span>
                      <span style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--error)' : 'var(--muted-dim)',
                        minWidth: '3rem',
                        textAlign: 'right',
                      }}>
                        {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Drift checks (collapsible) */}
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => setShowDriftChecks(!showDriftChecks)}
              className="button ghost"
              style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
              data-cuelume-hover="tick"
              data-cuelume-press="tick"
              aria-expanded={showDriftChecks}
            >
              {showDriftChecks ? 'Hide' : 'Show'} 12 drift checks (d01-d12)
            </button>
          </div>
          {showDriftChecks && (
            <div className="row-stack" role="list">
              {result.driftChecks?.map((check, i) => (
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
                          color: check.status === 'PASS' ? 'var(--ok)' : check.status === 'FAIL' ? 'var(--error)' : 'var(--warn)',
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

function TrendSparkline({ snapshots }: { snapshots: Snapshot[] }) {
  const width = 300;
  const height = 60;
  const padding = 8;
  const scores = snapshots.map((s) => s.score);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = max - min || 1;

  const points = scores.map((score, i) => {
    const x = padding + (i / Math.max(scores.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - ((score - min) / range) * (height - 2 * padding);
    return { x, y, score };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const lastScore = scores[scores.length - 1] || 0;
  const firstScore = scores[0] || 0;
  const slope = lastScore - firstScore;
  const lineColor = slope > 0 ? 'var(--ok)' : slope < -5 ? 'var(--error)' : 'var(--signal-light)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Score trend over ${snapshots.length} runs, from ${firstScore} to ${lastScore}`}
      style={{ maxWidth: '100%' }}
    >
      {/* Baseline grid */}
      <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--line-faint)" strokeWidth="1" strokeDasharray="2 4" />
      {/* Trend line */}
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={lineColor} />
      ))}
    </svg>
  );
}