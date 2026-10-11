// The Designesy icon family v2 (identity v1, D15 and D22) and its v2.1
// additions (D41: theme, motion, mention, machine, studio, continuity, error,
// share, chevron), from the brand masters designesy-icon-*.v2.svg, unchanged.
//
// Grammar: a 24-unit grid, a 2px stroke with round caps and joins, rounded
// modules. The round dot is the only filled part and the only part that may
// take colour, and it always marks one meaning: the active grade (score), the
// winner (leaderboard), the latest reading (monitor), the signature
// (contract), the 'on' switch (settings), the head (kit), the active choice
// (theme), the landing (motion), the match (mention), the machine reading
// (machine), the reply (studio). `sig` dots take Azure; the `live` dot takes
// the flame, and only for a live moment. A `hub` dot is a neutral point (the
// gauge's pivot, the clock's centre, the error's point) and keeps the body
// colour. The chevron points right; callers rotate it for down, left and up.
//
// On the site the colours come from tokens (.brand-icon .sig and .live in
// globals.css). The share cards render outside the page, so they pass the
// colours in (`sig`, `live`).
//
// Small sizes (D45): at 18px or smaller a `sig` or `live` dot is drawn at
// least SMALL_DOT_R grid units in radius, about its centre, so the one
// coloured part stays legible; `hub` dots stay exactly as drawn. The rule
// follows the size prop, not CSS.

import type { CSSProperties } from 'react';

export type BrandIconName =
  | 'score'
  | 'verify'
  | 'contract'
  | 'leaderboard'
  | 'monitor'
  | 'kit'
  | 'docs'
  | 'search'
  | 'settings'
  | 'live'
  | 'theme'
  | 'motion'
  | 'mention'
  | 'machine'
  | 'studio'
  | 'continuity'
  | 'error'
  | 'share'
  | 'chevron';

type Part =
  | { el: 'path'; paint: Paint; d: string; opacity?: number }
  | { el: 'rect'; paint: Paint; x: number; y: number; width: number; height: number; rx: number; opacity?: number }
  | { el: 'circle'; paint: Paint; cx: number; cy: number; r: number; opacity?: number };
type Paint = 'stroke' | 'fill' | 'hub' | 'sig' | 'live';

/** At or below this rendered size (px) the coloured dots take SMALL_DOT_R. */
const SMALL_SIZE_PX = 18;
/** The smallest radius, in 24-grid units, of a sig or live dot at a small size. */
const SMALL_DOT_R = 2.4;

