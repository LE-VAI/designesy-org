// @vai/icons — main entry
//
// Authored, named, motion-bearing icons for the VAI command surface.
// Each icon ships with its motion contract (principle + tier + reduce strategy).
// Built on @vai/motion's named principles; extends them with a per-icon
// tier declaration consumers can read at a glance.
//
// Zero dependencies. Tree-shakeable.

export {
  manifest,
  iconContract,
  resolveTier,
  prefersReducedMotion,
  mountIcon,
  iconsByPrinciple,
  iconsByTier,
  counts,
} from './core.js';
