import type { Metadata } from 'next';
import SceneClient from './scene-client';

export const metadata: Metadata = {
  title: 'Test',
  robots: { index: false, follow: false },
};

export default function TestPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper)',
        padding: '1.5rem',
      }}
    >
      <div
        id="canvas"
        style={{
          width: '100%',
          maxWidth: 'var(--maxw)',
          minHeight: 'calc(100vh - 3rem)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.35rem',
        }}
      >
        <p
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted-dim)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          Design intelligence infrastructure
        </p>
        <h1
          style={{
            fontSize: 'clamp(3.2rem, 9vw, 5.5rem)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: 'var(--ink)',
            userSelect: 'none',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          designesy<span style={{ color: 'var(--signal)' }}>.</span>
        </h1>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
          }}
        >
          <SceneClient />
        </div>
      </div>
    </main>
  );
}