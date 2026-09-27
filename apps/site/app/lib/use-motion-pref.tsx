'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'motion';

function readPaused(): boolean {
  return document.documentElement.dataset.motion === 'paused';
}

/**
 * The visitor's motion preference (WCAG 2.2.2 Pause, Stop, Hide).
 *
 * State lives on html[data-motion="paused"]; layout.tsx restores it from
 * localStorage before first paint, and globals.css freezes every CSS animation
 * under it. Every control that reads it observes the attribute, so the senses
 * panel and the phone drawer's row never disagree.
 */
export function useMotionPreference() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPaused(readPaused());
    const mo = new MutationObserver(() => setPaused(readPaused()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => mo.disconnect();
  }, []);

  const toggle = useCallback(() => {
    const next = !readPaused();
    const root = document.documentElement;
    if (next) root.dataset.motion = 'paused';
    else delete root.dataset.motion;
    try {
      localStorage.setItem(KEY, next ? 'paused' : 'on');
    } catch {
      /* storage blocked: the toggle still works for this page view */
    }
  }, []);

  return { paused, toggle };
}
