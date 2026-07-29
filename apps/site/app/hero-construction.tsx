// Hero construction field — the architectural-interface layer behind the
// landing product surface. Not illustration: construction geometry.
//
// v1 — "architectural interface": the huge inverted arc is the fixed datum of
// the hero (a design-legitimacy horizon line). CAD primitives sit ON or float
// AROUND that datum, mathematically placed on its circle — no randomness.
// Studio lighting is baked in: a large soft key (signal bloom) high-right,
// and a huge soft shadow pool low-center, "almost like Apple photographed the
// shapes." Three depth layers land as: background (page grid + fog + noise,
// already global) ← this SVG midground ← foreground glass UI (score panel).
//
//   arc     — the motif: a giant construction circle cropped by the hero,
//             stroke faint ink, one signal-light arc segment, fixed ticks.
//   sphere  — perfect sphere, sits ON the datum at -24° (NE), signal bloom.
//   chamfer — chamfered square, floats NW of center, ink + inner-light edge.
//   plane   — thin floating plane, E, catches a long shadow.
//   ring    — thin ring, sits ON the datum at -156° (SW), signal inner glow.
//   box     — wireframe box, SE low, dashed construction edges.
//
// Placement math: circle c=(1000,1900) r=1150 on a 2000×1300 viewBox; its
// crown passes through the hero's upper-center. On-arc points:
//   θ measured from the crown, clockwise-positive:
//   sphere (-24°, on-arc center (1468,848.8), r=72 → rect x=1392..1544)
//   ring   (-156°, on-arc center (531.9,848.8), r=62)
// Free-floating primitives at fixed construction coordinates:
//   chamfer rect (420,420)-(620,620) · plane rect (1500,330)-(1695,344)
//   box wireframe occupying (330-490, 800-1010)
// All positions are absolute viewBox coordinates so EffectEnhancer's
// viewport→viewBox scale math (triggerBurst) stays exact.
//
// Interactivity (fine pointer): reuses the EffectEnhancer seam machinery on
// each primitive <g class="hero-construction-mark"> — closest shape gets the
// magnetic drift + signal-light fill shift; click fires the burst ring; the
// sphere keeps the JS pulse ring. Hover personalities (CSS, no-preference
// only): sphere bloom tightens, ring glow spin-up, plane settle, box edge
// flicker. Reduced-motion: every animation freezes to a quiet static; the
// arc is fully drawn (structure, not animation).

