// @vai/motion — principle: block-settle
//
// Content blocks settle into place — a composed, weighted drop from a
// slight scale-down, landing on the grid. Not a bounce, not a stagger
// of identical entrances: a single composed settle per section.
//
// Retired: scattered identical entrances (the "everything fades up at
// once" tell). Doctrine: ONE authored moment per composition. Blocks
// arrive in an order that reads as structure, not decoration.
//
// Contract backing: motion rules — entrance "fadeUp 0.6s --ease with
// staggered delays (0.08s steps)"; interactive settle scale(0.97) at
// ~160ms --ease-out (Poise · adopted v0.1.1)
// Provenance: VAI aesthetic audit 2026-08-09
// Reduced motion: tier 2 — SOFTEN (≤200ms — blocks still arrive, fast).
// The delay and the stagger are dropped too, so all blocks settle
// together, in 200ms (see settle()).

import { EASE, prefersReducedMotion, resolveDuration } from '../reduced-motion.js';
import { readEase } from '../easing.js';

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
  // its from-state at once and holds it for `delay` ms.
  // @param el    HTMLElement
  // @param opts  { duration, ease, fromScale, delay }
  // @returns Promise<void>  resolves when the block lands
  async settle(el, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    const ease = readEase(o.ease);
    const duration = resolveDuration(this.tier, o.duration);
    if (duration === 0) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }
    // Under reduced motion the wait goes with the length. Tier 2 promises
    // ≤200ms; eight blocks at an 80ms stagger would otherwise take 760ms.
    // The CSS layer does the same (animation-delay: 0s under reduce).
    const delay = prefersReducedMotion() ? 0 : o.delay;
    el.style.opacity = '0';
    el.style.transform = `scale(${o.fromScale})`;
    const start = performance.now() + delay;
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        const eased = ease(t);
        el.style.opacity = String(eased);
        el.style.transform = `scale(${o.fromScale + (1 - o.fromScale) * eased})`;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  },

  // Settle an ordered set of blocks with the contract stagger interval.
  // Block i starts `delay + i * stagger` ms after the call (at once under
  // reduced motion). The blocks overlap, and the promise resolves when the
  // last one lands.
  // 3 blocks at 600ms with an 80ms stagger: 600 + 2 × 80 = 760ms.
  // @param els   HTMLElement[] or NodeList (in settle order)
  // @param opts  { duration, ease, fromScale, delay, stagger }
  // @returns Promise<void>
  async settleAll(els, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    await Promise.all(
      Array.from(els, (el, i) => this.settle(el, { ...o, delay: o.delay + i * o.stagger })),
    );
  },
};
