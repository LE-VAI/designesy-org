'use client';

import { useSoundPreference } from './use-sound';

/**
 * Sound toggle — lets the visitor enable or mute interaction sounds.
 * Small, doctrine-aligned: one icon, one state, no decoration.
 *
 * No data-cuelume-toggle here: Cuelume plays that in capture phase
 * before React flips preference, so "turn on" was silent. The hook
 * plays `toggle` imperatively after setEnabled.
 */
export function SoundToggle() {
  const { enabled, toggle } = useSoundPreference();

  return (
    <button
      type="button"
      className="sense-toggle sound-toggle"
      onClick={toggle}
      aria-label={enabled ? 'Mute interaction sounds' : 'Enable interaction sounds'}
      aria-pressed={enabled}
      title={enabled ? 'Sound on' : 'Sound off'}
    >
      <span className="sense-toggle-icon" aria-hidden="true">
        {enabled ? '◐' : '○'}
      </span>
    </button>
  );
}
