import type { CSSProperties } from 'react';
import { CHECKS, CATEGORY_WEIGHTS } from './check-definitions';
import { logLabel } from './check-labels';

/**
 * VerifyConsole — the homepage's one instrument: the engine verifying this
 * site, drawn natively from the check registry.
 *
 * WHAT IT SHOWS, AND WHY IT IS TRUE
 * Every cell is one check from CHECKS, grouped into one row per category, so
 * the rows are the contract's real anatomy (cadence's twelve checks make the
 * longest row). The statuses are the self-score's: the leaderboard seed records
 * pass/warn/fail counts for designesy.org, and when those counts reconcile with
 * the registry (every automated check passed, nothing warned or failed) each
 * automated cell resolves to pass and each manual one to "by a person". If they
 * ever stop reconciling, the cells resolve to a neutral "ran" state instead of
 * inventing which check did what, and the verdict still quotes the seed.
 *
 * HOW IT MOVES: ONE SCHEDULE, COMPOSITOR-ONLY
 * A single schedule (SCHEDULE below) places every event on one loop of LOOP_S
 * seconds: check k starts at at(k) and resolves a third of a step later; the
 * verdict lands; everything holds; then the stage fades and resets. Every
 * moving part gets @keyframes generated from that schedule, all with the same
 * duration and the same delay, so the parts cannot drift, and every keyframe
 * set ends where it begins (anything that jumps at the wrap is at opacity 0
 * when it does), so the loop is exact by construction.
 *
 * Only transform and opacity animate, so the browser runs all of it on the
 * compositor. (The first build drove everything from three registered custom
 * properties animated on the root. It was elegant and it cost ~400 ms of style
 * recalculation per frame at 4x CPU throttle: every descendant re-matched the
 * site stylesheet on every frame. Measured, then replaced.) Counters are digit
 * strips moved by translateY in steps, not CSS counters.
 *
 * AT REST
 * Every element's static style is its hold state: cells lit, verdict shown,
 * the log at its last lines, the counters at their totals. Reduced motion
 * removes the animations and that state is what renders. The negative delay
 * starts the loop inside the hold, so first paint (and every screenshot,
 * preview, and crawler) shows the complete verdict, not an empty grid. The
 * one exception is the verdict light (.vc-glow): coloured light means a state,
 * so its static style is off and reduced motion shows the verdict unlit.
 */

type Status = 'pass' | 'warn' | 'fail' | 'manual' | 'ran';

const LOOP_S = 12; // the site's master period; every other loop divides it
const PH = {
  fadeIn: 0.035,
  runStart: 0.07,
  runEnd: 0.58,
  verdictIn: 0.615,
  holdEnd: 0.885,
  fadeOut: 0.955,
};
const START_AT = 0.63; // first paint lands at the start of the hold: the verdict is on screen
const RESOLVE_AT = 0.34; // a cell resolves a third of the way through its step
const GLOW_IN_S = 0.15; // the verdict light's entry, seconds (material law: 150 ms, under the 200 ms reduced-motion allowance)
const GLOW_HOLD_S = 1.2; // it holds while the result is news (material law 3)
const GLOW_OUT_S = 0.6; // then decays to the rest floor, long before the verdict leaves
const LOG_ROWS = 5;
const LOG_LH = 1.45; // rem, one log line
const DIGIT_LH = 1.25; // em, one counter digit line

const EASE_OUT = 'cubic-bezier(.23,1,.32,1)';
const EASE_IN_OUT = 'cubic-bezier(.77,0,.175,1)';

/** Loop timing, shared with anything on the page that moves on the same clock. */
export const VC_TIMING = {
  '--vc-loop': `${LOOP_S}s`,
  '--vc-delay': `${-(START_AT * LOOP_S).toFixed(3)}s`,
} as CSSProperties;

const pc = (x: number) => `${(Math.min(1, Math.max(0, x)) * 100).toFixed(3)}%`;

type Cell = { id: string; item: string; category: string; status: Status; k: number };
type Row = { category: string; cells: Cell[]; kLast: number };

