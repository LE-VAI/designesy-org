'use client';

import { useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import Link from 'next/link';
import { initScrollPause } from './scroll-pause';
import { CONTRACT_VERSION } from '../lib/design-system-contract';

const SIGNALS = [
  { t: CONTRACT_VERSION + ' · LIVE', c: 'live', href: '/contracts/design-system' },
  { t: 'Poise ✓ adopted', c: 'adopted', href: '/labs/poise' },
  { t: 'Takt ✓ adopted', c: 'adopted', href: '/labs/takt' },
  { t: 'Cadence ✓ adopted', c: 'adopted', href: '/labs/cadence' },
  { t: 'Review ✓ pass', c: 'adopted', href: '/review' },
  { t: 'Keyboard ✓ verified', c: 'adopted', href: '/review/keyboard' },
  { t: 'Drift rule active', c: 'live', href: '/drift' },
  { t: 'SKILL.md published', c: 'live', href: '/contracts/skill' },
  { t: 'open.json · machine feed', c: 'info', href: '/open.json' },
  { t: 'llms.txt · agent brief', c: 'info', href: '/llms.txt' },
  { t: 'Cuelume · sound on', c: 'info', href: '/labs/acoustics' },
  { t: 'reduced-motion safe', c: 'info', href: '/contracts/motion' },
];

/**
 * System Signals vertical marquee — auto-scrolls, pauses on hover,
 * and lets the user manually scroll while hovered. Each pill is a
 * real link to the surface it signals, so the ticker doubles as a
 * quick-jump index. The duplicate loop copy is aria-hidden and
 * tabIndex -1 (same pattern as the footer dock).
 *
 * WCAG 2.2.2 (Pause, Stop, Hide): a pause/play toggle button is
 * provided so users can stop the animation independently of hover.
 *
 * EXACT LOOP. The track holds two identical groups, each carrying its own
 * trailing gap, and nothing else: so half the track's height is exactly one
 * period, and translateY(-50%) lands the second group where the first began.
 * (The old single list had the track's top and bottom padding inside that
 * 50%, so every wrap jumped by about 20px.) initScrollPause reads the same
 * half-height as its loop distance.
 */
export function StateMarquee() {
  const clipRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const clip = clipRef.current;
    if (clip && trackRef.current) {
      return initScrollPause(clip, trackRef.current, 'vertical', 'state-marquee--dragging');
    }
  }, []);

  return (
    <aside
      className={`state-marquee${paused ? ' state-marquee--user-paused' : ''}`}
      ref={clipRef as Ref<HTMLElement>}
    >
      <span className="state-marquee-header">System status</span>
      <button
        className="state-marquee-toggle"
        aria-pressed={paused}
        aria-label={paused ? 'Resume system status' : 'Pause system status'}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      <div className="state-marquee-track" ref={trackRef}>
        {[0, 1].map((copy) => (
          <div className="state-marquee-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
            {SIGNALS.map((item) => (
              <Link
                href={item.href}
                key={item.t}
                className={`state-marquee-pill state-marquee-pill--${item.c}`}
                tabIndex={copy === 1 ? -1 : undefined}
              >
                {item.t}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
