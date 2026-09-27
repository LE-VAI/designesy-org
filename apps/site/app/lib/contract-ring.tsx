import { CHECKS } from './check-definitions';

/**
 * ContractRing — the homepage's one anchor: the contract drawn as an instrument.
 *
 * Every tick is one check from the registry (CHECKS), in registry order, grouped
 * by category with a gap between categories, so the ring shows the contract's
 * real anatomy: cadence's twelve checks make the longest arc, and the three
 * checks that need a person (type: 'manual') are drawn hollow. It is the same
 * ring the share card and the score loop use, so the site, the cards, and the
 * video read as one system.
 *
 * The centre quotes the self-score with its measurement date. It is a dated
 * fact from the leaderboard seed, not a live reading, and the markup says so.
 *
 * Motion (the page's one cinematic moment): on load the activation needle
 * sweeps once and each tick lights as it passes, then everything rests. CSS
 * only, transform and opacity only; under reduced motion the ring is simply
 * lit and still. Server-rendered SVG: no image request, not an LCP candidate,
 * no layout shift (the box is sized in CSS).
 */
const SIZE = 400;
const C = SIZE / 2;
const R_IN = 148;
const R_OUT = 182;
const GAP_DEG = 4.2;
const SWEEP_S = 1.6;
const SWEEP_DELAY_S = 0.35;

type Tick = { id: string; category: string; manual: boolean; angle: number };

function layout(): { ticks: Tick[]; arcs: { category: string; from: number; to: number }[] } {
  const order: string[] = [];
  for (const c of CHECKS) if (!order.includes(c.category)) order.push(c.category);
  const grouped = order.map((cat) => CHECKS.filter((c) => c.category === cat));
  const step = (360 - order.length * GAP_DEG) / CHECKS.length;
  const ticks: Tick[] = [];
  const arcs: { category: string; from: number; to: number }[] = [];
  let a = GAP_DEG / 2;
  grouped.forEach((group, gi) => {
    const from = a;
    for (const c of group) {
      ticks.push({ id: c.id, category: order[gi], manual: c.type === 'manual', angle: a + step / 2 });
      a += step;
    }
    arcs.push({ category: order[gi], from, to: a });
    a += GAP_DEG;
  });
  return { ticks, arcs };
}

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function arcPath(r: number, from: number, to: number) {
  const s = polar(r, from);
  const e = polar(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export function ContractRing({
  grade,
  score,
  measured,
}: {
  grade: string;
  score: number;
  measured: string;
}) {
  const { ticks, arcs } = layout();
  const categories = arcs.length;
  const manual = ticks.filter((t) => t.manual).length;
  return (
    <figure className="contract-ring">
      <svg
        className="contract-ring-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`The contract as a ring: ${ticks.length} checks in ${categories} categories, ${manual} of them checked by a person. Self-score ${score}% grade ${grade}, measured ${measured}.`}
      >
        <circle className="contract-ring-orbit" cx={C} cy={C} r={R_IN - 16} />
        {arcs.map((arc) => (
          <path key={arc.category} className="contract-ring-arc" d={arcPath(R_OUT + 12, arc.from + 0.4, arc.to - 0.4)} />
        ))}
        {ticks.map((t) => {
          const p = polar((R_IN + R_OUT) / 2, t.angle);
          return (
            <rect
              key={t.id}
              className={`contract-ring-tick${t.manual ? ' is-manual' : ''}`}
              x={p.x - 3}
              y={p.y - (R_OUT - R_IN) / 2}
              width={6}
              height={R_OUT - R_IN}
              rx={3}
              transform={`rotate(${t.angle.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
              style={{ animationDelay: `${(SWEEP_DELAY_S + (t.angle / 360) * SWEEP_S).toFixed(3)}s` }}
            />
          );
        })}
        <g className="contract-ring-needle">
          <line x1={C} y1={C - R_IN + 22} x2={C} y2={C - R_OUT - 22} />
          <circle cx={C} cy={C - R_OUT - 22} r={4} />
        </g>
        <text className="contract-ring-grade" x={C} y={C + 30} textAnchor="middle">
          {grade}
        </text>
        <text className="contract-ring-score" x={C} y={C + 68} textAnchor="middle">
          {score}% self-score
        </text>
      </svg>
      <figcaption className="contract-ring-caption">
        <span>
          <b>{ticks.length}</b> checks in <b>{categories}</b> categories. Hollow ticks are the {manual} a
          person runs.
        </span>
        <span className="contract-ring-measured">Measured {measured}, rescored weekly</span>
      </figcaption>
    </figure>
  );
}
