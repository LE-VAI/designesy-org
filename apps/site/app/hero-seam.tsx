// Hero seam constellation — the modular mark grammar scattered as a field to
// the right of the hero copy on /.
//
// v3 — "scatter field": the vertical spine is gone. The five shapes breathe
// in organic positions across an open canvas — no column, no ladder, no
// docked arrangement. Each is fully interactive on hover (magnetic drift,
// pulse ring, satellite spin-up, echo surge, block tumble) and on click
// (a burst ring fires from whichever shape you press).
//
//   dot      — NE anchor; keeps its JS pulse-ring on hover + click burst
//   square   — big body NW of center; dashed satellite ring orbits it
//   block    — small wanderer E of square; 8s sine bob + hover tumble
//   orbit    — wide low center-S; the arc breathes on dash-offset
//   triangle — SW; two ink echoes cascade outward behind the solid
//
// Hover (fine pointer): EffectEnhancer picks the closest shape, shifts it to
// signal-light, and gives it a magnetized 8px drift toward the cursor.
// Click any shape: that shape fires its own pulse ring (600ms expand + fade).
// Dock-in stagger preserved (0.08 → 0.34s). aria-hidden decorative.
//
// Geometry: viewBox 0 0 200 190 — a near-square canvas so the field reads as
// a constellation, not a strip. transform-box: fill-box + origin: center set
// in CSS so every idle language emanates from each shape's own centroid.

export function HeroSeam() {
  return (
    <div className="hero-seam" aria-hidden="true">
      <div className="hero-seam-constellation">
        <svg
          className="hero-seam-mark"
          viewBox="0 0 200 190"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Dot — NE anchor (signal blue). Pulse ring + click burst. */}
          <g className="seam-shape seam-shape-dot">
            <circle className="seam-dot-pulse" cx="164" cy="34" r="30" fill="none" stroke="var(--signal-light)" strokeWidth="2" opacity="0" />
            <circle className="seam-dot" cx="164" cy="34" r="11" />
          </g>

          {/* Square — big body NW of center (ink). Dashed satellite orbits it. */}
          <g className="seam-shape seam-shape-square">
            <rect className="seam-square" x="40" y="72" width="52" height="52" rx="2" />
            <rect
              className="seam-square-satellite"
              x="32"
              y="64"
              width="68"
              height="68"
              rx="8"
              fill="none"
              stroke="var(--muted-dim)"
              strokeWidth="1"
              strokeDasharray="3 6"
            />
          </g>

          {/* Orbit — wide low center-S (signal blue). Breathing arc aperture. */}
          <g className="seam-shape seam-shape-orbit">
            <path
              className="seam-orbit"
              d="M 74 168 A 40 40 0 0 1 154 168"
              fill="none"
              stroke="var(--signal)"
              strokeWidth="9"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="60 40"
            />
          </g>

          {/* Block — small wanderer NE of square / SE of dot (ink). */}
          <g className="seam-shape seam-shape-block">
            <rect className="seam-block" x="144" y="92" width="15" height="15" rx="4" />
          </g>

          {/* Triangle — SW (ink). Echo cascade behind the solid. */}
          <g className="seam-shape seam-shape-triangle">
            <path className="seam-triangle-echo is-echo-2" d="M 38 142 L 18 174 L 58 174 Z" />
            <path className="seam-triangle-echo is-echo-1" d="M 38 142 L 18 174 L 58 174 Z" />
            <path className="seam-triangle" d="M 38 142 L 18 174 L 58 174 Z" />
          </g>
        </svg>
      </div>
    </div>
  );
}