export function HeroConstruction() {
  return (
    <div className="hero-construction" aria-hidden="true">
      <svg
        className="hero-construction-svg"
        viewBox="0 0 2000 1300"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Giant soft key light — the signal bloom behind the sphere. */}
          <radialGradient id="hc-bloom" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--signal-light)" stopOpacity="0.55" />
            <stop offset="45%" stopColor="var(--signal)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </radialGradient>
          {/* Sphere body — lit from top-left, almost photographic. */}
          <radialGradient id="hc-sphere" cx="33%" cy="26%" r="80%">
            <stop offset="0%" stopColor="#8fa4ff" />
            <stop offset="26%" stopColor="var(--signal-light)" />
            <stop offset="72%" stopColor="var(--signal)" />
            <stop offset="100%" stopColor="#0a2a9e" />
          </radialGradient>
          {/* Chamfered square — ink body, top face catches the key light. */}
          <linearGradient id="hc-chamfer" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#18181d" />
            <stop offset="100%" stopColor="#0b0b0e" />
          </linearGradient>
          {/* Thin ring — ink metal with a signal inner edge. */}
          <linearGradient id="hc-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1d1d22" />
            <stop offset="100%" stopColor="#0e0e11" />
          </linearGradient>
          {/* Shadow pool — the huge soft shadow under the hero. */}
          <radialGradient id="hc-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#000000" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* --- Datum: the giant construction circle -------------------------
            c=(1000,1900) r=1150. The crown passes through the hero's
            upper-center; the limbs fall below the fold like a horizon. */}
        <g className="hc-arc-layer">
          <circle className="hc-arc-ghost" cx="1000" cy="1900" r="1150" fill="none" strokeWidth="1" />
          <circle className="hc-arc-lit" cx="1000" cy="1900" r="1150" fill="none"
                  strokeWidth="1.5" pathLength={360} strokeDasharray="46 314"
                  transform="rotate(-64 1000 1900)" />
          {/* Construction ticks at fixed angles on the datum. */}
          {[-90, -56, -22, 22, 56, 90].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <circle key={a} className="hc-arc-tick"
                      cx={1000 + 1150 * Math.sin(rad)}
                      cy={1900 - 1150 * Math.cos(rad)} r="3" />
            );
          })}
        </g>

        {/* --- Shadow pool --------------------------------------------------- */}
        <ellipse className="hc-shadow" cx="1000" cy="1175" rx="640" ry="86"
                 fill="url(#hc-shadow)" />

        {/* --- Sphere — on the datum at -24° (NE). The hero light source. --- */}
        <g className="hero-construction-mark hc-prim hc-prim-sphere">
          <circle className="hc-bloom-field" cx="1468" cy="848" r="165" fill="url(#hc-bloom)" />
          {/* JS pulse-ring host (EffectEnhancer targets .seam-dot-pulse) */}
          <circle className="seam-dot-pulse" cx="1468" cy="848" r="98" fill="none"
                  stroke="var(--signal-light)" strokeWidth="1.5" opacity="0" />
          <g className="seam-shape seam-shape-dot">
            <circle className="seam-dot hc-sphere-body" cx="1468" cy="848" r="72"
                    fill="url(#hc-sphere)" />
            {/* photographic highlight sliver */}
            <ellipse cx="1440" cy="812" rx="32" ry="18" fill="#ffffff"
                     opacity="0.18" transform="rotate(-32 1440 812)" />
          </g>
        </g>

        {/* --- Chamfered square — NW of center, floating ink body. ---------- */}
        <g className="hero-construction-mark hc-prim hc-prim-chamfer">
          <g className="seam-shape seam-shape-square">
            <path className="seam-square hc-chamfer-body"
                  d="M 434 434 L 606 434 L 620 448 L 620 606 L 606 620 L 434 620 L 420 606 L 420 448 Z"
                  fill="url(#hc-chamfer)" stroke="var(--line-strong)" strokeWidth="1" />
            <path d="M 434 434 L 606 434 L 620 448" fill="none"
                  stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" />
          </g>
        </g>

        {/* --- Floating plane — E, thin slab. -------------------------------- */}
        <g className="hero-construction-mark hc-prim hc-prim-plane">
          <g className="seam-shape seam-shape-block">
            {/* Parked in the free band above the input, inside the datum ring
                (ring inner edge at y≈330 here) and right of the editorial
                title column (titles end ≈x1395). The midline-centered spot
                (~x1150,y470) is reserved for the input — the orbit, never
                the obstacle. */}
            <rect className="seam-block hc-plane-body" x="1500" y="330"
                  width="195" height="14" rx="2" fill="#101014"
                  stroke="var(--line-strong)" strokeWidth="1" />
            <line x1="1500" y1="330" x2="1695" y2="330" stroke="#ffffff"
                  strokeOpacity="0.14" strokeWidth="1" />
          </g>
        </g>

        {/* --- Thin ring — on the datum at -156° (SW). ----------------------- */}
        <g className="hero-construction-mark hc-prim hc-prim-ring">
          <g className="seam-shape seam-shape-orbit">
            <circle className="hc-ring-body" cx="532" cy="848" r="62" fill="none"
                    stroke="url(#hc-ring)" strokeWidth="7" />
            <circle className="seam-orbit hc-ring-glow" cx="532" cy="848" r="62"
                    fill="none" stroke="var(--signal-light)" strokeOpacity="0.22"
                    strokeWidth="1.5" />
          </g>
        </g>

        {/* --- Wireframe box — W low, dashed construction edges. ------------ */}
        <g className="hero-construction-mark hc-prim hc-prim-box">
          <g className="seam-shape seam-shape-triangle hc-box">
            <path className="seam-triangle hc-box-edges"
                  d="M 330 850 L 420 828 L 420 942 L 330 964 Z" />
            <path className="hc-box-edges" d="M 420 828 L 476 856 L 476 970 L 420 942 Z" />
            <path className="hc-box-edges" fill="none"
                  d="M 330 964 L 386 992 L 476 970 L 420 942 M 330 850 L 386 878 L 476 856 M 386 878 L 386 992 M 386 878 L 420 942" />
          </g>
        </g>
      </svg>
    </div>
  );
}
