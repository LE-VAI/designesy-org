// MiniConstellation — the score-tool visual idiom (center arc + per-category
// node ring, fixed weight-ordered axes) composed as a small inline component.
// Used on /leaderboard rows as the per-site category fingerprint.
//
// Intentionally NOT mounted on the /score result itself: /score already
// renders the full-size constellation (100×100, animated arcs, click-to-filter
// legend, rubric). A 44px echo on the same result would duplicate one idiom at
// two scales in one viewport. This component exists for COMPACT surfaces —
// leaderboard rows now; compact cards/badges later. Keep it for those.
//
// Geometry mirrors the full constellation at 1/4 scale: C=22, RING_R=13,
// NODE_R=24, NODE_ARC_R=3.5 on a 44×44 viewBox. Fixed axis order so every
// surface reads the same: cadence at 12 o'clock, weighted clockwise.

export type MiniCategoryScore = {
  score: number | null;
  weight: number;
};

const ORDER = [
  'cadence',
  'accessibility',
  'semantic',
  'motion',
  'tokens',
  'takt',
  'poise',
  'identity',
  'interaction',
  'performance',
  'responsive',
] as const;

const C = 22;
const RING_R = 13;
const NODE_R = 24;
const NODE_ARC_R = 3.5;
const MAIN_CIRC = 2 * Math.PI * RING_R;
const NODE_ARC_CIRC = 2 * Math.PI * NODE_ARC_R;

function point(index: number, total: number, r: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: C + r * Math.cos(angle), y: C + r * Math.sin(angle) };
}

function gradeStroke(grade: string): string {
  switch (grade.toUpperCase()) {
    case 'A':
      return '#22c55e';
    case 'B':
      return '#84cc16';
    case 'C':
      return '#eab308';
    case 'D':
      return '#fb923c';
    default:
      return '#ef4444';
  }
}

export function MiniConstellation({
  categories,
  score,
  grade,
  size = 44,
  label,
}: {
  /** Per-category scores keyed by category id (missing key = unscored). */
  categories: Record<string, MiniCategoryScore>;
  /** Composite score 0–100 for the center arc. */
  score: number | null;
  /** Letter grade for the center mark + main arc color. */
  grade: string | null;
  /** Rendered px size (default 44). */
  size?: number;
  /** Accessible label — describe the whole thing as one image. */
  label?: string;
}) {
  const present = ORDER.filter((k) => categories[k] && categories[k].score !== null);
  const centerPct = score !== null ? `${score.toFixed(1)}%` : '—';
  const ariaLabel =
    label ??
    (score !== null
      ? `Grade ${grade ?? '?'}, ${centerPct} — category breakdown`
      : 'Score pending — no category breakdown yet');

  return (
    <svg
      className="mini-constel"
      viewBox="0 0 44 44"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Spokes from center ring to each node position — static. */}
      <g className="mini-constel-spokes">
        {ORDER.map((key, i) => {
          const p0 = point(i, ORDER.length, RING_R + 1.5);
          const p1 = point(i, ORDER.length, NODE_R - NODE_ARC_R - 1);
          return (
            <line
              key={key}
              className="mini-constel-spoke"
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
            />
          );
        })}
      </g>

      {/* Center grade arc. */}
      <circle
        className="mini-constel-track"
        cx={C}
        cy={C}
        r={RING_R}
      />
      {score !== null && grade !== null && (
        <circle
          className={`mini-constel-node-fill is-${grade.toLowerCase()}`}
          cx={C}
          cy={C}
          r={RING_R}
          strokeDasharray={`${(score / 100) * MAIN_CIRC} ${MAIN_CIRC}`}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          transform={`rotate(-90 ${C} ${C})`}
          style={{ stroke: gradeStroke(grade) }}
        />
      )}

      {/* Per-category nodes on the outer ring. */}
      {ORDER.map((key, i) => {
        const entry = categories[key];
        const scored = entry && entry.score !== null;
        const pct = scored ? (entry.score as number) : 0;
        const p = point(i, ORDER.length, NODE_R);
        return (
          <g key={key} className={`mini-constel-node${scored ? '' : ' is-unscored'}`}>
            <circle
              className="mini-constel-node-track"
              cx={p.x}
              cy={p.y}
              r={NODE_ARC_R}
            />
            {scored && (
              <circle
                className="mini-constel-node-fill"
                cx={p.x}
                cy={p.y}
                r={NODE_ARC_R}
                strokeDasharray={`${(pct / 100) * NODE_ARC_CIRC} ${NODE_ARC_CIRC}`}
                transform={`rotate(-90 ${p.x} ${p.y})`}
              />
            )}
          </g>
        );
      })}

      {/* Center readout. */}
      <text className="mini-constel-center-grade" x={C} y={C - 2} dy="0.35em">
        {grade ?? '—'}
      </text>
      <text className="mini-constel-center-pct" x={C} y={C + 6.5} dy="0.35em">
        {centerPct}
      </text>
    </svg>
  );
}
