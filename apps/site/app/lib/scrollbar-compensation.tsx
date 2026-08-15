'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ScrollbarCompensation — JS-driven scrollbar gutter reservation.
 *
 * The page shifts left on route navigation because:
 * 1. Pages have different heights → scrollbar appears/disappears
 * 2. overflow-x:clip on html prevents scrollbar-gutter:stable from
 *    reliably propagating to the viewport in all browsers
 * 3. Without gutter reservation, the layout width changes by ~13-17px
 *    when the scrollbar appears or disappears → visible leftward shift
 *
 * This component measures the real viewport scrollbar width and writes
 * it to --scrollbar-width so body's padding-inline-end reserves the exact
 * gutter. It re-measures on:
 * - Initial mount (rAF + 100ms timeout to catch async scrollbar appearance)
 * - Every route change (via usePathname — Next.js <Link> navigation doesn't
 *   remount the layout, so we must actively re-measure on each transition)
 * - Window resize (scrollbar may appear/disappear on viewport change)
 * - Content resize via ResizeObserver on body (catches dynamic content
 *   height changes that don't trigger resize but do change overflow state)
 *
 * The padding is RESERVE-ONLY: 0px when there's no scrollbar, ~13-17px
 * when there is one. This keeps the layout width stable across all
 * navigation and scroll states.
 */
export function ScrollbarCompensation() {
  const pathname = usePathname();

  useEffect(() => {
    const measure = () => {
      const html = document.documentElement;
      const width = window.innerWidth - html.clientWidth;
      html.style.setProperty('--scrollbar-width', `${Math.max(0, width)}px`);
    };

    // Measure immediately, then after first paint, then after layout settles.
    measure();
    const rafTimer = requestAnimationFrame(measure);
    const timeoutTimer = setTimeout(measure, 100);

    // Re-measure on resize (scrollbar may appear/disappear on viewport change).
    const onResize = () => measure();
    window.addEventListener('resize', onResize);

    // Re-measure when body height changes (content load, accordion, etc.)
    // — catches cases where overflow state changes without a resize event.
    const body = document.body;
    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(body);
    // Also observe documentElement for cases where html scrollHeight changes.
    resizeObserver.observe(document.documentElement);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafTimer);
      clearTimeout(timeoutTimer);
      resizeObserver.disconnect();
    };
  }, [pathname]); // Re-run on every route change — Link navigation doesn't remount.

  return null;
}