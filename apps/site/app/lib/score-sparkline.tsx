/*
  ScoreSparkline — 10-point trend line for score history.

  Pairs with the delta chip in the score result hero: the chip says how much,
  the sparkline says the shape. Renders nothing below 2 points (a trend needs
  at least two).

  Craft contract:
  - Hand-rolled SVG, zero deps (verification-tool bundle discipline).
  - Fixed viewBox, scales to the data's min/max with padding so a flat
    history doesn't render a line pinned to an edge.
  - Color follows the LATEST score's threshold band (ok/warn/error), not a
    gradient — one hue, one story.
  - role="img" + aria-label per the 2026 chart-a11y contract; the numeric
    history lives in the adjacent "Recent scores" list (linked-table
    pattern — the list IS the accessible table for this chart).
  - Reduced motion: CSS disables the draw-on animation (globals.css).
*/

export type ScoreSparklineProps = {
  /** Scores oldest → newest. */
  points: number[];
  /** Pixel width (default 72) */
  width?: number;
  /** Pixel height (default 24) */
  height?: number;
  /** Accessible description (default "Score trend") */
  label?: string;
};

export function ScoreSparkline({
  points,
  width = 72,
  height = 24,
  label = 'Score trend',
}: ScoreSparklineProps) {
  if (!points || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  // Pad the band so flat lines don't hug an edge; if all equal, center it.
  const span = max - min;
  const lo = span === 0 ? min - 5 : min - span * 0.15;
  const hi = span === 0 ? max + 5 : max + span * 0.15;
  const range = hi - lo || 1;

  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (1 - (v - lo) / range) * (height - pad * 2);
  const coords = points.map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`);

  const latest = points[points.length - 1];
  const stroke = latest >= 90 ? 'var(--ok)' : latest >= 70 ? 'var(--warn)' : 'var(--error)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-roledescription="sparkline"
      aria-label={`${label}: ${points.map((p) => Math.round(p)).join(', ')}`}
      className="score-sparkline"
    >
      {/* End-point dot — the "you are here" marker, slightly brighter than the line */}
      <circle
        cx={pad + (points.length - 1) * step}
        cy={y(latest)}
        r={2.5}
        fill={stroke}
      />
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
