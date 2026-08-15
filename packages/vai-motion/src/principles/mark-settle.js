// @vai/motion — principle: mark-settle
//
// The mark resolves — blur-to-sharp iris settle. A logo or emblem enters
// out of focus and settles into crisp clarity. The attention is earned by
// arriving sharp: focus, then rest.
//
// Retired: generic blur-to-sharp reveals were being used as throwaway
// decoration; the authored version is the mark's OWN settle — one moment,
// one object, then stillness (contract: "ONE authored moment per
// composition, not scattered identical entrances").
//
// Contract backing: motion §ten_standards (entrances have opacity;
// animate from scale 0.9–0.97, never scale(0); easing is deliberate)
// Provenance: VAI aesthetic audit 2026-08-09
// Reduced motion: tier 2 — SOFTEN (≤200ms — the settle still happens,
// it just happens fast)

import { EASE, resolveDuration } from '../reduced-motion.js';

export const markSettle = {
  name: 'mark-settle',
  tier: 'tier2',
  description:
    'The mark resolves — blur-to-sharp iris settle. Arrive sharp, then rest.',
  defaultOptions: {
    duration: 600, // primary entrance --duration
    ease: EASE.out,
    fromScale: 0.95, // contract entrance default scale
    fromBlur: 8, // px
  },

  // Settle a mark (image, svg, or text element) from blur to sharp.
  // Uses a temporary class with CSS transitions for the blur, and a
  // WAAPI animation for the scale+opacity (transform/opacity only).
  // @param el    HTMLElement
  // @param opts  { duration, ease, fromScale, fromBlur }
  // @returns Promise<void>
  async settle(el, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    const duration = resolveDuration(this.tier, o.duration);
    if (duration === 0) {
      el.style.filter = 'none';
      el.style.opacity = '1';
      return;
    }
    el.style.filter = `blur(${o.fromBlur}px)`;
    el.style.opacity = '0';
    el.style.transform = `scale(${o.fromScale})`;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        el.style.filter = `blur(${o.fromBlur * (1 - eased)}px)`;
        el.style.opacity = String(eased);
        el.style.transform = `scale(${o.fromScale + (1 - o.fromScale) * eased})`;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  },
};

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
