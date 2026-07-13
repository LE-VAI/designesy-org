'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { buildPaneMap, PANE_PRESETS, type PaneMapResult } from './optics';
import { detectPaneTier, type PaneTier } from './capability';

type PaneKind = 'sheet' | 'card' | 'chip' | 'lens';

type PaneSurfaceProps = {
  kind?: PaneKind;
  refract?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * Layered glass surface with per-element sized optics.
 *
 * Live failure mode: shared global filters + wrong coordinate space produced
 * soft frost smear, not geometric rim bend on the "Pane lens" card.
 *
 * Fix: measure this surface, build a map at its pixel size, mount a local
 * SVG filter, apply `backdrop-filter: url(#id)` on the backdrop layer only.
 * Labels stay on .pane-content, unfiltered.
 */
export function PaneSurface({
  kind = 'card',
  refract = true,
  className = '',
  style,
  children,
}: PaneSurfaceProps) {
  const reactId = useId().replace(/:/g, '');
  const filterId = `pane-local-${kind}-${reactId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [tier, setTier] = useState<PaneTier>(0);
  const [map, setMap] = useState<PaneMapResult | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0, r: 0 });

  useEffect(() => {
    setTier(detectPaneTier());
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const radius = parseFloat(cs.borderRadius) || (kind === 'lens' ? 28 : kind === 'chip' ? 999 : 14);
      const w = Math.max(48, Math.round(rect.width));
      const h = Math.max(48, Math.round(rect.height));
      setBox({ w, h, r: Math.min(radius, w / 2, h / 2) });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [kind]);

  useEffect(() => {
    if (!refract || tier < 2 || box.w < 48 || box.h < 48) {
      setMap(null);
      return;
    }

    const preset = PANE_PRESETS[kind];
    const next = buildPaneMap({
      width: box.w,
      height: box.h,
      radius: box.r || preset.radius,
      bezel: preset.bezel,
      profile: preset.profile,
      gain: preset.gain,
    });
    setMap(next);

    return () => {
      // Don't revoke shared cache entries aggressively — maps are keyed by size
    };
  }, [refract, tier, box.w, box.h, box.r, kind]);

  const shell = [
    'pane-surface',
    `pane-${kind}`,
    refract ? 'pane-refract' : '',
    tier >= 2 && map ? 'pane-refract-live' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const s = map ? Math.max(55, Math.min(Math.round(map.scale), 140)) : 80;
  const rScale = Math.round(s * 1.28);
  const gScale = s;
  const bScale = Math.round(s * 0.72);

  return (
    <div ref={rootRef} className={shell} style={style}>
      {tier >= 2 && map ? (
        <svg
          className="pane-local-filter"
          aria-hidden="true"
          focusable="false"
          width="0"
          height="0"
        >
          <defs>
            <filter
              id={filterId}
              x="-40%"
              y="-40%"
              width="180%"
              height="180%"
              filterUnits="objectBoundingBox"
              primitiveUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={map.url}
                x="0"
                y="0"
                width={map.width}
                height={map.height}
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
          </defs>
        </svg>
      ) : null}

      <div
        className="pane-backdrop"
        aria-hidden="true"
        style={
          tier >= 2 && map
            ? {
                // Chromium true-glass path: displace the live backdrop, no fog stack
                backdropFilter: `url(#${filterId})`,
                WebkitBackdropFilter: `url(#${filterId})`,
              }
            : undefined
        }
      />
      <div className="pane-content">{children}</div>
    </div>
  );
}
