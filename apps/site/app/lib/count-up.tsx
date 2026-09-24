'use client';

// CountUp — animates a number from 0 to its target value when it scrolls
// into view. Used for the homepage hero proof numbers, leaderboard stats,
// work case studies, contract pages, and score page integers.
//
// Accessibility: respects prefers-reduced-motion (jumps to final value).
// The count-up is decorative — the final value is in the DOM at first paint
// via SSR. The reset to 0 is GATED ON BEING IN THE VIEWPORT at mount: an
// element that is guaranteed to animate immediately can safely seed at 0
// before paint (no flash of the SSR value), but an element that is off-screen
// must KEEP its real value, because the observer may never fire for it.
//
// The unconditional reset this replaced was a real defect, found 2026-09-23:
// anything that reads the DOM without scrolling saw the seed 0 forever —
//   - screen-reader linear reads (a blind user reads document order, not
//     visual scroll position, and heard "0 of 0 sites scored / Self-score 0%
//     / Lowest: 0% F" on the homepage hero proof block)
//   - print, and any automated screenshot/capture at a scroll offset
//   - elements inside a collapsed container that never intersects
// Information must not be gated behind motion. The count-up is delight; the
// number is the answer. Delight may be skipped; the answer may never be wrong.
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

// Shared animation epoch.
//
// Each counter captured its own performance.now() when its start timer fired,
// so two counters starting in the same batch ran on clocks a few ms apart and
// could display different progress fractions in the same frame. For a paired
// readout like "30 of 30 sites scored" that means the two numbers can visibly
// disagree mid-animation even though the final value agrees. Counters starting
// within the same frame now share one epoch, so equal values always display
// the same fraction. A counter that starts later gets a fresh epoch, so
// scroll-triggered counters keep their own timing.
let sharedEpoch = 0;
let sharedEpochStamp = -Infinity;

function epochFor(now: number): number {
  if (now - sharedEpochStamp > 24) {
    sharedEpoch = now;
    sharedEpochStamp = now;
  }
  return sharedEpoch;
}

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

  // Seed to 0 before paint ONLY when this counter is about to animate right
  // now. If the element is off-screen, the real value stays in the DOM until
  // the observer actually fires — so a non-scrolling read (screen reader,
  // print, capture) never sees a seed zero. See the header note: the previous
  // unconditional reset made the homepage hero read "0 of 0 sites scored".
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (inViewport) setDisplay(0);
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

      // Share the epoch with any counter starting in the same frame so paired
      // values (30 of 30) stay consistent for the whole animation.
      const startTime = epochFor(performance.now());
      const tick = (now: number) => {
        const elapsed = now - startTime;
        // Clamp BOTH ends. The rAF timestamp is the frame's start time, which
        // can predate the performance.now() captured just before scheduling —
        // elapsed goes negative, the cubic easing amplifies it (1-(1-t)^3 with
        // t<0 is negative), and the hero briefly rendered "-1" checks and
        // "-2%" self-score. A counter must never display a value the data
        // cannot hold; the upper clamp also stops any late frame overshooting
        // past the target.
        const progress = Math.max(0, Math.min(elapsed / duration, 1));
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
          // Zero it HERE, at the moment it begins to enter, not later. The
          // off-screen value is the real one (see the layout effect), so
          // without this the first tween frame would drop the number from its
          // real value to 0 and then count back up — a visible glitch. At
          // threshold 0.1 the element is only just entering, so the reset is
          // effectively unseen; a counter that was never off-screen never
          // reaches this branch.
          setDisplay(0);
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