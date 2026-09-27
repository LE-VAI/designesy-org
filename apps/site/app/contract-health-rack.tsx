import type { CSSProperties } from 'react';

/*
  Contract health rack: one cell meter per design review dimension.

  Each meter is twenty cells, five points a cell, so a reading is counted
  rather than estimated: 95 lights nineteen cells; 92 lights eighteen and
  shows the nineteenth at 40% (the two points left over). It is the same cell
  language as the homepage console, which replaced a rack of eight circular
  gauges: the page had become a page of rings.

  Motion: where the browser has scroll-driven animation, each meter fills cell
  by cell as the rack scrolls into view (steps snap to cell edges; rows follow
  one another). Everywhere else, and under reduced motion, the meters are
  simply full: the reading never depends on the animation.

  Pure markup and CSS (home-lvl.css). No JS.
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

const CELLS = 20;
const POINTS_PER_CELL = 100 / CELLS;

export function ContractHealthRack() {
  return (
    <ol className="hm" aria-label="Contract health by dimension, out of 100">
      {CONTRACT_HEALTH_DIMS.map((d, i) => {
        const points = pct(d.v);
        const full = Math.floor(points / POINTS_PER_CELL);
        const part = (points % POINTS_PER_CELL) / POINTS_PER_CELL;
        const lit = Math.min(CELLS, full + (part > 0 ? 1 : 0));
        return (
          <li
            className="hm-row"
            key={d.label}
            style={
              {
                '--hm-i': i,
                '--hm-lit': lit,
                '--hm-full': full,
                '--hm-part': part,
              } as CSSProperties
            }
          >
            <span className="hm-label">{d.label}</span>
            <span className="hm-meter" role="img" aria-label={`${d.label}: ${points} out of 100`}>
              <span className="hm-lit">
                <span className="hm-fill" />
              </span>
            </span>
            <span className="hm-value" data-tabular>
              {points}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
