'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { HapticsToggle } from './haptics-toggle';
import { MotionToggle } from './motion-toggle';
import { SoundToggle } from './sound-toggle';
import { ThemeToggle } from './theme-toggle';

/**
 * Senses — one control centre for motion, sound, haptics, and theme.
 * The trigger reads "Tune senses": verb-first (check v38), and the accessible
 * name starts with the visible words (WCAG 2.5.3).
 *
 * The topbar used to show these as four identical 44px squares next to the
 * search box: five unlabeled boxes in a row, the most-seen component on the
 * site and the least designed. They now live behind one labelled trigger, in
 * a panel where each control has a name and a line of explanation.
 *
 * The toggles themselves are the same components with the same behaviour and
 * aria (aria-pressed, the motion pre-paint restore, the sound preference and
 * its data-audio attribute). Only their placement changed. Haptics renders
 * only on hardware that can vibrate, so its row hides itself (CSS :has) when
 * the toggle renders nothing.
 */
const ROWS = [
  { key: 'motion', label: 'Motion', hint: 'Pause every looping animation', Control: MotionToggle },
  { key: 'sound', label: 'Sound', hint: 'Interaction sounds', Control: SoundToggle },
  { key: 'haptics', label: 'Haptics', hint: 'Vibration on touch devices', Control: HapticsToggle },
  { key: 'theme', label: 'Theme', hint: 'Switch light and dark', Control: ThemeToggle },
] as const;

export function SensesMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

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
          <i /><i /><i /><i />
        </span>
        <span className="senses-label">Tune senses</span>
      </button>
      <div className="senses-panel" id={panelId} role="group" aria-label="Senses" hidden={!open}>
        {ROWS.map(({ key, label, hint, Control }) => (
          <div className={`senses-row senses-row--${key}`} key={key}>
            <span className="senses-row-text">
              <span className="senses-row-label">{label}</span>
              <span className="senses-row-hint">{hint}</span>
            </span>
            <Control />
          </div>
        ))}
      </div>
    </div>
  );
}
