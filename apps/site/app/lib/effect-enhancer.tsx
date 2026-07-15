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

      // Surface card spotlight + 3D tilt
      const surfaceCard = target.closest<HTMLElement>('.surface-card');
      if (surfaceCard) {
        const rect = surfaceCard.getBoundingClientRect();
        surfaceCard.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
        surfaceCard.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);

        // 3D tilt on fine pointers (same as field cards)
        if (finePointer.matches) {
          const px = (e.clientX - rect.left) / rect.width - 0.5;
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          surfaceCard.style.setProperty('--tilt-rx', `${py * -8}deg`);
          surfaceCard.style.setProperty('--tilt-ry', `${px * 8}deg`);
        }
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
      const surfaceCard = target.closest<HTMLElement>('.surface-card');
      if (surfaceCard) {
        surfaceCard.style.removeProperty('--tilt-rx');
        surfaceCard.style.removeProperty('--tilt-ry');
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

    /* --- Hero seam: per-shape color shift + dot pulse on hover --- */
    let activeMark: HTMLElement | null = null;
    let pulseAnimating = false;

    const triggerDotPulse = (mark: HTMLElement) => {
      if (pulseAnimating) return;
      const pulse = mark.querySelector<HTMLElement>('.seam-dot-pulse');
      if (!pulse) return;
      pulseAnimating = true;

      // Use SVG attribute animation via rAF
      let r = 56;
      let opacity = 0.8;
      const maxR = 90;
      const start = performance.now();
      const duration = 600;

      const animate = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        r = 56 + (maxR - 56) * eased;
        opacity = 0.8 * (1 - eased);

        pulse.setAttribute('r', String(r));
        pulse.style.setProperty('opacity', String(opacity), 'important');
        pulse.style.setProperty('stroke-width', String(2 + eased * 2), 'important');

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          pulse.setAttribute('r', '56');
          pulse.style.removeProperty('opacity');
          pulse.style.removeProperty('stroke-width');
          pulseAnimating = false;
        }
      };
      requestAnimationFrame(animate);
    };

    const resetMark = (mark: HTMLElement) => {
      mark.querySelectorAll<HTMLElement>('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
        .forEach(s => {
          s.style.removeProperty('fill');
        });
      const pulse = mark.querySelector<HTMLElement>('.seam-dot-pulse');
      if (pulse) {
        pulse.setAttribute('r', '56');
        pulse.style.removeProperty('opacity');
        pulse.style.removeProperty('stroke-width');
      }
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
      let isDotClosest = false;
      shapes.forEach(shape => {
        const sr = shape.getBoundingClientRect();
        const sx = sr.x + sr.width / 2;
        const sy = sr.y + sr.height / 2;
        const dist = Math.hypot(e.clientX - sx, e.clientY - sy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = shape;
          isDotClosest = shape.classList.contains('seam-dot');
        }
      });

      // Apply: closest shape gets color shift, no sibling dim
      shapes.forEach(shape => {
        if (shape === closest) {
          shape.style.setProperty('fill', '#3358e8', 'important');
        } else {
          shape.style.removeProperty('fill');
        }
      });

      // Trigger pulse ring when dot is hovered
      if (isDotClosest) {
        triggerDotPulse(mark);
      }
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