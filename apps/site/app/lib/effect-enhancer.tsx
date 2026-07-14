'use client';

import { useEffect } from 'react';

/**
 * Effect enhancer — applies cursor-tracking CSS variables and
 * tap-triggered effects to site-wide elements:
 *
 * - .surface-card: sets --spot-x / --spot-y on pointermove
 * - .field-card: sets --tilt-rx / --tilt-ry on pointermove
 * - .hero-seam-mark: 3D tilt toward cursor + per-shape color shift + sibling dim
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

    /* --- Hero seam: 3D tilt on mark + per-shape color + sibling dim --- */
    // SVG child elements don't support CSS transforms, but the .hero-seam-mark
    // container (an <svg> element) does. We tilt the whole mark toward the
    // cursor AND shift color/dim on individual shapes.
    let currentMark: HTMLElement | null = null;

    const handleSeamMove = (e: PointerEvent) => {
      if (!finePointer.matches) return;
      const target = e.target as Element;
      const mark = target.closest<HTMLElement>('.hero-seam-mark');
      if (!mark) return;

      if (currentMark !== mark) {
        // Reset previous
        if (currentMark) {
          currentMark.style.transform = '';
          currentMark.querySelectorAll('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
            .forEach(s => {
              (s as HTMLElement).style.removeProperty('opacity');
              (s as HTMLElement).style.removeProperty('fill');
            });
        }
        currentMark = mark;
      }

      // 3D tilt the whole mark toward cursor
      const rect = mark.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      const tiltRx = py * -12;
      const tiltRy = px * 12;
      mark.style.transform = `perspective(500px) rotateX(${tiltRx}deg) rotateY(${tiltRy}deg) translateZ(8px)`;

      // Per-shape color shift on the shape closest to cursor
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

      shapes.forEach(shape => {
        if (shape === closest) {
          // Highlight: brighten to signal-light
          shape.style.setProperty('fill', 'var(--signal-light)', 'important');
          shape.style.setProperty('opacity', '1', 'important');
        } else {
          // Dim siblings
          shape.style.setProperty('opacity', '0.45', 'important');
          shape.style.removeProperty('fill');
        }
      });
    };

    const handleSeamOut = (e: PointerEvent) => {
      const target = e.target as Element;
      const mark = target.closest<HTMLElement>('.hero-seam-mark');
      if (!mark) return;

      const rect = mark.getBoundingClientRect();
      const outside =
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom;

      if (outside) {
        mark.style.transform = '';
        mark.querySelectorAll<HTMLElement>('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
          .forEach(s => {
            s.style.removeProperty('opacity');
            s.style.removeProperty('fill');
          });
        currentMark = null;
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