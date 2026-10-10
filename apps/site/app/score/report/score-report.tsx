'use client';


import { useState, useEffect, useMemo } from 'react';
import { ENGINE_SCORED_CHECK_COUNT } from '../../lib/check-definitions';
import Link from 'next/link';
import { ShareButton } from '../../lib/share-button';
import { CONTRACT_VERSION } from '../../lib/design-system-contract';
import {
  isEmptyRun,
  emptyRunReason,
  resultAnnouncement,
  categoryLabel,
  fmtScore,
  fmtCategory,
  scopeLabel,
  statusCount,
  verdictLine,
  STATUS_LABEL,
} from '../verdict';
import { ResultReadout, ResultScale, CategoryList } from '../result-parts';
import { ScoreEmptyRun } from '../score-empty-run';
type CheckResult = {
  id: string;
  item: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'MANUAL';
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
  manual?: number;
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
  /** null when the target could not be read: there is no score to report. */
  score?: number | null;
  grade?: string | null;
  unreachable?: boolean;
  unreachableDetail?: string;
  pass?: number;
  fail?: number;
  warn?: number;
  skip?: number;
  manual?: number;
  total?: number;
  scope?: 'contract' | 'universal';
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

const STATUS_ORDER: Record<string, number> = { FAIL: 0, WARN: 1, MANUAL: 2, SKIP: 3, PASS: 4 };

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
  // Bumped by "Try again" on the failure and empty-run states, to run again.
  const [attempt, setAttempt] = useState(0);
  // What the polite region says. It starts empty and is written after the
  // page has painted (below), so the loading line arrives as a change.
  const [liveText, setLiveText] = useState('');
  const retry = () => setAttempt((a) => a + 1);

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
          body: JSON.stringify({ url: normalized, format: 'designesy', scope: 'auto' }),
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
  }, [initialUrl, attempt]);

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
        const catScore = result.categoryScores?.[key];
        const sortedChecks = [...checks].sort(
          (a, b) => (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)
        );
        return {
          key,
          label: categoryLabel(key),
          score: catScore?.score ?? null,
          weight: catScore?.weight ?? 0,
          pass: catScore?.pass ?? 0,
          fail: catScore?.fail ?? 0,
          warn: catScore?.warn ?? 0,
          skip: catScore?.skip ?? 0,
          manual: catScore?.manual ?? 0,
          checks: sortedChecks,
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [result?.checks, result?.categoryScores]);

  // One polite region carries the run from first paint to its end: the
  // loading line, then the failure. The loading region used to unmount with
  // the run, and a region mounted with its text already in it is not reliably
  // read, so the failure was never announced (WCAG 4.1.3). The run starts on
  // page load, not on a press, so it waits its turn rather than cutting into
  // the page being read. Its key keeps the one node across the two branches
  // below; the visible error block stays out of it, so the failure is read
  // once and without the block's link.
  // A run that read nothing is not a score: the same empty-run card the score
  // form shows, never a grade. The report used to default a missing score to 0
  // and a missing grade to F, so a site that refused the fetch read "F 0.0%".
  const emptyRun = status === 'ok' && !!result && (isEmptyRun(result) || result.score == null || !result.grade);
  // A screen reader announces a change to a live region, never the text it
  // was mounted with: the page starts loading, so the loading line was in the
  // region from the server render and was never read, and on success the
  // region unmounted, so a finished report was silent while focus stayed on
  // the page body. The region now renders empty, every message is written
  // into it once the page has painted, and it stays mounted on success too,
  // where it reads the result (focus is left alone, so nothing is said twice).
  const message =
    status === 'loading'
      ? `Evaluating ${ENGINE_SCORED_CHECK_COUNT} contract checks against ${initialUrl}…`
      : status === 'error'
        ? `Score failed. ${error ?? ''}`
        : emptyRun && result
          ? `Could not read this site. ${emptyRunReason(result, scoredUrl)}`
          : result
            ? resultAnnouncement(result)
            : '';
  useEffect(() => {
    const id = window.setTimeout(() => setLiveText(message), 150);
    return () => window.clearTimeout(id);
  }, [message]);
  const live = (
    <p key="live" className="sr-only" role="status" aria-live="polite">
      {liveText}
    </p>
  );

  if (status === 'loading') {
    return (
      <>
      {live}
      <div key="loading" className="report-loading">
        {/* Hero skeleton: grade circle + score number + meta lines */}
        <div className="report-skel-hero">
          <div className="report-skel-circle" aria-hidden="true" />
          <div className="report-skel-hero-meta">
            <div className="report-skel-line report-skel-line--lg" aria-hidden="true" />
            <div className="report-skel-line report-skel-line--md" aria-hidden="true" />
            <div className="report-skel-line report-skel-line--sm" aria-hidden="true" />
          </div>
        </div>
        {/* Category nav skeleton: row of chips */}
        <div className="report-skel-nav" aria-hidden="true">
          <div className="report-skel-chip" />
          <div className="report-skel-chip" />
          <div className="report-skel-chip" />
          <div className="report-skel-chip" />
          <div className="report-skel-chip" />
        </div>
        {/* Section skeleton: header bar + check rows */}
        <div className="report-skel-section" aria-hidden="true">
          <div className="report-skel-section-header" />
          <div className="report-skel-row" />
          <div className="report-skel-row" />
          <div className="report-skel-row" />
          <div className="report-skel-row" />
        </div>
        <div className="report-skel-section" aria-hidden="true">
          <div className="report-skel-section-header" />
          <div className="report-skel-row" />
          <div className="report-skel-row" />
          <div className="report-skel-row" />
        </div>
      </div>
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
      {live}
      <div key="error" className="report-error">
        <h2>Score failed</h2>
        <p>{error}</p>
        <div className="report-error-actions">
          <button type="button" className="score-action-btn" onClick={retry} data-cuelume-press="tick">
            Try again
          </button>
          <Link href="/score" className="score-action-btn">
            Score a site →
          </Link>
        </div>
      </div>
      </>
    );
  }

  if (!result) return null;

  if (emptyRun || result.score == null || !result.grade) {
    return (
      <>
      {live}
      <div key="empty" className="report-empty">
        <ScoreEmptyRun url={scoredUrl} reason={emptyRunReason(result, scoredUrl)} onRetry={retry} />
      </div>
      </>
    );
  }

  const score = result.score;
  const grade = result.grade;
  const total = result.total ?? 0;
  const scored = (result.pass ?? 0) + (result.warn ?? 0) + (result.fail ?? 0);

  return (
    <>
    {live}
    <div key="report" className="report">
      {/* ── RESULT (B′, owner-approved 2026-10-10): the readout and grade
          scale, the verdict, the meta line, and one category list. A row opens
          that category's checks below; selected again, every section shows. ── */}
      <section className="report-result rs" aria-label="Result">
        <div className="rs-layout">
          <div className="rs-side">
            <div className="rs-head">
              <ResultReadout grade={grade} score={score} />
              <ResultScale score={score} />
            </div>
            <p className="score-verdict-line">{verdictLine(result)}</p>
            <div className="score-site-url">
              <span className="score-url-dot" />
              <span className="score-url-text">{scoredUrl}</span>
              <span className="score-scope-badge">{scopeLabel(result.scope)}</span>
            </div>
            <p className="score-scored-line">
              {scored} of {total} checks scored · design system contract {CONTRACT_VERSION}
            </p>
            {result.a11yFloorApplied && (
              <p className="report-hero-floor">Accessibility floor applied: the score is capped at 70.0 /100.</p>
            )}
          </div>
          {result.categoryScores && (
            <CategoryList
              scores={result.categoryScores}
              selected={expandedCategory}
              onSelect={(k) => setExpandedCategory(expandedCategory === k ? null : k)}
            />
          )}
        </div>
      </section>

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
                  <span className="report-section-score">{fmtCategory(cat.score)}</span>
                )}
              </h2>
              <div className="report-section-meta">
                <span className="report-section-weight">
                  Weight {cat.weight}
                </span>
                <span className="report-section-counts">
                  {[
                    statusCount('PASS', cat.pass),
                    cat.warn ? statusCount('WARN', cat.warn) : '',
                    cat.fail ? statusCount('FAIL', cat.fail) : '',
                    cat.manual ? statusCount('MANUAL', cat.manual) : '',
                    cat.skip ? statusCount('SKIP', cat.skip) : '',
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>

            <div className="report-check-list">
              {cat.checks
                .filter((c) => c.status !== 'SKIP' && c.status !== 'MANUAL')
                .map((check) => (
                  <details
                    key={check.id}
                    className={`report-check report-check--${check.status.toLowerCase()}`}
                  >
                    <summary className="report-check-summary">
                      <span
                        className={`report-check-status report-check-status--${check.status.toLowerCase()}`}
                      >
                        {STATUS_LABEL[check.status] || check.status}
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

            {cat.checks.some((c) => c.status === 'MANUAL') && (
              <details className="report-skipped">
                <summary>
                  {statusCount('MANUAL', cat.checks.filter((c) => c.status === 'MANUAL').length)}
                </summary>
                <div className="report-check-list">
                  {cat.checks
                    .filter((c) => c.status === 'MANUAL')
                    .map((check) => (
                      <div
                        key={check.id}
                        className="report-check report-check--manual"
                      >
                        <span className="report-check-status report-check-status--manual">
                          {STATUS_LABEL.MANUAL}
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
            {cat.checks.some((c) => c.status === 'SKIP') && (
              <details className="report-skipped">
                <summary>
                  {statusCount('SKIP', cat.checks.filter((c) => c.status === 'SKIP').length)}
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
                          {STATUS_LABEL.SKIP}
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
            className="score-action-btn"
          >
            Score another site →
          </Link>
          <ShareButton
            url={`/score/report?url=${encodeURIComponent(scoredUrl)}`}
            text={result?.grade
              ? `Designesy contract score: Grade ${grade}, ${fmtScore(score)} /100 for ${scoredUrl}`
              : `Designesy design verification report for ${scoredUrl}`}
            label="Share this report"
            compact
          />
          <Link
            href="/methodology"
            className="score-action-btn"
            style={{ fontSize: '0.82rem', color: 'var(--muted-dim)' }}
          >
            How we score ↗
          </Link>
        </div>
        <p className="report-version">
          Report generated against design system contract {CONTRACT_VERSION} · {scored} of {total} checks scored
        </p>
        <p className="report-caveat" style={{ fontSize: '0.78rem', color: 'var(--muted-dim)', lineHeight: 1.5, marginTop: '0.5rem', maxWidth: '64ch' }}>
          A high score means the site ships the contract primitives the engine
          can detect: token architecture, motion hygiene, accessibility,
          typography discipline. It does{' '}
          <strong style={{ color: 'var(--muted)' }}>not</strong> mean the
          design is good. Conformance &ne; quality. A site can pass every check and
          still be mediocre, or fail many and still be excellent. The score is a{' '}
          <em>calibration point</em> for your own judgment. See the{' '}
          <a href="/methodology#what-engine-measures" style={{ color: 'var(--signal-text)' }}>methodology</a>{' '}
          for what the engine can and cannot measure.
        </p>
      </div>
    </div>
    </>
  );
}
