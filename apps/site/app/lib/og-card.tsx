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
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
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
              fontSize: title.length > 28 ? 64 : 76,
              fontWeight: 800,
              letterSpacing: '-0.035em',
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
              fontWeight: 800,
              letterSpacing: '-0.04em',
              color: T.ink,
              display: 'flex',
            }}
          >
            designesy
            <span style={{ color: T.signal }}>.</span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              color: T.mutedDim,
              letterSpacing: '0.01em',
              display: 'flex',
            }}
          >
            {path}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
