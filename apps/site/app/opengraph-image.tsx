import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Social share card — wordmark only.
 * No monogram tile. The signal lives in the period of designesy.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000000',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.04em',
            display: 'flex',
          }}
        >
          designesy<span style={{ color: '#0133cb' }}>.</span>
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: '#a0a0a0',
            marginTop: 20,
          }}
        >
          Design intelligence infrastructure
        </div>
      </div>
    ),
    size
  );
}
