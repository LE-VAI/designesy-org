'use client';

import { useEffect } from 'react';

/**
 * Effect enhancer — applies cursor-tracking CSS variables and
 * tap-triggered shake to site-wide elements:
 *
 * - .surface-card: sets --spot-x / --spot-y on pointermove
 * - .field-card: sets --tilt-rx / --tilt-ry on pointermove
 * - .hero-seam-mark: 3D tilt toward cursor + sibling dim on hover
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

    /* --- 3D tilt for hero seam mark --- */
    // The SVG child elements don't support CSS transforms, but the
    // .hero-seam-mark container does. We tilt the whole mark toward
    // the cursor and dim siblings via opacity.
    let currentMark: HTMLElement | null = null;

    const handleSeamMove = (e: PointerEvent) => {
      if (!finePointer.matches) return;
      const target = e.target as Element;
      const mark = target.closest<HTMLElement>('.hero-seam-mark');
      if (!mark) return;

      if (currentMark !== mark) {
        // Reset previous mark
        if (currentMark) {
          currentMark.style.transform = '';
          currentMark
            .querySelectorAll('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
            .forEach(s => (s as HTMLElement).style.removeProperty('opacity'));
        }
        currentMark = mark;
      }

      const rect = mark.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      const tiltRx = py * -14;
      const tiltRy = px * 14;
      mark.style.transform = `perspective(500px) rotateX(${tiltRx}deg) rotateY(${tiltRy}deg) translateZ(10px)`;

      // Dim the shape closest to cursor? No — dim all shapes slightly
      // since the whole mark lifts. Actually, just let the tilt speak.
      // No sibling dim needed — the whole mark tilts as one piece.
    };

    const handleSeamLeave = (e: PointerEvent) => {
      const target = e.target as Element;
      const mark = target.closest<HTMLElement>('.hero-seam-mark');
      if (!mark) return;

      // Check if the pointer is leaving the mark entirely
      const rect = mark.getBoundingClientRect();
      const outside =
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom;

      if (outside) {
        mark.style.transform = '';
        currentMark = null;
      }
    };

    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointermove', handleSeamMove, { passive: true });
    document.addEventListener('pointerout', handleLeave, { passive: true });
    document.addEventListener('pointerout', handleSeamLeave, { passive: true });
    document.addEventListener('pointerdown', handleShake, { passive: true });

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointermove', handleSeamMove);
      document.removeEventListener('pointerout', handleLeave);
      document.removeEventListener('pointerout', handleSeamLeave);
      document.removeEventListener('pointerdown', handleShake);
    };
  }, []);

  return null;
}