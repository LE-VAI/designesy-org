import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Tab mark — signal "gate" mark.
 * One lit cell of the 42-check verification grid: a signal dot inside a
 * thin square ring. Echoes the Score Gate hero and the OG card markRing.
 * No monogram, no letter logo. Matches wordmark period language.
 * Contract tokens: --paper #010102, --signal #0133cb, --signal-dim rgba(1,51,203,0.14).
 */
export default function Icon() {
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
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1.5px solid rgba(1, 51, 203, 0.14)',
            borderRadius: 5,
            background: '#0a0a0c',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: '#0133cb',
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
