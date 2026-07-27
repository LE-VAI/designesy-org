// Hero seam constellation — the five modular mark elements that dock on a
// vertical seam to the right of the hero copy on /.
//
// The CSS (globals.css .hero-seam) and the per-shape hover/3D-tilt JS
// (effect-enhancer.tsx) already existed but had no rendered markup to act on.
// This component wires the SVG into the hero. Shapes: dot, orbit quarter,
// square, triangle, rounded block — the brand mark grammar.
//
// Fine-pointer only (hidden < 860px via CSS). Scrambles on dock-in via the
// seamDock keyframe. Hover shifts the closest shape to signal-light and
// pulses the dot ring (EffectEnhancer handles this).

export function HeroSeam() {
  return (
    <div className="hero-seam" aria-hidden="true">
      <div className="hero-seam-line" />
      <div className="hero-seam-constellation">
        <svg
          className="hero-seam-mark"
          viewBox="0 0 148 280"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Dot — the living element (signal blue). Pulse ring expands on hover. */}
          <g className="seam-shape">
            <circle className="seam-dot-pulse" cx="74" cy="40" r="56" fill="none" stroke="var(--signal-light)" strokeWidth="2" opacity="0" />
            <circle className="seam-dot" cx="74" cy="40" r="14" />
          </g>

          {/* Orbit quarter — the second living element (signal blue). */}
          <g className="seam-shape">
            <path
              className="seam-orbit"
              d="M 24 120 A 50 50 0 0 1 124 120"
              fill="none"
              stroke="var(--signal)"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </g>

          {/* Square — body form (ink). */}
          <g className="seam-shape">
            <rect className="seam-square" x="44" y="158" width="60" height="60" rx="2" />
          </g>

          {/* Triangle — body form (ink). */}
          <g className="seam-shape">
            <path className="seam-triangle" d="M 74 232 L 44 278 L 104 278 Z" />
          </g>

          {/* Rounded block — body form (ink). */}
          <g className="seam-shape">
            <rect className="seam-block" x="34" y="150" width="16" height="16" rx="4" />
          </g>
        </svg>
      </div>
    </div>
  );
}