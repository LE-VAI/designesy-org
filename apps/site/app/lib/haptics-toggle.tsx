'use client';

import { useHapticsPreference } from './use-haptics';

/**
 * Haptics toggle — only mounts when Vibration API is available.
 * Compact twin of the sound toggle; no chrome on desktop.
 */
export function HapticsToggle() {
  const { supported, enabled, toggle, ready } = useHapticsPreference();

  if (!ready || !supported) return null;

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
