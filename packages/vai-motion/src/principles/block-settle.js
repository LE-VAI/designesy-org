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
// Reduced motion: tier 2 — SOFTEN (≤200ms — blocks still arrive, fast)

import { EASE, resolveDuration } from '../reduced-motion.js';

export const blockSettle = {
  name: 'block-settle',
  tier: 'tier2',
  description:
    'Content blocks settle into place — one composed, weighted drop onto the grid.',
  defaultOptions: {
    duration: 600, // primary entrance --duration
    ease: EASE.out,
    fromScale: 0.97, // contract interactive settle scale
    stagger: 80, // ms between blocks (contract stagger interval 30–80ms)
  },

  // Settle one block (scale + opacity, transform-only).
  // @param el    HTMLElement
  // @param opts  { duration, ease, fromScale }
  // @returns Promise<void>
  async settle(el, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    const duration = resolveDuration(this.tier, o.duration);
    if (duration === 0) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }
    el.style.opacity = '0';
    el.style.transform = `scale(${o.fromScale})`;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        el.style.opacity = String(eased);
        el.style.transform = `scale(${o.fromScale + (1 - o.fromScale) * eased})`;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  },

  // Settle an ordered set of blocks with the contract stagger interval.
  // @param els   HTMLElement[]  (in settle order)
  // @param opts  { duration, ease, fromScale, stagger }
  // @returns Promise<void>
  async settleAll(els, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    for (let i = 0; i < els.length; i++) {
      await this.settle(els[i], { ...o, delay: i * o.stagger });
    }
  },
};

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
