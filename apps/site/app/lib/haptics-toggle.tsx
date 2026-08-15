'use client';

import { useHapticsPreference } from './use-haptics';

/**
 * Haptics toggle — only mounts when Vibration API is available.
 * Compact twin of the sound toggle; no chrome on desktop.
 *
 * Layout-shift prevention: the `ready` flag starts false and flips true
 * after the first useEffect tick (checking Vibration API support). If we
 * return null during that brief window, the .sense-toggles container is
 * ~35px narrower on first paint, then expands when the toggle mounts —
 * visibly shifting the nav-links leftward on every client-side navigation
 * (the Topbar remounts per-page, so the effect re-fires each route change).
 *
 * Fix: render an invisible placeholder (same 32px width, visibility:hidden)
 * while `!ready`. Once ready, if supported, show the real toggle. If not
 * supported, return null — the placeholder was only needed to bridge the
 * async check, not to reserve permanent space for an unsupported feature.
 */
export function HapticsToggle() {
  const { supported, enabled, toggle, ready } = useHapticsPreference();

  if (!ready) {
    return (
      <button
        type="button"
        className="sense-toggle haptics-toggle"
        aria-hidden="true"
        tabIndex={-1}
        style={{ visibility: 'hidden' }}
      />
    );
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      className="sense-toggle haptics-toggle"
      onClick={toggle}
      aria-label={enabled ? 'Turn off haptics' : 'Turn on haptics'}
      aria-pressed={enabled}
      title={enabled ? 'Haptics on' : 'Haptics off'}
    >
      <span className="sense-toggle-icon" aria-hidden="true">
        {enabled ? '▣' : '□'}
      </span>
    </button>
  );
}
