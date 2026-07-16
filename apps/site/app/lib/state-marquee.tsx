'use client';

import { useEffect, useRef } from 'react';
import type { Ref } from 'react';
import { initScrollPause } from './scroll-pause';

const SIGNALS = [
  { t: 'v0.3.0 · LIVE', c: 'live' },
  { t: 'Poise ✓ adopted', c: 'adopted' },
  { t: 'Takt ✓ adopted', c: 'adopted' },
  { t: 'Cadence ✓ adopted', c: 'adopted' },
  { t: 'Review ✓ pass', c: 'adopted' },
  { t: 'Keyboard ✓ verified', c: 'adopted' },
  { t: 'Drift rule active', c: 'live' },
  { t: 'SKILL.md published', c: 'live' },
  { t: 'open.json · machine feed', c: 'info' },
  { t: 'llms.txt · agent brief', c: 'info' },
  { t: 'Cuelume · sound on', c: 'info' },
  { t: 'reduced-motion safe', c: 'info' },
];

const ITEMS = [...SIGNALS, ...SIGNALS];

/**
 * System Signals vertical marquee — auto-scrolls, pauses on hover,
 * and lets the user manually scroll while hovered.
 */
export function StateMarquee() {
  const clipRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const clip = clipRef.current;
    if (clip && trackRef.current) {
      return initScrollPause(clip, trackRef.current, 'vertical');
    }
  }, []);

  return (
    <aside
      className="state-marquee"
      aria-hidden="true"
      ref={clipRef as Ref<HTMLElement>}
    >
      <span className="state-marquee-header">System signals</span>
      <div className="state-marquee-track" ref={trackRef}>
        {ITEMS.map((item, i) => (
          <span className={`state-marquee-pill state-marquee-pill--${item.c}`} key={i}>
            {item.t}
          </span>
        ))}
      </div>
    </aside>
  );
}