'use client';

// A run's findings, in the instrument's own groups and order. Each row is one
// control (the whole row opens it) showing the check, its status and the
// engine's detail; open, it adds what the contract asks for and where the
// criterion is published. A filter narrows to what needs work.

import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { Lamp } from './instrument';
import { Segmented } from './command-bar';
import { display, type Outcomes, type RegistryView, type Status } from './types';

export type FindingsHandle = { open: (id: string) => void };

type Filter = 'all' | 'work' | 'passed';

const WORD: Record<Status, string> = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', SKIP: 'SKIP', MANUAL: 'PERSON' };

export const Findings = forwardRef<FindingsHandle, {
  registry: RegistryView;
  outcomes: Outcomes;
  sub: ReactNode;
  heading?: string;
  /** Start narrowed to what needs work (monitor's drift list). */
  defaultFilter?: Filter;
  /** Heading id, for pages with more than one findings list. */
  id?: string;
  /** Above the heading, inside the section (report's engine switch). */
  lead?: ReactNode;
}>(function Findings({ registry, outcomes, sub, heading = 'Findings', defaultFilter = 'all', id = 'eg-findings-h', lead }, ref) {
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = useRef<Map<string, HTMLButtonElement>>(new Map());

  const counts = useMemo(() => {
    let work = 0, passed = 0;
    for (const c of registry.checks) {
      const s = outcomes[c.id]?.status;
      if (s === 'FAIL' || s === 'WARN') work++;
      else if (s === 'PASS') passed++;
    }
    return { all: registry.checks.filter((c) => outcomes[c.id]).length, work, passed };
  }, [registry.checks, outcomes]);

  useImperativeHandle(ref, () => ({
    open(id: string) {
      const s = outcomes[id]?.status;
      if (filter === 'work' && s !== 'FAIL' && s !== 'WARN') setFilter('all');
      if (filter === 'passed' && s !== 'PASS') setFilter('all');
      setOpen((prev) => new Set(prev).add(id));
      requestAnimationFrame(() => {
        const el = rows.current.get(id);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        el.focus({ preventScroll: true });
      });
    },
  }), [outcomes, filter]);

  const keep = (s?: Status) =>
    !!s && (filter === 'all' || (filter === 'work' ? s === 'FAIL' || s === 'WARN' : s === 'PASS'));

  const groups = registry.groups
    .map((g) => ({ ...g, checks: registry.checks.filter((c) => c.group === g.id && keep(outcomes[c.id]?.status)) }))
    .filter((g) => g.checks.length);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="eg-section" aria-labelledby={id}>
      {lead && <div className="eg-section-lead">{lead}</div>}
      <div className="eg-section-head">
        <div>
          <h2 className="eg-h2" id={id}>{heading}</h2>
          <p className="eg-section-sub">{sub}</p>
        </div>
        <Segmented<Filter>
          label="show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${counts.all}` },
            { value: 'work', label: `Needs work ${counts.work}` },
            { value: 'passed', label: `Passed ${counts.passed}` },
          ]}
        />
      </div>
      {groups.length === 0 ? (
        <p className="eg-empty">
          {filter === 'work' ? 'Nothing here needs work.' : 'No checks in this view.'}
        </p>
      ) : (
        groups.map((g) => (
          <div className="eg-find-group" key={g.id}>
            {registry.groups.length > 1 && <span className="eg-label">{g.label}</span>}
            <ul className="eg-rows">
              {g.checks.map((c) => {
                const o = outcomes[c.id];
                const isOpen = open.has(c.id);
                const moreId = `${id}-more-${c.id}`;
                return (
                  <li key={c.id}>
                    <button
                      ref={(el) => {
                        if (el) rows.current.set(c.id, el);
                        else rows.current.delete(c.id);
                      }}
                      type="button"
                      className="eg-row"
                      data-status={o.status}
                      aria-expanded={isOpen}
                      aria-controls={moreId}
                      onClick={() => toggle(c.id)}
                    >
                      <Lamp status={o.status} />
                      <span className="eg-row-id">{c.id}</span>
                      <span className="eg-row-body">
                        <span className="eg-row-title">{c.label}</span>
                        {o.detail && <span className="eg-row-detail">{display(o.detail)}</span>}
                      </span>
                      <span className="eg-row-status">{WORD[o.status]}</span>
                      <svg className="eg-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 3.5 4.5 4.5L6 12.5" />
                      </svg>
                    </button>
                    <div className="eg-row-more" id={moreId} hidden={!isOpen}>
                      <b>Checks</b>
                      <span>{c.item}</span>
                      <b>Passes when</b>
                      <span>{c.pass}</span>
                      <b>Criterion</b>
                      <span>
                        <a href={registry.machine}>{registry.machine}</a> · {c.id}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
});
