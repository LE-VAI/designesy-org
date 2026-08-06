'use client';

// CountUp — animates a number from 0 to its target value when it scrolls
// into view. Used for the homepage hero proof numbers (40 checks, 100%,
// cohort counts). Renders the final value server-side via SSR fallback
// so the number is always in the DOM for SEO and no-JS; the animation
// is a progressive enhancement layer on top.
//
// Accessibility: respects prefers-reduced-motion (jumps to final value).
// The count-up is decorative — the final value is in the DOM at first paint.
//
// Hydration strategy: SSR renders the final value. On client mount,
// useLayoutEffect resets to 0 before the browser paints, so the user
// only sees 0 → count-up → final value (no flash of the SSR value).

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
  /** className for the span */
  className?: string;
};

export function CountUp({ value, duration = 1200, suffix = '', className }: CountUpProps) {
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
    const start = () => {
      if (started) return;
      started = true;

      const startTime = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic: 1 - (1 - t)^3
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(eased * value));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    // IntersectionObserver: start when element enters viewport
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // Small delay so the fade-up CSS animation finishes first
          setTimeout(start, 300);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}{suffix}
    </span>
  );
}