function layout(pass: number, warn: number, fail: number) {
  const auto = CHECKS.filter((c) => c.type === 'auto').length;
  const reconciled = pass === auto && warn === 0 && fail === 0;
  const cats: string[] = [];
  for (const c of CHECKS) if (!cats.includes(c.category)) cats.push(c.category);
  const grouped = cats
    .map((category) => ({ category, checks: CHECKS.filter((c) => c.category === category) }))
    .sort(
      (a, b) =>
        b.checks.length - a.checks.length ||
        (CATEGORY_WEIGHTS[b.category] ?? 0) - (CATEGORY_WEIGHTS[a.category] ?? 0)
    );
  let k = 0;
  const rows: Row[] = grouped.map(({ category, checks }) => {
    const cells = checks.map((c) => ({
      id: c.id,
      item: c.item,
      category,
      status: (c.type === 'manual' ? 'manual' : reconciled ? 'pass' : 'ran') as Status,
      k: k++,
    }));
    return { category, cells, kLast: cells[cells.length - 1].k };
  });
  return { rows, cells: rows.flatMap((r) => r.cells), reconciled };
}

type Tally = Record<'np' | 'nw' | 'nf' | 'nm' | 'nr', number>;
const TALLY_KEY: Record<Status, keyof Tally> = { pass: 'np', warn: 'nw', fail: 'nf', manual: 'nm', ran: 'nr' };

/** Everything that moves, as generated CSS. */
function choreography(rows: Row[], cells: Cell[]) {
  const n = cells.length;
  const step = (PH.runEnd - PH.runStart) / n; // one check, as a fraction of the loop
  const at = (x: number) => PH.runStart + x * step;
  const css: string[] = [];

  // Cells: each pops lit as it resolves (a small overshoot is the "scan
  // head": no separate element), holds, and fades with the stage.
  for (const c of cells) {
    const a = at(c.k);
    const b = at(c.k + RESOLVE_AT);
    css.push(
      `@keyframes vcf${c.k}{0%,${pc(a)}{opacity:0;transform:scale(.5);animation-timing-function:${EASE_OUT}}` +
        `${pc(b)}{opacity:1;transform:scale(1.14);animation-timing-function:${EASE_OUT}}` +
        `${pc(b + step * 0.9)},${pc(PH.holdEnd)}{opacity:1;transform:none}${pc(PH.fadeOut)}{opacity:0;transform:none}` +
        `100%{opacity:0;transform:scale(.5)}}`
    );
  }

  // The log: one list, one animation. It starts with LOG_ROWS blank lines in
  // the window and moves up one line per resolved check, so each check line
  // rises in at the bottom as its cell lights. The container fades with the
  // stage (vc-gate), which hides the jump back to the top at the wrap.
  const logY = (lines: number) => `translateY(-${(lines * LOG_LH).toFixed(3)}rem)`;
  const scroll: string[] = [`0%{transform:${logY(0)}}`];
  for (const c of cells) {
    const b = at(c.k + RESOLVE_AT);
    scroll.push(`${pc(b)}{transform:${logY(c.k)};animation-timing-function:${EASE_OUT}}`);
    scroll.push(`${pc(b + step * 0.6)}{transform:${logY(c.k + 1)}}`);
  }
  scroll.push(`${pc(PH.runEnd)}{transform:${logY(n)};animation-timing-function:${EASE_OUT}}`);
  scroll.push(`${pc(PH.verdictIn)},100%{transform:${logY(n + 1)}}`);
  css.push(`@keyframes vc-log{${scroll.join('')}}`);

  // Counters: digit strips moved in steps. Values change on the frame their
  // cell starts (check n of N) or resolves (the tally).
  const strip = (name: string, events: [number, number][]) => {
    const y = (v: number) => `translateY(-${(v * DIGIT_LH).toFixed(3)}em)`;
    const stops = [`0%{transform:${y(0)}}`, ...events.map(([x, v]) => `${pc(x)}{transform:${y(v)}}`)];
    stops.push(`100%{transform:${y(events.length ? events[events.length - 1][1] : 0)}}`);
    css.push(`@keyframes ${name}{${stops.join('')}}`);
  };
  strip('vcn-c', cells.map((c) => [at(c.k), c.k + 1]));
  const tally: Tally = { np: 0, nw: 0, nf: 0, nm: 0, nr: 0 };
  const tallyEvents: Record<keyof Tally, [number, number][]> = { np: [], nw: [], nf: [], nm: [], nr: [] };
  for (const c of cells) {
    const key = TALLY_KEY[c.status];
    tally[key] += 1;
    tallyEvents[key].push([at(c.k + RESOLVE_AT), tally[key]]);
  }
  (Object.keys(tallyEvents) as (keyof Tally)[]).forEach((key) => strip(`vcn-${key}`, tallyEvents[key]));

  // Rows: the count rolls up to a tick when the row's last check resolves, and
  // rolls back down during the reset.
  rows.forEach((r, i) => {
    const done = at(r.kLast + RESOLVE_AT) + step * 0.3;
    css.push(
      `@keyframes vcr${i}{0%,${pc(done)}{transform:none;animation-timing-function:${EASE_OUT}}` +
        `${pc(done + step * 1.5)},${pc(PH.holdEnd)}{transform:translateY(-${DIGIT_LH}em);animation-timing-function:${EASE_IN_OUT}}` +
        `${pc(PH.fadeOut)},100%{transform:none}}`
    );
  });

  // Panels: running while checks run, the verdict after; the stage gate.
  css.push(
    `@keyframes vc-run{0%{opacity:0}${pc(PH.fadeIn)},${pc(PH.runEnd)}{opacity:1}${pc(PH.verdictIn)},100%{opacity:0}}`,
    `@keyframes vc-verdict{0%,${pc(PH.runEnd)}{opacity:0;transform:translateY(.5rem);animation-timing-function:${EASE_OUT}}` +
      `${pc(PH.verdictIn)},${pc(PH.holdEnd)}{opacity:1;transform:none}${pc(PH.fadeOut)},100%{opacity:0;transform:none}}`,
    `@keyframes vc-gate{0%{opacity:0}${pc(PH.fadeIn)},${pc(PH.holdEnd)}{opacity:1}${pc(PH.fadeOut)},100%{opacity:0}}`,
    `@keyframes vc-meter{0%,${pc(PH.runStart)}{transform:scaleX(0)}${pc(PH.runEnd)},100%{transform:scaleX(1)}}`
  );

  // The hero's "provable" underline: drawn as the verdict lands, withdrawn
  // with it.
  css.push(
    `@keyframes vc-underline{0%,${pc(PH.runEnd)}{transform:translateX(-101%);animation-timing-function:${EASE_OUT}}` +
      `${pc(PH.verdictIn + 0.02)},${pc(PH.holdEnd)}{transform:none;animation-timing-function:${EASE_IN_OUT}}` +
      `${pc(PH.fadeOut)},100%{transform:translateX(101%)}}`
  );

  // The verdict light under the window (.vc-glow): it reaches full on the
  // frame the verdict does, so the claim's underline, the verdict and the
  // light land on one beat. Then it behaves as news, not decoration: 1.2 s
  // of hold and a 600 ms decay, and the verdict stays on screen unlit for
  // the rest of the hold. Opacity of a pre-rendered shadow layer only; the
  // shadow itself never animates.
  const glowHold = PH.verdictIn + GLOW_HOLD_S / LOOP_S;
  css.push(
    `@keyframes vc-glow{0%,${pc(PH.verdictIn - GLOW_IN_S / LOOP_S)}{opacity:0;animation-timing-function:${EASE_OUT}}` +
      `${pc(PH.verdictIn)},${pc(glowHold)}{opacity:1;animation-timing-function:${EASE_IN_OUT}}` +
      `${pc(glowHold + GLOW_OUT_S / LOOP_S)},100%{opacity:0}}`
  );

  return { css: css.join('\n'), tally, logEnd: logY(n + 1) };
}

