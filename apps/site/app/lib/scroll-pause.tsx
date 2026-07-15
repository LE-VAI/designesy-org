'use client';

import { useEffect, useRef } from 'react';

/**
 * Enables manual scrolling on an auto-scrolling marquee when the
 * animation pauses on hover.
 *
 * The CSS sets up: clip (overflow:hidden) > track (animated translateX/Y).
 * On mouseenter of the clip:
 *   1. Read the animation's current transform offset.
 *   2. Pause the animation.
 *   3. Remove the inline transform so native scroll takes over.
 *   4. Switch clip to overflow:auto so the user can scroll.
 *   5. Set scrollLeft/scrollTop to match where the animation was.
 * On mouseleave:
 *   1. Switch clip back to overflow:hidden.
 *   2. Clear scroll position.
 *   3. Resume the animation from the beginning (clean reset).
 *
 * Usage: wrap the clip element with a ref and pass it + the track ref.
 * Or simpler: call initScrollPause(clipEl, trackEl, direction).
 */

export function initScrollPause(
  clip: HTMLElement,
  track: HTMLElement,
  direction: 'horizontal' | 'vertical' = 'horizontal'
) {
  let hovered = false;

  const isHorizontal = direction === 'horizontal';
  const scrollProp: 'scrollLeft' | 'scrollTop' =
    isHorizontal ? 'scrollLeft' : 'scrollTop';
  const overflowAxis: 'overflowX' | 'overflowY' =
    isHorizontal ? 'overflowX' : 'overflowY';

  const onEnter = () => {
    if (hovered) return;
    hovered = true;

    // Read the current transform from the running animation
    const style = window.getComputedStyle(track);
    const transform = style.transform;
    let offset = 0;
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
      if (match) {
        const values = match[1].split(',').map(Number);
        offset = isHorizontal
          ? (values.length === 16 ? values[12] : values[4])
          : (values.length === 16 ? values[13] : values[5]);
      }
    }

    // Pause the animation
    track.style.animationPlayState = 'paused';
    // Remove the transform so native scroll works
    track.style.transform = 'none';

    // Make the clip scrollable
    clip.style[overflowAxis] = 'auto';

    // Scroll to where the animation was
    clip[scrollProp] = Math.abs(offset);
  };

  const onLeave = () => {
    if (!hovered) return;
    hovered = false;

    // Back to hidden
    clip.style[overflowAxis] = 'hidden';
    clip[scrollProp] = 0;

    // Resume animation from the start
    track.style.transform = '';
    track.style.animationPlayState = 'running';
  };

  clip.addEventListener('mouseenter', onEnter);
  clip.addEventListener('mouseleave', onLeave);

  // Touch: enter on touchstart, leave on touchend with a small delay
  // so the user can lift their finger without the animation restarting
  // immediately.
  let touchResumeTimer: ReturnType<typeof setTimeout> | null = null;
  const onTouchStart = () => {
    if (touchResumeTimer) {
      clearTimeout(touchResumeTimer);
      touchResumeTimer = null;
    }
    onEnter();
  };
  const onTouchEnd = () => {
    if (touchResumeTimer) clearTimeout(touchResumeTimer);
    touchResumeTimer = setTimeout(onLeave, 800);
  };

  clip.addEventListener('touchstart', onTouchStart, { passive: true });
  clip.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    clip.removeEventListener('mouseenter', onEnter);
    clip.removeEventListener('mouseleave', onLeave);
    clip.removeEventListener('touchstart', onTouchStart);
    clip.removeEventListener('touchend', onTouchEnd);
    if (touchResumeTimer) clearTimeout(touchResumeTimer);
  };
}