// Hero seam constellation — the modular mark grammar docked on a vertical
// seam to the right of the hero copy on /.
//
// v2 — "creative rework": the five dead statics come alive. Each shape now
// carries its own idle language (all transforms + stroke-offsets, zero
// fill/opacity painting, all honors prefers-reduced-motion via globals.css):
//
//   orbit   — the arc BREATHES: dash-array slow-cycles 60→100→60 over 8s,
//             the contract's own motion idiom made ambient
//   square  — a dashed satellite ORBITS the solid square on a 12s loop
//   triangle — three ink echoes cascade outward (1.00→1.06→1.12 scale, fade)
//   block   — the rounded block now drifts on an 8s sine bob beside the square
//   dot     — keeps its JS pulse-ring on hover (EffectEnhancer)
//
// Hover: EffectEnhancer still shifts the closest shape to signal-light.
// Scramble dock-in: seamDock keyframe + per-shape delays, unchanged.
// Fine-pointer only (hidden < 860px via CSS). aria-hidden decorative.
//
// Geometry notes: viewBox 0 0 148 300 (was 280 — triangle cascade needed
// headroom at the bottom). transform-box: fill-box + transform-origin: center
// are set in CSS so scale cascades emanate from each shape's own centroid.

export function HeroSeam() {
  return (
    <div className="hero-seam" aria-hidden="true">
      <div className="hero-seam-line" />
      <div className="hero-seam-constellation">
        <svg
          className="hero-seam-mark"
          viewBox="0 0 148 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Dot — the living element (signal blue). Pulse ring expands on hover. */}
          <g className="seam-shape">
            <circle className="seam-dot-pulse" cx="74" cy="40" r="56" fill="none" stroke="var(--signal-light)" strokeWidth="2" opacity="0" />
            <circle className="seam-dot" cx="74" cy="40" r="14" />
          </g>

          {/* Orbit — breathing arc (signal blue). The dash-array cycle makes
              the quarter-dome slowly open and close like a lens aperture. */}
          <g className="seam-shape">
            <path
              className="seam-orbit"
              d="M 24 120 A 50 50 0 0 1 124 120"
              fill="none"
              stroke="var(--signal)"
              strokeWidth="10"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="60 40"
            />
          </g>

          {/* Square — body form (ink) with an orbiting dashed satellite.
              The satellite ring rotates around the square's centroid. */}
          <g className="seam-shape">
            <rect className="seam-square" x="44" y="158" width="60" height="60" rx="2" />
            <rect
              className="seam-square-satellite"
              x="36"
              y="150"
              width="76"
              height="76"
              rx="8"
              fill="none"
              stroke="var(--muted-dim)"
              strokeWidth="1"
              strokeDasharray="3 6"
            />
          </g>

          {/* Block — bobbing satellite (ink). Drifts on an 8s sine beside the
              square, the constellation's smallest body with the most wander. */}
          <g className="seam-shape">
            <rect className="seam-block" x="30" y="146" width="16" height="16" rx="4" />
          </g>

          {/* Triangle — echo cascade (ink). Two expanding ghost copies pulse
              outward behind the solid form; a blueprint leaving the page. */}
          <g className="seam-shape">
            <path className="seam-triangle-echo is-echo-2" d="M 74 232 L 44 278 L 104 278 Z" />
            <path className="seam-triangle-echo is-echo-1" d="M 74 232 L 44 278 L 104 278 Z" />
            <path className="seam-triangle" d="M 74 232 L 44 278 L 104 278 Z" />
          </g>
        </svg>
      </div>
    </div>
  );
}
