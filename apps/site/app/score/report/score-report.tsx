'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
  remediation?: string;
};

type CategoryScore = {
  score: number | null;
  weight: number;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
};

type SlopFinding = {
  id: string;
  label: string;
  severity: number;
  instances: number;
  evidence: string[];
  deduction: number;
};

type SlopResult = {
  total: number;
  findings: SlopFinding[];
  convergences: string | null;
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
  a11yFloorApplied?: boolean;
  hardFailCeilingApplied?: boolean;
  hardFailCeilingReason?: string | null;
  categoryScores?: Record<string, CategoryScore>;
  checks?: CheckResult[];
  tokensExtracted?: number;
  slop?: SlopResult;
  error?: string;
};

type Status = 'loading' | 'ok' | 'error';

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
  { key: 'semantic', label: 'Semantic' },
  { key: 'copywriting', label: 'Copywriting' },
  { key: 'security', label: 'Security' },
  { key: 'spec', label: 'Spec' },
];

const STATUS_ORDER: Record<string, number> = { FAIL: 0, WARN: 1, SKIP: 2, PASS: 3 };

const GRADE_COLOR: Record<string, string> = {
  A: 'var(--ok)',
  B: 'var(--signal-light)',
  C: 'var(--warn)',
  D: '#fb923c',
  F: 'var(--error)',
};

function gradeColor(grade: string | undefined): string {
  return GRADE_COLOR[grade || 'F'] || GRADE_COLOR.F;
}

function normalizeInput(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}

