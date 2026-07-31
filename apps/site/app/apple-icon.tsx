import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Home-screen mark — signal "gate" mark.
 * One lit cell of the 40-check verification grid: a signal dot inside a
 * thin square ring. Scaled proportionally from the 32×32 icon (×5.6).
 * Echoes the Score Gate hero and the OG card markRing.
 * No monogram, no letter logo. Matches wordmark period language.
 * Contract tokens: --paper #010102, --signal #0133cb, --signal-dim rgba(1,51,203,0.14).
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#010102',
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '8px solid rgba(1, 51, 203, 0.14)',
            borderRadius: 28,
            background: '#0a0a0c',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: '#0133cb',
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
