// @vai/motion — principle: grain-shift
//
// Ambient grain shifts — a subtle noise texture drifts over the surface,
// never static, never demanding. Film-grain honesty for a digital
// command surface. The surface is alive without pretending to pulse.
//
// Retired: scan-beam texture noise (generic tech trope). Grain-shift is
// the quiet version: texture as material, not as decoration.
//
// Contract backing: motion §ten_standards (properties are explicit —
// transform/opacity only; no layout animation). Uses a CSS keyframe
// translate on a pre-rendered noise layer: GPU-composited, cheap.
// Provenance: VAI aesthetic audit 2026-08-09
// Reduced motion: tier 1 — REMOVE (ambient texture; no information lost)

export const grainShift = {
  name: 'grain-shift',
  tier: 'tier1',
  description:
    'Ambient grain shifts — a subtle noise texture drifts over the surface. Material, not decoration.',
  defaultOptions: {
    speed: 'slow', // 'slow' | 'normal' — keyframe duration
  },

  // Apply the grain class to an element. Requires the grain texture
  // layers (see styles/vai-motion.css — .vai-grain).
  // @param el    HTMLElement
  // @param opts  { speed }
  apply(el, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    el.classList.add('vai-grain');
    el.classList.add(`vai-grain--${o.speed}`);
  },

  // Remove the grain layer.
  remove(el) {
    el.classList.remove('vai-grain', 'vai-grain--slow', 'vai-grain--normal');
  },
};
