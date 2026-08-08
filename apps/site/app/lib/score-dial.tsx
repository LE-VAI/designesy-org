/*
  ScoreDial — canonical SVG circle gauge for scores.

  Extracted from 6 duplicated implementations (report, drift, compare, monitor,
  frameworks/[slug], score/verify) into a single shared component.

  Two color modes:
  - 'threshold' (default): score >= 90 → ok, >= 70 → warn, < 70 → error
  - 'grade': looks up a GRADE_COLORS map (used by frameworks/[slug])

  Accessibility: role="img" with descriptive aria-label. The score-0 guard
  prevents a phantom dot when the arc has zero length (round-capped dash
  paints a dot at 0 — skip the arc entirely so a fully-failing URL reads
  as an empty ring).

  Motion: stroke-dashoffset transition animates the arc fill on mount.
  Respects the --ease-out token and reduced-motion preferences via CSS.
*/

import React from 'react';

const GRADE_COLORS: Record<string, string> = {
  A: 'var(--ok)',
  B: 'var(--signal)',
  C: 'var(--warn)',
  D: 'var(--warn)',
  F: 'var(--error)',
};

export function thresholdColor(score: number): string {
  return score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--error)';
}

export function gradeColor(grade: string): string {
  return GRADE_COLORS[grade] || 'var(--warn)';
}

export type ScoreDialProps = {
  /** Numeric score 0–100 */
  score: number;
  /** Letter grade (A–F) */
  grade: string;
  /** SVG width/height in px (default 120) */
  size?: number;
  /** Aria label prefix (default "Grade"). Use "Composite grade" for composite scores. */
  label?: string;
  /** Color mode: 'threshold' uses score thresholds, 'grade' uses grade lookup (default 'threshold') */
  colorMode?: 'threshold' | 'grade';
};

export function ScoreDial({
  score,
  grade,
  size = 120,
  label = 'Grade',
  colorMode = 'threshold',
}: ScoreDialProps) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const fillColor = colorMode === 'grade' ? gradeColor(grade) : thresholdColor(score);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${label} ${grade}, ${score} percent`}
    >
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="6" />
      {/* Score-0 guard: a zero-length round-capped dash paints a phantom dot.
          Skip the arc entirely at 0 so a fully-failing URL reads as an empty
          ring, not a dot. (Lighthouse PR fix pattern.) */}
      {score > 0 && (
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 0.8s var(--ease-out)' }}
        />
      )}
      <text
        x="60"
        y="58"
        textAnchor="middle"
        style={{ fontSize: '2rem', fontWeight: 700, fill: 'var(--ink)' }}
      >
        {grade}
      </text>
      <text
        x="60"
        y="78"
        textAnchor="middle"
        style={{ fontSize: '0.8rem', fill: 'var(--muted-dim)' }}
      >
        {score}/100
      </text>
    </svg>
  );
}
