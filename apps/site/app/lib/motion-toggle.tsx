'use client';

import { useMotionPreference } from './use-motion-pref';

/**
 * Motion toggle — pauses every looping animation on the site.
 *
 * WCAG 2.2.2 (Pause, Stop, Hide) asks for a visible pause control on any
 * motion that starts automatically and runs longer than 5s. The homepage
 * console loops on a 12s clock, so prefers-reduced-motion alone does not
 * satisfy it: a visitor who never set the OS preference still needs a way to
 * stop it. The senses panel's Motion row is that control on every width; this
 * component is the same switch as a labelled row in the phone nav drawer.
 *
 * State lives on html[data-motion="paused"] (lib/use-motion-pref). layout.tsx
 * restores it before first paint, and CSS freezes every animation under it.
 *
 * aria-pressed with a fixed label: "Pause animations", pressed = paused.
 */
export function MotionToggle({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const { paused, toggle } = useMotionPreference();

  if (variant === 'row') {
    return (
      <button type="button" className="motion-toggle-row" onClick={toggle} aria-pressed={paused}>
        <span className="motion-toggle-row-icon" aria-hidden="true">
          {paused ? '▶' : '❚❚'}
        </span>
        Pause animations
      </button>
    );
  }

  return (
    <button
      type="button"
      className="sense-toggle motion-toggle"
      onClick={toggle}
      aria-label="Pause animations"
      aria-pressed={paused}
      title={paused ? 'Animations paused' : 'Animations on'}
    >
      <span className="sense-toggle-icon" aria-hidden="true">
        {paused ? '▶' : '❚❚'}
      </span>
    </button>
  );
}
