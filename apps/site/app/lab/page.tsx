import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lab',
  robots: { index: false, follow: false },
};

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
        }}
      />
    </main>
  );
}