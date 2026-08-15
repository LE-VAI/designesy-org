// @vai/motion — principle: field-breath
//
// The ambient atmosphere breathes — a slow, near-imperceptible opacity
// swell and release on a background field. Not a pulse, not a beat:
// a breath. ~3.2s cycle, contract --ease-in-out.
//
// Retired: fake-liveness pulse — matched the 2026 slop tell "decorative
// motion without meaning". A pulse demands attention it never earned.
// A breath is background presence; it never asks.
//
// Contract backing: motion rules — "Wordmark mark: opacity breath only
// (~3.2s --ease-in-out); no blur, glow, or gradient decoration"
// Provenance: VAI aesthetic audit 2026-08-09
// Reduced motion: tier 2 — SOFTEN (≤200ms, transform/opacity only)

import { EASE, resolveDuration } from '../reduced-motion.js';

export const fieldBreath = {
  name: 'field-breath',
  tier: 'tier2',
  description:
    'The ambient atmosphere breathes — a slow opacity swell and release. Background presence, never a demand.',
  defaultOptions: {
    duration: 3200, // full breath cycle (~3.2s per contract wordmark rule)
    ease: EASE.inOut,
    minOpacity: 0.55,
    maxOpacity: 0.85,
  },

  // Run one breath cycle (swell + release) on an element.
  // @param el    HTMLElement
  // @param opts  { duration, ease, minOpacity, maxOpacity }
  // @returns Promise<void>
  async breathe(el, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    const duration = resolveDuration(this.tier, o.duration);
    if (duration === 0) {
      el.style.opacity = String(o.maxOpacity);
      return;
    }
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeInOut(t);
        const opacity = o.minOpacity + (o.maxOpacity - o.minOpacity) * eased;
        el.style.opacity = String(opacity);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  },

  // Start a continuous ambient loop. Returns a stop function.
  // @param el    HTMLElement
  // @param opts  { duration, ease, minOpacity, maxOpacity }
  // @returns () => void
  loop(el, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    let running = true;
    const cycle = async () => {
      while (running) {
        await this.breathe(el, o);
      }
    };
    cycle();
    return () => {
      running = false;
    };
  },
};

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
