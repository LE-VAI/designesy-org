'use client';

import { useEffect } from 'react';

/**
 * Magnetic cursor — the Linear/Arc/Vercel-tier micro-detail.
 *
 * A small ring lags behind the native cursor with spring physics (lerp),
 * and a tiny dot tracks instantly. The gap between ring and dot creates
 * the "alive" feel — the ring catches up after you stop.
 *
 * - Ring grows + brightens over interactive elements (a, button, [role="button"], input, .score-card-item, .field-card, .surface-card)
 * - Ring snaps to center of hovered interactive element (magnetic pull)
 * - Hidden on touch devices (pointer: coarse) and prefers-reduced-motion
 * - Zero dependencies, passive listeners, rAF-driven, cleans up on unmount
 * - Never blocks pointer events (pointer-events: none on both elements)
 */
export function MagneticCursor() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    // Bail on touch devices and reduced-motion users.
    if (reducedMotion || !finePointer.matches) return;

    // Build the two elements once.
    const ring = document.createElement('div');
    ring.className = 'mag-cursor-ring';
    ring.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('div');
    dot.className = 'mag-cursor-dot';
    dot.setAttribute('aria-hidden', 'true');

    document.body.append(ring, dot);

    // Ring position state — starts offscreen so it doesn't flash at 0,0.
    let ringX = -100;
    let ringY = -100;
    let targetX = -100;
    let targetY = -100;
    let dotX = -100;
    let dotY = -100;
    let hovering = false;
    let rafId = 0;

    const INTERACTIVE_SELECTOR =
      'a, button, [role="button"], input, textarea, select, .score-card-item, .field-card, .surface-card, .toggle, .toggle-row, .pillar';

    const onMove = (e: PointerEvent) => {
      // Dot tracks instantly.
      dotX = e.clientX;
      dotY = e.clientY;
      dot.style.transform = `translate(${dotX}px, ${dotY}px)`;

      // Ring target — magnetic snap to interactive element center.
      const target = e.target as HTMLElement;
      const interactive = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (interactive) {
        const rect = interactive.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // Snap fully to center — the magnetic pull.
        targetX = cx;
        targetY = cy;
        if (!hovering) {
          hovering = true;
          ring.classList.add('is-hovering');
        }
      } else {
        targetX = e.clientX;
        targetY = e.clientY;
        if (hovering) {
          hovering = false;
          ring.classList.remove('is-hovering');
        }
      }
    };

    const onLeave = () => {
      // Hide both when cursor leaves the window.
      ring.style.opacity = '0';
      dot.style.opacity = '0';
    };

    const onEnter = () => {
      ring.style.opacity = '';
      dot.style.opacity = '';
    };

    // rAF loop — ring follows target with spring lerp.
    const tick = () => {
      // The lerp factor (0.18) gives a subtle lag — fast enough to feel
      // responsive, slow enough to show the catch-up. Tuned to match
      // Linear's cursor feel.
      ringX += (targetX - ringX) * 0.18;
      ringY += (targetY - ringY) * 0.18;
      ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave, { passive: true });
    document.addEventListener('pointerenter', onEnter, { passive: true });

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerenter', onEnter);
      cancelAnimationFrame(rafId);
      ring.remove();
      dot.remove();
    };
  }, []);

  return null;
}