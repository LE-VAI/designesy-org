'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ENGINE_CHECK_COUNT } from './check-definitions';
import { DigitStrip, stripValues } from './digit-strip';

/**
 * InspectSequence — "Every check, run against the page", told by scroll.
 *
 * Replaces the MP4 score loop. The video was a dark rectangle in light mode,
 * could not follow the theme, and played on a timer no reader controlled. This
 * is native markup: a generic page drawn in HTML and CSS, and four inspection
 * layers over it, one per step of the text beside it. The reader's scroll
 * position chooses the step; nothing advances on its own.
 *
 * STATE
 * The section carries data-step (1..4). An IntersectionObserver watches the
 * four step blocks and sets the step whose block crosses the middle of the
 * viewport. It is the single source of truth for which step is on stage, in
 * every browser. CSS does the rest (home-inspect.css).
 *
 * ONE GEOMETRY, TWO CLOCKS
 * Reading and measuring are continuous, so they follow the reader's finger:
 * where the browser has scroll-driven animations, each step's block declares a
 * view timeline (--s1..--s4) inset to the SAME band the observer watches, so
 * cover 0% of --sN is the exact instant step N lights, in either direction.
 * Verdicts are discrete, so they land as transitions on data-step. The two
 * clocks share one geometry and cannot disagree.
 *
 * DEPTH CARRIES THE VERDICT
 * Reading lifts the page's layers off the paper; everything that passes sinks
 * back; the two findings stay standing until graded; the graded page slams
 * flat and holds still. Motion means unresolved, stillness means resolved.
 * Real Z is legal here because grouping properties flatten only the element
 * they sit on (CSS Transforms 2): the window keeps overflow and isolation, and
 * a NEW 3D context rooted in .ix-scene composites into it as a flat image. The
 * verdict HUD and the log are glass, so they stay OUTSIDE that context
 * (Chromium mis-renders backdrop-filter inside preserve-3d).
 *
 * WHO OWNS WHAT
 * A running fill-both scroll animation beats any data-step declaration on the
 * same property, so every property on every element has one owner: the scene
 * leans on `transform` (scrub), the page flattens on `translate` + `rotate`
 * (event), a plane lifts on `translate` (scrub) and sinks on `transform`
 * (event). The table is in home-inspect.css.
 *
 * WHEN THE 3D EXISTS
 * Only after this component arms the section (data-ix-armed), only with
 * scroll-driven animation support or the play-on-request loop, and only with
 * motion allowed. Server markup, no-JS and the moment before hydration are the
 * flat page, identical to before, never a half-exploded state.
 *
 * REDUCED MOTION (prefers-reduced-motion, or the site's motion toggle)
 * Tiered: everything that moves stops, step changes become 150ms crossfades,
 * colours and step lighting stay. The demo's content IS the motion, so a
 * "Play the inspection" button runs it on request: a 12s loop (steps at 0, 3,
 * 6 and 9s, a crossfade reset from 11.4s) for this section only, stopped by a
 * second press, by leaving the section, or after two loops.
 *
 * WHAT IS TRUE HERE
 * The page is a demo, and the section says so. The findings are the engine's
 * real checks with their real thresholds: v03 (a :focus-visible rule must
 * exist) and v06 (body text at least 4.5 to 1). Neither carries a ceiling
 * of its own, but v03 FAILs, and from engine 1.3.0 any FAIL caps the score
 * at 89.9, so the page grades B (it graded A until then). The counts are
 * derived from the registry
 * (lib/check-definitions): pass is the engine's total less the two findings,
 * so the tally, the counter and the accessible name can never disagree with
 * the engine.
 */

const STEPS = [
  {
    title: 'It reads the page you ship',
    text: 'The engine fetches the HTML your server sends and the stylesheets it links, and reads markup, tokens, type, spacing and motion from them. It runs no JavaScript, so it grades what arrives over the wire.',
  },
  {
    title: 'It measures instead of guessing',
    text: 'Contrast is computed, never eyeballed. Line length, type scale, and target size are read from the CSS the page ships, each against a threshold the contract publishes.',
  },
  {
    title: 'Each finding pins to its element',
    text: 'A check that fails names itself and marks what it caught. Here v03 finds no focus-visible ring on the button, and v06 measures the muted text at 3.8 to 1.',
  },
  {
    title: 'One grade, with the evidence attached',
    text: 'Findings roll up into one score. A failing check caps it at 89.9, so with v03 failing the page grades B, and every result links back to the rule that produced it.',
  },
] as const;

