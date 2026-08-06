'use client';

// CountUp — animates a number from 0 to its target value when it scrolls
// into view. Used for the homepage hero proof numbers (40 checks, 100%,
// cohort counts). Renders the final value server-side via SSR fallback
// so the number is always in the DOM for SEO and no-JS; the animation
// is a progressive enhancement layer on top.
//
// Accessibility: respects prefers-reduced-motion (jumps to final value).
// The count-up is decorative — the final value is in the DOM at first paint.

import { useEffect, useRef, useState } from 'react';

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
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced-motion: jump to final value, no animation
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }

    // If the element is already in view on mount (above the fold), start
    // after a short delay so the fade-up entrance finishes first.
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