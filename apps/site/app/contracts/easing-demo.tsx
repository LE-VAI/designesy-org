'use client';

import { useRef, useState } from 'react';

const CURVES = [
  { ease: 'default', token: '--ease' },
  { ease: 'out', token: '--ease-out' },
  { ease: 'in-out', token: '--ease-in-out' },
  { ease: 'drawer', token: '--ease-drawer' },
] as const;

/**
 * Four dots, four timing functions, same distance.
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
 * count never reaches CURVES.length, and the button stays stuck on "Playing".
 * Measured 2026-10-02: the demo could be played exactly once per page load.
 * A ref mutates synchronously, so the fourth event genuinely sees 4.
 */
export function EasingDemo() {
  const [playing, setPlaying] = useState(false);
  const ended = useRef(0);

  return (
    <div
      className="demo-easing"
      data-playing={playing ? 'true' : undefined}
      onAnimationEnd={() => {
        if (!playing) return;
        ended.current += 1;
        if (ended.current >= CURVES.length) {
          ended.current = 0;
          setPlaying(false);
        }
      }}
    >
      {CURVES.map((c) => (
        <div className="demo-easing-row" data-ease={c.ease} key={c.ease}>
          <span>{c.token}</span>
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
