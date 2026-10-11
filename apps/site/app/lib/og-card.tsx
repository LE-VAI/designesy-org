import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import {
  LOCKUP_MARK_TRANSFORM,
  LOCKUP_VIEWBOX,
  LOCKUP_WORD_TRANSFORM,
  LOGO_AZURE,
  markChildren,
  wordChildren,
} from './brand-logotype';
import { BrandIcon, type BrandIconName } from './brand-icons';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

/**
 * Card palette: the site's dark surfaces (identity v1). Paper, ink and the
 * two text greys as the brand-world share cards draw them; the tile is the
 * raised surface. Azure appears only in the logotype's dot and period and in
 * an icon's signal dot.
 */
export const OG_T = {
  paper: '#010102',
  ink: '#F5F5F7',
  logo: '#FFFFFF',
  muted: '#A0A0A8',
  mutedDim: '#7D7D86',
  tile: '#121216',
  tileLine: 'rgba(255, 255, 255, 0.10)',
  line: 'rgba(255, 255, 255, 0.14)',
  signal: LOGO_AZURE,
} as const;
const T = OG_T;

/**
 * The site's own faces, as static TTFs (lib/og-fonts). Satori cannot use the
 * next/font WOFF2 files, and with no fonts passed every card rendered in a
 * default sans that matched nothing on the site. Read once per process.
 * Fraunces 600 sets titles, Fraunces 700 (the 144pt cut) the score numerals,
 * Schibsted Grotesk the running text and Geist Mono the labels.
 */
type OgFont = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700; style: 'normal' };
let fontCache: OgFont[] | null = null;
export function ogFonts(): OgFont[] {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), 'app/lib/og-fonts');
  fontCache = [
    { name: 'Fraunces', data: readFileSync(join(dir, 'Fraunces-600.ttf')), weight: 600, style: 'normal' },
    { name: 'Fraunces', data: readFileSync(join(dir, 'Fraunces-700.ttf')), weight: 700, style: 'normal' },
    { name: 'Schibsted Grotesk', data: readFileSync(join(dir, 'SchibstedGrotesk-500.ttf')), weight: 500, style: 'normal' },
    { name: 'Schibsted Grotesk', data: readFileSync(join(dir, 'SchibstedGrotesk-700.ttf')), weight: 700, style: 'normal' },
    { name: 'Geist Mono', data: readFileSync(join(dir, 'GeistMono-400.ttf')), weight: 400, style: 'normal' },
  ];
  return fontCache;
}

/**
 * The horizontal lockup, white body and Azure dot and period, drawn from the
 * same data as the site header (brand-logotype.tsx). The viewBox keeps the
 * master's padding, so the dot (x 366) is never cropped.
 */
export function OgLockup({ height }: { height: number }) {
  const [, , vbW, vbH] = LOCKUP_VIEWBOX.split(' ').map(Number);
  return (
    <svg width={Math.round((height * vbW) / vbH)} height={height} viewBox={LOCKUP_VIEWBOX}>
      <g transform="scale(1,-1)">
        <g transform={LOCKUP_MARK_TRANSFORM}>{markChildren(T.logo)}</g>
        <g transform={LOCKUP_WORD_TRANSFORM}>{wordChildren(T.logo)}</g>
      </g>
    </svg>
  );
}

/** The quiet endorsement (D24): text only, no mark. */
export const OG_ENDORSEMENT = 'A VAI project';

export type OgKind =
  | 'default'
  | 'lab'
  | 'contract'
  | 'review'
  | 'docs'
  | 'kit';

export type OgCardProps = {
  eyebrow: string;
  title: string;
  lede: string;
  path: string;
  kind?: OgKind;
  badge?: string;
  /** The icon in the card's tile; null for none. Defaults by kind and path. */
  icon?: BrandIconName | null;
  /**
   * The quiet endorsement line (D24). On by default; false for a page whose
   * own copy leaves it off, so its card matches it (/brand, D71).
   */
  endorsement?: boolean;
};

/**
 * The tile's icon, where the icon family has one for what the page is. A
 * page with no matching icon gets no tile (labs, most tools): an icon that
 * means something else would mislabel it.
 */
function defaultIcon(kind: OgKind, path: string): BrandIconName | null {
  if (kind === 'contract') return 'contract';
  if (kind === 'kit') return 'kit';
  if (kind === 'docs') return 'docs';
  if (kind === 'review') return 'verify';
  if (kind === 'lab') return null;
  const route = path.replace(/^designesy\.org/, '') || '/';
  if (route === '/' || route === '/report' || route.startsWith('/score')) return 'score';
  if (route === '/leaderboard') return 'leaderboard';
  if (route === '/monitor') return 'monitor';
  if (route === '/badge') return 'verify';
  return null;
}

/**
 * Portable share card for designesy.org handoffs (identity v1, the brand-world
 * og-generic composition): the lockup, a Geist Mono eyebrow, the Fraunces
 * claim, the lede, and the page's icon in a raised tile. The VAI link is the
 * quiet text "A VAI project" (D24).
 * Used by route-level opengraph-image files.
 */
export function renderOgCard({
  eyebrow,
  title,
  lede,
  path,
  kind = 'default',
  badge,
  icon,
  endorsement = true,
}: OgCardProps) {
  const tileIcon = icon === undefined ? defaultIcon(kind, path) : icon;
  const textWidth = tileIcon ? 720 : 960;
  const titleSize = title.length > 40 ? 58 : title.length > 28 ? 66 : 76;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: T.paper,
          color: T.ink,
          fontFamily: '"Schibsted Grotesk"',
          padding: '64px 72px',
          position: 'relative',
        }}
      >
        {/* Top row: the lockup, and the page's badge as a quiet mono label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <OgLockup height={46} />
          {badge ? (
            <div
              style={{
                display: 'flex',
                fontFamily: '"Geist Mono"',
                fontSize: 18,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: T.muted,
                border: `1px solid ${T.line}`,
                borderRadius: 999,
                padding: '8px 16px',
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        {/* Eyebrow, claim, lede */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 56,
            width: textWidth,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: '"Geist Mono"',
              fontSize: 20,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: T.muted,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 18,
              fontFamily: 'Fraunces',
              fontSize: titleSize,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1.04,
              color: T.ink,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: 'block',
              marginTop: 20,
              fontSize: 26,
              fontWeight: 500,
              lineHeight: 1.35,
              color: T.muted,
              lineClamp: 2,
            }}
          >
            {lede}
          </div>
        </div>

        {/* Footer: the path, and the endorsement */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            width: '100%',
            marginTop: 'auto',
          }}
        >
          <div style={{ display: 'flex', fontFamily: '"Geist Mono"', fontSize: 22, color: T.muted }}>{path}</div>
          {endorsement ? (
            <div style={{ display: 'flex', fontSize: 20, fontWeight: 500, color: T.mutedDim }}>{OG_ENDORSEMENT}</div>
          ) : null}
        </div>

        {tileIcon ? (
          <div
            style={{
              position: 'absolute',
              right: 72,
              top: 168,
              width: 228,
              height: 228,
              borderRadius: 32,
              background: T.tile,
              border: `1px solid ${T.tileLine}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BrandIcon name={tileIcon} size={136} color={T.ink} sig={T.signal} live="#F56B00" />
          </div>
        ) : null}
      </div>
    ),
    { ...OG_SIZE, fonts: ogFonts() }
  );
}
