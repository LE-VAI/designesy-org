'use client';

import { useState } from 'react';
import { EngineBar, Well } from '../../lib/engine/command-bar';

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

  async function submit() {
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
      <EngineBar
        fields={[{ value: url, onChange: setUrl, label: 'URL to submit to the leaderboard', placeholder: 'Any public URL, like stripe.com' }]}
        onSubmit={() => void submit()}
        busy={loading}
        go="Submit and score"
        goBusy="Scoring"
        choices={
          <details className="eg-more">
            <summary>
              Add a name and a category <small>Optional</small>
            </summary>
            <div className="eg-more-body">
              <Well tag="Name" value={name} onChange={setName} placeholder="Site name" readOnly={loading} />
              <Well tag="Category" value={category} onChange={setCategory} placeholder="SaaS, design system, editorial" readOnly={loading} />
            </div>
          </details>
        }
        note="Scored on submit. Reviewed for the seed list at the next weekly run."
      />

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