export function ScoreReport({ initialUrl = '' }: { initialUrl?: string } = {}) {
  const [status, setStatus] = useState<Status>('loading');
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoredUrl, setScoredUrl] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!initialUrl) {
      setError('No URL provided. Add ?url= to the address.');
      setStatus('error');
      return;
    }

    const normalized = normalizeInput(initialUrl);

    async function runScore() {
      setStatus('loading');
      setError(null);
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalized, format: 'designesy' }),
        });

        const data: ScoreResponse = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        if (!data.ok) {
          throw new Error(data.error || 'Score failed');
        }

        setResult(data);
        setScoredUrl(normalized);
        setStatus('ok');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('error');
      }
    }

    runScore();
  }, [initialUrl]);

  // Group checks by category
  const checksByCategory = useMemo(() => {
    if (!result?.checks) return [];
    const map = new Map<string, CheckResult[]>();
    for (const check of result.checks) {
      const cat = check.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(check);
    }
    // Sort categories by weight (heaviest first)
    return Array.from(map.entries())
      .map(([key, checks]) => {
        const cat = CATEGORIES.find((c) => c.key === key);
        const catScore = result.categoryScores?.[key];
        const sortedChecks = [...checks].sort(
          (a, b) => (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)
        );
        return {
          key,
          label: cat?.label || key.charAt(0).toUpperCase() + key.slice(1),
          score: catScore?.score ?? null,
          weight: catScore?.weight ?? 0,
          pass: catScore?.pass ?? 0,
          fail: catScore?.fail ?? 0,
          warn: catScore?.warn ?? 0,
          skip: catScore?.skip ?? 0,
          checks: sortedChecks,
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [result?.checks, result?.categoryScores]);

  // Not-measured categories (Adobe Stardust pattern: show as null, not averaged)
  const notMeasured = useMemo(() => {
    if (!result?.categoryScores) return [];
    return CATEGORIES.filter((c) => {
      const cs = result.categoryScores?.[c.key];
      return cs && cs.score === null && cs.skip > 0;
    }).map((c) => c.label);
  }, [result?.categoryScores]);

  if (status === 'loading') {
    return (
      <div className="report-loading">
        <div className="report-loading-spinner" aria-hidden="true" />
        <p>Evaluating 40 contract checks against {initialUrl}…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="report-error">
        <h2>Score failed</h2>
        <p>{error}</p>
        <Link href="/score" className="score-action-btn">
          Score a site →
        </Link>
      </div>
    );
  }

  if (!result) return null;

  const score = result.score ?? 0;
  const grade = result.grade ?? 'F';
  const pass = result.pass ?? 0;
  const fail = result.fail ?? 0;
  const warn = result.warn ?? 0;
  const skip = result.skip ?? 0;
  const total = result.total ?? 0;
  const scored = pass + warn + fail;

  return (
    <div className="report">
      {/* ── HERO (Adobe Stardust: overall integer + letter + version label) ── */}
      <div className="report-hero">
        <div className="report-hero-score">
          <div className="report-hero-grade" style={{ color: gradeColor(grade) }}>
            {grade}
          </div>
          <div className="report-hero-number">
            <span className="report-hero-value">{score.toFixed(1)}</span>
            <span className="report-hero-pct">%</span>
          </div>
        </div>
        <div className="report-hero-meta">
          <p className="report-hero-url">{scoredUrl}</p>
          <p className="report-hero-contract">Design system contract v0.4.0 · {total} checks</p>
          <div className="report-hero-counts">
            <span className="report-count report-count--pass">{pass} pass</span>
            <span className="report-count report-count--fail">{fail} fail</span>
            <span className="report-count report-count--warn">{warn} warn</span>
            <span className="report-count report-count--skip">{skip} skip</span>
          </div>
          {result.a11yFloorApplied && (
            <p className="report-hero-floor">
              Accessibility floor applied — overall capped at 70.
            </p>
          )}
          <p className="report-hero-scored">
            {scored} of {total} checks scored · {skip} require a live browser (SKIP)
          </p>
        </div>
      </div>

      {/* ── CATEGORY NAVIGATION (sticky) ── */}
      {checksByCategory.length > 0 && (
        <nav className="report-cat-nav" aria-label="Report sections">
          {checksByCategory.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`report-cat-chip${expandedCategory === cat.key ? ' expanded' : ''}`}
              onClick={() =>
                setExpandedCategory(
                  expandedCategory === cat.key ? null : cat.key
                )
              }
            >
              <span className="report-cat-label">{cat.label}</span>
              <span className="report-cat-weight">w{cat.weight}</span>
              {cat.score !== null ? (
                <span
                  className="report-cat-score"
                  style={{
                    color:
                      cat.score >= 90
                        ? 'var(--ok)'
                        : cat.score >= 70
                          ? 'var(--warn)'
                          : 'var(--error)',
                  }}
                >
                  {cat.score}%
                </span>
              ) : (
                <span className="report-cat-score report-cat-score--null">—</span>
              )}
              <span className="report-cat-detail">
                {cat.pass}p/{cat.warn}w/{cat.fail}f/{cat.skip}s
              </span>
            </button>
          ))}
        </nav>
      )}

      {/* ── NOT MEASURED ── */}
      {notMeasured.length > 0 && (
        <div className="report-not-measured">
          <p>
            <strong>Not measured:</strong> {notMeasured.join(', ')} — these
            categories require a live browser and were excluded from scoring.
            A missing dimension is visible, not silently averaged.
          </p>
        </div>
      )}

      {/* ── HARD-FAIL CEILING ── */}
      {result.hardFailCeilingApplied && (
        <div className="report-hard-fail">
          <p>
            <strong>Hard-fail ceiling applied:</strong> {result.hardFailCeilingReason || 'A critical check failed, capping the overall score.'}
          </p>
        </div>
      )}

      {/* ── SLOP FINDINGS ── */}
      {result.slop && result.slop.total > 0 && (
        <div className="report-slop">
          <h2 className="report-slop-title">
            Anti-slop deduction: −{result.slop.total} point{result.slop.total !== 1 ? 's' : ''}
          </h2>
          {result.slop.convergences && (
            <p className="report-slop-convergence">{result.slop.convergences}</p>
          )}
          <div className="report-slop-findings">
            {result.slop.findings.map((finding) => (
              <div key={finding.id} className="report-slop-finding">
                <div className="report-slop-finding-header">
                  <span className="report-slop-finding-id">{finding.id}</span>
                  <span className="report-slop-finding-label">{finding.label}</span>
                  <span className="report-slop-finding-deduction">
                    −{finding.deduction} pt{finding.deduction !== 1 ? 's' : ''}
                  </span>
                </div>
                {finding.evidence.length > 0 && (
                  <p className="report-slop-finding-evidence">
                    {finding.evidence.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PER-CATEGORY SECTIONS ── */}
      {checksByCategory.map((cat) => {
        const isExpanded = expandedCategory === cat.key || expandedCategory === null;
        return (
          <section
            key={cat.key}
            id={`report-${cat.key}`}
            className={`report-section${isExpanded ? ' expanded' : ''}`}
          >
            <div className="report-section-header">
              <h2 className="report-section-title">
                {cat.label}
                {cat.score !== null && (
                  <span className="report-section-score">{cat.score}%</span>
                )}
              </h2>
              <div className="report-section-meta">
                <span className="report-section-weight">
                  Weight {cat.weight}
                </span>
                <span className="report-section-counts">
                  {cat.pass} pass · {cat.warn} warn · {cat.fail} fail · {cat.skip} skip
                </span>
              </div>
            </div>

            <div className="report-check-list">
              {cat.checks
                .filter((c) => c.status !== 'SKIP')
                .map((check) => (
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
                    {check.remediation && (
                      <div className="report-check-remediation">
                        <strong>Fix:</strong> {check.remediation}
                      </div>
                    )}
                  </details>
                ))}
            </div>

            {cat.checks.some((c) => c.status === 'SKIP') && (
              <details className="report-skipped">
                <summary>
                  {cat.checks.filter((c) => c.status === 'SKIP').length} check
                  {cat.checks.filter((c) => c.status === 'SKIP').length !== 1
                    ? 's'
                    : ''}{' '}
                  skipped (require live browser)
                </summary>
                <div className="report-check-list">
                  {cat.checks
                    .filter((c) => c.status === 'SKIP')
                    .map((check) => (
                      <div
                        key={check.id}
                        className="report-check report-check--skip"
                      >
                        <span className="report-check-status report-check-status--skip">
                          SKIP
                        </span>
                        <span className="report-check-id">{check.id}</span>
                        <span className="report-check-item">{check.item}</span>
                        <span className="report-check-detail">
                          {check.detail}
                        </span>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </section>
        );
      })}

      {/* ── FOOTER ACTIONS ── */}
      <div className="report-footer">
        <div className="report-actions">
          <Link
            href={`/score?url=${encodeURIComponent(scoredUrl)}`}
            className="score-action-btn"
          >
            Re-score ↻
          </Link>
          <Link
            href="/score"
            className="score-action-btn score-share-btn"
          >
            Score another site →
          </Link>
        </div>
        <p className="report-version">
          Report generated against design system contract v0.4.0 · 40 checks ·{' '}
          {total} checks evaluated
        </p>
      </div>
    </div>
  );
}
