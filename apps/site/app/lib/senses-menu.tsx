'use client';

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useSoundPreference } from './use-sound';
import { useHapticsPreference } from './use-haptics';
import { useMotionPreference } from './use-motion-pref';
import { useTheme, originOf } from './use-theme';
import { pushLayer } from './overlay-stack';

/**
 * Senses — one control centre for motion, sound, haptics, and theme.
 * The trigger reads "Tune senses": verb-first (check v38), and the accessible
 * name starts with the visible words (WCAG 2.5.3).
 *
 * EVERY ROW IS THE CONTROL
 * Each row used to hold a 40px icon button at its right edge, and only that
 * square responded: the name and the explanation beside it looked like part of
 * the control and did nothing. Now the whole row is one toggle button
 * (aria-pressed, named by its visible label, described by its hint line), so
 * the target is the full row and a voice user can say the name they see.
 *
 * aria-pressed rather than role="switch" keeps these on the contract's toggle
 * pattern: v04 traces the sound control by aria-pressed plus the data-audio
 * attribute, and v38 reads aria-pressed as a selection control, not a command.
 *
 * The tile at the right of each row is the state: lit when the sense is on,
 * with a glyph that changes shape rather than swapping characters.
 */

function Row({
  name,
  label,
  hint,
  on,
  onToggle,
  children,
}: {
  name: string;
  label: string;
  hint: string;
  on: boolean;
  onToggle: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <button
      type="button"
      className={`senses-row senses-row--${name}`}
      aria-pressed={on}
      aria-labelledby={`${id}-l`}
      aria-describedby={`${id}-h`}
      onClick={onToggle}
      data-cuelume-hover="whisper"
    >
      <span className="senses-row-text">
        <span className="senses-row-label" id={`${id}-l`}>
          {label}
        </span>
        <span className="senses-row-hint" id={`${id}-h`}>
          {hint}
        </span>
      </span>
      <span className="senses-tile" aria-hidden="true">
        {children}
      </span>
    </button>
  );
}

/* Glyphs: 20x20, stroked in currentColor; state changes move shapes. */

function MotionGlyph() {
  return (
    <svg className="sg sg-motion" viewBox="0 0 20 20" fill="none">
      <g className="sg-wave-clip">
        <path
          className="sg-wave"
          d="M-10 10c1.7-3.6 3.3-3.6 5 0s3.3 3.6 5 0 3.3-3.6 5 0 3.3 3.6 5 0 3.3-3.6 5 0 3.3 3.6 5 0 3.3-3.6 5 0 3.3 3.6 5 0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function SoundGlyph() {
  return (
    <svg className="sg sg-sound" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8h2.6l3.6-3v10l-3.6-3H3.5z" fill="currentColor" fillOpacity="0.18" />
      <path className="sg-arc sg-arc-1" d="M12.6 7.6a3.4 3.4 0 0 1 0 4.8" />
      <path className="sg-arc sg-arc-2" d="M14.8 5.4a6.5 6.5 0 0 1 0 9.2" />
      <path className="sg-mute" d="M12.8 8l4 4m0-4-4 4" />
    </svg>
  );
}

function HapticsGlyph() {
  return (
    <svg className="sg sg-haptics" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect className="sg-phone" x="6.5" y="3" width="7" height="14" rx="1.8" />
      <path className="sg-buzz sg-buzz-l" d="M3.6 7.5v5M1.8 8.8v2.4" />
      <path className="sg-buzz sg-buzz-r" d="M16.4 7.5v5M18.2 8.8v2.4" />
    </svg>
  );
}

function ThemeGlyph() {
  const id = useId();
  return (
    <svg className="sg sg-theme" viewBox="0 0 20 20" fill="none">
      <mask id={`${id}-m`}>
        <rect width="20" height="20" fill="white" />
        <circle className="sg-moon-bite" cx="25" cy="4" r="6.5" fill="black" />
      </mask>
      <circle className="sg-core" cx="10" cy="10" r="4.4" fill="currentColor" mask={`url(#${id}-m)`} />
      <g className="sg-rays" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M10 1.6v1.6M10 16.8v1.6M1.6 10h1.6M16.8 10h1.6M4 4l1.1 1.1M14.9 14.9 16 16M4 16l1.1-1.1M14.9 5.1 16 4" />
      </g>
    </svg>
  );
}

export function SensesMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const motion = useMotionPreference();
  const sound = useSoundPreference();
  const haptics = useHapticsPreference();
  const theme = useTheme();

  // Whether closing hands focus back to the trigger: yes for Escape; no for a
  // press elsewhere (the reader went there) or the trigger itself (it has it).
  const restoreRef = useRef(false);
  const close = useCallback((returnFocus: boolean) => {
    restoreRef.current = returnFocus;
    setOpen(false);
  }, []);

  // A non-modal layer on the shared overlay stack (lib/overlay-stack): the
  // page stays live, but Escape reaches this panel only while it is the top
  // layer, so with the palette open over it one Escape closes the palette
  // and leaves this open. Click-away likewise acts only from the top: a
  // press inside the palette is not a press away from this panel.
  useEffect(() => {
    if (!open) return;
    const layer = pushLayer({
      modal: false,
      element: () => rootRef.current,
      onEscape: () => close(true),
      returnFocus: () => [triggerRef.current],
    });
    const onPointer = (e: PointerEvent) => {
      if (!layer.isTop()) return;
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      layer.release({ restoreFocus: restoreRef.current });
      restoreRef.current = false;
    };
  }, [open, close]);

  const dark = theme.theme === 'dark';

  return (
    <div className={`senses${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="senses-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Tune senses: motion, sound, haptics, and theme"
        onClick={() => setOpen((o) => !o)}
        data-cuelume-press="tick"
      >
        <span className="senses-glyph" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="senses-label">Tune senses</span>
      </button>
      <div className="senses-panel" id={panelId} role="group" aria-label="Senses" hidden={!open}>
        <Row
          name="motion"
          label="Motion"
          hint={motion.paused ? 'Paused across the site' : 'Loops and transitions play'}
          on={!motion.paused}
          onToggle={motion.toggle}
        >
          <MotionGlyph />
        </Row>
        <Row
          name="sound"
          label="Sound"
          hint={sound.enabled ? 'Soft cues on press and toggle' : 'Muted'}
          on={sound.enabled}
          onToggle={sound.toggle}
        >
          <SoundGlyph />
        </Row>
        {haptics.ready && haptics.supported && (
          <Row
            name="haptics"
            label="Haptics"
            hint={haptics.enabled ? 'A light tap on touch' : 'Off'}
            on={haptics.enabled}
            onToggle={haptics.toggle}
          >
            <HapticsGlyph />
          </Row>
        )}
        <Row
          name="theme"
          label="Dark mode"
          hint={dark ? 'Dark palette, easier at night' : 'Light palette'}
          on={dark}
          onToggle={(e) => theme.toggle(originOf(e))}
        >
          <ThemeGlyph />
        </Row>
      </div>
    </div>
  );
}
