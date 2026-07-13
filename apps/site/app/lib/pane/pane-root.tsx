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
 * Mounts once near document root.
 * - Detects Pane capability tier → data-pane-tier on <html>
 * - Builds cached displacement maps (blob: URLs)
 * - Injects SVG filter defs for Chromium refraction + chromatic rim
 *
 * True glass = displacement of the backdrop. Blur alone is frost.
 * Tier 2 CSS must NOT stack a heavy blur over these filters.
 */
export function PaneRoot() {
  const [tier, setTier] = useState<PaneTier>(0);
  const [maps, setMaps] = useState<FilterState | null>(null);

  useEffect(() => {
    const t = detectPaneTier();
    setTier(t);
    document.documentElement.dataset.paneTier = String(t);

    if (t < 2) {
      return;
    }

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

  if (tier < 2 || !maps) {
    return null;
  }

  return (
    <svg
      className="pane-filter-root"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <PaneFilter id="pane-sheet" mapUrl={maps.sheetUrl} scale={maps.sheetScale} chroma />
        <PaneFilter id="pane-card" mapUrl={maps.cardUrl} scale={maps.cardScale} chroma />
        <PaneFilter id="pane-chip" mapUrl={maps.chipUrl} scale={maps.chipScale} chroma />
        <PaneFilter id="pane-lens" mapUrl={maps.lensUrl} scale={maps.lensScale} chroma />
      </defs>
    </svg>
  );
}

function PaneFilter({
  id,
  mapUrl,
  scale,
  chroma,
}: {
  id: string;
  mapUrl: string;
  scale: number;
  chroma: boolean;
}) {
  // Visible institutional bend — not theatrical OS clone, but not invisible
  const s = Math.max(32, Math.min(scale, 80));
  // Chromatic dispersion: R/B split at the rim (the glass tell)
  const rScale = s * 1.28;
  const gScale = s;
  const bScale = s * 0.72;

  // Chromatic glass: three displaced channels at different scales.
  // The R/B split at the rim is the dispersion tell — glass, not frost.
  // (mono path removed: every refract surface gets chroma so the effect reads)
  void chroma;
  return (
    <filter
      id={id}
      x="-30%"
      y="-30%"
      width="160%"
      height="160%"
      colorInterpolationFilters="sRGB"
    >
      <feImage
        href={mapUrl}
        x="0"
        y="0"
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
