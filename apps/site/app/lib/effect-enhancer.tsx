'use client';

import { useEffect } from 'react';

/**
 * Effect enhancer — applies cursor-tracking CSS variables and
 * tap-triggered shake to site-wide elements:
 *
 * - .surface-card: sets --spot-x / --spot-y on pointermove
 * - .field-card: sets --tilt-rx / --tilt-ry on pointermove
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

    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerout', handleLeave, { passive: true });
    document.addEventListener('pointerdown', handleShake, { passive: true });

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerout', handleLeave);
      document.removeEventListener('pointerdown', handleShake);
    };
  }, []);

  return null;
}