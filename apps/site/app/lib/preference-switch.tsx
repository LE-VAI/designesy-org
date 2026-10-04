'use client';

import { useId } from 'react';
import { useSoundPreference } from './use-sound';
import { useHapticsPreference } from './use-haptics';
import './preference-switch.css';

/**
 * Preference switches for the labs' live artifacts (Poise, Acoustics).
 *
 * A switch you can read, in place of the bare 13px glyph the lab used to
 * show (sound-toggle.tsx): a 44px track whose thumb moves to the state, the
 * name beside it, and the state word after it. The whole row is one toggle
 * button (aria-pressed, named by the visible name), the senses panel's
 * pattern (senses-menu.tsx), so v04 still traces it by aria-pressed, and
 * [data-sound-toggle] marks the sound one for the same check.
 *
 * The state word is hidden from the accessible name (aria-pressed already
 * says it), so the name stays "Sound" while the word beside it changes.
 * Until the preference resolves on the client the switch reads Off, never a
 * state it has not checked.
 */

type SwitchProps = {
  name: string;
  on: boolean;
  disabled?: boolean;
  describedBy?: string;
  onToggle?: () => void;
  sound?: boolean;
};

function Switch({ name, on, disabled, describedBy, onToggle, sound }: SwitchProps) {
  return (
    <button
      type="button"
      className="pref-switch"
      aria-pressed={on}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onToggle}
      data-sound-toggle={sound ? '' : undefined}
    >
      <span className="pref-switch-track" aria-hidden="true">
        <span className="pref-switch-thumb" />
      </span>
      <span className="pref-switch-name">{name}</span>
      <span className="pref-switch-state" aria-hidden="true">
        {on ? 'On' : 'Off'}
      </span>
    </button>
  );
}

/** The readout under a switch: an LED and one line of what the state means. */
function Readout({ id, on, children }: { id: string; on: boolean; children: React.ReactNode }) {
  return (
    <p className="pref-readout" id={id}>
      <i className="pref-led" data-on={on ? '' : undefined} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function SoundSwitch({ readout = false }: { readout?: boolean }) {
  const { enabled, toggle, ready } = useSoundPreference();
  const id = useId();
  const on = ready && enabled;

  return (
    <div className="pref">
      <Switch
        name="Sound"
        on={on}
        sound
        onToggle={toggle}
        describedBy={readout ? id : undefined}
      />
      {readout && (
        <Readout id={id} on={on}>
          {on ? 'Soft cues on press and toggle' : 'Muted'}
        </Readout>
      )}
    </div>
  );
}

/**
 * Haptics: a device without vibration hardware (every desktop: see
 * isHapticsSupported) gets the same switch, disabled, and says so, where the
 * old toggle rendered nothing and left the cell an empty pane.
 */
export function HapticsSwitch() {
  const { supported, enabled, toggle, ready } = useHapticsPreference();
  const id = useId();
  const usable = ready && supported;
  const on = usable && enabled;

  let line = 'Checking this device';
  if (ready) line = !supported ? 'Not available on this device' : on ? 'A light tap on press' : 'Off';

  return (
    <div className="pref">
      <Switch
        name="Haptics"
        on={on}
        disabled={!usable}
        onToggle={toggle}
        describedBy={id}
      />
      <Readout id={id} on={on}>
        {line}
      </Readout>
    </div>
  );
}
