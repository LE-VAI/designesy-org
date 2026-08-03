import type { Metadata } from 'next';
import SceneClient from './scene-client';
import CursorTrail from './cursor-trail';
import VaiCard from './vai-card';

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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper)',
        padding: '1.5rem',
        gap: '1rem',
      }}
    >
      {/* Hero cell — with Concept A: cursor particle trail inside */}
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--maxw)',
          minHeight: '320px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.35rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Concept A — cursor particle trail. Lives inside the hero cell only. */}
        <CursorTrail />
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
      </div>

      {/* Effect grid cell */}
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--maxw)',
          flex: '1 1 auto',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          padding: '1.25rem',
        }}
      >
        <p
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted-dim)',
            marginBottom: '1rem',
          }}
        >
          Hover · tap effects
        </p>
        <SceneClient />
      </div>

      {/* Concept B — VAI footer follow-card. The single VAI entry from the
          Designesy shell. Yellow lives inside the card/panel only. */}
      <VaiCard />
    </main>
  );
}