// Hero construction field — the architectural-interface layer behind the
// landing product surface. Not illustration: construction geometry.
//
// v2 — "the datum only." Stripped of floating primitives (sphere, chamfer,
// plane, ring, wireframe box) — those read as SaaS confetti orbiting the page,
// not deliberate geometry. What remains is the single construction circle:
// the design-legitimacy horizon line the whole site hangs from. One anchor,
// not five ornaments. This is the precision-lab register (Leica software,
// Figma restraint, Apple HIG documentation, architectural visualization,
// industrial design presentations) — the workbench the instrument sits on.
//
// The arc:
//   - giant construction circle cropped by the hero, stroke faint ink
//   - one signal-light arc segment (the "live" portion of the datum)
//   - construction ticks at fixed angles (datum registration marks)
//
// Placement math: circle c=(1000,1900) r=1150 on a 2000×1300 viewBox; its
// crown passes through the hero's upper-center. Ticks on-arc at -90, -56,
// -22, 22, 56, 90 degrees from the crown (clockwise-positive). All positions
// absolute viewBox coordinates so any future JS enhancement keeps scale math
// exact.
//
// Interactivity: none. The datum is structure, not ornament — reduced-motion
// has nothing to freeze because nothing animates. aria-hidden: pure
// decorative geometry.

export function HeroConstruction() {
  return (
    <div className="hero-construction" aria-hidden="true">
      <svg
        className="hero-construction-svg"
        viewBox="0 0 2000 1300"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="hc-arc-layer">
          {/* The datum itself — the giant construction circle. */}
          <circle
            className="hc-arc-ghost"
            cx="1000" cy="1900" r="1150"
            fill="none" strokeWidth="1"
          />
          {/* The lit segment — the live portion of the datum, where the
              current verification contract reads. */}
          <circle
            className="hc-arc-lit"
            cx="1000" cy="1900" r="1150"
            fill="none" strokeWidth="1.5"
            pathLength={360} strokeDasharray="46 314"
            transform="rotate(-64 1000 1900)"
          />
          {/* Registration ticks — fixed angles on the datum. */}
          {[-90, -56, -22, 22, 56, 90].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <circle
                key={a}
                className="hc-arc-tick"
                cx={1000 + 1150 * Math.sin(rad)}
                cy={1900 - 1150 * Math.cos(rad)}
                r="3"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
