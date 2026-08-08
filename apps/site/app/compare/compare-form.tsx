'use client';

import { useState, useRef } from 'react';
import { ShareButton } from '../lib/share-button';
import { ScoreDial } from '../lib/score-dial';

type Status = 'idle' | 'loading' | 'ok' | 'error';

type CheckResult = {
  id: string;
  item: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
};

type TokenDiffEntry = {
  token: string;
  valueA?: string;
  valueB?: string;
};

type RenameCandidate = {
  from: string;
  to: string;
  distance: number;
  valueA: string;
  valueB: string;
};

type ContrastDriftEntry = {
  token: string;
  valueA: string;
  valueB: string;
  contrastA: number;
  contrastB: number;
  drift: number;
};

type CompareResponse = {
  ok: boolean;
  urlA?: string;
  urlB?: string;
  score?: number;
  grade?: string;
  pass?: number;
  warn?: number;
  fail?: number;
  total?: number;
  tokensA?: number;
  tokensB?: number;
  added?: TokenDiffEntry[];
  removed?: TokenDiffEntry[];
  renamed?: RenameCandidate[];
  valueChanged?: TokenDiffEntry[];
  scaleDiff?: {
    spacing: { a: number; b: number; delta: number };
    radius: { a: number; b: number; delta: number };
    colors: { a: number; b: number; delta: number };
  };
  structureDelta?: {
    countA: number;
    countB: number;
    countDelta: number;
    categoriesA: Record<string, number>;
    categoriesB: Record<string, number>;
  };
  contrastDrift?: ContrastDriftEntry[];
  scoreDelta?: {
    scoreA: number;
    scoreB: number;
    delta: number;
    gradeA: string;
    gradeB: string;
  } | null;
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

export function CompareForm({ initialA, initialB }: { initialA: string; initialB: string }) {
  const [urlA, setUrlA] = useState(initialA);
  const [urlB, setUrlB] = useState(initialB);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'added' | 'removed' | 'renamed' | 'changed' | 'contrast'>('added');
  const inputARef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normA = normalizeInput(urlA);
    const normB = normalizeInput(urlB);
    if (!normA || !normB) return;
    setStatus('loading');
    setResult(null);

    try {
      const resp = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlA: normA, urlB: normB }),
      });
      const data: CompareResponse = await resp.json();
      if (!data.ok) {
        setStatus('error');
        setResult(data);
        return;
      }
      setStatus('ok');
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ ok: false, error: 'Network error — could not reach the compare engine.' });
    }
  }

  function shareUrl(a: string, b: string): string {
    return `/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
  }

  const tabs: { key: typeof activeTab; label: string; count: number }[] = [
    { key: 'added', label: 'Added', count: result?.added?.length || 0 },
    { key: 'removed', label: 'Removed', count: result?.removed?.length || 0 },
    { key: 'renamed', label: 'Renamed', count: result?.renamed?.length || 0 },
    { key: 'changed', label: 'Value changed', count: result?.valueChanged?.length || 0 },
    { key: 'contrast', label: 'Contrast drift', count: result?.contrastDrift?.length || 0 },
  ];

  return (
    <div className="compare-form">
      <form onSubmit={handleSubmit} className="score-input-card">
        <div className="score-input-col">
          <div className="score-input-flex-box">
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <text x="2" y="16" fontSize="11" fill="currentColor" stroke="none" fontWeight="700">A</text>
              </svg>
            </span>
            <input
              ref={inputARef}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              placeholder="First URL (your design system)..."
              className="score-url-input-inner"
              aria-label="First URL to compare"
              disabled={status === 'loading'}
            />
          </div>
          <div className="score-input-flex-box" style={{ marginTop: '0.5rem' }}>
            <span className="score-input-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <text x="2" y="16" fontSize="11" fill="currentColor" stroke="none" fontWeight="700">B</text>
              </svg>
            </span>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              placeholder="Second URL (reference or competitor)..."
              className="score-url-input-inner"
              aria-label="Second URL to compare"
              disabled={status === 'loading'}
            />
          </div>
          <button
            type="submit"
            className="button primary score-submit"
            disabled={status === 'loading' || !urlA.trim() || !urlB.trim()}
            data-cuelume-press="sparkle"
            data-firework="true"
          >
            {status === 'loading' ? (
              <span className="score-loading-state">
                <span className="score-spinner" />
                Diffing token systems…
              </span>
            ) : (
              'Compare them'
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
            <ScoreDial score={result.score || 0} grade={result.grade || 'F'} />
            <div className="score-summary">
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Diff completeness score
              </p>
              <p style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem' }}>
                {result.grade} · {result.score}/100
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                {result.pass} pass · {result.warn} warn · {result.fail} fail of {result.total} checks
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '0.5rem 0 0' }}>
                Tokens: {result.tokensA} (A) vs {result.tokensB} (B)
              </p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <ShareButton
                url={shareUrl(result.urlA || '', result.urlB || '')}
                text={`Designesy compare — ${result.urlA || ''} vs ${result.urlB || ''}`}
                label="Share this comparison"
                compact
              />
            </div>
          </div>

          {/* Score delta */}
          {result.scoreDelta && (
            <div style={{
              background: 'var(--surface-soft)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
            }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Score delta
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                A: <strong style={{ color: 'var(--ink)' }}>{result.scoreDelta.gradeA}/{result.scoreDelta.scoreA}</strong>
                {' · '}
                B: <strong style={{ color: 'var(--ink)' }}>{result.scoreDelta.gradeB}/{result.scoreDelta.scoreB}</strong>
                {' · '}
                Δ: <strong style={{ color: result.scoreDelta.delta > 0 ? 'var(--ok)' : result.scoreDelta.delta < 0 ? 'var(--error)' : 'var(--muted)' }}>
                  {result.scoreDelta.delta > 0 ? '+' : ''}{result.scoreDelta.delta}
                </strong>
              </p>
            </div>
          )}

          {/* Scale diff summary */}
          {result.scaleDiff && (
            <div style={{
              background: 'var(--surface-soft)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
            }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Scale diff
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                Spacing {result.scaleDiff.spacing.a}→{result.scaleDiff.spacing.b}
                {' · '}
                Radius {result.scaleDiff.radius.a}→{result.scaleDiff.radius.b}
                {' · '}
                Colors {result.scaleDiff.colors.a}→{result.scaleDiff.colors.b}
              </p>
            </div>
          )}

          {/* Tab bar */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem',
            borderBottom: '1px solid var(--line)',
            paddingBottom: '0.5rem',
            flexWrap: 'wrap',
          }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  fontSize: '0.8rem',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  color: activeTab === tab.key ? 'var(--ink)' : 'var(--muted)',
                  background: activeTab === tab.key ? 'var(--surface-hover)' : 'transparent',
                  border: '1px solid',
                  borderColor: activeTab === tab.key ? 'var(--line-strong)' : 'var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.4rem 0.8rem',
                  cursor: 'pointer',
                  transition: 'background-color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1)), color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1)), border-color 150ms var(--ease, cubic-bezier(0.22,0.61,0.36,1))',
                }}
                aria-pressed={activeTab === tab.key}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'added' && (
            <DiffList entries={result.added || []} side="A" emptyText="No tokens unique to A — both sites share the same token set." />
          )}
          {activeTab === 'removed' && (
            <DiffList entries={result.removed || []} side="B" emptyText="No tokens unique to B — both sites share the same token set." />
          )}
          {activeTab === 'renamed' && (
            <RenameList entries={result.renamed || []} />
          )}
          {activeTab === 'changed' && (
            <ChangedList entries={result.valueChanged || []} />
          )}
          {activeTab === 'contrast' && (
            <ContrastList entries={result.contrastDrift || []} />
          )}

          {/* Checks */}
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-dim)', margin: '2rem 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Emission checks
          </p>
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
        </div>
      )}
    </div>
  );
}


function DiffList({ entries, side, emptyText }: { entries: TokenDiffEntry[]; side: 'A' | 'B'; emptyText: string }) {
  if (entries.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '1rem 0' }}>{emptyText}</p>;
  }
  return (
    <div className="row-stack" role="list">
      {entries.map((entry, i) => (
        <div key={`${entry.token}-${i}`} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
          <span className="row-body">
            <span className="row-title">{entry.token}</span>
            <span className="row-meta">Value ({side}): {entry.valueA || entry.valueB || '—'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RenameList({ entries }: { entries: RenameCandidate[] }) {
  if (entries.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '1rem 0' }}>No rename candidates detected — no similar token names with different values.</p>;
  }
  return (
    <div className="row-stack" role="list">
      {entries.map((entry, i) => (
        <div key={`${entry.from}-${entry.to}-${i}`} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
          <span className="row-body">
            <span className="row-title">{entry.from} → {entry.to}</span>
            <span className="row-meta">Levenshtein distance: {entry.distance} · A: {entry.valueA} · B: {entry.valueB}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ChangedList({ entries }: { entries: TokenDiffEntry[] }) {
  if (entries.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '1rem 0' }}>No value changes — all shared tokens have identical values.</p>;
  }
  return (
    <div className="row-stack" role="list">
      {entries.map((entry, i) => (
        <div key={`${entry.token}-${i}`} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
          <span className="row-body">
            <span className="row-title">{entry.token}</span>
            <span className="row-meta">A: {entry.valueA || '—'} · B: {entry.valueB || '—'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ContrastList({ entries }: { entries: ContrastDriftEntry[] }) {
  if (entries.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '1rem 0' }}>No contrast drift — no shared color tokens with different values.</p>;
  }
  return (
    <div className="row-stack" role="list">
      {entries.map((entry, i) => (
        <div key={`${entry.token}-${i}`} className="row" role="listitem" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
          <span className="row-index">{String(i + 1).padStart(2, '0')}</span>
          <span className="row-body">
            <span className="row-title">{entry.token}</span>
            <span className="row-meta">
              A: {entry.valueA} ({entry.contrastA}:1) · B: {entry.valueB} ({entry.contrastB}:1) · Δ: <span style={{ color: entry.drift > 0 ? 'var(--ok)' : entry.drift < 0 ? 'var(--error)' : 'var(--muted)' }}>{entry.drift > 0 ? '+' : ''}{entry.drift}</span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}