const STATUS_LABEL: Record<Status, string> = {
  pass: 'Pass',
  warn: 'Warn',
  fail: 'Fail',
  manual: 'Person',
  ran: 'Ran',
};

/** A number that rolls: a strip of every value it takes, one line showing. */
function Digits({ name, max, value }: { name: string; max: number; value: number }) {
  return (
    <span className="vc-num">
      <span
        className="vc-num-strip"
        style={{ '--vc-na': `vcn-${name}`, transform: `translateY(-${(value * DIGIT_LH).toFixed(3)}em)` } as CSSProperties}
      >
        {Array.from({ length: max + 1 }, (_, i) => (
          <span key={i}>{i}</span>
        ))}
      </span>
    </span>
  );
}

export function VerifyConsole({
  host,
  score,
  grade,
  measured,
  contract,
  pass,
  warn,
  fail,
}: {
  host: string;
  score: number;
  grade: string;
  measured: string;
  contract: string;
  pass: number;
  warn: number;
  fail: number;
}) {
  const { rows, cells, reconciled } = layout(pass, warn, fail);
  const n = cells.length;
  const { css, tally, logEnd } = choreography(rows, cells);
  const scoreText = Number.isInteger(score) ? String(score) : score.toFixed(1);
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const windowVars = {
    ...VC_TIMING,
    '--vc-cols': cols,
    '--vc-log-rows': LOG_ROWS,
    '--vc-lh': `${LOG_LH}rem`,
    '--vc-dlh': `${DIGIT_LH}em`,
  } as CSSProperties;

  const summary = reconciled
    ? `${host} verified against contract ${contract}: all ${tally.np} automated checks pass and ${tally.nm} checks are run by a person. Score ${scoreText}%, grade ${grade}, measured ${measured}.`
    : `${host} verified against contract ${contract}: ${pass} pass, ${warn} warn, ${fail} fail. Score ${scoreText}%, grade ${grade}, measured ${measured}.`;

  const tallies: { key: keyof Tally; label: string; cls: string }[] = reconciled
    ? [
        { key: 'np', label: 'pass', cls: 'is-pass' },
        { key: 'nm', label: 'by a person', cls: 'is-manual' },
        { key: 'nw', label: 'warn', cls: 'is-warn' },
        { key: 'nf', label: 'fail', cls: 'is-fail' },
      ]
    : [{ key: 'nr', label: 'ran', cls: 'is-ran' }];

  return (
    <figure className="vc" data-reconciled={reconciled ? 'yes' : 'no'}>
      <style>{css}</style>
      <div className="vc-window" style={windowVars} role="img" aria-label={summary}>
        <span className="vc-glow" aria-hidden="true" />
        <div className="vc-bar" aria-hidden="true">
          <span className="vc-bar-app">
            <span className="vc-bar-mark">
              <i />
            </span>
            Verify
          </span>
          <span className="vc-bar-url">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.6" />
              <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
            </svg>
            {host}
          </span>
          <span className="vc-bar-contract">
            <span className="vc-live" />
            Contract {contract}
          </span>
        </div>

        <div className="vc-body" aria-hidden="true">
          <div className="vc-grid">
            <div className="vc-grid-head">
              <span>Category</span>
              <span>{n} checks</span>
            </div>
            <ol className="vc-rows">
              {rows.map((row, i) => (
                <li className="vc-row" key={row.category}>
                  <span className="vc-row-label">{row.category}</span>
                  <span className="vc-row-cells">
                    {row.cells.map((c) => (
                      <span
                        key={c.id}
                        className={`vc-cell is-${c.status}`}
                        style={{ '--vc-fa': `vcf${c.k}` } as CSSProperties}
                      />
                    ))}
                  </span>
                  <span className="vc-row-count">
                    <span className="vc-row-strip" style={{ '--vc-ra': `vcr${i}` } as CSSProperties}>
                      <span className="vc-row-n">{row.cells.length}</span>
                      <svg
                        className="vc-row-done"
                        viewBox="0 0 12 12"
                        width="10"
                        height="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2.5 6.3l2.3 2.3 4.7-5" />
                      </svg>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="vc-side">
            <div className="vc-state">
              <div className="vc-running">
                <span className="vc-label">Running</span>
                <span className="vc-progress">
                  Check <Digits name="c" max={n} value={n} /> of {n}
                </span>
                <span className="vc-meter">
                  <i />
                </span>
              </div>
              <div className="vc-verdict">
                <span className="vc-label">Verdict</span>
                <span className="vc-verdict-row">
                  <span className="vc-grade">{grade}</span>
                  <span className="vc-score">
                    {scoreText}
                    <small>%</small>
                  </span>
                </span>
              </div>
            </div>

            <ul className="vc-tally">
              {tallies.map((t) => (
                <li key={t.key}>
                  <i className={t.cls} />
                  <Digits name={t.key} max={Math.max(1, tally[t.key])} value={tally[t.key]} /> {t.label}
                </li>
              ))}
            </ul>

            <div className="vc-log">
              <ol className="vc-log-list" style={{ transform: logEnd }}>
                {Array.from({ length: LOG_ROWS }, (_, i) => (
                  <li className="vc-log-line is-blank" key={`blank-${i}`} />
                ))}
                {cells.map((c) => (
                  <li className={`vc-log-line is-${c.status}`} key={c.id}>
                    <span className="vc-log-id">{c.id}</span>
                    <span className="vc-log-item">{logLabel(c)}</span>
                    <span className="vc-log-status">{STATUS_LABEL[c.status]}</span>
                  </li>
                ))}
                <li className="vc-log-line is-verdict">
                  <span className="vc-log-id">end</span>
                  <span className="vc-log-item">
                    Grade {grade}, {scoreText}%
                  </span>
                  <span className="vc-log-status">Done</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="vc-caption">
        <span>
          This site, scored by its own engine against contract {contract}: {scoreText}%, grade {grade}.
        </span>
        <span className="vc-caption-meta">Measured {measured}, rescored weekly</span>
      </figcaption>
    </figure>
  );
}
