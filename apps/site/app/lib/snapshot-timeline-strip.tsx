/*
  SnapshotTimelineStrip — horizontal timestamped-dots timeline.

  2026 contract (CrUX Vis, Dembrandt, Supernova May 2026): every score
  surface should answer "what was the score last week" with a glance.
  Static dial = dated; timeline strip = governance-ready.

  Two modes:
  - With `snapshots` prop (2+): real dots from the URL's history.
  - Without: 6-point SAMPLE timeline showing what a watch series looks
    like — used on the /monitor hero to preview the surface before any
    run.

  GEOMETRY CONTRACT (v2 — do not regress):
  - FIXED viewBox (600 × H) with UNIFORM scaling (default
    preserveAspectRatio). The v1 attempt used viewBox 0 0 100 H +
    preserveAspectRatio="none", which stretched circles into flat
    ellipses and turned px-sized labels into smudges. Never combine a
    unit-width viewBox with `none` when the layer contains circles or
    text.
  - Vertical axis is DATA-RELATIVE (min/max + 15% padding) so a tight
    score band still reads as a trend. First/last dots carry their true
    numeric labels, so no dishonesty — the shape is relative, the
    anchors are absolute.
  - role="img" + aria-roledescription + per-dot <title> (each dot is a
    real timestamp + score for screen readers); the numeric history
    lives in the DOM around the strip.

  prefers-reduced-motion: CSS disables transitions (globals.css).
*/

export type TimelineSnapshot = {
  /** ISO timestamp */
  timestamp: string;
  score: number;
  grade: string;
};

export type SnapshotTimelineStripProps = {
  snapshots?: TimelineSnapshot[];
  /** SVG height in viewBox units (default 96) */
  height?: number;
  /** Mark as sample/preview data (default: auto — sample when no real snapshots) */
  sample?: boolean;
};

const VB_W = 600;

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
  height = 96,
  sample,
}: SnapshotTimelineStripProps) {
  const hasReal = snapshots && snapshots.length >= 2;
  const data = hasReal ? snapshots! : SAMPLE;
  const isSample = sample || !hasReal;

  const padX = 34;   // room for the first/last score labels
  const padY = 22;   // room for labels above dots
  const dotR = 6;

  // Data-relative vertical band with 15% padding (flat history centers).
  const scores = data.map((s) => s.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min;
  const lo = span === 0 ? min - 5 : min - span * 0.15;
  const hi = span === 0 ? max + 5 : max + span * 0.15;
  const range = hi - lo || 1;

  const y = (score: number) => padY + (1 - (score - lo) / range) * (height - padY * 2);
  const x = (i: number) => padX + (i / (data.length - 1)) * (VB_W - padX * 2);

  const linePoints = data.map((s, i) => `${x(i).toFixed(1)},${y(s.score).toFixed(1)}`).join(' ');

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
        viewBox={`0 0 ${VB_W} ${height}`}
        role="img"
        aria-roledescription="snapshot timeline"
        aria-label={`Snapshot timeline: ${data.length} runs from ${shortDate(first.timestamp)} (score ${Math.round(first.score)}) to ${shortDate(latest.timestamp)} (score ${Math.round(latest.score)})`}
        className="timeline-strip-svg"
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {/* Trend line connecting all dots. */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
        />
        {/* Per-snapshot dots + first/last true-value labels. */}
        {data.map((s, i) => (
          <g key={i}>
            <title>{`${shortDate(s.timestamp)} — ${s.grade} (${Math.round(s.score)})`}</title>
            <circle
              cx={x(i)}
              cy={y(s.score)}
              r={dotR}
              fill={gradeColor(s.grade)}
              stroke="var(--paper)"
              strokeWidth={1.5}
            />
          </g>
        ))}
        <text
          x={x(0)}
          y={y(first.score) - dotR - 7}
          textAnchor="middle"
          className="timeline-strip-label"
        >
          {Math.round(first.score)}
        </text>
        <text
          x={x(data.length - 1)}
          y={y(latest.score) - dotR - 7}
          textAnchor="middle"
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
