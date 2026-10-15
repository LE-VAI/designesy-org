// The first finding: the first failing fidelity check, or
// the first that needs work, with what the contract declared beside what the
// page shipped. A contrast pair (f09, f10) draws both pairs as specimens in
// the customer's own colours; every other check (f02, f03, f08 and the rest)
// shows the row's one-line result and the declared and shipped evidence as a
// list. "Go to this check" opens the row in its list.

import type { CSSProperties } from 'react';
import { Lamp } from '../../lib/engine/instrument';
import { pairFinding, rowDetail, type Coverage, type Evidence, type ResultCheck, type Thresholds } from './copy';

const EVIDENCE_SHOWN = 6;

function evidenceWords(e: Evidence): string {
  const where = e.where?.length ? ` in ${e.where.slice(0, 3).join(', ')}` : '';
  const uses = typeof e.uses === 'number' ? `, ${e.uses} ${e.uses === 1 ? 'use' : 'uses'}` : '';
  return `${e.value}${where}${uses}`;
}

export function FirstFinding({
  check,
  title,
  coverage,
  thresholds,
  idp,
  onGo,
}: {
  check: ResultCheck;
  title: string;
  coverage: Coverage | null;
  thresholds: Thresholds;
  /** Id prefix ("" live, "prev-" for a kept previous run). */
  idp: string;
  onGo: (id: string) => void;
}) {
  const pair = check.id === 'f09' || check.id === 'f10' ? pairFinding(check, thresholds) : null;
  const headId = `${idp}cf-first-h`;
  const declared = check.declared ?? [];
  const shipped = check.shipped ?? [];
  return (
    <div className="cf-start" role="group" aria-labelledby={headId}>
      <div className="cf-start-head">
        <h3 className="eg-label" id={headId}>
          First finding
        </h3>
        <p className="cf-start-title">
          <Lamp status={check.status as 'FAIL' | 'WARN'} />
          <span>
            <span className="cf-mono">{check.id}</span> {title}
          </span>
        </p>
        <p className="cf-start-detail">
          {pair ? (
            <>
              {pair.parts[0]}
              <code>{pair.parts[1]}</code>
              {pair.parts[2]}
            </>
          ) : (
            rowDetail(check, coverage, thresholds)
          )}
        </p>
      </div>
      {pair ? (
        <div className="cf-specs">
          <div className="cf-spec">
            <p className="cf-spec-label">Declared</p>
            <p className="cf-spec-where">{pair.declared.where}</p>
            <span className="cf-swatch" style={{ '--spec-bg': pair.declared.background, '--spec-fg': pair.declared.text } as CSSProperties} aria-hidden="true">
              Aa
            </span>
            <p className="cf-spec-values">
              {pair.declared.text} on {pair.declared.background}
            </p>
            <p className="cf-ratio">
              {pair.declared.ratio}
              <small>to 1</small>
            </p>
          </div>
          <div className="cf-spec">
            <p className="cf-spec-label">Shipped</p>
            <p className="cf-spec-where">{pair.shipped.where}</p>
            <span className="cf-swatch" style={{ '--spec-bg': pair.shipped.background, '--spec-fg': pair.shipped.text } as CSSProperties} aria-hidden="true">
              Aa
            </span>
            <p className="cf-spec-values">
              {pair.shipped.text} on {pair.shipped.background}
            </p>
            <p className="cf-ratio">
              {pair.shipped.ratio}
              <small>to 1</small>
            </p>
          </div>
        </div>
      ) : declared.length || shipped.length ? (
        <dl className="cf-evidence">
          {declared.length > 0 && (
            <div>
              <dt>Declared</dt>
              <dd>
                {declared.slice(0, EVIDENCE_SHOWN).map((e) => (e.path ? `${e.path} ${e.value}` : e.value)).join(', ')}
                {declared.length > EVIDENCE_SHOWN ? ` and ${declared.length - EVIDENCE_SHOWN} more` : ''}
              </dd>
            </div>
          )}
          {shipped.length > 0 && (
            <div>
              <dt>Shipped</dt>
              <dd>
                <ul>
                  {shipped.slice(0, EVIDENCE_SHOWN).map((e, i) => (
                    <li key={`${e.value}-${i}`}>
                      <code>{e.value}</code>
                      {evidenceWords(e).slice(e.value.length)}
                    </li>
                  ))}
                </ul>
                {shipped.length > EVIDENCE_SHOWN ? <span className="cf-evidence-more">{`and ${shipped.length - EVIDENCE_SHOWN} more in the check`}</span> : null}
              </dd>
            </div>
          )}
        </dl>
      ) : null}
      <div className="cf-start-foot">
        <button type="button" className="eg-share-btn" onClick={() => onGo(check.id)}>
          Go to this check
        </button>
        {check.remediation && <p>How to fix: {check.remediation}</p>}
      </div>
    </div>
  );
}
