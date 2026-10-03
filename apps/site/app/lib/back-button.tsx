'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useDockPacing } from './director-dock';

/**
 * Floating back button, paired with the Studio pill at the bottom-right
 * (director-dock.tsx), and shaped by the same room beside the shell: a
 * labelled glass pill where the gutter holds one, an icon-only 44px circle
 * that names itself on hover or focus where it holds only that, tucked away
 * until the end of the page where it holds neither (globals.css, "Gutter
 * parking"; useDockPacing). Phones drop it: their browsers already have one.
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
  const ref = useRef<HTMLButtonElement | null>(null);
  const shown = visible && pathname !== '/';
  useDockPacing(ref, shown);

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

  if (!shown) return null;

  // No title attribute: the visible label or the hover tag already names it,
  // and a native tooltip on top of the tag said "Back" twice.
  return (
    <button
      ref={ref}
      className={`back-button${leaving ? ' is-leaving' : ''}`}
      type="button"
      onClick={goBack}
      data-cuelume-press="tick"
      aria-label="Go back"
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
        aria-hidden="true"
      >
        <path d="M10 4L6 8l4 4" />
      </svg>
      <span className="back-button-label">Back</span>
    </button>
  );
}