const ICONS: Record<BrandIconName, readonly Part[]> = {
  score: [
    { el: 'path', paint: 'stroke', d: 'M3 18A9 9 0 0 1 5.31 11.98M6.71 10.72A9 9 0 0 1 17.29 10.72M18.69 11.98A9 9 0 0 1 21 18' },
    { el: 'path', paint: 'stroke', d: 'M12 18L14.54 13.01' },
    { el: 'circle', paint: 'hub', cx: 12, cy: 18, r: 1.6 },
    { el: 'circle', paint: 'sig', cx: 16.09, cy: 9.98, r: 2.5 },
  ],
  verify: [
    { el: 'rect', paint: 'stroke', x: 3, y: 3, width: 18, height: 18, rx: 5 },
    { el: 'path', paint: 'stroke', d: 'M8 12.5L11 15.5L16.5 9.5' },
  ],
  contract: [
    { el: 'rect', paint: 'stroke', x: 5, y: 3, width: 14, height: 18, rx: 3.5 },
    { el: 'path', paint: 'stroke', d: 'M9 8.5H15M9 12.5H13' },
    { el: 'circle', paint: 'sig', cx: 14.6, cy: 16.6, r: 1.9 },
  ],
  leaderboard: [
    { el: 'rect', paint: 'stroke', x: 2.5, y: 12.5, width: 5.5, height: 8.5, rx: 2 },
    { el: 'rect', paint: 'stroke', x: 9.25, y: 9, width: 5.5, height: 12, rx: 2 },
    { el: 'rect', paint: 'stroke', x: 16, y: 14.5, width: 5.5, height: 6.5, rx: 2 },
    { el: 'circle', paint: 'sig', cx: 12, cy: 4.4, r: 2.4 },
  ],
  monitor: [
    { el: 'rect', paint: 'stroke', x: 3, y: 4, width: 18, height: 15, rx: 4 },
    { el: 'path', paint: 'stroke', d: 'M7 14.5L10 11.5L12.5 13.5L15.6 10.4' },
    { el: 'circle', paint: 'sig', cx: 16.6, cy: 9.4, r: 1.9 },
  ],
  kit: [
    { el: 'rect', paint: 'stroke', x: 3.5, y: 3.5, width: 7, height: 7, rx: 2.2 },
    { el: 'rect', paint: 'stroke', x: 3.5, y: 13.5, width: 7, height: 7, rx: 2.2 },
    { el: 'rect', paint: 'stroke', x: 13.5, y: 13.5, width: 7, height: 7, rx: 2.2 },
    { el: 'circle', paint: 'sig', cx: 17, cy: 7, r: 3.6 },
  ],
  docs: [
    { el: 'path', paint: 'stroke', d: 'M8 3H17.5A3.5 3.5 0 0 1 21 6.5V16' },
    { el: 'rect', paint: 'stroke', x: 3, y: 7, width: 14, height: 14, rx: 3.5 },
    { el: 'path', paint: 'stroke', d: 'M7 12H13M7 16H11' },
  ],
  search: [
    { el: 'circle', paint: 'stroke', cx: 10.5, cy: 10.5, r: 6.5 },
    { el: 'path', paint: 'stroke', d: 'M15.5 15.5L20.5 20.5' },
  ],
  settings: [
    { el: 'rect', paint: 'stroke', x: 3, y: 3.5, width: 18, height: 8, rx: 4 },
    { el: 'circle', paint: 'sig', cx: 17, cy: 7.5, r: 2.2 },
    { el: 'rect', paint: 'stroke', x: 3, y: 12.5, width: 18, height: 8, rx: 4 },
    { el: 'circle', paint: 'fill', cx: 7, cy: 16.5, r: 2.2, opacity: 0.35 },
  ],
  live: [
    { el: 'circle', paint: 'stroke', cx: 12, cy: 12, r: 8.5 },
    { el: 'circle', paint: 'live', cx: 12, cy: 12, r: 3.6 },
  ],
  theme: [
    { el: 'path', paint: 'stroke', d: 'M19.5 14.2A8 8 0 1 1 9.8 4.5A6.2 6.2 0 0 0 19.5 14.2Z' },
    { el: 'circle', paint: 'sig', cx: 18.2, cy: 5.6, r: 1.9 },
  ],
  motion: [
    { el: 'path', paint: 'stroke', d: 'M3.5 19.5C11 19.5 12 6 18 6' },
    { el: 'circle', paint: 'sig', cx: 18.6, cy: 6, r: 2.2 },
  ],
  mention: [
    { el: 'path', paint: 'stroke', d: 'M4 6.5H20M4 12H10.5M4 17.5H15' },
    { el: 'circle', paint: 'sig', cx: 15.5, cy: 12, r: 2.2 },
  ],
  machine: [
    {
      el: 'path',
      paint: 'stroke',
      d: 'M8 4C5.5 4 5.5 6.5 5.5 8.5S4.5 12 3.5 12C4.5 12 5.5 13.5 5.5 15.5S5.5 20 8 20M16 4C18.5 4 18.5 6.5 18.5 8.5S19.5 12 20.5 12C19.5 12 18.5 13.5 18.5 15.5S18.5 20 16 20',
    },
    { el: 'circle', paint: 'sig', cx: 12, cy: 12, r: 2.2 },
  ],
  studio: [
    { el: 'path', paint: 'stroke', d: 'M7.5 3.5H16.5A4 4 0 0 1 20.5 7.5V13A4 4 0 0 1 16.5 17H11L6.5 20.5V17A3 3 0 0 1 3.5 14V7.5A4 4 0 0 1 7.5 3.5Z' },
    { el: 'path', paint: 'stroke', d: 'M8 8.5H13.5M8 12H11' },
    { el: 'circle', paint: 'sig', cx: 16.2, cy: 12, r: 1.9 },
  ],
  continuity: [
    { el: 'path', paint: 'stroke', d: 'M4.2 13.5A8 8 0 1 0 6.3 6.3' },
    { el: 'path', paint: 'stroke', d: 'M3.6 3.8V7.2H7' },
    { el: 'path', paint: 'stroke', d: 'M12 8V12L14.6 13.6' },
    { el: 'circle', paint: 'hub', cx: 12, cy: 12, r: 1.6 },
  ],
  error: [
    { el: 'circle', paint: 'stroke', cx: 12, cy: 12, r: 8.5 },
    { el: 'path', paint: 'stroke', d: 'M12 7.5V12.5' },
    { el: 'circle', paint: 'hub', cx: 12, cy: 16.2, r: 1.4 },
  ],
  share: [
    { el: 'path', paint: 'stroke', d: 'M10.5 4.5H7.5A4 4 0 0 0 3.5 8.5V16.5A4 4 0 0 0 7.5 20.5H15.5A4 4 0 0 0 19.5 16.5V13.5' },
    { el: 'path', paint: 'stroke', d: 'M14.5 3.5H20.5V9.5M20.5 3.5L12 12' },
  ],
  chevron: [{ el: 'path', paint: 'stroke', d: 'M9.5 6L15.5 12L9.5 18' }],
};

export function BrandIcon({
  name,
  size = 24,
  className,
  style,
  color = 'currentColor',
  sig,
  live,
}: {
  name: BrandIconName;
  size?: number;
  className?: string;
  /** Inline style on the svg, e.g. a chevron's rotation and its transition. */
  style?: CSSProperties;
  /** The body colour; currentColor on the site. */
  color?: string;
  /** Explicit dot colours, for renders outside the page (share cards). */
  sig?: string;
  live?: string;
}) {
  const small = size <= SMALL_SIZE_PX;
  return (
    <svg
      className={className ? `brand-icon ${className}` : 'brand-icon'}
      width={size}
      height={size}
      style={style}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name].map((p, i) => {
        const stroked = p.paint === 'stroke';
        const fill = stroked
          ? 'none'
          : p.paint === 'sig' && sig
            ? sig
            : p.paint === 'live' && live
              ? live
              : color;
        const paint = {
          fill,
          stroke: stroked ? color : undefined,
          strokeWidth: stroked ? 2 : undefined,
          strokeLinecap: stroked ? ('round' as const) : undefined,
          strokeLinejoin: stroked ? ('round' as const) : undefined,
          opacity: p.opacity,
          className: p.paint === 'sig' || p.paint === 'live' ? p.paint : undefined,
        };
        if (p.el === 'path') return <path key={i} {...paint} d={p.d} />;
        if (p.el === 'rect') return <rect key={i} {...paint} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} />;
        const dot = p.paint === 'sig' || p.paint === 'live';
        const r = small && dot ? Math.max(p.r, SMALL_DOT_R) : p.r;
        return <circle key={i} {...paint} cx={p.cx} cy={p.cy} r={r} />;
      })}
    </svg>
  );
}
