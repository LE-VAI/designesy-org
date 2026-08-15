// @vai/motion — main entry
//
// Five authored, named motion principles. Not components — principles.
// Each one ships with its contract backing, its provenance (which audit
// produced it, what it replaced and why), and its reduced-motion tier.
//
// Zero dependencies. Tree-shakeable. Tiered reduced-motion as a
// first-class API (tier 1 remove / tier 2 soften ≤200ms / tier 3 keep).

export { waveformTrace, fieldBreath, markSettle, blockSettle, grainShift, principles } from './principles/index.js';
export {
  REDUCED_MOTION,
  DURATION,
  EASE,
  SOFTENED,
  prefersReducedMotion,
  motionPreference,
  resolveDuration,
} from './reduced-motion.js';