// The demo's tally, derived: the engine's own total, less the two findings.
const WARN = 1;
const FAIL = 1;
const PASS = ENGINE_CHECK_COUNT - WARN - FAIL;
const TALLY = `${PASS} pass · ${WARN} warn · ${FAIL} fail`;

// The chrome counter rolls 0..total across steps 1-3, one third per step, each
// third on its own clock (nested strip segments; see lib/digit-strip). The
// last few checks are not scrolled: they roll with the step-four verdict, on
// the same event and in the same 300ms as "Verified" and the full title-bar
// progress, so the total can never read complete beside "Verifying" and a
// bar at three quarters (it did for 200px of scroll at 1440, judged
// 2026-10-03).
const THIRD_A = Math.floor(ENGINE_CHECK_COUNT / 3);
const THIRD_B = Math.floor((2 * ENGINE_CHECK_COUNT) / 3) - THIRD_A;
const THIRD_C = ENGINE_CHECK_COUNT - THIRD_A - THIRD_B;
const VERDICT_ROLL = Math.min(3, THIRD_C - 1);
const COUNT_SEGMENTS = [THIRD_A, THIRD_B, THIRD_C - VERDICT_ROLL, VERDICT_ROLL] as const;
const COUNT_ROWS = Array.from({ length: ENGINE_CHECK_COUNT + 1 }, (_, i) => i);

// Measurement read-outs: the strip lands on each row in steps(n).
const MEASURE_CH = stripValues(62, 7);
const TARGET_PX = stripValues(44, 4);

// The play-on-request loop, in ms. Every boundary divides the site's 12s
// master period (lib/verify-console).
// The reset fades the canvas out from 11.4s, cuts at 11.7s and fades it back
// in by 12s: 300ms each way, the duration home-inspect.css gives the canvas
// while the loop runs.
const LOOP = { step: 3000, fadeOut: 11400, reset: 11700, period: 12000, loops: 2 };
const FADE_QUICK = 150; // starting or stopping: within the 200ms reduced-motion allowance

// The least the narrow stage may scale its specimen's type to keep pinning.
// Below it the type is too small to read, and the stage rests resolved.
const FIT_MIN = 0.75;

// The settle (narrow, pinned): where a step comes to rest, how close a stop
// must be to one, and when a scroll counts as stopped.
const SETTLE_GAP = 8; // px between the stage's fade and the settled step's numeral
const SETTLE_REACH = 0.5; // of a step's spacing: farther than this, the page stays where it stopped
const SETTLE_IDLE = 180; // ms without a scroll event
const SETTLE_LAPSE = 1000; // ms an input waits for the scroll it should cause

const LABEL = `Demo on a generic page, inspected in four steps. v03 fails because no focus-visible ring is declared. v06 warns because muted text measures 3.8 to 1, under the 4.5 to 1 body minimum. The v03 failure caps the grade at B: ${PASS} pass, ${WARN} warn, ${FAIL} fail, grade B.`;

/** A numbered pin, as drawn on the page and repeated in the log. */
function Pin({ n, tone, inLog }: { n: number; tone: 'warn' | 'fail'; inLog?: boolean }) {
  return <span className={`${inLog ? 'ix-log-pin' : 'ix-pin'} is-${tone}`}>{n}</span>;
}

/** A log row not yet reached: its step, queued. */
function Queued({ k }: { k: string }) {
  return (
    <span className="ix-log-wait">
      <span>{k}</span>
      {/* The queued dash is drawn by home-inspect.css (.ix-log-dash): it is a
          status glyph, and check-voice holds copy em dashes on / at zero. */}
      <span className="ix-log-dash" aria-hidden="true" />
    </span>
  );
}

/** The verdict's segmented tally: pass, warn, fail at 40:1:1, 4px minimum. */
function TallyBar({ className }: { className: string }) {
  return (
    <span className={className}>
      <i className="is-pass" style={{ '--n': PASS, '--k': 0 } as CSSProperties} />
      <i className="is-warn" style={{ '--n': WARN, '--k': 1 } as CSSProperties} />
      <i className="is-fail" style={{ '--n': FAIL, '--k': 2 } as CSSProperties} />
    </span>
  );
}

