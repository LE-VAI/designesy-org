// @vai/motion — principle: field-breath
//
// The ambient atmosphere breathes — a slow, near-imperceptible opacity
// swell on a background field. Not a pulse, not a beat: a breath.
// ~3.2s swell, contract --ease-in-out.
//
// Retired: fake-liveness pulse — matched the 2026 slop tell "decorative
// motion without meaning". A pulse demands attention it never earned.
// A breath is background presence; it never asks.
//
// Contract backing: motion rules — "Wordmark mark: opacity breath only
// (~3.2s --ease-in-out); no blur, glow, or gradient decoration"
// Provenance: VAI aesthetic audit 2026-08-09
// Reduced motion: tier 2 — SOFTEN (≤200ms, transform/opacity only).
// loop() runs one 200ms swell and then rests, as the CSS layer runs the
// breath once (animation-iteration-count: 1 under reduce).

import { EASE, prefersReducedMotion, resolveDuration } from '../reduced-motion.js';
import { readEase } from '../easing.js';
import { readOptions } from '../options.js';
import { claim, frames } from '../frames.js';

export const fieldBreath = {
  name: 'field-breath',
  tier: 'tier2',
  description:
    'The ambient atmosphere breathes — a slow opacity swell. Background presence, never a demand.',
  defaultOptions: {
    duration: 3200, // one swell (~3.2s per contract wordmark rule)
    ease: EASE.inOut,
    minOpacity: 0.55,
    maxOpacity: 0.85,
  },

  // Run one swell on an element: opacity eases from minOpacity up to
  // maxOpacity over `duration`. It does not release; see loop().
  // @param el    HTMLElement
  // @param opts  { duration, ease, minOpacity, maxOpacity }
  // @returns Promise<void>
  async breathe(el, opts = {}) {
    const o = readOptions(this.defaultOptions, opts);
    const ease = readEase(o.ease);
    await swell(el, o, ease, resolveDuration(this.tier, o.duration));
  },

  // Start a continuous ambient loop. Returns a stop function, which takes
  // effect on the next frame: the field keeps the opacity it has then.
  // Each cycle is one breathe(), so opacity steps from maxOpacity back to
  // minOpacity in one frame between cycles.
  // Under reduced motion, or with duration 0, it runs one swell and rests
  // at maxOpacity. Repeating a 200ms swell would drop opacity in one frame
  // about five times a second, for exactly the users who asked for less
  // motion.
  // The loop ends early if another run takes the element (src/frames.js).
  // @param el    HTMLElement
  // @param opts  { duration, ease, minOpacity, maxOpacity }
  // @returns () => void
  loop(el, opts = {}) {
    // A bad option throws here, at the call, not in the unawaited cycle.
    const o = readOptions(this.defaultOptions, opts);
    const ease = readEase(o.ease);
    const duration = resolveDuration(this.tier, o.duration);
    let running = true;
    const live = () => running;
    const cycle = async () => {
      if (prefersReducedMotion() || duration === 0) {
        await swell(el, o, ease, duration, live);
        return;
      }
      let more = true;
      while (more) more = await swell(el, o, ease, duration, live);
    };
    cycle();
    return () => {
      running = false;
    };
  },
};

// One swell from minOpacity to maxOpacity. Resolves true when it reaches
// maxOpacity, false if it was stopped first.
function swell(el, o, ease, duration, live) {
  if (duration === 0) {
    claim(el);
    el.style.opacity = String(o.maxOpacity);
    return Promise.resolve(true);
  }
  return frames(
    el,
    performance.now(),
    duration,
    (t) => {
      el.style.opacity = String(o.minOpacity + (o.maxOpacity - o.minOpacity) * ease(t));
    },
    live,
  );
}
