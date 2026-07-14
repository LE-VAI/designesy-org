'use client';

import { useEffect } from 'react';

/**
 * Effect enhancer — applies cursor-tracking CSS variables and
 * tap-triggered effects to site-wide elements:
 *
 * - .surface-card: sets --spot-x / --spot-y on pointermove
 * - .field-card: sets --tilt-rx / --tilt-ry on pointermove
 * - .hero-seam-mark: per-shape opacity dim (closest shape highlights)
 * - .principle, .pipeline-step: adds .is-shaking on pointerdown
 *
 * Respects prefers-reduced-motion (exits early).
 * Zero dependencies, passive listeners only.
 */

export function EffectEnhancer() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    /* --- Cursor tracking for spotlight + tilt --- */
    const handleMove = (e: PointerEvent) => {
      const target = e.target as HTMLElement;

      // Surface card spotlight
      const surfaceCard = target.closest<HTMLElement>('.surface-card');
      if (surfaceCard) {
        const rect = surfaceCard.getBoundingClientRect();
        surfaceCard.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
        surfaceCard.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
      }

      // Field card tilt
      if (finePointer.matches) {
        const fieldCard = target.closest<HTMLElement>('.field-card');
        if (fieldCard) {
          const rect = fieldCard.getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width - 0.5;
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          fieldCard.style.setProperty('--tilt-rx', `${py * -6}deg`);
          fieldCard.style.setProperty('--tilt-ry', `${px * 6}deg`);
        }
      }
    };

    const handleLeave = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const fieldCard = target.closest<HTMLElement>('.field-card');
      if (fieldCard) {
        fieldCard.style.removeProperty('--tilt-rx');
        fieldCard.style.removeProperty('--tilt-ry');
      }
    };

    /* --- Shake on tap for non-link elements --- */
    const handleShake = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const shakeEl = target.closest<HTMLElement>('.principle, .pipeline-step');
      if (shakeEl && !shakeEl.classList.contains('is-shaking')) {
        shakeEl.classList.add('is-shaking');
        setTimeout(() => shakeEl.classList.remove('is-shaking'), 400);
      }
    };

    /* --- Hero seam: per-shape opacity dim on hover --- */
    // No 3D tilt (causes feedback loop jumpiness). Just dim siblings
    // when hovering a shape — clean, stable, smooth.
    let activeMark: HTMLElement | null = null;

    const resetMark = (mark: HTMLElement) => {
      mark.querySelectorAll<HTMLElement>('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
        .forEach(s => {
          s.style.removeProperty('opacity');
          s.style.removeProperty('fill');
          s.style.removeProperty('filter');
        });
    };

    const handleSeamMove = (e: PointerEvent) => {
      if (!finePointer.matches) return;
      const target = e.target as Element;
      const mark = target.closest<HTMLElement>('.hero-seam-mark');
      if (!mark) return;

      if (activeMark !== mark) {
        if (activeMark) resetMark(activeMark);
        activeMark = mark;
      }

      // Find which shape is closest to cursor
      const shapes = mark.querySelectorAll<HTMLElement>('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block');
      let closest: HTMLElement | null = null;
      let closestDist = Infinity;
      shapes.forEach(shape => {
        const sr = shape.getBoundingClientRect();
        const sx = sr.x + sr.width / 2;
        const sy = sr.y + sr.height / 2;
        const dist = Math.hypot(e.clientX - sx, e.clientY - sy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = shape;
        }
      });

      // Apply: closest shape full, others dim
      shapes.forEach(shape => {
        if (shape === closest) {
          shape.style.setProperty('opacity', '1', 'important');
          shape.style.setProperty('fill', '#3358e8', 'important');
        } else {
          shape.style.setProperty('opacity', '0.4', 'important');
          shape.style.removeProperty('fill');
        }
      });
    };

    const handleSeamOut = (e: PointerEvent) => {
      const target = e.target as Element;
      const mark = target.closest<HTMLElement>('.hero-seam-mark');
      if (!mark || mark !== activeMark) return;

      const rect = mark.getBoundingClientRect();
      const outside =
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom;

      if (outside) {
        resetMark(mark);
        activeMark = null;
      }
    };

    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointermove', handleSeamMove, { passive: true });
    document.addEventListener('pointerout', handleLeave, { passive: true });
    document.addEventListener('pointerout', handleSeamOut, { passive: true });
    document.addEventListener('pointerdown', handleShake, { passive: true });

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointermove', handleSeamMove);
      document.removeEventListener('pointerout', handleLeave);
      document.removeEventListener('pointerout', handleSeamOut);
      document.removeEventListener('pointerdown', handleShake);
    };
  }, []);

  return null;
}