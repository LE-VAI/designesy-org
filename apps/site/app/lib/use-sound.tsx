'use client';

import { useEffect, useState, useCallback } from 'react';
import { setEnabled } from 'cuelume';

const STORAGE_KEY = 'designesy:sound';

/**
 * Designesy owns the sound preference. Cuelume only applies it.
 *
 * Default is enabled, unless the user has reduced-motion preference
 * (serves as the acoustic-reduction proxy) or has explicitly opted out.
 */
export function useSoundPreference() {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    let initial = true;

    // Respect reduced-motion as acoustic-reduction proxy
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      initial = false;
    }

    // Honor explicit user choice
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'false') initial = false;
    if (stored === 'true') initial = true;

    setEnabledState(initial);
    setEnabled(initial);
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      setEnabled(next);
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Storage may be unavailable — preference is session-only
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}