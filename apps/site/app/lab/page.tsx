import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Lab',
  robots: { index: false, follow: false },
};

const Scene = dynamic(() => import('./scene'), { ssr: false });

export default function LabPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper)',
        padding: '1.5rem',
        gap: '2rem',
      }}
    >
      {/* Hero — the actual designesy wordmark + lede */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.9rem',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <p
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted-dim)',
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
          }}
        >
          designesy<span style={{ color: 'var(--signal)' }}>.</span>
        </h1>
        <p
          style={{
            maxWidth: '560px',
            fontSize: 'clamp(1.15rem, 2.5vw, 1.5rem)',
            lineHeight: 1.35,
            fontWeight: 500,
            color: 'var(--ink)',
            textAlign: 'center',
            textWrap: 'balance' as never,
          }}
        >
          Design intelligence infrastructure for a humane creative civilization.
        </p>
        <p
          style={{
            maxWidth: '520px',
            fontSize: 'clamp(0.875rem, 1.8vw, 0.95rem)',
            color: 'var(--muted)',
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          Sources into principles. Principles into contracts. Contracts into
          tools. Tools into better designed work.
        </p>
      </section>

      {/* 3D canvas cell */}
      <div
        id="canvas"
        style={{
          width: '100%',
          maxWidth: 'var(--maxw)',
          flex: '1 1 auto',
          minHeight: '400px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Scene />
      </div>
    </main>
  );
}