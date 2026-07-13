'use client';

import { useEffect, useState } from 'react';
import { buildPaneMap, PANE_PRESETS } from './optics';
import { detectPaneTier, type PaneTier } from './capability';

type FilterState = {
  sheetUrl: string;
  sheetScale: number;
  cardUrl: string;
  cardScale: number;
  chipUrl: string;
  chipScale: number;
  lensUrl: string;
  lensScale: number;
};

/**
 * SVG filter defs for true-glass refraction.
 *
 * Live diagnosis (designesy.org/labs/pane):
 * - data-pane-tier=2, blob maps, url(#pane-lens) all mounted
 * - Card still looked like soft frost: displacement coordinate space wrong
 *   + filter applied to whole node instead of a backdrop-only layer
 *
 * Correct path (rdev / liquid-glass pattern):
 * - .pane-backdrop gets light backdrop-filter (sample page)
 * - same layer gets filter:url(#pane-*) so feDisplacementMap warps that sample
 * - labels live in .pane-content above, unfiltered
 *
 * Filter units: objectBoundingBox region + userSpaceOnUse primitives with
 * pixel displacement scale (not object-fraction scale).
 */
export function PaneRoot() {
  const [tier, setTier] = useState<PaneTier>(0);
  const [maps, setMaps] = useState<FilterState | null>(null);

  useEffect(() => {
    const t = detectPaneTier();
    setTier(t);
    document.documentElement.dataset.paneTier = String(t);

    if (t < 2) return;

    const sheet = buildPaneMap({ ...PANE_PRESETS.sheet });
    const card = buildPaneMap({ ...PANE_PRESETS.card });
    const chip = buildPaneMap({ ...PANE_PRESETS.chip });
    const lens = buildPaneMap({ ...PANE_PRESETS.lens });

    setMaps({
      sheetUrl: sheet.url,
      sheetScale: sheet.scale,
      cardUrl: card.url,
      cardScale: card.scale,
      chipUrl: chip.url,
      chipScale: chip.scale,
      lensUrl: lens.url,
      lensScale: lens.scale,
    });

    return () => {
      sheet.revoke();
      card.revoke();
      chip.revoke();
      lens.revoke();
    };
  }, []);

  if (tier < 2 || !maps) return null;

  return (
    <svg
      className="pane-filter-root"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
    >
      <defs>
        <GlassFilter id="pane-sheet" mapUrl={maps.sheetUrl} scale={maps.sheetScale} />
        <GlassFilter id="pane-card" mapUrl={maps.cardUrl} scale={maps.cardScale} />
        <GlassFilter id="pane-chip" mapUrl={maps.chipUrl} scale={maps.chipScale} />
        <GlassFilter id="pane-lens" mapUrl={maps.lensUrl} scale={maps.lensScale} />
      </defs>
    </svg>
  );
}

function GlassFilter({
  id,
  mapUrl,
  scale,
}: {
  id: string;
  mapUrl: string;
  scale: number;
}) {
  // Pixel displacement — strong enough to read geometric rim bend
  const s = Math.max(48, Math.min(Math.round(scale), 110));
  const rScale = Math.round(s * 1.3);
  const gScale = s;
  const bScale = Math.round(s * 0.7);

  return (
    <filter
      id={id}
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"
      filterUnits="objectBoundingBox"
      primitiveUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      {/*
        Stretch map across the filter subregion. preserveAspectRatio=none is required
        so RG channels align to the surface, not letterboxed.
      */}
      <feImage
        href={mapUrl}
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        result="map"
        preserveAspectRatio="none"
      />

      <feDisplacementMap
        in="SourceGraphic"
        in2="map"
        scale={rScale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="dispR"
      />
      <feColorMatrix
        in="dispR"
        type="matrix"
        values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="red"
      />

      <feDisplacementMap
        in="SourceGraphic"
        in2="map"
        scale={gScale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="dispG"
      />
      <feColorMatrix
        in="dispG"
        type="matrix"
        values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="green"
      />

      <feDisplacementMap
        in="SourceGraphic"
        in2="map"
        scale={bScale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="dispB"
      />
      <feColorMatrix
        in="dispB"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
        result="blue"
      />

      <feBlend in="red" in2="green" mode="screen" result="rg" />
      <feBlend in="rg" in2="blue" mode="screen" />
    </filter>
  );
}
