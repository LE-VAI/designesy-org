'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  HAPTICS_STORAGE_KEY,
  isHapticsSupported,
  setHapticsEnabled,
  triggerHaptic,
} from './haptics-engine';

/**
 * Designesy owns haptic preference. web-haptics only vibrates.
 *
 * Default: on when the Vibration API is available, unless reduced-motion
 * is set (non-essential motion proxy) or the visitor opted out.
 * Unsupported devices never show UI and never call the engine.
 *
 * Module-level cache: the Topbar remounts on every client-side navigation
 * (it's per-page, not in the root layout). Without caching the support
 * check, `ready` resets to false on each remount, causing the HapticsToggle
 * to flash from visibility:hidden → visible — a blink on every nav click.
 * After the first mount resolves the check, subsequent mounts read the
 * cached values as their initial state, so `ready` starts true and there's
 * no hidden→visible transition.
 */
let cachedSupported: boolean | null = null;
let cachedEnabled: boolean | null = null;

export function useHapticsPreference() {
  const [supported, setSupported] = useState(cachedSupported ?? false);
  const [enabled, setEnabledState] = useState(cachedEnabled ?? true);
  const [ready, setReady] = useState(cachedSupported !== null);

  useEffect(() => {
    // Already resolved on a previous mount — use cached values.
    if (cachedSupported !== null) {
      setSupported(cachedSupported);
      setEnabledState(cachedEnabled ?? true);
      setHapticsEnabled(cachedEnabled ?? true);
      setReady(true);
      return;
    }

    const can = isHapticsSupported();
    setSupported(can);

    let initial = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      initial = false;
    }

    try {
      const stored = localStorage.getItem(HAPTICS_STORAGE_KEY);
      if (stored === 'false') initial = false;
      if (stored === 'true') initial = true;
    } catch {
      // session default only
    }

    // Unsupported: keep engine off so stray calls are quiet.
    if (!can) initial = false;

    cachedSupported = can;
    cachedEnabled = initial;

    setEnabledState(initial);
    setHapticsEnabled(initial);
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    if (!isHapticsSupported()) return;

    setEnabledState((prev) => {
      const next = !prev;

      if (prev) {
        // Mute: one last rigid tick, then off.
        setHapticsEnabled(true);
        triggerHaptic('toggle');
        setHapticsEnabled(false);
      } else {
        setHapticsEnabled(true);
        triggerHaptic('toggle');
      }

      try {
        localStorage.setItem(HAPTICS_STORAGE_KEY, String(next));
      } catch {
        // session-only
      }

      return next;
    });
  }, []);

  return { supported, enabled, toggle, ready };
}
