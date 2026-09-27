'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Motion toggle — pauses every looping animation on the site.
 *
 * WCAG 2.2.2 (Pause, Stop, Hide) asks for a visible pause control on any
 * motion that starts automatically and runs longer than 5s. The hero rotator
 * cycles every 3.2s indefinitely and the hero construction primitives loop on
 * 4.5–9s CSS cycles, so prefers-reduced-motion alone does not satisfy it: a
 * visitor who never set the OS preference still needs a way to stop them.
 *
 * State lives on html[data-motion="paused"]. layout.tsx stamps it from
 * localStorage before first paint, so a paused visitor never sees a flash of
 * motion on the next page. CSS freezes every animation under that attribute;
 * the scramble rotator and the ambient particles read it directly.
 *
 * Two placements share that one attribute: the icon button in the topbar's
 * Sensory group (desktop) and a labelled row in the nav drawer (≤720px, where
 * the topbar has no room for a fifth control). Each instance observes the
 * attribute, so toggling one updates the other.
 *
 * aria-pressed with a fixed label: "Pause animations", pressed = paused.
 */
const KEY = 'motion';

function readPaused(): boolean {
  return document.documentElement.dataset.motion === 'paused';
}

export function MotionToggle({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPaused(readPaused());
    const observer = new MutationObserver(() => setPaused(readPaused()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    });
    return () => observer.disconnect();
  }, []);

  const toggle = useCallback(() => {
    const next = !readPaused();
    const root = document.documentElement;
    if (next) root.dataset.motion = 'paused';
    else delete root.dataset.motion;
    try {
      localStorage.setItem(KEY, next ? 'paused' : 'on');
    } catch {
      /* storage blocked — the toggle still works for this page view */
    }
  }, []);

  if (variant === 'row') {
    return (
      <button
        type="button"
        className="motion-toggle-row"
        onClick={toggle}
        aria-pressed={paused}
      >
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
