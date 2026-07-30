/*
  Contract health rack — 8 mini-gauge modules, one per design review dimension.

  Unbordered, un-padded, un-contained. The gauges sit on the page background
  at the same optical weight as the principle-list items beside them — no
  card to "hang", no internal type hierarchy fighting between a caps title,
  a sub-note, and a giant numeral. The mean lives in the section header as
  a quiet badge, not inside this block.

  Each module encodes one dimension as a 270° arc from a shared baseline —
  length judgment, the strongest perceptual channel. Hover lifts just that
  instrument.

  Pure SVG + CSS. No JS. Reduced-motion respected.
*/

export type HealthDim = { label: string; v: number };

export const CONTRACT_HEALTH_DIMS: HealthDim[] = [
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
export const CONTRACT_HEALTH_MEAN =
  Math.round(
    (CONTRACT_HEALTH_DIMS.reduce((s, d) => s + d.v, 0) / CONTRACT_HEALTH_DIMS.length) * 100
  ) / 100; // 0.93

/*
  One 270° arc gauge. Sweep: starts at 135° (7:30 position), ends at 45°
  (4:30 position) — a "C open at the floor."
*/
const VB = 120;
const CX = VB / 2;
const CY = VB / 2;
const R = 40;
const ARC_SWEEP_DEG = 270;
const ARC_START_DEG = 135;
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
const FULL_ARC_LEN = (ARC_SWEEP_DEG / 360) * 2 * Math.PI * R;

function DimGauge({ label, v, index }: { label: string; v: number; index: number }) {
  const dash = FULL_ARC_LEN * Math.min(v, 1);
  const tipAngle = ARC_START_DEG + ARC_SWEEP_DEG * v;
  const [tx, ty] = polar(tipAngle, R);
  return (
    <div className="health-rack-module" data-dim={index} data-score={pct(v)}>
      <svg
        className="health-rack-svg"
        viewBox={`0 0 ${VB} ${VB}`}
        fill="none"
        role="img"
        aria-label={`${label}: ${pct(v)} out of 100`}
      >
        <path className="health-rack-track" d={FULL_ARC} strokeLinecap="round" />
        <path
          className="health-rack-value"
          d={FULL_ARC}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${FULL_ARC_LEN}`}
        />
        <circle className="health-rack-tip" cx={tx} cy={ty} r={2.6} />
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
    <div className="health-rack-grid" role="list" data-reveal>
      {CONTRACT_HEALTH_DIMS.map((d, i) => (
        <div key={d.label} role="listitem">
          <DimGauge label={d.label} v={d.v} index={i} />
        </div>
      ))}
    </div>
  );
}
