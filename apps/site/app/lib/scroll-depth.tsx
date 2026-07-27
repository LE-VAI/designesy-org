'use client';

import { useEffect } from 'react';

/**
 * Scroll-driven depth — the parallax + progress layer.
 *
 * Sets three CSS variables on <html> via a single passive scroll listener
 * + rAF throttle:
 *
 *   --scroll-y      : current scrollY in px (for parallax transforms)
 *   --scroll-progress : 0..1 fraction of the page scrolled (for a top progress bar)
 *   --scroll-velocity : -1..1 normalized velocity (for skew/stretch effects)
 *
 * The CSS layer reads these vars to drive:
 *   - .hero-seam parallax drift (translateY at 0.3x scroll speed)
 *   - .scroll-progress-bar (top-of-page width: calc(var(--scroll-progress) * 100%))
 *   - .section parallax (subtle 4px shift per section as it crosses the viewport)
 *
 * Zero dependencies. Respects prefers-reduced-motion (exits early — the
 * site stays fully readable, just without parallax). Passive listener
 * so it never blocks the scroll thread.
 */
export function ScrollDepth() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    let ticking = false;
    let lastY = window.scrollY;
    let lastTime = performance.now();
    let velocity = 0;

    const update = () => {
      const y = window.scrollY;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(y / maxScroll, 1);

      // Velocity: px/ms, normalized to a -1..1 range and smoothed.
      const now = performance.now();
      const dt = Math.max(now - lastTime, 1);
      const rawVel = (y - lastY) / dt;
      velocity = velocity * 0.7 + rawVel * 0.3; // smoothing
      const normVel = Math.max(-1, Math.min(1, velocity / 3));

      const root = document.documentElement;
      root.style.setProperty('--scroll-y', `${y}px`);
      root.style.setProperty('--scroll-progress', String(progress));
      root.style.setProperty('--scroll-velocity', String(normVel));

      lastY = y;
      lastTime = now;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Initial paint so the progress bar starts at 0 and vars are defined.
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return null;
}