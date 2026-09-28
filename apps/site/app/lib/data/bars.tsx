// Horizontal bars, one per row, drawn to one scale (0 to max). A row may carry
// a reference mark (the cohort's mean in that row), so one site's profile is
// read against the cohort bar by bar: small multiples on a shared axis, where
// an overlaid radar would hide one shape behind the other.
//
// The fill is drawn at its value from the first paint. Where the browser has
// scroll timelines, it grows from zero as the row comes into view; nothing
// waits on that animation to be readable.

import type { CSSProperties, ReactNode } from 'react';

export type Bar = {
  key: string;
  label: ReactNode;
  /** null: nothing to measure (drawn as an empty, dashed track). */
  value: number | null;
  /** The value as printed; one decimal by default. */
  display?: string;
  tone?: 'pass' | 'warn' | 'fail' | 'plain';
  /** A reference value on the same scale, drawn as a tick. */
  mark?: number | null;
  /** A second line under the label (a weight, a count). */
  meta?: ReactNode;
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function BarList({
  bars,
  max = 100,
  label,
  markName,
  empty = 'unscored',
}: {
  bars: Bar[];
  max?: number;
  /** The drawing's accessible name, with its headline values. */
  label: string;
  /** What the tick marks: shown as a key under the bars. */
  markName?: string;
  empty?: string;
}) {
  return (
    <>
      <div className="dx-bars" role="img" aria-label={label}>
        {bars.map((b) => (
          <div className="dx-bar" key={b.key} data-tone={b.value === null ? 'none' : b.tone ?? 'plain'}>
            <span className="dx-bar-label">
              {b.label}
              {b.meta && <small>{b.meta}</small>}
            </span>
            <span className="dx-bar-track">
              {b.value !== null && <i className="dx-bar-fill" style={{ '--v': clamp(b.value / max) } as CSSProperties} />}
              {typeof b.mark === 'number' && <i className="dx-bar-mark" style={{ '--m': clamp(b.mark / max) } as CSSProperties} />}
            </span>
            <span className="dx-bar-val">{b.value === null ? empty : b.display ?? b.value.toFixed(1)}</span>
          </div>
        ))}
      </div>
      {markName && (
        <p className="dx-bars-key">
          <i aria-hidden="true" />
          {markName}
        </p>
      )}
    </>
  );
}

export type Range = {
  key: string;
  label: ReactNode;
  /** The range's ends and the point inside it, on the list's scale. */
  lo: number;
  hi: number;
  at: number;
  display: string;
  tone?: 'pass' | 'warn' | 'fail' | 'plain';
};

/** Ranges on one scale (a rank band per site): a segment from lo to hi with a
    dot where the published value sits. min is drawn at the left. */
export function RangeList({
  ranges,
  min,
  max,
  label,
}: {
  ranges: Range[];
  min: number;
  max: number;
  label: string;
}) {
  const at = (v: number) => clamp((v - min) / (max - min || 1));
  return (
    <div className="dx-bars dx-ranges" role="img" aria-label={label}>
      {ranges.map((r) => (
        <div className="dx-bar" key={r.key} data-tone={r.tone ?? 'plain'}>
          <span className="dx-bar-label">{r.label}</span>
          <span className="dx-bar-track">
            <i className="dx-range-seg" style={{ '--a': at(r.lo), '--b': at(r.hi) } as CSSProperties} />
            <i className="dx-range-dot" style={{ '--at': at(r.at) } as CSSProperties} />
          </span>
          <span className="dx-bar-val">{r.display}</span>
        </div>
      ))}
    </div>
  );
}
