import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 80,
            height: 80,
            background: '#0133cb',
            borderRadius: 12,
            fontSize: 56,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.04em',
            marginBottom: 40,
          }}
        >
          d
        </div>
        <div
          style={{
            fontSize: 64,
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
            marginTop: 16,
          }}
        >
          Design intelligence infrastructure
        </div>
      </div>
    ),
    size
  );
}