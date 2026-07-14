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
    // SVG child elements don't support CSS 3D transforms and reduced-motion
    // !important rules can block CSS hover. We apply effects via inline styles
    // which bypass CSS cascade issues, and skip entirely if reduced-motion.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const SHAPE_FILTERS: Record<string, string> = {
      'seam-dot': 'brightness(1.15) drop-shadow(0 0 6px var(--signal-dim))',
      'seam-orbit': 'brightness(1.12) drop-shadow(0 0 5px var(--signal-dim))',
      'seam-square': 'brightness(1.1) drop-shadow(0 0 4px var(--signal-dim))',
      'seam-triangle': 'brightness(1.13) drop-shadow(0 0 5px var(--signal-dim))',
      'seam-block': 'brightness(1.08) drop-shadow(0 0 4px var(--signal-dim))',
    };

    const handleSeamEnter = (e: PointerEvent) => {
      if (reducedMotion) return;
      const target = e.target as Element;
      const shape = target.closest('.hero-seam-mark .seam-dot, .hero-seam-mark .seam-orbit, .hero-seam-mark .seam-square, .hero-seam-mark .seam-triangle, .hero-seam-mark .seam-block') as Element | null;
      if (!shape) return;

      const shapeClass = ['seam-dot', 'seam-orbit', 'seam-square', 'seam-triangle', 'seam-block']
        .find(c => shape.classList.contains(c) || (shape as Element).tagName.toLowerCase().includes(c.replace('seam-', '')));
      if (!shapeClass) return;

      const mark = shape.closest('.hero-seam-mark');
      if (!mark) return;

      // Apply filter to hovered shape
      (shape as HTMLElement).style.filter = SHAPE_FILTERS[shapeClass] || '';
      (shape as HTMLElement).style.transition = 'filter 180ms var(--ease-out)';

      // Dim siblings
      mark.querySelectorAll('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
        .forEach(sibling => {
          if (sibling !== shape) {
            (sibling as HTMLElement).style.setProperty('opacity', '0.55', 'important');
          }
        });
    };

    const handleSeamLeave = (e: PointerEvent) => {
      if (reducedMotion) return;
      const target = e.target as Element;
      const shape = target.closest('.hero-seam-mark .seam-dot, .hero-seam-mark .seam-orbit, .hero-seam-mark .seam-square, .hero-seam-mark .seam-triangle, .hero-seam-mark .seam-block') as Element | null;
      if (!shape) return;

      const mark = shape.closest('.hero-seam-mark');
      if (!mark) return;

      // Remove filter from hovered shape
      (shape as HTMLElement).style.filter = '';
      // Restore siblings
      mark.querySelectorAll('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
        .forEach(sibling => {
          (sibling as HTMLElement).style.removeProperty('opacity');
        });
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