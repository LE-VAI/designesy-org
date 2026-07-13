'use client';

import { useCallback, useEffect, useState } from 'react';
import { play, setEnabled } from 'cuelume';

const STORAGE_KEY = 'designesy:sound';

/**
 * Designesy owns the sound preference. Cuelume only applies it.
 *
 * Default is enabled, unless reduced-motion is set (acoustic-reduction
 * proxy) or the visitor has explicitly opted out.
 *
 * Mobile: Web Audio starts suspended until a user gesture. The first
 * play() during a gesture (toggle, press, or tap) resumes Cuelume's
 * shared AudioContext.
 *
 * Toggle cue is played here (not via data-cuelume-toggle) so enable can
 * sound after setEnabled(true). Capture-phase attribute cues fired too early.
 */
export function useSoundPreference() {
  const [enabled, setEnabledState] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = true;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      initial = false;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'false') initial = false;
      if (stored === 'true') initial = true;
    } catch {
      // Storage may be unavailable — keep derived default.
    }

    setEnabledState(initial);
    setEnabled(initial);
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;

      if (prev) {
        // Mute: confirm while still enabled when context is already running.
        play('toggle');
        setEnabled(false);
      } else {
        // Enable first so async AudioContext.resume() still hears the cue.
        setEnabled(true);
        play('toggle');
      }

      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Session-only preference if storage is blocked.
      }

      return next;
    });
  }, []);

  return { enabled, toggle, ready };
}
