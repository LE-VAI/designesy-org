// @vai/motion — reduced-motion tiering
//
// Industry default is a binary kill-switch: `prefers-reduced-motion: reduce`
// sets every duration to 0.01ms. That obliterates meaning along with motion.
//
// VAI tiers it. Every principle carries its own tier, and the tier decides
// what happens for users who ask for less motion:
//
//   tier 1 — REMOVE  (remove entirely; the motion carried no information)
//   tier 2 — SOFTEN  (≤200ms, transform/opacity only — the meaning survives)
//   tier 3 — KEEP    (essential motion: the motion IS the information)
//
// No other motion library tiers reduced motion as a first-class API.
// This is contract §10 "Reduced-motion is handled" made explicit.

export const REDUCED_MOTION = Object.freeze({
  tier1: 'remove',
  tier2: 'soften',
  tier3: 'keep',
});

// Contract motion tokens (designesy.org contract, motion section)
export const DURATION = Object.freeze({
  quick: 150, // close, swap, tooltip
  fast: 250, // open, hover transition, icon swap
  medium: 350, // panel close, toast
  slow: 400, // panel open, skeleton reveal
  primary: 600, // primary entrance
});

export const EASE = Object.freeze({
  default: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  out: 'cubic-bezier(0.23, 1, 0.32, 1)', // exit / settle
  inOut: 'cubic-bezier(0.77, 0, 0.175, 1)', // symmetric
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)', // drawer / panel slide
});

// Tier-2 softened durations — never above 200ms (WCAG 2.2 §2.3.3 spirit,
// contract "UI animation stays at or below 300ms unless justified").
export const SOFTENED = Object.freeze({
  quick: 120,
  fast: 180,
  medium: 200,
  slow: 200,
  primary: 200,
});

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function motionPreference() {
  if (typeof window === 'undefined') return { reduced: false, tier: null };
  const reduced = prefersReducedMotion();
  return { reduced, tier: reduced ? 'reduced' : 'full' };
}

// Resolve a duration given the user's motion preference and the principle's tier.
// tier 1 → 0 (removed), tier 2 → softened ≤200ms, tier 3 → full duration.
export function resolveDuration(tier, duration) {
  if (!prefersReducedMotion()) return duration;
  if (tier === 'tier1') return 0;
  if (tier === 'tier2') return Math.min(SOFTENED[durationKey(duration)] ?? 200, 200);
  return duration; // tier 3 — keep
}

function durationKey(duration) {
  const entry = Object.entries(DURATION).find(([, v]) => v === duration);
  return entry ? entry[0] : null;
}