export function InspectSequence() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The play button's handle on the controller that lives inside the effect.
  const ctlRef = useRef<{ toggle: () => void } | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-inspect-step]'));
    const stage = root.querySelector<HTMLElement>('.inspect-stage');
    let io: IntersectionObserver | null = null;
    // While the play-on-request loop runs it owns data-step; the scroll
    // observer stands down until it stops.
    let auto = false;

    /** Light step n: the section state and the list's aria-current. */
    const show = (n: string) => {
      if (root.dataset.step !== n) root.dataset.step = n;
      for (const li of steps) {
        if (li.dataset.inspectStep === n) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
      }
    };

    const setStep = (el: Element) => {
      if (auto) return;
      const step = el.closest('[data-inspect-step]');
      show(step?.getAttribute('data-inspect-step') ?? '1');
    };

    /**
     * Motion gates, written as attributes so the CSS reads one source:
     *   data-ix-calm   reduced motion, or the site's motion toggle (Tier 1/2)
     *   data-ix-scrub  the scroll-driven layer: supported, motion allowed, and
     *                  not overridden by the play loop
     *   data-ix-3d     the exploded scene: the scrub layer, or the play loop
     *                  (except during its one-frame reset snap)
     * The feature test is the same condition the CSS @supports block uses.
     */
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sda =
      typeof CSS !== 'undefined' &&
      CSS.supports('animation-timeline: view()') &&
      CSS.supports('timeline-scope: --a');
    const sync = () => {
      const calm = rm.matches || document.documentElement.dataset.motion === 'paused';
      const looping = root.hasAttribute('data-ix-auto');
      // Unpinned, the stage rests resolved; nothing on it follows the scroll.
      const scrub = sda && !calm && !looping && root.dataset.pin !== 'off';
      root.toggleAttribute('data-ix-calm', calm);
      root.toggleAttribute('data-ix-scrub', scrub);
      root.toggleAttribute('data-ix-3d', scrub || (looping && !root.hasAttribute('data-ix-snap')));
    };

    /**
     * Wide: a one-pixel band across the middle of the viewport; the step whose
     * block crosses it is on stage.
     *
     * Narrow: the stage is pinned over the top of the screen, and a step must
     * stay readable, numeral to last line, for as long as it is on stage.
     * Before, a step lit at a fixed line (68% down) with its text centred in a
     * 46vh block, so for the last third of each step its own heading sat under
     * the pinned stage (measured at 390x844, 2026-10-03). From the stage's
     * real bottom edge S, the readable region R = H - S below it, and the
     * stage's own fade F (the 1.5rem gradient under it; text in it is half
     * gone), E = S + F is the first line a step can be read from:
     *   - steps are spaced D = 0.6R apart (their min-height), and
     *   - the trigger is the step's BLOCK crossing L = E + D,
     * so the active step's block travels from L up to exactly E before the
     * next block reaches L and takes over, and the step just read fades out
     * there (home-inspect.css) instead of sliding under the fade lit. The
     * heading used to be the trigger, so the numeral above it went under the
     * stage, and the heading into the fade, while the step was still lit.
     * Works scrolling either way: the last block to touch the band wins.
     * The last step has no successor, so the pin ends when its block reaches
     * E + SETTLE_GAP: the section's content box stops --ix-pin-end short of
     * the list's end (the list runs on into the padding; home-inspect.css),
     * and at release step four sits whole under the graded stage, as a
     * settled step does. (It released with its heading on S, under the fade,
     * and its numeral under the stage, and they scrolled away like that.)
     *
     * H is the large viewport's height (100lvh), not innerHeight. On a phone
     * innerHeight changes as the address bar slides in and out on the first
     * scrolls; the geometry built on it changed with it, every step moved by
     * up to 3 x 0.6 of the bar's height under the reader's finger, and at
     * some sizes the stage unpinned or pinned mid-scroll (390 wide: unpinned
     * at 750 tall, pinned at 844; measured 2026-10-15). The large viewport
     * does not change with the bar, so neither does the layout: a resize that
     * changes innerHeight alone re-aims the observers (their band is measured
     * from the viewport's bottom) and touches nothing else.
     *
     * Where R cannot hold a step's text plus that travel (a short tablet
     * window), the specimen is first fitted: --ix-fit scales its type until
     * the stage is short enough, down to FIT_MIN. Below that (a short phone,
     * a 959x700 window) the stage stops pinning (data-pin="off"), and since
     * the reader then meets it before the steps rather than beside them, it
     * rests in its resolved state: step four, flat, the observers off. A
     * scroll that drove it would grade a stage nobody could see.
     *
     * Which of the two is read from --ix-mode, which the CSS sets in the same
     * container query that switches the layout, so CSS and JS cannot disagree.
     *
     * The view timelines take the same band: their subject is the step's
     * block, as the observer's is, and the band's bottom inset is written as
     * calc(100% - ...) so it follows the viewport's height without a write.
     * These are static writes, on setup and resize only, never per frame.
     */
    const canvas = root.querySelector<HTMLElement>('.inspect-canvas');
    const list = root.querySelector<HTMLElement>('.inspect-steps');
    let ends: IntersectionObserver | null = null;
    let line = 0; // the band, in viewport px
    let watched: Element[] = steps;
    // The narrow stage is pinned over the list (setup decides).
    let pinned = false;
    let edge = 0; // E, in viewport px while the stage is stuck
    let spacing = 0; // D
    let built = { w: 0, h: 0 }; // the viewport setup last laid out for

    /** The large viewport's height: a phone's height with its address bar
     *  hidden, innerHeight everywhere else. */
    const viewportH = () => {
      if (typeof CSS === 'undefined' || !CSS.supports('height', '100lvh')) return window.innerHeight;
      const probe = document.createElement('div');
      probe.setAttribute('data-ix-viewport', '');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none';
      document.body.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      probe.remove();
      return h || window.innerHeight;
    };

    /**
     * The observer can only report a crossing it sees, and a jump (Home, an
     * anchor, find-in-page) or a fast phone flick can carry a 60px heading
     * clean over a one-pixel band. The step would then go stale against the
     * scroll timelines, and a stale step four (sink, flatten) on a page that
     * has not leaned yet would sink its layers behind the paper. Two guards,
     * neither of which changes what the observer decides:
     *   - the list itself is watched on the same band; it is too tall to jump
     *     over, so leaving it above or below always resets to the first or
     *     last step (exactly what crossing every heading would have done);
     *   - when a scroll settles, the step is corrected to the headings around
     *     the band if it is two or more off, if the band says the LAST step
     *     (the terminal state is always honoured: a jump that stopped on step
     *     four's copy left step three's flags on stage, judged at 1440,
     *     2026-10-03), or if the lit step's block is off screen. One off with
     *     the lit block still in view is the observer's own scroll-up
     *     hysteresis, and is left alone.
     *   - narrow and pinned, the step is always the geometry's. There the
     *     stage covers the top of the screen, so a lit step can be "in view"
     *     and still unreadable under it: after a jump at 768 (1700 to 1950)
     *     step two stayed lit while only step three's copy could be read
     *     (judged 2026-10-03). The band there is exact, the active block
     *     travels from L up to the readable edge E, so the last block at or
     *     above L is the step a reader can see, in either direction.
     */
    const fromGeometry = () => {
      let n = 1;
      watched.forEach((t, i) => {
        if (t.getBoundingClientRect().top <= line) n = i + 1;
      });
      return n;
    };
    const resync = () => {
      if (auto || root.dataset.pin === 'off') return;
      const n = fromGeometry();
      const cur = Number(root.dataset.step ?? 1);
      if (n === cur) return;
      if (pinned) {
        show(String(n));
        return;
      }
      const lit = steps[cur - 1]?.getBoundingClientRect();
      const gone = !lit || lit.bottom <= 0 || lit.top >= window.innerHeight;
      if (Math.abs(n - cur) >= 2 || n === steps.length || gone) show(String(n));
    };

    /** Unpinned: step four, no step current, and a cut, not a replay. */
    const rest = () => {
      root.toggleAttribute('data-ix-snap', true);
      if (root.dataset.step !== String(steps.length)) root.dataset.step = String(steps.length);
      for (const li of steps) li.removeAttribute('aria-current');
      requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-ix-snap')));
    };

    /** (Re)build the observers on the current band and viewport. */
    const observe = () => {
      io?.disconnect();
      ends?.disconnect();
      io = ends = null;
      if (root.dataset.pin === 'off') return;
      const vh = window.innerHeight;
      if (!pinned) line = vh / 2;
      const band = pinned ? `-${line}px 0px -${Math.max(0, vh - line - 1)}px 0px` : '-50% 0px -50% 0px';
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) setStep(e.target);
        },
        { rootMargin: band, threshold: 0 }
      );
      watched.forEach((t) => io!.observe(t));
      if (list) {
        ends = new IntersectionObserver(
          ([e]) => {
            if (e.isIntersecting || auto) return;
            show(e.boundingClientRect.top > line ? '1' : String(steps.length));
          },
          { rootMargin: band, threshold: 0 }
        );
        ends.observe(list);
      }
    };

    const setup = () => {
      io?.disconnect();
      ends?.disconnect();
      const narrow = !!stage && getComputedStyle(stage).getPropertyValue('--ix-mode').trim() === 'narrow';
      const vh = viewportH();
      built = { w: window.innerWidth, h: vh };
      for (const p of ['--ix-step-h', '--ix-band-start', '--ix-band-end', '--ix-pin-end', '--ix-fit']) {
        root.style.removeProperty(p);
      }
      root.removeAttribute('data-ix-fit');
      const wasOff = root.dataset.pin === 'off';
      delete root.dataset.pin;
      pinned = false;
      if (narrow && stage) {
        const top = parseFloat(getComputedStyle(stage).top) || 0;
        const bottom = () => top + stage.getBoundingClientRect().height;
        // The text's own height (numeral to paragraph), not the block's: the
        // block carries the min-height this computes.
        const textH = (s: HTMLElement) => {
          const a = s.firstElementChild?.getBoundingClientRect();
          const z = s.lastElementChild?.getBoundingClientRect();
          return a && z ? z.bottom - a.top : s.scrollHeight;
        };
        const tallest = Math.max(...steps.map(textH));
        // 0.6R must hold the tallest step plus 24px of travel, so S may sit
        // no lower than this.
        const maxS = vh - (tallest + 24) / 0.6;
        let S = bottom();
        // Fit. First the card descriptions give up their room (data-ix-fit,
        // as on a phone's stage), so the specimen's 10px type floor costs no
        // height; then the type scales by the canvas height it must give up.
        // The chrome, the log and the floors are fixed, so one pass
        // undershoots; three converge. Synchronous reads, on setup and
        // resize only.
        if (S > maxS) {
          root.toggleAttribute('data-ix-fit', true);
          S = bottom();
        }
        let fit = 1;
        for (let k = 0; k < 3 && S > maxS && canvas; k++) {
          const h = canvas.getBoundingClientRect().height;
          fit *= Math.max(0, h - (S - maxS) - 2) / h;
          if (fit < FIT_MIN) break;
          root.style.setProperty('--ix-fit', fit.toFixed(3));
          S = bottom();
        }
        if (S > maxS) {
          root.style.removeProperty('--ix-fit');
          root.removeAttribute('data-ix-fit');
          root.dataset.pin = 'off';
          watched = [];
          if (!auto) rest();
          sync();
          return;
        }
        pinned = true;
        const F = parseFloat(getComputedStyle(stage, '::after').height) || 0;
        spacing = Math.round(0.6 * (vh - S));
        edge = Math.round(S + F);
        line = edge + spacing;
        root.style.setProperty('--ix-step-h', `${spacing}px`);
        root.style.setProperty('--ix-band-start', `${line}px`);
        root.style.setProperty('--ix-band-end', `calc(100% - ${line + 1}px)`);
        // The pin's early end: from the last block, less the fade and the
        // settle gap, to the list's end (read after --ix-step-h has laid the
        // list out).
        const last = steps[steps.length - 1];
        if (list && last) {
          const end = list.getBoundingClientRect().bottom - last.getBoundingClientRect().top + F + SETTLE_GAP;
          root.style.setProperty('--ix-pin-end', `${Math.max(0, Math.round(end))}px`);
        }
      }
      watched = steps;
      observe();
      // Back from resting resolved: the observer reports only crossings, so
      // take the step from the geometry once.
      if (wasOff && !auto) show(String(fromGeometry()));
      sync();
    };

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(setup);
    };
    // innerHeight alone changed (a phone's address bar): same layout, the
    // observers re-aimed. Anything else lays the section out again.
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (window.innerWidth === built.w && viewportH() === built.h) observe();
        else setup();
      });
    };
    setup();
    sync();
    root.toggleAttribute('data-ix-armed', true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scrollend', resync, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' && stage ? new ResizeObserver(schedule) : null;
    if (ro && stage) ro.observe(stage);

    // The time loops (scan, LED) and will-change run only while the section
    // is within a viewport of the screen. Not PlayWhenVisible: its blanket
    // pause would also freeze the scroll-driven animations.
    const near = new IntersectionObserver(
      ([e]) => root.toggleAttribute('data-ix-active', e.isIntersecting),
      { rootMargin: '100% 0px' }
    );
    near.observe(root);

    rm.addEventListener('change', sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });

    /**
     * The settle (narrow, pinned). Scrolling stays free; when a reader's
     * scroll stops near a step, the page eases the last few pixels so that
     * step rests whole just under the stage, its numeral SETTLE_GAP below the
     * fade: the place every step passes through on its turn, and where step
     * four releases. Without it a stop could leave the lit step low with an
     * empty band above it, or the step just read half faded at the stage's
     * edge.
     *
     * Only after the reader's own input (wheel, touch, a scrolling key), so a
     * jump, find-in-page or this settle's own scroll never sets one off; not
     * while a finger is down; only toward a step ahead in the direction of
     * travel, or back onto one passed by no more than the gap (which never
     * changes the lit step), and only within SETTLE_REACH of it. So a short
     * scroll stays where it stopped, and the page never pulls a reader back
     * against the way they were going. Never in calm (reduced motion, or the
     * site's motion toggle), never while the play loop runs.
     */
    // The direction of travel is the page's last movement in the gesture,
    // else the input's own (a wheel's delta, the key, the finger's travel):
    // a passive listener can run after the scroll it caused, so a one-notch
    // wheel can arrive with the page already still. No direction, no settle.
    // An input that moves nothing (a wheel at the page's end, a key in a
    // field) lapses after SETTLE_LAPSE, so it cannot arm a later jump.
    let armed = false;
    let touching = false;
    let touchY = 0;
    let lastY = 0;
    let dir = 0; // 1: the page moved down the document, -1: up
    let idle = 0;
    const disarm = () => {
      idle = 0;
      if (touching) return;
      armed = false;
      dir = 0;
    };
    const arm = (hint: number) => {
      if (!armed) {
        armed = true;
        lastY = window.scrollY;
      }
      if (hint) dir = hint;
      clearTimeout(idle);
      idle = window.setTimeout(disarm, SETTLE_LAPSE);
    };
    const settle = () => {
      idle = 0;
      if (touching || !armed) return;
      armed = false;
      const d = dir;
      dir = 0;
      if (!d || !pinned || auto || root.hasAttribute('data-ix-calm')) return;
      let best: number | null = null;
      for (const li of steps) {
        // scrollBy(delta) brings this step's numeral to E + SETTLE_GAP.
        const delta = li.getBoundingClientRect().top - (edge + SETTLE_GAP);
        if (d * delta < -SETTLE_GAP || Math.abs(delta) > spacing * SETTLE_REACH) continue;
        if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
      }
      if (best !== null && Math.abs(best) >= 2) window.scrollBy({ top: best, behavior: 'smooth' });
    };
    const onScroll = () => {
      if (!armed) return;
      clearTimeout(idle);
      // Away from the section, the gesture just runs out.
      if (!root.hasAttribute('data-ix-active')) {
        idle = window.setTimeout(disarm, SETTLE_IDLE);
        return;
      }
      const y = window.scrollY;
      if (y !== lastY) {
        dir = Math.sign(y - lastY);
        lastY = y;
      }
      idle = window.setTimeout(settle, SETTLE_IDLE);
    };
    const onWheel = (e: WheelEvent) => arm(Math.sign(e.deltaY));
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.defaultPrevented || el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return;
      const k = e.key;
      if (k === 'PageDown' || k === 'ArrowDown' || k === 'End' || (k === ' ' && !e.shiftKey)) arm(1);
      else if (k === 'PageUp' || k === 'ArrowUp' || k === 'Home' || (k === ' ' && e.shiftKey)) arm(-1);
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (e.type === 'touchstart') {
        touching = true;
        touchY = t ? t.clientY : 0;
        arm(0);
        return;
      }
      touching = e.touches.length > 0;
      // A finger travelling up the screen moves the page down the document.
      arm(t ? Math.sign(touchY - t.clientY) : 0);
      if (!touching) onScroll();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchend', onTouch, { passive: true });
    window.addEventListener('touchcancel', onTouch, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // --- Play on request ---------------------------------------------------
    let timers: number[] = [];
    let leave: IntersectionObserver | null = null;
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    /** Two frames with every transition off, so a state change is a cut. */
    const cut = (change: () => void, after?: () => void) => {
      root.toggleAttribute('data-ix-snap', true);
      change();
      sync();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          root.removeAttribute('data-ix-snap');
          after?.();
          sync();
        })
      );
    };

    const stop = (fade: boolean) => {
      if (!auto) return;
      clearTimers();
      leave?.disconnect();
      leave = null;
      const finish = () =>
        cut(
          () => {
            auto = false;
            root.removeAttribute('data-ix-auto');
            setup(); // the observer re-reports the step under the band
          },
          () => root.removeAttribute('data-ix-fade')
        );
      setPlaying(false);
      if (fade) {
        root.dataset.ixFade = '';
        at(FADE_QUICK, finish);
      } else {
        finish();
      }
    };

    const start = () => {
      if (auto) return;
      auto = true;
      setPlaying(true);
      leave = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) stop(false);
      });
      leave.observe(root);
      root.dataset.ixFade = '';
      // t0: the canvas is out; cut to step 1 with the loop's motion on.
      at(FADE_QUICK, () =>
        cut(
          () => {
            root.toggleAttribute('data-ix-auto', true);
            show('1');
          },
          () => root.removeAttribute('data-ix-fade')
        )
      );
      for (let k = 0; k < LOOP.loops; k++) {
        const t = FADE_QUICK + k * LOOP.period;
        at(t + LOOP.step, () => show('2'));
        at(t + 2 * LOOP.step, () => show('3'));
        at(t + 3 * LOOP.step, () => show('4'));
        if (k < LOOP.loops - 1) {
          at(t + LOOP.fadeOut, () => {
            root.dataset.ixFade = '';
          });
          at(t + LOOP.reset, () =>
            cut(
              () => show('1'),
              () => root.removeAttribute('data-ix-fade')
            )
          );
        } else {
          at(t + LOOP.fadeOut, () => stop(true));
        }
      }
    };

    ctlRef.current = { toggle: () => (auto ? stop(true) : start()) };

    return () => {
      ctlRef.current = null;
      clearTimers();
      leave?.disconnect();
      io?.disconnect();
      ends?.disconnect();
      ro?.disconnect();
      near.disconnect();
      mo.disconnect();
      rm.removeEventListener('change', sync);
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scrollend', resync);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchend', onTouch);
      window.removeEventListener('touchcancel', onTouch);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="inspect g12" ref={rootRef} data-step="1">
      <ol className="inspect-steps">
        {STEPS.map((s, i) => (
          <li
            className="inspect-step"
            key={s.title}
            data-inspect-step={i + 1}
            aria-current={i === 0 ? 'step' : undefined}
          >
            <span className="inspect-step-n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="inspect-step-title">{s.title}</h3>
            <p className="inspect-step-text">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="inspect-stage">
        <figure className="inspect-window" role="img" aria-label={LABEL}>
          <div className="inspect-chrome" aria-hidden="true">
            <span className="inspect-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="inspect-url">yoursite.com</span>
            <span className="inspect-status">
              <i className="ix-led" />
              <span className="inspect-status-word">
                <span className="inspect-status-run">Verifying</span>
                <span className="inspect-status-done">Verified</span>
              </span>
              <span className="ix-count">
                <DigitStrip values={COUNT_ROWS} at={0} segments={COUNT_SEGMENTS} />
                <span className="ix-count-of">/{ENGINE_CHECK_COUNT}</span>
              </span>
            </span>
            <span className="inspect-rail">
              <i />
            </span>
          </div>

          <div className="inspect-canvas" aria-hidden="true">
            {/* The scene's flat wrapper: it holds the lens and clips the
                leaned page above the log row (home-inspect.css). */}
            <div className="ix-clip">
              <div className="ix-scene">
                <div className="mp">
                  <div className="mp-nav ix" data-z="1" data-verdict="pass" style={{ '--i': 0 } as CSSProperties}>
                    <span className="ix-foot" />
                    <span className="ix-sheet" />
                    <span className="mp-logo">
                      <i />
                      yoursite
                    </span>
                    <span className="mp-links">
                      <span>Product</span>
                      <span>Pricing</span>
                      <span>Docs</span>
                    </span>
                    <span className="mp-signin">Sign in</span>
                    <span className="ix-box" />
                    <span className="ix-tag ix-read">nav · 4 links</span>
                  </div>

                  <div className="mp-hero">
                    <span className="mp-eyebrow">Release 4.2</span>

                    <div className="mp-h1 ix" data-z="2" data-verdict="pass" style={{ '--i': 1 } as CSSProperties}>
                      <span className="ix-foot" />
                      <span className="ix-sheet" />
                      Ship interfaces people trust.
                      <span className="ix-box" />
                      <span className="ix-reticle">
                        <i />
                      </span>
                      <span className="ix-tag ix-read">h1 · 32 / 36</span>
                      <span className="ix-chip ix-measure">
                        <b>15.8 : 1</b> contrast
                      </span>
                    </div>

                    <p className="mp-p ix" data-z="2" data-verdict="warn" style={{ '--i': 2 } as CSSProperties}>
                      <span className="ix-foot" />
                      <span className="ix-sheet" />
                      Tokens, components, and checks in one place, so the page you ship is the page you
                      designed.
                      <span className="ix-box" />
                      <span className="ix-tag ix-read">p · 17 / 27</span>
                      <span className="ix-ruler ix-measure">
                        <i className="ix-ruler-line" />
                        <span className="ix-ruler-label">
                          <DigitStrip values={MEASURE_CH} />
                          {' '}ch
                        </span>
                      </span>
                      <span className="ix-find is-warn">
                        <Pin n={1} tone="warn" />
                      </span>
                      <span className="ix-flag is-warn">
                        <b>v06</b> <span className="ix-flag-what">muted text</span> 3.8 : 1 <em>warn</em>
                      </span>
                    </p>

                    <div className="mp-actions">
                      <span className="mp-btn ix" data-z="3" data-verdict="fail" style={{ '--i': 3 } as CSSProperties}>
                        <span className="ix-foot" />
                        <span className="ix-sheet" />
                        Start free
                        <span className="ix-box" />
                        <span className="ix-tag ix-read">button · 128 × 44</span>
                        <span className="ix-target ix-measure">
                          <i className="ix-target-line" />
                          <span className="ix-target-label">
                            <DigitStrip values={TARGET_PX} />
                            {' '}px
                          </span>
                        </span>
                        <span className="ix-find is-fail">
                          <Pin n={2} tone="fail" />
                        </span>
                        <span className="ix-flag is-fail">
                          <b>v03</b> no :focus-visible ring <em>fail</em>
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="mp-cards ix" data-z="1" data-verdict="pass" style={{ '--i': 4 } as CSSProperties}>
                    <span className="ix-foot" />
                    <span className="ix-sheet" />
                    {[
                      ['Tokens', 'One source for color, type, and space'],
                      ['Components', 'Accessible by default, themable by design'],
                      ['Checks', 'Every pull request, verified'],
                    ].map(([t, d]) => (
                      <span className="mp-card" key={t}>
                        <i className="mp-card-ico" />
                        <b>{t}</b>
                        <span>{d}</span>
                      </span>
                    ))}
                    <span className="ix-box" />
                    <span className="ix-tag ix-read">3 × article</span>
                  </div>

                  <span className="ix-scan" />
                </div>
              </div>
            </div>

            <div className="ix-verdict">
              <span className="ix-verdict-grade">B</span>
              <span className="ix-verdict-body">
                <span className="ix-verdict-tally">
                  <b>{PASS}</b> pass · <b>{WARN}</b> warn · <b>{FAIL}</b> fail
                </span>
                <TallyBar className="ix-verdict-bar" />
                <span className="ix-verdict-note">A failing check caps the grade at B.</span>
              </span>
            </div>

            {/* The inspector's log: one line per step, docked over the page's
                foot on the outlines' edges. Wide, every row is reserved and
                reads as queued until its step (four rows, height fixed), and
                at step four the HUD takes its footprint; phone-width, one step
                shows at a time on two reserved rows and carries the findings
                and the grade that the hidden flags and HUD would. */}
            <div className="ix-log">
              <span className="ix-log-line" data-n="1">
                <b className="ix-log-k">read</b>
                <span className="ix-log-v">nav · h1 · p · button · 3 × article</span>
              </span>
              <span className="ix-log-line" data-n="2">
                <Queued k="measure" />
                <b className="ix-log-k">measured</b>
                <span className="ix-log-v">62 ch · 44 px · 15.8 : 1</span>
              </span>
              <span className="ix-log-line" data-n="3">
                <Queued k="find" />
                <b className="ix-log-k">found</b>
                <span className="ix-log-v ix-log-wide">
                  <Pin n={1} tone="warn" inLog /> v06 warn · <Pin n={2} tone="fail" inLog /> v03 fail
                </span>
                <span className="ix-log-v ix-log-rows">
                  <span>
                    <Pin n={1} tone="warn" inLog /> v06 muted text 3.8 : 1 <em>warn</em>
                  </span>
                  <span>
                    <Pin n={2} tone="fail" inLog /> v03 no :focus-visible <em>fail</em>
                  </span>
                </span>
              </span>
              <span className="ix-log-line" data-n="4">
                <Queued k="grade" />
                <b className="ix-log-k">graded</b>
                <b className="ix-log-grade">B</b>
                <span className="ix-log-v ix-log-wide">B · {TALLY}</span>
                <span className="ix-log-v ix-log-rows">
                  <span>{TALLY}</span>
                  <TallyBar className="ix-log-bar" />
                </span>
              </span>
            </div>
          </div>
        </figure>
        <p className="inspect-caption">
          Demo on a generic page. The checks and their thresholds are the engine&rsquo;s own.
        </p>
      </div>

      {/* Play on request, shown only when motion is reduced. A real button
          outside the role="img" figure, at the start of the narrative: above
          the steps when wide, under the pinned stage when narrow. Never inside
          the stage: its height would push the phone stage past the pinning
          threshold and unpin it for exactly the readers who need it held. */}
      <button
        type="button"
        className="ix-play"
        aria-pressed={playing}
        onClick={() => ctlRef.current?.toggle()}
      >
        <i className="ix-play-ico" aria-hidden="true" />
        Play the inspection
      </button>
    </div>
  );
}
