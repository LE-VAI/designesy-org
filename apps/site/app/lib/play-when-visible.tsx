'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * PlayWhenVisible — pauses every CSS animation inside it while it is off screen.
 *
 * The homepage instruments run on CSS clocks (one @keyframes per instrument,
 * all sharing one duration), so a loop is exact by construction. Pausing them
 * as a unit keeps that true: every animation inside stops and resumes on the
 * same frame, so their phases never drift apart. What this saves is the main
 * thread, since the clocks animate registered custom properties.
 *
 * State is a data attribute the CSS reads (data-play="off"), so the markup is
 * still complete and correct before hydration: the instruments simply run.
 */
type Passthrough = {
  id?: string;
  [key: `aria-${string}`]: string | undefined;
  [key: `data-${string}`]: string | undefined;
};

export function PlayWhenVisible({
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'section' | 'figure';
  className?: string;
  children: ReactNode;
} & Passthrough) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        el.dataset.play = entry.isIntersecting ? 'on' : 'off';
      },
      { rootMargin: '120px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} className={className} {...rest}>
      {children}
    </Tag>
  );
}
