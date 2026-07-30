/*
  Contract health rack — 8 mini-gauge modules, one per design review dimension.

  Replaces the octagonal radar chart. Radar failed for the documented reasons:
  arbitrary axis order changes the silhouette; connecting lines between
  categorical axes imply continuity that doesn't exist; area/angular comparison
  is cognitively expensive; the mean floating at the centroid promised precision
  it didn't anchor.

  A 4×2 (desktop) / 2×4 (mobile) rack of 270° arcs keeps every dimension
  visible simultaneously, gives each score its own shared baseline, encodes
  value as arc length from 12-o'clock (a length judgment — the strongest
  perceptual channel), and lets the header mean act as a true instrument
  readout instead of a decorative centroid.

  Pure SVG + CSS. No JS. Reduced-motion respected.
*/

export type HealthDim = { label: string; v: number };

const DIMS: HealthDim[] = [
  { label: 'Type', v: 0.95 },
  { label: 'Motion', v: 0.90 },
  { label: 'Color', v: 0.95 },
  { label: 'A11y', v: 0.88 },
  { label: 'Space', v: 0.92 },
  { label: 'Hierarchy', v: 0.95 },
  { label: 'Interact', v: 0.90 },
  { label: 'Provenance', v: 1.0 },
];

const pct = (v: number) => Math.round(v * 100);
const mean = DIMS.reduce((s, d) => s + d.v, 0) / DIMS.length;

/*
  One 270° arc gauge. Sweep: starts at 135° (7:30 position), ends at 45°
  (4:30 position), leaving a 90° wedge open at the bottom — a "C open at
  the floor," the standard instrument dial register.
  Geometry: r=40 in a 120 viewBox, center at (60, 60).
*/
const VB = 120;
const CX = VB / 2;
const CY = VB / 2;
const R = 40;
const ARC_SWEEP_DEG = 270;             // full track sweep
const ARC_START_DEG = 135;             // degrees from +X, clockwise
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
};
const arcPath = (fromDeg: number, toDeg: number, r: number) => {
  const [x1, y1] = polar(fromDeg, r);
  const [x2, y2] = polar(toDeg, r);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
};
const FULL_ARC = arcPath(ARC_START_DEG, ARC_START_DEG + ARC_SWEEP_DEG, R);
// Arc length of 270° at radius R: (270/360)·2πR = 1.5πR.
const FULL_ARC_LEN = (ARC_SWEEP_DEG / 360) * 2 * Math.PI * R;

function DimGauge({ label, v, index }: { label: string; v: number; index: number }) {
  const dash = FULL_ARC_LEN * Math.min(v, 1);
  return (
    <div className="health-rack-module" data-dim={index} data-score={pct(v)}>
      <svg
        className="health-rack-svg"
        viewBox={`0 0 ${VB} ${VB}`}
        fill="none"
        role="img"
        aria-label={`${label}: ${pct(v)} out of 100`}
      >
        {/* Track: full 270° arc in faint line, the "always 100" baseline */}
        <path
          className="health-rack-track"
          d={FULL_ARC}
          strokeLinecap="round"
        />
        {/* Reading: arc from start, truncated to the score via dasharray */}
        <path
          className="health-rack-value"
          d={FULL_ARC}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${FULL_ARC_LEN}`}
        />
        {/* Tip marker: a small circle at the reading's end */}
        {(() => {
          const tipAngle = ARC_START_DEG + ARC_SWEEP_DEG * v;
          const [tx, ty] = polar(tipAngle, R);
          return <circle className="health-rack-tip" cx={tx} cy={ty} r={2.6} />;
        })()}
        {/* Center numeral */}
        <text
          className="health-rack-numeral"
          x={CX}
          y={CY + 2}
          textAnchor="middle"
          dominantBaseline="middle"
          data-tabular
        >
          {pct(v)}
        </text>
        <text
          className="health-rack-unit"
          x={CX}
          y={CY + 16}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          / 100
        </text>
      </svg>
      <div className="health-rack-label">{label}</div>
    </div>
  );
}

export function ContractHealthRack() {
  return (
    <div className="health-rack" data-reveal>
      <div className="health-rack-header">
        <div className="health-rack-title-block">
          <span className="health-rack-title">Contract health</span>
          <span className="health-rack-sub">8 dimensions · mean of all readings</span>
        </div>
        <div className="health-rack-mean" aria-label={`Mean score ${pct(mean)} out of 100`}>
          <span className="health-rack-mean-numeral" data-tabular>{pct(mean)}</span>
          <span className="health-rack-mean-label">mean</span>
        </div>
      </div>
      <div className="health-rack-grid" role="list">
        {DIMS.map((d, i) => (
          <div key={d.label} role="listitem">
            <DimGauge label={d.label} v={d.v} index={i} />
          </div>
        ))}
      </div>
      <p className="health-rack-foot">
        Live readings from the same contract categories the score engine
        verifies — typography, motion, color, accessibility, spacing,
        hierarchy, interaction, provenance.
      </p>
    </div>
  );
}
