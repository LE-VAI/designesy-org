'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep console for operator debugging; no PII.
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="surface-page"
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <section className="surface-header">
        <p className="surface-eyebrow">Error</p>
        <h1 className="surface-title">Something went wrong</h1>
        <p className="surface-lede">
          The page hit an unexpected fault. Try again, or return home.
        </p>
        <div className="hero-actions" style={{ marginTop: '2rem' }}>
          <button
            type="button"
            className="button primary"
            onClick={() => reset()}
            data-cuelume-hover="chime"
            data-cuelume-press
          >
            Try again
          </button>
          <Link
            className="button ghost"
            href="/"
            data-cuelume-hover="tick"
            data-cuelume-press
          >
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
