'use client';

/**
 * Keeps a run's feedback where the visitor can see it.
 *
 * On a phone every engine stacks its instrument under the URL bar, so a run
 * started from the bar played out below the fold: at 375 by 667 the visitor
 * saw the key turn to "Running" and, at most, the instrument's title strip at
 * the bottom edge (0 to 13% of it on screen, on every engine). The same
 * happens when a step swaps its content in place (the maturity quiz's next
 * axis landed 800px above the screen). bringIntoView scrolls a block's start
 * to just under the sticky bar (html's scroll-padding-top) unless that start
 * is already on screen, in the upper part: so wide screens, where the
 * instrument sits beside the bar, never move. Smooth unless the visitor asked
 * for reduced motion.
 *
 * userJustActed separates a run the visitor started from one a shared link
 * started on load: only the first should move the page.
 */
let lastInput = 0;

if (typeof window !== 'undefined') {
  const mark = () => {
    lastInput = Date.now();
  };
  window.addEventListener('pointerdown', mark, { capture: true, passive: true });
  window.addEventListener('keydown', mark, { capture: true });
  // A screen reader presses a button with an accessibility click: no key or
  // pointer event reaches the page, only a trusted click whose detail is 0
  // (NVDA's Enter in browse mode). Without this, a run its user started read
  // as one a shared link started on load, and focus stayed put.
  window.addEventListener(
    'click',
    (e) => {
      if (e.isTrusted && e.detail === 0) mark();
    },
    { capture: true, passive: true },
  );
}

export function userJustActed(withinMs = 2500): boolean {
  return Date.now() - lastInput < withinMs;
}

export function bringIntoView(el: HTMLElement | null): void {
  if (!el) return;
  // html's scroll-padding-top is the sticky bar's clearance.
  const clear = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const r = el.getBoundingClientRect();
  if (r.top >= clear - 1 && r.top <= window.innerHeight * 0.6) return;
  // Aim at the block's layout position, not where it is drawn: a block that
  // is still in its entrance (a translate) would otherwise land short, under
  // the bar.
  let top = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, top - clear), behavior: reduce ? 'auto' : 'smooth' });
}
