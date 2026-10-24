import type { CSSProperties } from 'react';
import { BATCH_CATEGORY_SCORES, BATCH_RUN_DATE } from './leaderboard/batch-data';
import { LEADERBOARD_ENGINE_VERSION } from './leaderboard/seed';
import { CATEGORY_LABELS, CATEGORY_ORDER, SELF_URL } from './lib/data/cohort';
import { CHECKS } from './lib/check-definitions';

/*
  This site, by category: one cell meter per category the engine scored
  designesy.org on, read from the self row's batch record (batch-data.ts,
  written by a hand-run re-score from the live /api/score engine).

  It replaces a rack titled "Contract health" whose eight readings (Type 95,
  Motion 90, A11y 88 ...) were typed into the source when the panel was drawn
  and never measured: no method, no date, and an accessibility reading the
  engine contradicted. Every value here is the engine's own category score, and
  the panel names the run it came from.

  Each meter is twenty cells, five points a cell, so a reading is counted
  rather than estimated: 95.8 lights nineteen cells and shows the twentieth at
  16% (the 0.8 points left over).

  Motion: where the browser has scroll-driven animation, each meter fills cell
  by cell as the rack scrolls in, and every meter is full by the time the rack
  is wholly on screen (home-lvl.css). Under reduced motion, with motion paused
  on the site, and where scroll timelines are missing, the meters are simply
  full: the reading never depends on the animation or on how far a reader has
  scrolled.

  Pure markup and CSS (home-lvl.css). No JS.
*/

export type HealthDim = { key: string; label: string; v: number };

const SELF_CATEGORIES = BATCH_CATEGORY_SCORES[SELF_URL] ?? {};
const label = (k: string) => CATEGORY_LABELS[k] ?? k;
const allManual = (k: string) => {
  const checks = CHECKS.filter((c) => c.category === k);
  return checks.length > 0 && checks.every((c) => c.type === 'manual');
};

/** The categories the batch scored for designesy.org, heaviest first. */
export const SELF_CATEGORY_DIMS: HealthDim[] = CATEGORY_ORDER.filter(
  (k) => typeof SELF_CATEGORIES[k]?.score === 'number',
).map((k) => ({ key: k, label: label(k), v: SELF_CATEGORIES[k].score as number }));

/** Categories recorded with no score because every check in them needs a browser. */
export const SELF_BROWSER_ONLY = CATEGORY_ORDER.filter(
  (k) => k in SELF_CATEGORIES && SELF_CATEGORIES[k].score === null && allManual(k),
).map(label);

/** Categories the engine scores that the batch does not record per category. */
export const SELF_NOT_RECORDED = CATEGORY_ORDER.filter((k) => !(k in SELF_CATEGORIES)).map(label);

export const SELF_CATEGORY_DATE = BATCH_RUN_DATE;
export const SELF_CATEGORY_ENGINE = LEADERBOARD_ENGINE_VERSION;

/** One decimal where the engine gives one, as the score pages print scores. */
export const fmtCategory = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const CELLS = 20;
const POINTS_PER_CELL = 100 / CELLS;

export function ContractHealthRack() {
  return (
    <ol className="hm" aria-label={`designesy.org by category, out of 100, batch run of ${SELF_CATEGORY_DATE}`}>
      {SELF_CATEGORY_DIMS.map((d, i) => {
        const points = Math.max(0, Math.min(100, d.v));
        const full = Math.floor(points / POINTS_PER_CELL);
        const part = (points - full * POINTS_PER_CELL) / POINTS_PER_CELL;
        const lit = Math.min(CELLS, full + (part > 0 ? 1 : 0));
        return (
          <li
            className="hm-row"
            key={d.key}
            style={
              {
                '--hm-i': i,
                '--hm-lit': lit,
                '--hm-full': full,
                '--hm-part': Math.round(part * 100) / 100,
              } as CSSProperties
            }
          >
            <span className="hm-label">{d.label}</span>
            <span className="hm-meter" role="img" aria-label={`${d.label}: ${fmtCategory(d.v)} out of 100`}>
              <span className="hm-lit">
                <span className="hm-fill" />
              </span>
            </span>
            <span className="hm-value" data-tabular>
              {fmtCategory(d.v)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
