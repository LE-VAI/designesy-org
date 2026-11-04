'use client';

// The two check lists (WIREFRAMES W4, W5): the fourteen fidelity checks, each
// with the field of the contract it read, and the baseline checks, which read
// no contract. Words come from the one result language (#267): row words from
// verdict.ts STATUS_LABEL, group heads from STATUS_GROUP, and the filter
// umbrella "Not scored N" (brand D78, R31-04). Each row is one control (the
// whole row opens it); open, it adds how to fix, the criterion and the
// weight, and for a contrast pair (f09, f10) the declared and shipped table.
// Passing and not-applicable checks wait behind one "show more" row under the
// All filter; any other filter alone decides what shows.

import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BrandIcon } from '../../lib/brand-icons';
import { Lamp } from '../../lib/engine/instrument';
import { Segmented } from '../../lib/engine/command-bar';
import { display, type Status } from '../../lib/engine/types';
import { STATUS_GROUP, STATUS_LABEL } from '../verdict';
import {
  baselineCriterion,
  baselineSub,
  baselineWeight,
  fidelityCriterion,
  fidelitySub,
  fidelityWeight,
  filterSaid,
  pairFinding,
  rowDetail,
  showMore,
  showPassing,
  type Coverage,
  type ListFilter,
  type ResultCheck,
  type Thresholds,
} from './copy';

/** What the page knows about each check before a run (from the published formula and the registry). */
export type CheckDef = {
  title: string;
  /** Fidelity: the published criterion; baseline: the registry's threshold. */
  criterion: string;
  /** Category label and weight ("Typography", 18); baseline adds whether it needs a browser. */
  category: string;
  weight: number;
  manual?: boolean;
};

export type FindingsHandle = { open: (id: string) => void };

type Group = { key: string; title: string; ids: string[]; show: ListFilter[]; moreOf?: string };

const FILTER_OF: Record<string, ListFilter> = { FAIL: 'needs', WARN: 'needs', SKIP: 'notrun', MANUAL: 'notrun', PASS: 'passed' };

