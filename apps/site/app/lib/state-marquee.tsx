'use client';

import { useEffect, useRef } from 'react';
import type { Ref } from 'react';
import Link from 'next/link';
import { initScrollPause } from './scroll-pause';

const SIGNALS = [
  { t: 'v0.4.0 · LIVE', c: 'live', href: '/contracts/design-system' },
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

const ITEMS = [...SIGNALS, ...SIGNALS];

/**
 * System Signals vertical marquee — auto-scrolls, pauses on hover,
 * and lets the user manually scroll while hovered. Each pill is a
 * real link to the surface it signals, so the ticker doubles as a
 * quick-jump index. The duplicate loop copy is aria-hidden and
 * tabIndex -1 (same pattern as the footer dock).
 */
export function StateMarquee() {
  const clipRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const clip = clipRef.current;
    if (clip && trackRef.current) {
      return initScrollPause(clip, trackRef.current, 'vertical', 'state-marquee--dragging');
    }
  }, []);

  return (
    <aside
      className="state-marquee"
      ref={clipRef as Ref<HTMLElement>}
    >
      <span className="state-marquee-header">System signals</span>
      <div className="state-marquee-track" ref={trackRef}>
        {ITEMS.map((item, i) => (
          <Link
            href={item.href}
            key={i}
            className={`state-marquee-pill state-marquee-pill--${item.c}`}
            aria-hidden={i >= SIGNALS.length ? true : undefined}
            tabIndex={i >= SIGNALS.length ? -1 : undefined}
          >
            {item.t}
          </Link>
        ))}
      </div>
    </aside>
  );
}
