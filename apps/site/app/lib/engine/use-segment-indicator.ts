import { useLayoutEffect, type RefObject } from 'react';

/**
 * The sliding pill behind the selected segment of a .score-filter-segmented
 * strip: measures the active tab (.score-filter-tab.is-active) and writes
 * --indicator-x/-y/-w/-h on the strip, which its ::before reads (globals.css).
 * Runs on layout, before paint, so the pill never flashes at 0,0; follows the
 * tab's offsetTop when the tabs wrap on a phone and its height when a coarse
 * pointer makes them 44px; re-measures when the strip resizes.
 *
 * One copy for every strip. The four-engine form (/score) drew the same strip
 * without it, so the pill stayed 0px wide: in the light theme the selected
 * label, white for the dark pill, sat on the light track at 1.09:1.
 *
 * `a` and `b` are what moves the selection or the tabs (the selected value,
 * the result the tabs count).
 */
export function useSegmentIndicator(ref: RefObject<HTMLElement | null>, a: unknown, b?: unknown): void {
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const place = () => {
      const active = container.querySelector<HTMLElement>('.score-filter-tab.is-active');
      if (!active) return;
      container.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
      container.style.setProperty('--indicator-y', `${active.offsetTop}px`);
      container.style.setProperty('--indicator-w', `${active.offsetWidth}px`);
      container.style.setProperty('--indicator-h', `${active.offsetHeight}px`);
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [ref, a, b]);
}
