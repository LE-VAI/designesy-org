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
        }}
      >
        <Scene />
      </div>
    </main>
  );
}