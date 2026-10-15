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
 * while a scroll started here is still moving, a block is judged where that
 * scroll will leave it, and the scroll is retargeted when that is off screen.
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

/** Where the smooth scroll this module last started will stop, while it is
    still moving; null once it has ended. */
let moving: number | null = null;
let movingTimer = 0;

function settle() {
  moving = null;
  window.clearTimeout(movingTimer);
}

if (typeof document !== 'undefined') {
  // A scroll the visitor takes over also ends here, which is what we want:
  // the page is theirs again.
  document.addEventListener('scrollend', settle, { passive: true });
}

export function bringIntoView(el: HTMLElement | null): void {
  if (!el) return;
  // html's scroll-padding-top is the sticky bar's clearance.
  const clear = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const r = el.getBoundingClientRect();
  const onScreen = (y: number) => y >= clear - 1 && y <= window.innerHeight * 0.6;
  // Where the block will be drawn once the page stops: here and now, or at
  // the end of a smooth scroll still under way (clamped to the page's end,
  // which a fold may have just moved up).
  const end = moving === null ? window.scrollY : Math.min(moving, document.documentElement.scrollHeight - window.innerHeight);
  if (onScreen(r.top + window.scrollY - end)) return;
  // Aim at the block's layout position, not where it is drawn: a block that
  // is still in its entrance (a translate) would otherwise land short, under
  // the bar.
  let top = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  const calm =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'paused';
  const to = Math.max(0, top - clear);
  settle();
  // A new scrollTo replaces one still in flight, so this also retargets it.
  window.scrollTo({ top: to, behavior: calm ? 'instant' : 'smooth' });
  if (calm || Math.abs(to - window.scrollY) < 1) return;
  moving = to;
  // Browsers without scrollend: no smooth scroll here runs past a second.
  movingTimer = window.setTimeout(settle, 1000);
}
