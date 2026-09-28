'use client';

// The cohort on one scale: every scored site is a dot at its composite score,
// on the grade bands the engine grades by (F under 60, then ten points a
// grade). Sites a point or two apart stack instead of hiding each other. The
// readout above the drawing names the site under the pointer; it sits in the
// figure, never over the marks, and the figure's table carries the same
// numbers for keyboard and screen-reader use.

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

export type StripSite = {
  slug: string;
  name: string;
  score: number;
  grade: string;
  rank: number;
  self?: boolean;
  /** Held over: the engine could not read the site on the last run. */
  held?: boolean;
};

const BANDS = [
  { grade: 'F', from: 0, to: 60, tone: 'fail' },
  { grade: 'D', from: 60, to: 70, tone: 'warn' },
  { grade: 'C', from: 70, to: 80, tone: 'warn' },
  { grade: 'B', from: 80, to: 90, tone: 'pass' },
  { grade: 'A', from: 90, to: 100, tone: 'pass' },
] as const;

/** Two dots closer than this (in score points) take separate rows. */
const GAP = 1.7;

function toneOf(grade: string) {
  return grade === 'A' || grade === 'B' ? 'pass' : grade === 'C' || grade === 'D' ? 'warn' : 'fail';
}

export function CohortStrip({
  sites,
  median,
  label,
  lo = 40,
  hi = 100,
  focus,
  idle,
}: {
  sites: StripSite[];
  median: number;
  /** The drawing's accessible name: what it shows and its headline numbers. */
  label: string;
  lo?: number;
  hi?: number;
  /** A site to draw larger and read out at rest (a framework's own page). */
  focus?: string;
  idle?: ReactNode;
}) {
  const at = (v: number) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;

  const dots = useMemo(() => {
    const placed: { score: number; row: number }[] = [];
    return [...sites]
      .sort((a, b) => a.score - b.score || a.rank - b.rank)
      .map((s) => {
        let row = 0;
        while (placed.some((p) => p.row === row && Math.abs(p.score - s.score) < GAP)) row++;
        placed.push({ score: s.score, row });
        return { ...s, row, x: at(s.score) };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, lo, hi]);
  const rows = Math.max(1, ...dots.map((d) => d.row + 1));

  const plot = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<number | null>(null);
  const focused = focus ? dots.findIndex((d) => d.slug === focus) : -1;
  const shown = on ?? (focused >= 0 ? focused : null);

  // Nearest dot to the pointer, within reach of a fingertip.
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const el = plot.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const step = parseFloat(getComputedStyle(el).getPropertyValue('--step')) || 12;
    const pad = parseFloat(getComputedStyle(el).getPropertyValue('--pad')) || 12;
    let best = -1;
    let dist = Infinity;
    dots.forEach((d, i) => {
      const dx = (d.x / 100) * r.width - (e.clientX - r.left);
      const dy = r.bottom - pad - d.row * step - e.clientY;
      const dd = Math.hypot(dx, dy);
      if (dd < dist) {
        dist = dd;
        best = i;
      }
    });
    setOn(dist <= 28 ? best : null);
  };

  const ticks: number[] = [];
  for (let t = Math.ceil(lo / 10) * 10; t <= hi; t += 10) ticks.push(t);
  const d = shown !== null ? dots[shown] : null;

  return (
    <div className="dx-strip">
      <p className="dx-readout" aria-hidden="true">
        {d ? (
          <>
            <b>{d.name}</b>
            <span className="dx-readout-num">{d.score.toFixed(1)}</span>
            <span className="dx-readout-grade" data-tone={toneOf(d.grade)}>
              {d.grade}
            </span>
            <span className="dx-readout-meta">
              rank <span className="dx-num">{d.rank}</span>
              {d.self ? ', self-scored' : ''}
              {d.held ? ', held over' : ''}
            </span>
          </>
        ) : (
          idle
        )}
      </p>
      <div
        ref={plot}
        className="dx-strip-plot"
        role="img"
        aria-label={label}
        style={{ '--rows': rows } as CSSProperties}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setOn(null)}
      >
        {BANDS.filter((b) => b.to > lo).map((b) => (
          <span
            key={b.grade}
            className="dx-zone"
            data-tone={b.tone}
            style={{ '--a': at(Math.max(lo, b.from)), '--b': at(b.to) } as CSSProperties}
          >
            <b>{b.grade}</b>
          </span>
        ))}
        {BANDS.filter((b) => b.from > lo).map((b) => (
          <i key={b.grade} className="dx-cut" style={{ '--at': at(b.from) } as CSSProperties} />
        ))}
        {dots.map((dot, i) => (
          <i
            key={dot.slug}
            className="dx-dot"
            data-tone={toneOf(dot.grade)}
            data-self={dot.self || undefined}
            data-held={dot.held || undefined}
            data-on={shown === i || undefined}
            style={{ '--at': dot.x, '--row': dot.row } as CSSProperties}
          />
        ))}
      </div>
      <div className="dx-axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ '--at': at(t) } as CSSProperties}>
            {t}
          </span>
        ))}
      </div>
      {/* The median has its own row: at 69.8 it sits on the C/D line, and a
          line in the plot would read as one more grade boundary. */}
      <div className="dx-median" aria-hidden="true" style={{ '--at': at(median) } as CSSProperties}>
        <span>median {median.toFixed(1)}</span>
      </div>
    </div>
  );
}
