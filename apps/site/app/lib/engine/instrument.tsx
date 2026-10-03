'use client';

// The instrument: an engine's registry drawn as cells, lit by a run.
//
// At rest it shows every check the engine holds (the page states what it does
// before anyone types). While a request is out, a cursor steps through the
// checks in registry order. When the answer lands, each check resolves in the
// same order, once, and the side column carries the verdict on the grade scale.
// Pointer or keyboard focus on a check shows that check's contract criterion
// and result in the side column; activating it opens the matching finding.

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DigitStrip } from '../digit-strip';
import { bringIntoView, userJustActed } from './bring-into-view';
import type { Outcomes, Phase, RegistryCheck, RegistryView, Status, VerdictData } from './types';
import { bandOf, display } from './types';

export type Face = 'tiles' | 'paths' | 'files' | 'engines' | 'diff';

export type EngineBlock = {
  key: string;
  name: string;
  count: number;
  ids: string[];
  score?: number | null;
  /** The question the engine asks, read under its register in the face. */
  asks?: ReactNode;
};

type Props = {
  name: string;
  registry: RegistryView;
  face: Face;
  phase: Phase;
  target?: string;
  outcomes?: Outcomes;
  verdict?: VerdictData | null;
  error?: ReactNode;
  /** One line under the legend: how a result is scored. */
  scoring: string;
  /** Side column copy before any run. */
  restNote: ReactNode;
  /** Side column reference before any run, drawn from the engine's contract. */
  restCard?: ReactNode;
  /** readiness: the origin shown at the root of the map. */
  origin?: string;
  /** guardrails: a size or line count per file, once emitted. */
  fileMeta?: Record<string, string>;
  /** guardrails: where each file goes, as the last line of its cell. */
  fileWhere?: Record<string, string>;
  /** tiles: what a group catches, under its cells (keyed by group id). */
  groupNotes?: Record<string, ReactNode>;
  /** score: the four engines as blocks of cells. */
  engines?: EngineBlock[];
  onOpen?: (id: string) => void;
  /** compare: the two sides' names and each dimension's value on each side. */
  sides?: { a: string; b: string };
  diffValues?: Record<string, { a?: ReactNode; b?: ReactNode }>;
  /** guardrails: the file shown in the viewer; its tile reads as pressed. */
  selected?: string;
  /** id of the element the cells control (the file viewer). */
  controls?: string;
  /** Replaces the default start-here line (report points at an engine). */
  startNode?: ReactNode;
  /** Drawn above the check groups (report's weighting bar). */
  faceTop?: ReactNode;
  /** Replaces the done-state side column (compare leads with the diff). */
  verdictNode?: ReactNode;
  /** Extra content under the verdict (monitor's history strip). */
  sideExtra?: ReactNode;
};

const STATUS_WORD: Record<Status, string> = {
  PASS: 'pass',
  WARN: 'warn',
  FAIL: 'fail',
  SKIP: 'skipped',
  MANUAL: 'by a person',
};

const ZONES = [
  { grade: 'F', from: 0, w: 60 },
  { grade: 'D', from: 60, w: 10 },
  { grade: 'C', from: 70, w: 10 },
  { grade: 'B', from: 80, w: 10 },
  { grade: 'A', from: 90, w: 10 },
];

export function Lamp({ status }: { status?: Status }) {
  return <i className="eg-lamp" data-status={status} aria-hidden="true" />;
}

