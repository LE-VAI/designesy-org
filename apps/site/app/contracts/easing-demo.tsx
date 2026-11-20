'use client';

import { useRef, useState } from 'react';

/** One timing function: its row's data-ease name (contracts.css maps it to
    the token), the token, and the four cubic-bezier numbers the contract
    publishes for it. The page reads the numbers from the contract module and
    passes them in, so this client file does not import the contract. */
export type EasingCurve = {
  ease: 'default' | 'out' | 'in-out' | 'drawer';
  token: string;
  bezier: readonly [number, number, number, number];
};

/* The plot: a 24-unit box with a 20-unit field inset by 2, time left to
   right and progress bottom to top, so the curve runs from the bottom left
   corner to the top right. */
const FIELD = 20;
const INSET = 2;
const round = (n: number) => Math.round(n * 100) / 100;
function plotPath([x1, y1, x2, y2]: EasingCurve['bezier']) {
  const x = (t: number) => round(INSET + FIELD * t);
  const y = (v: number) => round(INSET + FIELD * (1 - v));
  return `M${x(0)} ${y(0)} C${x(x1)} ${y(y1)} ${x(x2)} ${y(y2)} ${x(1)} ${y(1)}`;
}

/**
 * Four dots, four timing functions, same distance.
 *
 * Beside each token its curve is drawn from the contract's own numbers. The
 * plot is still, so the shape of each curve is on the page before any dot
 * moves, and stays there when motion is paused or reduced.
 *
 * With motion allowed the dots loop and the Play button stays hidden. Under
 * prefers-reduced-motion: reduce they hold still, because a dot travelling
 * across its track is exactly the movement reduce stops (tiered policy,
 * 2026-10-01: movement stops, fades and short transitions stay). This demo's
 * content IS the motion, so instead of deleting it the button runs each curve
 * once, on request, and the dots come back to rest.
 *
 * The completion count lives in a ref, not state. All four dots end in the
 * same tick, so four `animationend` events arrive in one React batch — four
 * handlers reading `ended` from the same render all see the same value, the
 * count never reaches curves.length, and the button stays stuck on "Playing".
 * Measured 2026-10-02: the demo could be played exactly once per page load.
 * A ref mutates synchronously, so the fourth event genuinely sees 4.
 */
export function EasingDemo({ curves }: { curves: readonly EasingCurve[] }) {
  const [playing, setPlaying] = useState(false);
  const ended = useRef(0);

  return (
    <div
      className="demo-easing"
      data-playing={playing ? 'true' : undefined}
      onAnimationEnd={() => {
        if (!playing) return;
        ended.current += 1;
        if (ended.current >= curves.length) {
          ended.current = 0;
          setPlaying(false);
        }
      }}
    >
      {curves.map((c) => (
        <div className="demo-easing-row" data-ease={c.ease} key={c.ease}>
          <span>{c.token}</span>
          <svg
            className="demo-easing-plot"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            aria-hidden="true"
            focusable="false"
          >
            <path className="demo-easing-axis" d="M2 2V22H22" />
            <path className="demo-easing-curve" d={plotPath(c.bezier)} />
          </svg>
          <div className="demo-easing-track">
            <div className="demo-easing-dot" />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="demo-easing-play"
        onClick={() => {
          if (playing) return;
          ended.current = 0;
          setPlaying(true);
        }}
        // aria-disabled, not disabled: disabling the focused button would drop
        // keyboard focus to <body> mid-demo.
        aria-disabled={playing}
      >
        {playing ? 'Playing' : 'Play the curves once'}
      </button>
    </div>
  );
}
