'use client';

import { useEffect } from 'react';
import { bind } from 'cuelume';

/**
 * Mounts once in the root layout. Calls bind() on the document
 * to delegate all data-cuelume-* attributes. Idempotent —
 * safe across route transitions in the Next.js app router.
 *
 * Guards against middle-mouse (scroll wheel click) events firing
 * press/release sounds — Cuelume's bind() doesn't filter by button,
 * so we intercept pointerdown/pointerup with button !== 0 before
 * they reach the delegated listeners.
 */
export function CuelumeBinder() {
  useEffect(() => {
    /**
     * Cuelume's bind() doesn't filter by pointer button, so middle-click
     * (scroll wheel click) fires press/release sounds. During browser
     * auto-scroll mode, elements also scroll under the stationary cursor,
     * firing pointerenter on hover-attribute elements — causing a stream
     * of hover sounds.
     *
     * We guard all three events (pointerdown, pointerup, pointerenter)
     * in the capture phase BEFORE bind() registers its own listeners.
     */

    let middleDown = false;

    const guard = (e: PointerEvent) => {
      if (e.button !== 0) {
        // Non-primary button — block press/release
        e.stopImmediatePropagation();
        if (e.type === 'pointerdown' && e.button === 1) middleDown = true;
        if (e.type === 'pointerup') middleDown = false;
      }
    };

    const guardHover = (e: PointerEvent) => {
      // During auto-scroll, elements scroll under the cursor
      if (middleDown) {
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener('pointerdown', guard, true);
    document.addEventListener('pointerup', guard, true);
    document.addEventListener('pointerenter', guardHover, true);

    bind();

    return () => {
      document.removeEventListener('pointerdown', guard, true);
      document.removeEventListener('pointerup', guard, true);
      document.removeEventListener('pointerenter', guardHover, true);
    };
  }, []);

  return null;
}