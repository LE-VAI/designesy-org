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
 * for reduced motion or paused the site's motion.
 *
 * A smooth scroll takes several hundred milliseconds, and a fast run can land
 * inside it: the running state scrolls toward the instrument, the form folds
 * a few milliseconds later, and the verdict that now sits higher reads as "on
 * screen" while the page is still moving. Left alone, the old scroll finished
 * at the instrument's old position, below the verdict and both numbers. So
 * while a scroll started here is still moving, the next call retargets it to
 * its own block, whatever that block's position reads mid-scroll.
 *
 * "Still moving" is not taken from scrollend: that event also arrives for
 * other scrolls (a reset to the top, a wheel turn just before the run), and
 * one arriving late cleared the record of a scroll still under way, so the
 * landing saw a still page and let the old scroll finish. The record holds
 * until the page reaches the target, the visitor scrolls by wheel, touch or
 * key, or 1.5 s pass (no smooth scroll here runs that long).
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

/** The smooth scroll this module last started: its target and start time. */
let moving: { to: number; at: number } | null = null;

/** Keys that scroll the page when focus is not in a field. */
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);

if (typeof window !== 'undefined') {
  // The visitor taking the scroll over ends it: the page is theirs again.
  const takeOver = () => {
    moving = null;
  };
  window.addEventListener('wheel', takeOver, { capture: true, passive: true });
  window.addEventListener('touchstart', takeOver, { capture: true, passive: true });
  window.addEventListener(
    'keydown',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (SCROLL_KEYS.has(e.key) && !t?.closest?.('input, textarea, select, [contenteditable="true"]')) takeOver();
    },
    { capture: true, passive: true },
  );
}

function stillMoving(): boolean {
  if (!moving) return false;
  if (performance.now() - moving.at > 1500 || Math.abs(window.scrollY - moving.to) <= 1) moving = null;
  return moving !== null;
}

export function bringIntoView(el: HTMLElement | null): void {
  if (!el) return;
  // html's scroll-padding-top is the sticky bar's clearance.
  const clear = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  // With the page still, a block whose start is already on screen, in the
  // upper part, stays put. With a scroll from here still under way, where the
  // block is drawn now says nothing about where it will end: retarget.
  if (!stillMoving()) {
    const y = el.getBoundingClientRect().top;
    if (y >= clear - 1 && y <= window.innerHeight * 0.6) return;
  }
  // Aim at the block's layout position, not where it is drawn: a block that
  // is still in its entrance (a translate) would otherwise land short, under
  // the bar.
  let top = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  const calm =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'paused';
  const to = Math.max(0, top - clear);
  // A new scrollTo replaces one still in flight, so this also retargets it.
  window.scrollTo({ top: to, behavior: calm ? 'instant' : 'smooth' });
  moving = calm || Math.abs(to - window.scrollY) <= 1 ? null : { to, at: performance.now() };
}
