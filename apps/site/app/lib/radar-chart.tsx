/*
  RadarChart — SVG radar/spider chart for category score comparison.

  Shows a site's per-category scores as a filled polygon on a radial grid,
  with the cohort mean overlaid as a dashed polygon. Each axis represents one
  category; the distance from center encodes the score (0–100).

  Pure SVG + CSS. No JS animation — the polygon is static at render time.
  Reduced-motion respected via CSS (no transition on the polygon).

  Used on: frameworks/[slug] per-category breakdown section.
*/

import React from 'react';

export type RadarDataPoint = {
  label: string;
  score: number | null;
  cohortAvg: number | null;
};

export type RadarChartProps = {
  data: RadarDataPoint[];
  size?: number;
};

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function RadarChart({ data, size = 320 }: RadarChartProps) {
  const scored = data.filter((d) => d.score !== null);
  if (scored.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 40; // leave room for labels
  const levels = 4; // concentric grid rings at 25%, 50%, 75%, 100%

  const angleStep = 360 / scored.length;

  // Build polygon points for the site scores
  const sitePoints = scored.map((d, i) => {
    const angle = i * angleStep;
    const r = ((d.score ?? 0) / 100) * maxRadius;
    return polarToCartesian(cx, cy, r, angle);
  });

  // Build polygon points for the cohort average
  const cohortPoints = scored.map((d, i) => {
    const angle = i * angleStep;
    const r = ((d.cohortAvg ?? 0) / 100) * maxRadius;
    return polarToCartesian(cx, cy, r, angle);
  });

  const sitePath = sitePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  const cohortPath = cohortPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <div className="radar-chart" role="img" aria-label={`Category radar chart comparing site scores to cohort average across ${scored.length} dimensions`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {Array.from({ length: levels }, (_, i) => {
          const r = ((i + 1) / levels) * maxRadius;
          return (
            <circle
              key={`ring-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              className="radar-chart-grid"
            />
          );
        })}

        {/* Axis lines */}
        {scored.map((_, i) => {
          const angle = i * angleStep;
          const end = polarToCartesian(cx, cy, maxRadius, angle);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              className="radar-chart-axis"
            />
          );
        })}

        {/* Axis labels */}
        {scored.map((d, i) => {
          const angle = i * angleStep;
          const labelRadius = maxRadius + 20;
          const pos = polarToCartesian(cx, cy, labelRadius, angle);
          return (
            <text
              key={`label-${i}`}
              x={pos.x}
              y={pos.y}
              className="radar-chart-label"
              dominantBaseline="middle"
            >
              {d.label}
            </text>
          );
        })}

        {/* Cohort polygon (dashed, behind) */}
        <path d={cohortPath} className="radar-chart-polygon-cohort" />

        {/* Site polygon (filled, front) */}
        <path d={sitePath} className="radar-chart-polygon" />

        {/* Data dots — site */}
        {sitePoints.map((p, i) => (
          <circle
            key={`dot-site-${i}`}
            cx={p.x}
            cy={p.y}
            r={3.5}
            className="radar-chart-dot"
          />
        ))}

        {/* Data dots — cohort */}
        {cohortPoints.map((p, i) => (
          <circle
            key={`dot-cohort-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.5}
            className="radar-chart-dot-cohort"
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="radar-chart-legend">
        <div className="radar-chart-legend-item">
          <span className="radar-chart-legend-swatch radar-chart-legend-swatch--site" />
          <span>This site</span>
        </div>
        <div className="radar-chart-legend-item">
          <span className="radar-chart-legend-swatch radar-chart-legend-swatch--cohort" />
          <span>Cohort mean</span>
        </div>
      </div>
    </div>
  );
}
