'use client';

// CountUp — animates a number from 0 to its target value when it scrolls
// into view. Used for the homepage hero proof numbers, leaderboard stats,
// work case studies, contract pages, and score page integers.
//
// Accessibility: respects prefers-reduced-motion (jumps to final value).
// The count-up is decorative — the final value is in the DOM at first paint
// via SSR, then reset to 0 by useLayoutEffect before the browser paints,
// so the user only sees 0 → count-up → final value (no flash of SSR value).
//
// iOS Safari notes:
// - useLayoutEffect (via useIsoLayoutEffect) resets to 0 synchronously before
//   paint on the client. SSR renders the final value for SEO/no-JS.
// - IntersectionObserver threshold 0.1 (not 0.5) — iOS dynamic toolbars can
//   cause the viewport height to shift, and 0.5 may never be reached for tall
//   elements. 0.1 fires as soon as a sliver is visible.
// - If the element is already in viewport on mount, start immediately without
//   the 300ms delay (the delay is only for scroll-triggered entrances where
//   a fade-up CSS animation needs to finish first).
// - rootMargin: '0px 0px -10% 0px' — small bottom margin so the observer
//   fires slightly before the element is fully in view, reducing the chance
//   the user sees a 0 that's about to animate.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// useLayoutEffect during SSR is a no-op (warnings suppressed by checking
// typeof window). On the client it runs synchronously before paint.
const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type CountUpProps = {
  /** Target value to count up to */
  value: number;
  /** Animation duration in ms (default 1200) */
  duration?: number;
  /** Suffix appended after the number (e.g. '%' or '') */
  suffix?: string;
  /** Prefix prepended before the number (e.g. '+' or '−') */
  prefix?: string;
  /** className for the span */
  className?: string;
  /** Decimal places for the displayed number (default 0) */
  decimals?: number;
};

export function CountUp({ value, duration = 1200, suffix = '', prefix = '', className, decimals = 0 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // SSR renders the final value for SEO/no-JS.
  const [display, setDisplay] = useState(value);

  // Reset to 0 before paint on the client (progressive enhancement).
  useIsoLayoutEffect(() => {
    setDisplay(0);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced-motion: jump to final value, no animation
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }

    let started = false;
    let rafId = 0;

    const start = () => {
      if (started) return;
      started = true;

      const startTime = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic: 1 - (1 - t)^3
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(eased * value);
        if (progress < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          setDisplay(value);
        }
      };
      rafId = requestAnimationFrame(tick);
    };

    // Check if element is already in viewport on mount (above-the-fold content).
    // If so, start immediately — no scroll delay needed.
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (inViewport) {
      // Small delay to let CSS fade-up animations settle, but shorter than
      // the scroll-triggered case (100ms vs 300ms)
      const timer = setTimeout(start, 100);
      return () => {
        clearTimeout(timer);
        if (rafId) cancelAnimationFrame(rafId);
      };
    }

    // IntersectionObserver: start when element enters viewport
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // Delay so the fade-up CSS animation finishes first
          setTimeout(start, 300);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [value, duration, decimals]);

  const formatted = decimals > 0 ? display.toFixed(decimals) : String(Math.round(display));

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{formatted}{suffix}
    </span>
  );
}