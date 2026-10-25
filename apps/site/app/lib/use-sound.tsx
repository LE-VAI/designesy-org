'use client';

import { useCallback, useEffect, useState } from 'react';
import { play, setEnabled } from 'cuelume';
import { THEMES } from 'cuelume/themes';

/**
 * Mirror the preference onto <html data-audio="on|off">. Check v04 requires the
 * toggle to flip aria-pressed AND apply the preference as a [data-audio]
 * attribute the audio layer can read; before this, only aria-pressed moved.
 */
function applyAudioAttr(on: boolean) {
  document.documentElement.dataset.audio = on ? 'on' : 'off';
}

const STORAGE_KEY = 'designesy:sound';

/** The timing of one layer of a cuelume cue, in seconds. */
type CueLayer = { attack: number; decay: number; offset?: number };

/**
 * How long the toggle cue sounds, in milliseconds, read from cuelume's own
 * recipe for it (the cuelume/themes export, default theme, the one this
 * site plays). A layer starts at its offset, swells over its attack and
 * falls 60 dB over its decay; the cue lasts until its last layer has
 * fallen. Every layer counts, the one only strong emphasis plays included,
 * so this is an upper bound for the normal emphasis the site plays.
 */
export const TOGGLE_CUE_MS = Math.ceil(
  1000 *
    Math.max(
      0,
      ...(THEMES.default.toggle.layers as readonly CueLayer[]).map(
        (layer) => (layer.offset ?? 0) + layer.attack + layer.decay,
      ),
    ),
);

/** A mute that waits for the toggle cue to finish, while it waits. */
let pendingMute: ReturnType<typeof setTimeout> | null = null;

/**
 * Turn cuelume on or off. From cuelume 0.2.6, setEnabled(false) fades
 * whatever is still sounding within 15 ms, so a mute that confirms itself
 * with the toggle cue waits TOGGLE_CUE_MS before it turns cuelume off. Any
 * later call cancels a mute that is still waiting, so sound turned back on
 * inside the wait stays on and the switch and the sound agree.
 */
function applyToCuelume(on: boolean, afterCue = false) {
  if (pendingMute !== null) {
    clearTimeout(pendingMute);
    pendingMute = null;
  }
  if (on || !afterCue) {
    setEnabled(on);
    return;
  }
  pendingMute = setTimeout(() => {
    pendingMute = null;
    setEnabled(false);
  }, TOGGLE_CUE_MS);
}

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
    applyToCuelume(initial);
    applyAudioAttr(initial);
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;

      if (prev) {
        // Mute: confirm while still enabled when context is already running,
        // and turn cuelume off once the cue has played.
        play('toggle');
        applyToCuelume(false, true);
      } else {
        // Enable first so async AudioContext.resume() still hears the cue.
        applyToCuelume(true);
        play('toggle');
      }

      applyAudioAttr(next);

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
