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
 * at the instrument's old position, below the verdict and both numbers.
 *
 * Two earlier fixes guessed whether that scroll was still moving: from
 * scrollend (which other scrolls send too), then from "the page reached the
 * target, or 1.5 s passed". Both were timing guesses. On a busy device a
 * smooth scroll can still be moving after 1.5 s; the landing then saw a
 * "still" page, judged the verdict on screen mid-scroll, and the old scroll
 * finished at the instrument's old position (check-contract-page's "slow"
 * fast runs). Here nothing is guessed from the clock:
 *
 *  - Once this module moves the page, the page is its own until the visitor
 *    next acts (a key, a pointer, a wheel, a touch). The next call in that
 *    span (the landing after the running state's scroll) aims at its block
 *    without asking whether the block looks on screen, finished or not. A
 *    call whose predecessor never reached its first frame has not been
 *    moved by it, so that call still asks.
 *  - A call that takes over a scroll this module is still steering (the
 *    landing inside the running state's scroll) sets the page at once. A
 *    smooth reversal waits on the device's frames: on a busy one it had not
 *    begun half a second later, and the page sat at the old scroll's target
 *    (check-contract-page's "slow" fast runs on CI: 14 of 17 failures). A
 *    call that finds the page where the visitor left it still glides.
 *  - Nothing is read inside the commit that calls this (a scroll read there
 *    can be a passing value while the fold lays out): the first animation
 *    frame after the call decides, and aims.
 *  - After that, each frame re-reads where the block's start sits in the
 *    layout and re-aims if it moved (the fold, anchoring, a font) before the
 *    page got there, or if the scroll stopped short of it. The loop ends once
 *    the page has held still on the target for a few frames, or the visitor
 *    scrolls.
 *
 * So the end is the block's own position, whatever lands when.
 *
 * userJustActed separates a run the visitor started from one a shared link
 * started on load: only the first should move the page.
 */
let lastInput = 0;

/** A scroll this module started and is still steering to its block. */
type Aim = {
  el: HTMLElement;
  /** Whether this call may leave the page still (it did not find the page moving or placed here). */
  mayStay: boolean;
  /** Set the page at once: this call took over a scroll this module started and was still steering. */
  snap: boolean;
  /** The scroll aimed at; null until the first frame reads the layout. */
  to: number | null;
  lastY: number;
  still: number;
  /** The page has reached the target: from here the loop only waits for rest. */
  held: boolean;
  moved: boolean;
  sinceIssue: number;
  frames: number;
};
let aim: Aim | null = null;

/** The page sits where this module put it, and the visitor has not acted since. */
let placed = false;

/** Keys that scroll the page when focus is not in a field. */
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);

/** Frames the page must hold still on the target before the loop lets go. */
const SETTLE_FRAMES = 6;
/** Frames a scroll may sit still short of its target, after it has moved, before it is re-aimed. */
const STALL_FRAMES = 8;
/** Frames a fresh scroll may take to start moving before it is re-aimed. */
const START_FRAMES = 30;
/** A backstop in frames, not time: the loop never outlives this. */
const MAX_FRAMES = 600;

if (typeof window !== 'undefined') {
  const mark = () => {
    lastInput = Date.now();
    placed = false;
  };
  // The visitor taking the scroll over ends it: the page is theirs again.
  const takeOver = () => {
    aim = null;
    placed = false;
  };
  window.addEventListener(
    'pointerdown',
    (e) => {
      mark();
      // A press on the page's own scrollbar lands on <html>.
      if (e.target === document.documentElement) takeOver();
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'keydown',
    (e) => {
      mark();
      const t = e.target as HTMLElement | null;
      if (SCROLL_KEYS.has(e.key) && !t?.closest?.('input, textarea, select, [contenteditable="true"]')) takeOver();
    },
    { capture: true },
  );
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
  window.addEventListener('wheel', takeOver, { capture: true, passive: true });
  window.addEventListener('touchstart', takeOver, { capture: true, passive: true });
}

export function userJustActed(withinMs = 2500): boolean {
  return Date.now() - lastInput < withinMs;
}

/** html's scroll-padding-top: the sticky bar's clearance. */
function clearance(): number {
  return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
}

/** The block's start in the layout, not where it is drawn: a block still in
    its entrance (a translate) would otherwise read short, under the bar. */
function layoutTop(el: HTMLElement): number {
  let top = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  return top;
}

/** The scroll that puts the block's start just under the bar, within the page. */
function targetOf(el: HTMLElement): number {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(max, Math.max(0, layoutTop(el) - clearance()));
}

function calm(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'paused';
}

function issue(a: Aim, to: number): void {
  a.to = to;
  a.sinceIssue = 0;
  a.moved = false;
  a.still = 0;
  placed = true;
  // A new scrollTo replaces one still in flight, so this also retargets it;
  // already there, an instant one to the same place still stops another
  // scroll under way (Chrome aborts it), without moving the page.
  const near = Math.abs(to - window.scrollY) <= 1;
  window.scrollTo({ top: to, behavior: near || a.snap || calm() ? 'instant' : 'smooth' });
}

let looping = false;

function step(): void {
  const a = aim;
  if (!a || !a.el.isConnected || ++a.frames > MAX_FRAMES) {
    if (a === aim) aim = null;
    looping = false;
    return;
  }
  const y = window.scrollY;
  const to = targetOf(a.el);
  a.sinceIssue++;
  if (a.to === null) {
    // The first frame after the call, with the commit that made the call
    // laid out: a scroll read inside that commit can be a passing value.
    // With the page still and not placed here, a block whose start is
    // already on screen, in the upper part, stays put.
    const drawn = layoutTop(a.el) - y;
    if (a.mayStay && drawn >= clearance() - 1 && drawn <= window.innerHeight * 0.6) aim = null;
    else issue(a, to);
  } else {
    if (Math.abs(y - a.to) <= 1) a.held = true;
    if (!a.held && Math.abs(to - a.to) > 1) {
      // The block moved in the layout (the fold, anchoring, a late font)
      // before the page got there: re-aim. Once the page has reached the
      // block, a later shift is the next state's to place (the landing
      // replaces the running state's aim), and following it would drag the
      // page away first.
      issue(a, to);
    } else if (y === a.lastY) {
      a.still++;
      if (a.held) {
        if (a.still >= SETTLE_FRAMES) aim = null;
      } else if ((a.moved && a.still >= STALL_FRAMES) || a.sinceIssue >= START_FRAMES) {
        // Stopped short of the block, or never started: aim again.
        issue(a, to);
      }
    } else {
      a.still = 0;
      a.moved = true;
    }
  }
  a.lastY = window.scrollY;
  if (aim) requestAnimationFrame(step);
  else looping = false;
}

export function bringIntoView(el: HTMLElement | null): void {
  if (!el) return;
  // With the page moved here and not touched since (a scroll from here under
  // way, or finished with no input after it), where the block reads now says
  // nothing about where the move ends: aim at it, and with that scroll still
  // being steered, take it over at once. An aim that has not issued yet has
  // moved nothing. Otherwise the first frame decides whether it needs to move
  // at all.
  const steering = aim !== null && aim.to !== null;
  aim = { el, mayStay: !steering && !placed, snap: steering, to: null, lastY: window.scrollY, still: 0, held: false, moved: false, sinceIssue: 0, frames: 0 };
  if (!looping) {
    looping = true;
    requestAnimationFrame(step);
  }
}