function Row({
  c,
  def,
  idp,
  open,
  onToggle,
  coverage,
  thresholds,
  engineVersion,
  contractVersion,
  staticMax,
  hidden,
  rowRef,
}: {
  c: ResultCheck;
  def: CheckDef;
  idp: string;
  open: boolean;
  onToggle: () => void;
  coverage: Coverage | null;
  thresholds: Thresholds;
  engineVersion: string;
  contractVersion: string;
  staticMax: number;
  hidden?: boolean;
  rowRef: (el: HTMLButtonElement | null) => void;
}) {
  const fid = /^f\d\d$/.test(c.id);
  const status = c.status as Status;
  const moreId = `${idp}cf-more-${c.id}`;
  const pair = fid && (c.id === 'f09' || c.id === 'f10') && (status === 'FAIL' || status === 'WARN') ? pairFinding(c, thresholds) : null;
  return (
    <li hidden={hidden}>
      <button
        ref={rowRef}
        type="button"
        className={`eg-row${status === 'SKIP' || status === 'MANUAL' ? ' cf-skip' : ''}`}
        id={`${idp}cf-row-${c.id}`}
        data-status={status}
        aria-expanded={open}
        aria-controls={moreId}
        onClick={onToggle}
      >
        <Lamp status={status} />
        <span className="eg-row-id">{c.id}</span>
        <span className="eg-row-body">
          <span className="eg-row-title">
            <span className="cf-id-inline">{c.id}</span>
            {def.title}
          </span>
          {fid && c.reads?.length ? (
            <span className="cf-reads">
              Reads {c.reads.map((r) => <code key={r}>{r}</code>)}
            </span>
          ) : null}
          <span className="eg-row-detail">{display(rowDetail(c, coverage, thresholds))}</span>
        </span>
        <span className="eg-row-status">{STATUS_LABEL[status]}</span>
        <BrandIcon name="chevron" size={16} className="eg-chev" />
      </button>
      <div className="eg-row-more" id={moreId} hidden={!open}>
        {pair && (
          <div className="cf-table">
            <table>
              <caption>Declared and shipped values for {c.id}</caption>
              <thead>
                <tr>
                  <th scope="col">Declared</th>
                  <th scope="col">Shipped</th>
                  <th scope="col">Where it ships</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Declared">
                    <span>
                      <span className="cf-dot" style={{ '--spec-bg': pair.declared.background } as CSSProperties} aria-hidden="true" />
                      <code>
                        {pair.declared.text} on {pair.declared.background}
                      </code>
                      <small>
                        {pair.declared.where}, {pair.declared.ratio} to 1
                      </small>
                    </span>
                  </td>
                  <td data-label="Shipped">
                    <span>
                      <span className="cf-dot" style={{ '--spec-bg': pair.shipped.background } as CSSProperties} aria-hidden="true" />
                      <code>
                        {pair.shipped.text} on {pair.shipped.background}
                      </code>
                      <small>{pair.shipped.ratio} to 1</small>
                    </span>
                  </td>
                  <td data-label="Where">
                    <span>
                      <code>{pair.shipped.where}</code>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="cf-more-copy">
          {fid && c.remediation && (status === 'FAIL' || status === 'WARN') ? (
            <>
              <b>How to fix</b>
              <p>{c.remediation}</p>
            </>
          ) : null}
          <b>Criterion</b>
          <p>{fid ? fidelityCriterion(def.criterion, engineVersion) : baselineCriterion(def.criterion, contractVersion)}</p>
          <b>Weight</b>
          <p>{fid ? fidelityWeight(def.category, def.weight) : baselineWeight(def.category, def.weight, staticMax, status === 'MANUAL' || !!def.manual)}</p>
        </div>
      </div>
    </li>
  );
}

const CheckList = forwardRef<
  FindingsHandle,
  {
    kind: 'fidelity' | 'baseline';
    checks: ResultCheck[];
    defs: Record<string, CheckDef>;
    idp: string;
    noScore: boolean;
    scored: number;
    min: number;
    coverage: Coverage | null;
    thresholds: Thresholds;
    engineVersion: string;
    contractVersion: string;
    staticMax: number;
    say: (msg: string) => void;
    after?: ReactNode;
    labelledBy?: string;
  }
>(function CheckList(p, ref) {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<string>>(new Set());
  const rows = useRef<Map<string, HTMLButtonElement>>(new Map());
  const byStatus = (s: string[]) => p.checks.filter((c) => s.includes(c.status)).map((c) => c.id);

  const groups: Group[] = useMemo(() => {
    const fail = byStatus(['FAIL']);
    const warn = byStatus(['WARN']);
    const pass = byStatus(['PASS']);
    const skip = byStatus(['SKIP']);
    const manual = byStatus(['MANUAL']);
    if (p.kind === 'fidelity' && !p.noScore) {
      return [
        { key: 'fail', title: STATUS_GROUP.FAIL, ids: fail, show: ['all', 'needs'] },
        { key: 'warn', title: STATUS_GROUP.WARN, ids: warn, show: ['all', 'needs'] },
        { key: 'skip', title: 'Not declared or not located', ids: skip, show: ['all', 'notrun'] },
        { key: 'pass', title: STATUS_GROUP.PASS, ids: pass, show: ['all', 'passed'], moreOf: 'pass' },
      ];
    }
    if (p.kind === 'fidelity') {
      const by = (r: string) => p.checks.filter((c) => c.status === 'SKIP' && c.skipReason === r).map((c) => c.id);
      const notLocated = by('not_located');
      const notDeclared = skip.filter((id) => !notLocated.includes(id));
      return [
        { key: 'fail', title: STATUS_GROUP.FAIL, ids: fail, show: ['all', 'needs'] },
        { key: 'warn', title: STATUS_GROUP.WARN, ids: warn, show: ['all', 'needs'] },
        { key: 'pass', title: STATUS_GROUP.PASS, ids: pass, show: ['all', 'passed'] },
        { key: 'notloc', title: 'Not located', ids: notLocated, show: ['all', 'notrun'] },
        { key: 'notdec', title: 'Not declared', ids: notDeclared, show: ['all', 'notrun'], moreOf: 'rest' },
      ];
    }
    return [
      { key: 'fail', title: STATUS_GROUP.FAIL, ids: fail, show: ['all', 'needs'] },
      { key: 'warn', title: STATUS_GROUP.WARN, ids: warn, show: ['all', 'needs'] },
      { key: 'pass', title: STATUS_GROUP.PASS, ids: pass, show: ['all', 'passed'], moreOf: 'rest' },
      { key: 'skip', title: STATUS_GROUP.SKIP, ids: skip, show: ['all', 'notrun'], moreOf: 'rest' },
      { key: 'manual', title: STATUS_GROUP.MANUAL, ids: manual, show: ['all', 'notrun'], moreOf: 'rest' },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.checks, p.kind, p.noScore]);

  const live = groups.filter((g) => g.ids.length);
  const moreCount = (k: string) => live.filter((g) => g.moreOf === k).reduce((n, g) => n + g.ids.length, 0);
  const shows = (g: Group) => g.show.includes(filter) && (filter !== 'all' || !g.moreOf || more.has(g.moreOf));
  const counts = {
    all: p.checks.length,
    needs: byStatus(['FAIL', 'WARN']).length,
    notrun: byStatus(['SKIP', 'MANUAL']).length,
    passed: byStatus(['PASS']).length,
  };

  const choose = (f: ListFilter) => {
    setFilter(f);
    p.say(filterSaid(f, f === 'all' ? counts.all : counts[f]));
  };

  useImperativeHandle(
    ref,
    () => ({
      open(id: string) {
        const c = p.checks.find((x) => x.id === id);
        if (!c) return;
        const g = live.find((x) => x.ids.includes(id));
        if (filter !== 'all' && FILTER_OF[c.status] !== filter) setFilter('all');
        if (g?.moreOf && (filter === 'all' || FILTER_OF[c.status] !== filter)) setMore((m) => new Set(m).add(g.moreOf!));
        setOpen((o) => new Set(o).add(id));
        requestAnimationFrame(() => {
          const el = rows.current.get(id);
          if (!el) return;
          el.focus({ preventScroll: true });
          el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        });
      },
    }),
    [p.checks, filter, live],
  );

  const headId = `${p.idp}cf-${p.kind === 'fidelity' ? 'fid' : 'base'}-list-h`;
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rowsOf = (ids: string[]) =>
    ids.map((id) => {
      const c = p.checks.find((x) => x.id === id)!;
      return (
        <Row
          key={id}
          c={c}
          def={p.defs[id] ?? { title: id, criterion: '', category: '', weight: 0 }}
          idp={p.idp}
          open={open.has(id)}
          onToggle={() => toggle(id)}
          coverage={p.coverage}
          thresholds={p.thresholds}
          engineVersion={p.engineVersion}
          contractVersion={p.contractVersion}
          staticMax={p.staticMax}
          rowRef={(el) => {
            if (el) rows.current.set(id, el);
            else rows.current.delete(id);
          }}
        />
      );
    });

  return (
    <section className="eg-section cf-list" aria-labelledby={p.labelledBy ? `${p.labelledBy} ${headId}` : headId} data-filter={filter}>
      <div className="eg-section-head">
        <div>
          <h2 className="eg-h2" id={headId}>
            {p.kind === 'fidelity' ? 'Contract fidelity checks' : 'Baseline checks'}
          </h2>
          <p className="eg-section-sub">
            {p.kind === 'fidelity' ? fidelitySub(p.checks.length, p.scored, p.noScore, p.min) : baselineSub(p.checks.length, p.scored)}
          </p>
        </div>
        <Segmented<ListFilter>
          label="show"
          value={filter}
          onChange={choose}
          options={[
            { value: 'all', label: `All ${counts.all}` },
            { value: 'needs', label: `Needs work ${counts.needs}` },
            { value: 'notrun', label: `Not scored ${counts.notrun}` },
            { value: 'passed', label: `Passed ${counts.passed}` },
          ]}
        />
      </div>
      {live.map((g) => {
        const lead = (
          <div className="eg-find-group" key={g.key} hidden={!shows(g)} id={`${p.idp}cf-${p.kind}-${g.key}`}>
            <h3 className="eg-label">
              <span>{g.title}</span>
              <span>{g.ids.length}</span>
            </h3>
            <ul className="eg-rows">{rowsOf(g.ids)}</ul>
          </div>
        );
        // The "show more" row sits right before the first group it opens.
        const first = g.moreOf && live.find((x) => x.moreOf === g.moreOf) === g;
        if (!first) return lead;
        const key = g.moreOf!;
        const isOpen = more.has(key);
        const n = moreCount(key);
        const controls = live.filter((x) => x.moreOf === key).map((x) => `${p.idp}cf-${p.kind}-${x.key}`).join(' ');
        const label = key === 'pass' ? showPassing(n) : showMore(n);
        return [
          <div className="eg-find-group" key={`more-${key}`} hidden={filter !== 'all'}>
            <button
              type="button"
              className="cf-more-row"
              aria-expanded={isOpen}
              aria-controls={controls}
              onClick={() =>
                setMore((m) => {
                  const next = new Set(m);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            >
              <span>{isOpen ? label.replace(/^Show /, 'Hide ') : label}</span>
              <BrandIcon name="chevron" size={16} className="eg-chev" />
            </button>
          </div>,
          lead,
        ];
      })}
      {p.after}
    </section>
  );
});

export { CheckList };