export function GradeScale({ score, grade }: { score?: number; grade?: string }) {
  const here = typeof score === 'number' && grade ? ZONES.find((z) => score >= z.from && score < z.from + z.w + (z.grade === 'A' ? 1 : 0)) : null;
  return (
    <div className="eg-scale">
      <div className="eg-scale-track" aria-hidden="true">
        {ZONES.map((z) => (
          <span
            key={z.grade}
            className={`eg-scale-zone${here === z ? ' is-here' : ''}`}
            data-band={grade ? bandOf(grade) : undefined}
            style={{ '--w': z.w } as CSSProperties}
          />
        ))}
        {typeof score === 'number' && (
          <i className="eg-scale-marker" style={{ '--at': Math.max(0, Math.min(100, score)) } as CSSProperties} />
        )}
      </div>
      <div className="eg-scale-ticks" aria-hidden="true">
        {ZONES.map((z) => (
          <span key={z.grade} style={{ '--w': z.w } as CSSProperties}>
            {z.grade} {z.from > 0 ? z.from : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Live elapsed time while running (ticks every 100 ms) and the exact
    duration of the last run, measured from its start to the moment it ended. */
function useElapsed(phase: Phase): { live: number; took: number | null } {
  const [live, setLive] = useState(0);
  const [took, setTook] = useState<number | null>(null);
  const start = useRef(0);
  useEffect(() => {
    if (phase === 'running') {
      start.current = performance.now();
      setLive(0);
      setTook(null);
      const t = window.setInterval(() => setLive(performance.now() - start.current), 100);
      return () => window.clearInterval(t);
    }
    if ((phase === 'done' || phase === 'error') && start.current) setTook(performance.now() - start.current);
  }, [phase]);
  return { live, took };
}

export function Instrument(props: Props) {
  const { name, registry, face, phase, target, outcomes = {}, verdict, error, scoring, restNote, onOpen } = props;
  const [inspect, setInspect] = useState<string | null>(null);
  const leave = useRef<number | null>(null);
  const uid = useId();
  const { live: elapsed, took } = useElapsed(phase);

  const index = useMemo(() => new Map(registry.checks.map((c, i) => [c.id, i])), [registry.checks]);
  const byId = useMemo(() => new Map(registry.checks.map((c) => [c.id, c])), [registry.checks]);
  // The reading counter's rows, 1..n: the strip steps one row per check, on
  // the scan cursor's clock (engine.css, eg-read).
  const readRows = useMemo(() => registry.checks.map((_, i) => i + 1), [registry.checks]);

  const enter = (id: string) => {
    if (leave.current) window.clearTimeout(leave.current);
    setInspect(id);
  };
  const exit = () => {
    if (leave.current) window.clearTimeout(leave.current);
    leave.current = window.setTimeout(() => setInspect(null), 140);
  };
  useEffect(() => () => { if (leave.current) window.clearTimeout(leave.current); }, []);

  // A run the visitor just started plays out where they can see it: on a
  // phone the instrument sits under the bar, below the fold (bring-into-view).
  // An engine that answers at once (the M3 converter) goes idle to done.
  const root = useRef<HTMLElement | null>(null);
  const was = useRef(phase);
  useEffect(() => {
    const before = was.current;
    was.current = phase;
    const started = phase === 'running' || (phase === 'done' && before === 'idle');
    if (started && before !== 'running' && userJustActed()) bringIntoView(root.current);
  }, [phase]);

  const cellProps = (c: RegistryCheck) => {
    const o = outcomes[c.id];
    // A file cell shows the file's name first, so its name says it too.
    const named = face === 'files' && c.file ? `${c.file}, ${c.label}` : c.label;
    return {
      'data-status': phase === 'done' ? o?.status : undefined,
      'data-inspect': inspect === c.id ? 'true' : undefined,
      style: { '--i': index.get(c.id) ?? 0 } as CSSProperties,
      onMouseEnter: () => enter(c.id),
      onFocus: () => enter(c.id),
      onClick: () => onOpen?.(c.id),
      'aria-label': `${c.id} ${named}${phase === 'done' && o ? `, ${STATUS_WORD[o.status]}` : ''}`,
      'aria-describedby': props.fileWhere?.[c.id] ? `${uid}-where-${c.id}` : undefined,
      'aria-pressed': props.selected !== undefined && phase === 'done' ? props.selected === c.id : undefined,
      'aria-controls': props.controls,
      type: 'button' as const,
    };
  };

  const groupsWith = registry.groups
    .map((g) => ({ ...g, checks: registry.checks.filter((c) => c.group === g.id) }))
    .filter((g) => g.checks.length);

  let faceNode: ReactNode;
  if (face === 'paths') {
    // One row per location probed; checks that share a location share a row.
    const rows: { path: string; checks: RegistryCheck[] }[] = [];
    for (const c of registry.checks) {
      const p = c.path ?? c.id;
      const row = rows.find((r) => r.path === p);
      if (row) row.checks.push(c);
      else rows.push({ path: p, checks: [c] });
    }
    faceNode = (
      <div className="eg-group" style={{ '--n': 12 } as CSSProperties}>
        <div className="eg-group-head">
          <span className="eg-label">What an agent finds</span>
          <span className="eg-count">{rows.length} locations · {registry.checks.length} checks</span>
        </div>
        <ul className="eg-paths">
          <li className="eg-paths-origin" aria-hidden="true">
            <i className="eg-mark"><i /></i>
            <span>{props.origin || 'your origin'}</span>
          </li>
          {rows.map((r) => {
            const first = r.checks[0];
            const statuses = r.checks.map((c) => (phase === 'done' ? outcomes[c.id]?.status : undefined));
            const worst = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('WARN') ? 'WARN' : statuses.every((s) => s === 'PASS') ? 'PASS' : statuses[0];
            return (
              <li key={r.path}>
                <button
                  {...cellProps(first)}
                  className="eg-path-row"
                  data-status={phase === 'done' ? worst : undefined}
                  aria-label={`${r.path}: ${r.checks.map((c) => `${c.id} ${c.label}${phase === 'done' && outcomes[c.id] ? `, ${STATUS_WORD[outcomes[c.id].status]}` : ''}`).join('; ')}`}
                >
                  <span className="eg-path-branch" aria-hidden="true" />
                  <span className="eg-path-main">
                    <span className="eg-path-url">{r.path}</span>
                    <span className="eg-path-checks">{r.checks.map((c) => `${c.id} ${c.label}`).join(' · ')}</span>
                  </span>
                  <span className="eg-path-lamps" aria-hidden="true">
                    {r.checks.map((c, k) => (
                      <i
                        key={c.id}
                        className="eg-lamp"
                        data-status={statuses[k]}
                        style={{ '--i': index.get(c.id) ?? 0 } as CSSProperties}
                      />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  } else if (face === 'diff') {
    const sides = props.sides ?? { a: 'A', b: 'B' };
    faceNode = (
      <div className="eg-group" style={{ '--n': 12 } as CSSProperties}>
        <div className="eg-diff" role="presentation">
          <div className="eg-diff-head" aria-hidden="true">
            <span className="eg-diff-a"><b>A</b> {sides.a}</span>
            <span className="eg-diff-mid">{registry.checks.length} dimensions</span>
            <span className="eg-diff-b"><b>B</b> {sides.b}</span>
          </div>
          <ul className="eg-diff-rows">
            {registry.checks.map((c) => {
              const v = phase === 'done' ? props.diffValues?.[c.id] : undefined;
              return (
                <li key={c.id}>
                  <button {...cellProps(c)} className="eg-diff-row">
                    <span className="eg-diff-a">{v?.a}</span>
                    <span className="eg-diff-mid">
                      <Lamp />
                      <span className="eg-cell-id">{c.id}</span>
                      <span className="eg-diff-label">{c.label}</span>
                    </span>
                    <span className="eg-diff-b">{v?.b}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  } else if (face === 'engines') {
    faceNode = (
      <div className="eg-group" style={{ '--n': 12 } as CSSProperties}>
        <div className="eg-group-head">
          <span className="eg-label">Four engines</span>
          <span className="eg-count">{registry.checks.length} checks</span>
        </div>
        <div className="eg-engines">
          {(props.engines ?? []).map((e) => (
            <div className="eg-engine" key={e.key}>
              <span className="eg-engine-name">
                {e.name}
                <small>{e.count} checks</small>
              </span>
              <ul className="eg-minicells" aria-label={`${e.name}, ${e.count} checks`}>
                {e.ids.map((id) => {
                  const o = outcomes[id];
                  const c = byId.get(id);
                  return (
                    <li key={id}>
                      <button
                        className="eg-minicell"
                        type="button"
                        data-status={phase === 'done' ? o?.status : undefined}
                        style={{ '--i': index.get(id) ?? 0 } as CSSProperties}
                        onMouseEnter={() => enter(id)}
                        onFocus={() => enter(id)}
                        onClick={() => onOpen?.(id)}
                        aria-label={`${id} ${c?.label ?? ''}${phase === 'done' && o ? `, ${STATUS_WORD[o.status]}` : ''}`}
                      />
                    </li>
                  );
                })}
              </ul>
              <span className="eg-engine-score">{phase === 'done' && typeof e.score === 'number' ? e.score : ''}</span>
              {e.asks && <p className="eg-engine-ask">{e.asks}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    faceNode = (
      <>
        {props.faceTop}
        {groupsWith.map((g) => (
      <div className="eg-group" key={g.id} style={{ '--n': g.checks.length } as CSSProperties}>
        <div className="eg-group-head">
          <span className="eg-label">{g.label}</span>
          <span className="eg-count">{g.checks.length}</span>
        </div>
        {g.hint && <p className="eg-group-hint">{g.hint}</p>}
        <ul className={face === 'files' ? 'eg-files' : 'eg-cells'}>
          {g.checks.map((c) => (
            <li key={c.id}>
              <button {...cellProps(c)} className={`eg-cell${face === 'files' ? ' eg-file' : ''}`}>
                <span className="eg-cell-top">
                  <span className="eg-cell-id">{c.id}</span>
                  <Lamp />
                </span>
                {face === 'files' ? (
                  <>
                    <span className="eg-cell-label">{c.file}</span>
                    <span className="eg-file-meta">
                      {phase === 'done' && props.fileMeta?.[c.id] ? props.fileMeta[c.id] : c.label}
                    </span>
                    {props.fileWhere?.[c.id] && (
                      <span className="eg-file-where" id={`${uid}-where-${c.id}`}>
                        {props.fileWhere[c.id]}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="eg-cell-label">{c.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {props.groupNotes?.[g.id] && <p className="eg-group-note">{props.groupNotes[g.id]}</p>}
      </div>
        ))}
      </>
    );
  }

  // Where to begin: the first failing check in registry order, else the first
  // warning. The engine's own detail says why.
  const start =
    phase === 'done'
      ? registry.checks.find((c) => outcomes[c.id]?.status === 'FAIL') ??
        registry.checks.find((c) => outcomes[c.id]?.status === 'WARN')
      : undefined;

  const probe = inspect ? byId.get(inspect) : null;
  const probeOutcome = probe && phase === 'done' ? outcomes[probe.id] : undefined;
  const seconds = (n: number) => (n < 100 ? 'under 0.1 s' : `${(n / 1000).toFixed(1)} s`);

  const stateLabel =
    phase === 'running' ? 'checking' : phase === 'done' ? (took === null ? 'done' : `done in ${seconds(took)}`) : phase === 'error' ? 'stopped' : 'ready';

  // The verdict light's hue: the grade's band once a verdict lands, the fail
  // hue when the run stops without one. No band, no light.
  const lightBand = phase === 'done' && verdict ? bandOf(verdict.grade) : phase === 'error' ? 'fail' : undefined;

  // The probe (a check under the pointer or keyboard focus) is drawn OVER the
  // resting side, not instead of it; see the eg-side render below.
  const probeNode: ReactNode = probe ? (
      <div className="eg-probe">
        <span className="eg-probe-id">
          <Lamp status={probeOutcome?.status} />
          {probe.id}
          {probeOutcome ? ` · ${STATUS_WORD[probeOutcome.status]}` : ''}
        </span>
        <p className="eg-probe-title">{probe.label}</p>
        <dl>
          <dt>Checks</dt>
          <dd>{probe.item}</dd>
          <dt>Passes when</dt>
          <dd>{probe.pass}</dd>
          {probeOutcome?.detail && (
            <>
              <dt>Result</dt>
              <dd>{display(probeOutcome.detail)}</dd>
            </>
          )}
        </dl>
      </div>
  ) : null;

  let side: ReactNode;
  if (phase === 'running') {
    side = (
      <>
        <span className="eg-label">Checking</span>
        <div className="eg-running">
          <p className="eg-running-line">
            Running {registry.checks.length} checks on {target}
          </p>
          <span className="eg-elapsed">{seconds(elapsed)}</span>
        </div>
        <GradeScale />
      </>
    );
  } else if (phase === 'done' && props.verdictNode) {
    side = props.verdictNode;
  } else if (phase === 'done' && verdict) {
    side = (
      <>
        <span className="eg-label">Verdict</span>
        <div className="eg-verdict-row">
          <span className="eg-grade">{verdict.grade}</span>
          <span className="eg-score">
            {verdict.score}
            <small>/100</small>
          </span>
        </div>
        <GradeScale score={verdict.score} grade={verdict.grade} />
        <ul className="eg-tally">
          <li><Lamp status="PASS" /><b>{verdict.pass}</b> pass</li>
          <li><Lamp status="WARN" /><b>{verdict.warn}</b> warn</li>
          <li><Lamp status="FAIL" /><b>{verdict.fail}</b> fail</li>
          {!!verdict.skip && <li><Lamp status="SKIP" /><b>{verdict.skip}</b> skipped</li>}
          {!!verdict.manual && <li><Lamp status="MANUAL" /><b>{verdict.manual}</b> by a person</li>}
        </ul>
        {props.startNode ? (
          props.startNode
        ) : start ? (
          <button type="button" className="eg-start" onClick={() => onOpen?.(start.id)}>
            <span className="eg-label">Start here</span>
            <span className="eg-start-title">
              <Lamp status={outcomes[start.id].status} />
              {start.id} · {start.label}
            </span>
            {outcomes[start.id].detail && <span className="eg-start-detail">{display(outcomes[start.id].detail)}</span>}
          </button>
        ) : (
          <p className="eg-side-note">Every check passed.</p>
        )}
        {props.sideExtra}
      </>
    );
  } else if (phase === 'error') {
    side = (
      <>
        <span className="eg-label">No result</span>
        <div className="eg-error">{error}</div>
      </>
    );
  } else {
    side = (
      <>
        <span className="eg-label">Verdict</span>
        <p className="eg-side-note">{restNote}</p>
        <GradeScale />
        {props.restCard}
        {props.sideExtra}
      </>
    );
  }

  const announce =
    phase === 'done' && verdict
      ? `${name}: grade ${verdict.grade}, ${verdict.score} out of 100. ${verdict.pass} pass, ${verdict.warn} warn, ${verdict.fail} fail.`
      : phase === 'error'
        ? `${name} stopped without a result.`
        : '';

  return (
    <section
      ref={root}
      className="eg-inst"
      data-phase={phase}
      aria-label={`${name}: ${registry.checks.length} checks`}
      style={{ '--n-all': registry.checks.length } as CSSProperties}
    >
      {/* State light: pre-rendered layers under the panel whose opacity
          moves (engine.css). Signal while a run is out; the verdict's hue
          once, when the answer lands. */}
      <i className="eg-inst-glow" aria-hidden="true" />
      <i className="eg-inst-verdict" aria-hidden="true" data-band={lightBand} />
      <div className="eg-inst-bar">
        <span className="eg-inst-app">
          <i className="eg-mark" aria-hidden="true"><i /></i>
          {name}
        </span>
        <span className="eg-inst-target">
          {/* Keyed by the host, so a new target remounts and rises into the
              pill (cause, the slab's submit; effect, the instrument). */}
          <span key={target || ''} data-host={target ? '' : undefined}>
            {target || 'waiting for a URL'}
          </span>
        </span>
        <span className="eg-inst-state">
          <i className="eg-dot" aria-hidden="true" />
          {phase === 'running' ? (
            <>
              <span className="eg-state-read" aria-hidden="true">
                reading <DigitStrip values={readRows} at={0} className="eg-read-strip" />/{registry.checks.length}
              </span>
              <span className="eg-state-calm">reading {registry.checks.length} checks</span>
            </>
          ) : (
            <span>
              {registry.checks.length} checks · {stateLabel}
            </span>
          )}
        </span>
      </div>
      <div className="eg-inst-body">
        <div
          className="eg-faces"
          role="group"
          aria-label={`${name} checks`}
          onMouseLeave={exit}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) exit();
          }}
        >
          {faceNode}
        </div>
        {/* Both states share one grid cell, so the panel's height is the larger
            of the two and never jumps. Swapping one for the other resized it on
            every focus: stacked on a phone (/score at 390px) the resting side is
            531px and a probe ~200px, so tabbing into the cells pulled the page up
            ~300px and tabbing out pushed it back down 297px, carrying the focused
            history button off the bottom of the screen (CLS 0.193, WCAG 2.4.11;
            measured on production 2026-10-03). The resting side is hidden while a
            probe shows, as it was absent before. */}
        <div className="eg-side" data-probing={probeNode ? '' : undefined}>
          <div className="eg-side-rest">{side}</div>
          {probeNode}
        </div>
      </div>
      <div className="eg-legend">
        <ul aria-label="Legend">
          <li><Lamp status="PASS" />pass</li>
          <li><Lamp status="WARN" />warn</li>
          <li><Lamp status="FAIL" />fail</li>
          <li><Lamp status="SKIP" />skipped</li>
        </ul>
        <span>{scoring}</span>
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </section>
  );
}
