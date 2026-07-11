'use client';

import { useSoundPreference } from './use-sound';

/**
 * Sound toggle — lets the visitor enable or mute interaction sounds.
 * Small, doctrine-aligned: one icon, one state, no decoration.
 */
export function SoundToggle() {
  const { enabled, toggle } = useSoundPreference();

  return (
    <button
      className="sound-toggle"
      onClick={toggle}
      aria-label={enabled ? 'Mute interaction sounds' : 'Enable interaction sounds'}
      aria-pressed={enabled}
      data-cuelume-toggle
      title={enabled ? 'Sound on' : 'Sound off'}
    >
      <span className="sound-toggle-icon" aria-hidden="true">
        {enabled ? '◐' : '○'}
      </span>
    </button>
  );
}