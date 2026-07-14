'use client';

import { useEffect } from 'react';

/**
 * Effect enhancer — applies cursor-tracking CSS variables and
 * tap-triggered shake to site-wide elements:
 *
 * - .surface-card: sets --spot-x / --spot-y on pointermove
 * - .field-card: sets --tilt-rx / --tilt-ry on pointermove
 * - .principle, .pipeline-step: adds .is-shaking on pointerdown
 * - .hero-seam-mark [seam-*]: adds .is-hovered on pointerenter/leave
 *   (CSS :hover on SVG children can be unreliable across browsers;
 *   this JS-driven approach ensures consistent hover state)
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

    /* --- JS-driven hover for hero seam shapes --- */
    const handleSeamEnter = (e: PointerEvent) => {
      const target = e.target as Element;
      const shape = target.closest('.hero-seam-mark .seam-dot, .hero-seam-mark .seam-orbit, .hero-seam-mark .seam-square, .hero-seam-mark .seam-triangle, .hero-seam-mark .seam-block');
      if (shape) {
        shape.classList.add('is-hovered');
        // Sibling dim
        const mark = shape.closest('.hero-seam-mark');
        if (mark) {
          mark.querySelectorAll('.is-hovered').forEach(s => {
            if (s !== shape) s.classList.remove('is-hovered');
          });
          mark.classList.add('has-hover');
        }
      }
    };

    const handleSeamLeave = (e: PointerEvent) => {
      const target = e.target as Element;
      const shape = target.closest('.hero-seam-mark .seam-dot, .hero-seam-mark .seam-orbit, .hero-seam-mark .seam-square, .hero-seam-mark .seam-triangle, .hero-seam-mark .seam-block');
      if (shape) {
        shape.classList.remove('is-hovered');
        const mark = shape.closest('.hero-seam-mark');
        if (mark) {
          mark.classList.remove('has-hover');
        }
      }
    };

    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerout', handleLeave, { passive: true });
    document.addEventListener('pointerdown', handleShake, { passive: true });
    document.addEventListener('pointerenter', handleSeamEnter, { passive: true, capture: true });
    document.addEventListener('pointerleave', handleSeamLeave, { passive: true, capture: true });

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerout', handleLeave);
      document.removeEventListener('pointerdown', handleShake);
      document.removeEventListener('pointerenter', handleSeamEnter, true);
      document.removeEventListener('pointerleave', handleSeamLeave, true);
    };
  }, []);

  return null;
}