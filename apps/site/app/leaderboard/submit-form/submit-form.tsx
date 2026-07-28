'use client';

import { useState } from 'react';

type SubmitResult = {
  ok: boolean;
  message?: string;
  error?: string;
  submitted?: { url: string; name: string; category: string };
  score?: {
    score: number;
    grade: string;
    pass: number;
    fail: number;
    warn: number;
    skip: number;
    tokens: number;
  };
};

export function SubmitForm() {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), name: name.trim(), category: category.trim() }),
      });
      const data: SubmitResult = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lb-submit">
      <form onSubmit={handleSubmit} className="lb-submit-form">
        <label className="lb-field">
          <span className="lb-field-label">URL</span>
          <input
            type="url"
            name="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
            disabled={loading}
            className="lb-input"
          />
        </label>
        <label className="lb-field">
          <span className="lb-field-label">Name (optional)</span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Site name"
            disabled={loading}
            className="lb-input"
          />
        </label>
        <label className="lb-field">
          <span className="lb-field-label">Category (optional)</span>
          <input
            type="text"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="SaaS, Design System, Editorial…"
            disabled={loading}
            className="lb-input"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="button primary lb-submit-btn"
          data-cuelume-press
        >
          {loading ? 'Scoring…' : 'Submit & score'}
        </button>
      </form>

      {result && (
        <div className={`lb-submit-result ${result.ok ? 'lb-result-ok' : 'lb-result-err'}`}>
          {result.ok && result.score ? (
            <>
              <p className="lb-result-head">
                <strong>{result.score.grade}</strong> · {result.score.score}%
              </p>
              <p className="lb-result-detail">
                {result.score.pass} pass · {result.score.fail} fail · {result.score.warn} warn · {result.score.skip} skip · {result.score.tokens} tokens
              </p>
              <p className="lb-result-msg">{result.message}</p>
            </>
          ) : (
            <p className="lb-result-err-msg">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}