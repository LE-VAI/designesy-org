'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Floating back button: a labelled glass pill at the bottom-left, paired with
 * the Studio pill at the bottom-right (director-dock.tsx).
 * Appears when there is navigation history; uses history.back() to return the
 * visitor exactly where they were. Not on the homepage, where "back" leads
 * off the site.
 *
 * (2026-09-27: it was an unlabelled circle at mid-height on the left edge,
 * opposite another on the right; the pair read as carousel arrows.)
 */
export function BackButton() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.history.length > 1) {
      const t = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  const goBack = useCallback(() => {
    setLeaving(true);
    setTimeout(() => window.history.back(), 120);
  }, []);

  if (!visible || pathname === '/') return null;

  return (
    <button
      className={`back-button${leaving ? ' is-leaving' : ''}`}
      type="button"
      onClick={goBack}
      data-cuelume-press="tick"
      aria-label="Go back"
      title="Back"
    >
      <svg
        viewBox="0 0 16 16"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 4L6 8l4 4" />
      </svg>
      <span className="back-button-label">Back</span>
    </button>
  );
}
