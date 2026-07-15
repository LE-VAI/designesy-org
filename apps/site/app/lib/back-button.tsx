'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Elegant floating back button.
 * Appears on the left edge when there is navigation history.
 * Uses history.back() to return the user exactly where they were.
 * Subtle by default (low opacity), full on hover/focus.
 */
export function BackButton() {
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

  if (!visible) return null;

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
    </button>
  );
}
