'use client';

import { useState, useRef } from 'react';

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

const STATUS_LABELS: Record<string, string> = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
};

export function ScoreForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
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

  const checks = result?.checks || [];
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: checks.filter((c) => c.category === cat.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="score-form">
      <form ref={formRef} onSubmit={handleSubmit} className="score-input-row">
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
        />
        <button
          type="submit"
          disabled={status === 'loading' || !url.trim()}
          data-cuelume-press
          className="button primary score-submit"
        >
          {status === 'loading' ? 'Scoring…' : 'Score it'}
        </button>
      </form>

      {status === 'error' && result?.error && (
        <div className="definition score-error" role="alert">
          <p className="definition-label">Error</p>
          <p>{result.error}</p>
        </div>
      )}

      {status === 'ok' && result && result.ok && (
        <div className="score-results fade-up">
          {/* Score header */}
          <div className="score-header">
            <div className={`score-grade is-${result.grade?.toLowerCase()}`}>
              {result.grade}
            </div>
            <div className="score-meta">
              <div className="score-percent">{result.score}%</div>
              <div className="score-counts">
                <span className="score-count pass">{result.pass} pass</span>
                <span className="score-count fail">{result.fail} fail</span>
                <span className="score-count warn">{result.warn} warn</span>
                <span className="score-count skip">{result.skip} skip</span>
              </div>
            </div>
          </div>

          <p className="score-url-display">{scoredUrl}</p>

          {/* Check breakdown by category */}
          <div className="score-breakdown">
            {grouped.map((group) => (
              <div key={group.key} className="score-category">
                <h3 className="score-category-heading">{group.label}</h3>
                <div className="score-check-list">
                  {group.items.map((check) => (
                    <div key={check.id} className={`score-check is-${check.status.toLowerCase()}`}>
                      <span className={`score-check-badge is-${check.status.toLowerCase()}`}>
                        {STATUS_LABELS[check.status]}
                      </span>
                      <span className="score-check-id">{check.id}</span>
                      <span className="score-check-item">{check.item}</span>
                      <span className="score-check-detail">{check.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="score-note">
            {result.total} checks against the Designesy design system contract v0.3.0.
            Live browser checks (viewport overflow, Core Web Vitals) require the{' '}
            <a href="/open" className="text-link">MCP verification engine</a>.
          </p>
        </div>
      )}

      {status === 'idle' && (
        <p className="score-hint">
          Enter any public URL. We fetch its CSS, extract design tokens, and run 26 verification
          checks against the Designesy contract. No login. No tracking. Real-time.
        </p>
      )}
    </div>
  );
}