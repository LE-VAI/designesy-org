'use client';

import { useEffect, useId, useState } from 'react';
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
 * - Builds cached displacement maps
 * - Injects SVG filter defs for Chromium refraction
 *
 * Frost tier needs no SVG. Refract tier uses backdrop-filter: url(#pane-*).
 */
export function PaneRoot() {
  const uid = useId().replace(/:/g, '');
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
      sheetScale: Math.min(sheet.scale, 18),
      cardUrl: card.url,
      cardScale: Math.min(card.scale, 22),
      chipUrl: chip.url,
      chipScale: Math.min(chip.scale, 16),
      lensUrl: lens.url,
      lensScale: Math.min(lens.scale, 28),
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
        <PaneFilter
          id={`pane-sheet-${uid}`}
          mapUrl={maps.sheetUrl}
          scale={maps.sheetScale}
          chroma={false}
        />
        <PaneFilter
          id={`pane-card-${uid}`}
          mapUrl={maps.cardUrl}
          scale={maps.cardScale}
          chroma
        />
        <PaneFilter
          id={`pane-chip-${uid}`}
          mapUrl={maps.chipUrl}
          scale={maps.chipScale}
          chroma={false}
        />
        <PaneFilter
          id={`pane-lens-${uid}`}
          mapUrl={maps.lensUrl}
          scale={maps.lensScale}
          chroma
        />
        <PaneFilter
          id="pane-sheet"
          mapUrl={maps.sheetUrl}
          scale={maps.sheetScale}
          chroma={false}
        />
        <PaneFilter
          id="pane-card"
          mapUrl={maps.cardUrl}
          scale={maps.cardScale}
          chroma
        />
        <PaneFilter
          id="pane-chip"
          mapUrl={maps.chipUrl}
          scale={maps.chipScale}
          chroma={false}
        />
        <PaneFilter
          id="pane-lens"
          mapUrl={maps.lensUrl}
          scale={maps.lensScale}
          chroma
        />
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
  const s = Math.max(4, Math.min(scale, 32));
  const rScale = s * 1.06;
  const bScale = s * 0.94;

  if (!chroma) {
    return (
      <filter
        id={id}
        x="-8%"
        y="-8%"
        width="116%"
        height="116%"
        filterUnits="objectBoundingBox"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={mapUrl}
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          result="map"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale={s}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    );
  }

  return (
    <filter
      id={id}
      x="-10%"
      y="-10%"
      width="120%"
      height="120%"
      filterUnits="objectBoundingBox"
      colorInterpolationFilters="sRGB"
    >
      <feImage
        href={mapUrl}
        x="0"
        y="0"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        result="map"
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
        scale={s}
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
