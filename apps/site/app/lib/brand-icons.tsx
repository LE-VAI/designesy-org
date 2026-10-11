// The Designesy icon family v2 (identity v1, D15 and D22), from the brand
// masters designesy-icon-*.v2.svg, unchanged.
//
// Grammar: a 24-unit grid, a 2px stroke with round caps and joins, rounded
// modules. The round dot is the only filled part and the only part that may
// take colour, and it always marks one meaning: the active grade (score), the
// winner (leaderboard), the latest reading (monitor), the signature
// (contract), the 'on' switch (settings), the head (kit). `sig` dots take
// Azure; the `live` dot takes the flame, and only for a live moment.
//
// On the site the colours come from tokens (.brand-icon .sig and .live in
// globals.css). The share cards render outside the page, so they pass the
// colours in (`sig`, `live`).

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
  | 'live';

type Part =
  | { el: 'path'; paint: Paint; d: string; opacity?: number }
  | { el: 'rect'; paint: Paint; x: number; y: number; width: number; height: number; rx: number; opacity?: number }
  | { el: 'circle'; paint: Paint; cx: number; cy: number; r: number; opacity?: number };
type Paint = 'stroke' | 'fill' | 'hub' | 'sig' | 'live';

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
};

export function BrandIcon({
  name,
  size = 24,
  className,
  color = 'currentColor',
  sig,
  live,
}: {
  name: BrandIconName;
  size?: number;
  className?: string;
  /** The body colour; currentColor on the site. */
  color?: string;
  /** Explicit dot colours, for renders outside the page (share cards). */
  sig?: string;
  live?: string;
}) {
  return (
    <svg
      className={className ? `brand-icon ${className}` : 'brand-icon'}
      width={size}
      height={size}
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
        return <circle key={i} {...paint} cx={p.cx} cy={p.cy} r={p.r} />;
      })}
    </svg>
  );
}
