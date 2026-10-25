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
// it just happens fast). There is no blur under reduce: tier 2 is
// transform and opacity only, as in the CSS layer (filter: none).

import { EASE, prefersReducedMotion, resolveDuration } from '../reduced-motion.js';
import { readEase } from '../easing.js';
import { readOptions } from '../options.js';
import { claim, frames } from '../frames.js';

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
  // Blur, scale and opacity follow one eased progress, written on each
  // animation frame (requestAnimationFrame).
  // @param el    HTMLElement
  // @param opts  { duration, ease, fromScale, fromBlur }
  // @returns Promise<void>
  async settle(el, opts = {}) {
    const o = readOptions(this.defaultOptions, opts);
    const ease = readEase(o.ease);
    const duration = resolveDuration(this.tier, o.duration);
    if (duration === 0) {
      claim(el);
      el.style.filter = 'none';
      el.style.opacity = '1';
      return;
    }
    const blur = prefersReducedMotion() ? 0 : o.fromBlur;
    el.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';
    el.style.opacity = '0';
    el.style.transform = `scale(${o.fromScale})`;
    await frames(el, performance.now(), duration, (t) => {
      const eased = ease(t);
      // An ease that overshoots takes eased past 1, and a negative blur()
      // is invalid CSS, so it is held at 0. Scale and opacity may overshoot.
      if (blur > 0) el.style.filter = `blur(${Math.max(0, blur * (1 - eased))}px)`;
      el.style.opacity = String(eased);
      el.style.transform = `scale(${o.fromScale + (1 - o.fromScale) * eased})`;
    });
  },
};
