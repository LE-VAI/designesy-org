import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

/** Contract tokens — keep in sync with live foundation */
const T = {
  paper: '#000000',
  ink: '#ffffff',
  muted: '#a0a0a0',
  mutedDim: '#6b6b6b',
  surface: '#0a0a0a',
  line: 'rgba(255, 255, 255, 0.12)',
  lineStrong: 'rgba(255, 255, 255, 0.22)',
  signal: '#0133cb',
  signalLight: '#3358e8',
  signalDim: 'rgba(1, 51, 203, 0.14)',
} as const;

/**
 * The site's own faces, as static TTFs (lib/og-fonts). Satori cannot use the
 * next/font WOFF2 files, and with no fonts passed every card rendered in a
 * default sans that matched nothing on the site. Read once per process.
 */
let fontCache: { name: string; data: Buffer; weight: 500 | 600 | 700; style: 'normal' }[] | null = null;
function ogFonts() {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), 'app/lib/og-fonts');
  fontCache = [
    { name: 'Fraunces', data: readFileSync(join(dir, 'Fraunces-600.ttf')), weight: 600, style: 'normal' },
    { name: 'Schibsted Grotesk', data: readFileSync(join(dir, 'SchibstedGrotesk-500.ttf')), weight: 500, style: 'normal' },
    { name: 'Schibsted Grotesk', data: readFileSync(join(dir, 'SchibstedGrotesk-700.ttf')), weight: 700, style: 'normal' },
  ];
  return fontCache;
}

/** VAI house mark (the LE-VAI asterisk), drawn on the card's black paper. */
const VAI_YELLOW = '#FECC35';
function VaiMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <line x1="72" y1="28" x2="28" y2="72" stroke={VAI_YELLOW} strokeWidth="15" strokeLinecap="round" />
      <line x1="28" y1="28" x2="72" y2="72" stroke={T.paper} strokeWidth="23" strokeLinecap="round" />
      <line x1="28" y1="28" x2="72" y2="72" stroke={VAI_YELLOW} strokeWidth="15" strokeLinecap="round" />
      <path d="M50 34 C47 29 43 25.5 43 20 A7 7 0 0 1 57 20 C57 25.5 53 29 50 34 Z" fill={VAI_YELLOW} />
      <path d="M50 66 C47 71 43 74.5 43 80 A7 7 0 0 0 57 80 C57 74.5 53 71 50 66 Z" fill={VAI_YELLOW} />
      <path d="M34 50 C29 47 25.5 43 20 43 A7 7 0 0 0 20 57 C25.5 57 29 53 34 50 Z" fill={VAI_YELLOW} />
      <path d="M66 50 C71 47 74.5 43 80 43 A7 7 0 0 1 80 57 C74.5 57 71 53 66 50 Z" fill={VAI_YELLOW} />
    </svg>
  );
}

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
};

/**
 * Portable share card for designesy.org handoffs.
 * Wordmark + signal period only — no monogram letter logo.
 * Used by route-level opengraph-image files.
 */
export function renderOgCard({
  eyebrow,
  title,
  lede,
  path,
  kind = 'default',
  badge,
}: OgCardProps) {
  const isLab = kind === 'lab';
  const isContract = kind === 'contract';
  const isKit = kind === 'kit';
  // contract = square; kit = soft square (usable package); lab/default = circle
  const markRadius = isContract ? 6 : isKit ? 10 : 999;
  const markFill = isLab || isKit ? T.signalLight : T.signal;
  const markRing = isContract ? 8 : isKit ? 10 : 999;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: T.paper,
          color: T.ink,
          fontFamily: '"Schibsted Grotesk"',
          padding: '64px 72px',
          position: 'relative',
        }}
      >
        {/* Quiet frame */}
        <div
          style={{
            position: 'absolute',
            inset: 28,
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            display: 'flex',
          }}
        />

        {/* Top row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${T.signalDim}`,
                borderRadius: markRing,
                background: T.surface,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: markRadius,
                  background: markFill,
                }}
              />
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: T.mutedDim,
                display: 'flex',
              }}
            >
              {eyebrow}
            </div>
          </div>
          {badge ? (
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: T.signalLight,
                border: `1px solid ${T.signalDim}`,
                background: T.signalDim,
                borderRadius: 4,
                padding: '8px 14px',
                display: 'flex',
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        {/* Center claim */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            maxWidth: 920,
            position: 'relative',
          }}
        >
          <div
            style={{
              fontFamily: 'Fraunces',
              fontSize: title.length > 28 ? 64 : 76,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: T.ink,
              display: 'flex',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.35,
              color: T.muted,
              display: 'flex',
              maxWidth: 860,
            }}
          >
            {lede}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            width: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: T.ink,
              display: 'flex',
            }}
          >
            designesy
            <span style={{ color: T.signal }}>.</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontSize: 22,
              fontWeight: 500,
              color: T.mutedDim,
              letterSpacing: '0.01em',
            }}
          >
            <div style={{ display: 'flex' }}>{path}</div>
            <div style={{ width: 1, height: 24, background: T.lineStrong, display: 'flex' }} />
            {/* Endorsement: designesy is its own brand, made by VAI. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.muted }}>
              <VaiMark size={30} />
              a VAI project
            </div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: ogFonts() }
  );
}
