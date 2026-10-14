'use client';

// The rejected contract (422, WIREFRAMES W3): an error summary. Its heading
// takes focus when it arrives; every problem the engine returned is listed in
// the order its field sits in the file, each in the engine's own approved
// sentence (own-contract problems.ts, owner decision O6) with the line it sits
// on. A prose DESIGN.md also gets its first table rows written as front
// matter, from the text the visitor pasted or uploaded.

import { useEffect, useRef, type Ref } from 'react';
import { Lamp } from '../../lib/engine/instrument';
import {
  inFieldOrder,
  isMinimumCode,
  lintLine,
  minimumRows,
  problemWhere,
  problemsIntro,
  problemsSub,
  proseDetail,
  proseRewrite,
  type ContractProblem,
} from './copy';

export function ContractProblems({
  ref,
  problems,
  warnings,
  text,
  linterVersion,
  onEdit,
}: {
  ref?: Ref<HTMLHeadingElement>;
  problems: ContractProblem[];
  warnings: ContractProblem[];
  /** The contract's text, when the visitor pasted or uploaded it (never for a link). */
  text: string;
  linterVersion: string;
  onEdit: () => void;
}) {
  const ordered = inFieldOrder(problems);
  const minimum = ordered.some((p) => isMinimumCode(p.code));
  const prose = ordered.find((p) => p.code === 'TOKENS_IN_PROSE');
  const rewrite = prose && text ? proseRewrite(text, prose) : null;
  const lint = lintLine(problems, warnings, linterVersion);

  // The rewrite keeps its lines and scrolls sideways in its own well; it is a
  // Tab stop only while it scrolls, so a stop that scrolls nothing is not added.
  const codeRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    const sync = () => {
      if (el.scrollWidth > el.clientWidth + 1) el.setAttribute('tabindex', '0');
      else el.removeAttribute('tabindex');
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rewrite]);

  return (
    <section className="cf-panel cf-problems" aria-labelledby="cf-problems-h">
      <div className="cf-problems-head">
        <h2 className="eg-h2" id="cf-problems-h" tabIndex={-1} ref={ref}>
          Your contract cannot be scored yet
        </h2>
        <p>{problemsIntro(ordered)}</p>
      </div>
      <div className="cf-split">
        <div>
          <p className="cf-sub">{problemsSub(ordered.length)}</p>
          <ol className="cf-problem-list">
            {ordered.map((p, i) => {
              const where = problemWhere(p);
              const detail = proseDetail(p);
              return (
                <li key={`${p.code}-${i}`}>
                  <div>
                    <p>{p.message}</p>
                    {detail && <p>{detail}</p>}
                    {where && (
                      <p className="cf-problem-where">
                        {p.path ? <code>{p.path}</code> : null}
                        {p.path ? ' · ' : ''}
                        {where}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {minimum && (
            <>
              <p className="cf-sub cf-sub-gap">What scoring needs</p>
              <ul className="cf-minimum">
                {minimumRows(ordered).map((r) => (
                  <li key={r.text}>
                    <Lamp status={r.ok === null ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'} />
                    <span>{r.text}</span>
                    <span>{r.found}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {rewrite && (
          <div>
            <p className="cf-sub" id="cf-rewrite-h">
              The same tokens, as front matter
            </p>
            <pre className="cf-code" role="region" aria-labelledby="cf-rewrite-h" ref={codeRef}>
              {rewrite}
            </pre>
            <p className="cf-rewrite-note">The first rows of your tables, written the way scoring reads them. Your table&apos;s Token column becomes the name.</p>
          </div>
        )}
      </div>
      <div className="cf-actions">
        <button type="button" className="eg-share-btn" onClick={onEdit}>
          Edit contract
        </button>
      </div>
      {warnings.length > 0 && (
        <div className="cf-quiet">
          <p className="cf-sub">Warnings (will not stop scoring)</p>
          <ul className="cf-warnings">
            {inFieldOrder(warnings).map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      {lint && (
        <div className="cf-quiet">
          <p>
            Linted with <code>@google/design.md</code> {lint.version}: {lint.errors} {lint.errors === 1 ? 'error' : 'errors'}, {lint.warnings} {lint.warnings === 1 ? 'warning' : 'warnings'}.
          </p>
        </div>
      )}
    </section>
  );
}
