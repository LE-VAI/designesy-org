// @vai/motion — principle: block-settle
//
// Content blocks settle into place — a composed, weighted drop from a
// slight scale-down, landing on the grid. Not a bounce: an ordered settle,
// each block a short stagger after the one before, so the order reads as
// structure.
//
// Retired: scattered identical entrances (the "everything fades up at
// once" tell). Doctrine: ONE authored moment per composition. Blocks
// arrive in an order that reads as structure, not decoration.
//
// Contract backing: motion rules — entrance "fadeUp 0.6s --ease-out, …
// with staggered delays (0.08s steps)"; interactive settle scale(0.97) at
// ~160ms --ease-out (Poise · adopted v0.1.1)
// Provenance: VAI aesthetic audit 2026-08-09
// Reduced motion: tier 2 — SOFTEN (≤200ms — blocks still arrive, fast).
// The delay and the stagger are dropped too, so all blocks settle
// together, in 200ms (see settle()).

import { EASE, prefersReducedMotion, resolveDuration } from '../reduced-motion.js';
import { readEase } from '../easing.js';
import { readOptions } from '../options.js';
import { claim, frames } from '../frames.js';

export const blockSettle = {
  name: 'block-settle',
  tier: 'tier2',
  description:
    'Content blocks settle into place — one composed, weighted drop onto the grid.',
  defaultOptions: {
    duration: 600, // primary entrance --duration
    ease: EASE.out,
    fromScale: 0.97, // contract interactive settle scale
    delay: 0, // ms the block holds its from-state before it moves
    stagger: 80, // ms between blocks (contract stagger interval 30–80ms)
  },

  // Settle one block (scale + opacity, transform-only). The block takes
  // its from-state at once and holds it for `delay` ms. With duration 0
  // it lands at once, or after `delay` if there is one.
  // @param el    HTMLElement
  // @param opts  { duration, ease, fromScale, delay }
  // @returns Promise<void>  resolves when the block lands, or early if a
  //   newer run on the same element stops this one (see src/frames.js)
  async settle(el, opts = {}) {
    const o = readOptions(this.defaultOptions, opts);
    const ease = readEase(o.ease);
    const duration = resolveDuration(this.tier, o.duration);
    // Under reduced motion the wait goes with the length. Tier 2 promises
    // ≤200ms; eight blocks at an 80ms stagger would otherwise take 760ms.
    // The CSS layer does the same (animation-delay: 0s under reduce).
    const delay = prefersReducedMotion() ? 0 : o.delay;
    if (duration === 0 && delay <= 0) {
      claim(el);
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }
    el.style.opacity = '0';
    el.style.transform = `scale(${o.fromScale})`;
    await frames(el, performance.now() + delay, duration, (t) => {
      const eased = ease(t);
      el.style.opacity = String(eased);
      el.style.transform = `scale(${o.fromScale + (1 - o.fromScale) * eased})`;
    });
  },

  // Settle an ordered set of blocks with the contract stagger interval.
  // Block i starts `delay + i * stagger` ms after the call (at once under
  // reduced motion). The blocks overlap, and the promise resolves when the
  // last one lands.
  // 3 blocks at 600ms with an 80ms stagger: 600 + 2 × 80 = 760ms.
  // Every block takes its from-state at the call, so the last of n blocks
  // stays hidden for delay + (n − 1) × stagger ms before it moves.
  // If a block fails (for example, an entry that is not an element), the
  // others still land, and then the promise rejects with the first error.
  // @param els   HTMLElement[] or NodeList (in settle order)
  // @param opts  { duration, ease, fromScale, delay, stagger }
  // @returns Promise<void>
  async settleAll(els, opts = {}) {
    const o = readOptions(this.defaultOptions, opts);
    readEase(o.ease); // a bad ease throws here, before any block is touched
    const results = await Promise.allSettled(
      Array.from(els, (el, i) => this.settle(el, { ...o, delay: o.delay + i * o.stagger })),
    );
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
  },
};
