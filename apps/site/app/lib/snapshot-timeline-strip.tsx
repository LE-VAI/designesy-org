/*
  SnapshotTimelineStrip — horizontal timestamped-dots timeline.

  2026 contract (CrUX Vis, Dembrandt, Supernova May 2026): every score
  surface should answer "what was the score last week" with a glance.
  Static dial = dated; timeline strip = governance-ready.

  Two modes:
  - With `snapshots` prop: real dots from the URL's history (oldest →
    newest), colored by grade. Click to mark selected.
  - Without: 6-point SAMPLE timeline showing what a watch series looks
    like — used on the /monitor hero to preview the surface before any
    run.

  Craft contract:
  - Hand-rolled SVG. No chart library. Blueprint-grid subtle baseline.
  - role="img" + aria-roledescription + a per-dot title (linked-list
    pattern: each dot is a real timestamp + score for screen readers).
  - prefers-reduced-motion: CSS disables draw-on.
*/

export type TimelineSnapshot = {
  /** ISO timestamp */
  timestamp: string;
  score: number;
  grade: string;
};

export type SnapshotTimelineStripProps = {
  snapshots?: TimelineSnapshot[];
  /** Pixel width (default fills container via 100%) */
  width?: number;
  height?: number;
  /** Show "sample" badge to mark preview data (default false) */
  sample?: boolean;
};

const SAMPLE: TimelineSnapshot[] = [
  { timestamp: '2026-08-04T09:00:00Z', score: 78, grade: 'C' },
  { timestamp: '2026-08-11T09:00:00Z', score: 81, grade: 'B' },
  { timestamp: '2026-08-18T09:00:00Z', score: 79, grade: 'C' },
  { timestamp: '2026-08-22T09:00:00Z', score: 83, grade: 'B' },
  { timestamp: '2026-08-24T09:00:00Z', score: 85, grade: 'B' },
  { timestamp: '2026-08-25T09:00:00Z', score: 84, grade: 'B' },
];

const GRADE_COLORS: Record<string, string> = {
  A: 'var(--ok)',
  B: 'var(--signal)',
  C: 'var(--warn)',
  D: 'var(--warn)',
  F: 'var(--error)',
};

function gradeColor(grade: string): string {
  return GRADE_COLORS[grade] || 'var(--warn)';
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(5, 10);
  }
}

export function SnapshotTimelineStrip({
  snapshots,
  height = 88,
  sample = false,
}: SnapshotTimelineStripProps) {
  const data = snapshots && snapshots.length >= 2 ? snapshots : SAMPLE;
  const isSample = sample || !snapshots || snapshots.length < 2;
  if (data.length < 2) return null;

  const pad = 14;
  const dotR = 5;
  const stepX = 1 / (data.length - 1);

  // Score band (0-100) — pad by 5 each side so dots don't kiss the edges.
  const lo = 0;
  const hi = 100;
  const y = (score: number) => pad + (1 - (score - lo) / (hi - lo)) * (height - pad * 2);

  const linePoints = data
    .map((s, i) => `${(i * stepX * 100).toFixed(2)},${y(s.score).toFixed(1)}`)
    .join(' ');

  const latest = data[data.length - 1];
  const first = data[0];
  const delta = latest.score - first.score;

  return (
    <div className="timeline-strip">
      <div className="timeline-strip-head">
        <p className="timeline-strip-title">
          {isSample ? 'Sample snapshot timeline' : `${data.length} snapshots`}
        </p>
        {isSample && <span className="timeline-strip-sample">sample</span>}
        <span className="timeline-strip-delta">
          {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
        </span>
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-roledescription="snapshot timeline"
        aria-label={`Snapshot timeline: ${data.length} runs from ${shortDate(first.timestamp)} (score ${Math.round(first.score)}) to ${shortDate(latest.timestamp)} (score ${Math.round(latest.score)})`}
        className="timeline-strip-svg"
      >
        {/* Faint 50%-line baseline (Lighthouse score midline). */}
        <line x1={pad} y1={y(50)} x2={100 - pad} y2={y(50)} stroke="var(--line-faint)" strokeWidth="0.5" strokeDasharray="2 4" />
        {/* Trend line connecting all dots. */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />
        {/* Per-snapshot dots + first/last labels. */}
        {data.map((s, i) => {
          const cx = pad + (i * stepX * (100 - pad * 2));
          const cy = y(s.score);
          const color = gradeColor(s.grade);
          return (
            <g key={i}>
              <title>{`${shortDate(s.timestamp)} — ${s.grade} (${Math.round(s.score)})`}</title>
              <circle cx={cx} cy={cy} r={dotR} fill={color} stroke="var(--paper)" strokeWidth="1" />
            </g>
          );
        })}
        {/* First + last dot score labels — minimal, only the two anchors. */}
        <text
          x={pad + (0 * stepX * (100 - pad * 2))}
          y={y(first.score) - 10}
          textAnchor="start"
          className="timeline-strip-label"
        >
          {Math.round(first.score)}
        </text>
        <text
          x={pad + ((data.length - 1) * stepX * (100 - pad * 2))}
          y={y(latest.score) - 10}
          textAnchor="end"
          className="timeline-strip-label"
        >
          {Math.round(latest.score)}
        </text>
      </svg>
      <div className="timeline-strip-axis" aria-hidden="true">
        <span>{shortDate(first.timestamp)}</span>
        <span>{shortDate(latest.timestamp)}</span>
      </div>
    </div>
  );
}