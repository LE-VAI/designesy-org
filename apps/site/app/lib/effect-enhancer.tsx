'use client';

import { useEffect } from 'react';

/**
 * Effect enhancer — applies cursor-tracking CSS variables and
 * tap-triggered effects to site-wide elements:
 *
 * - .surface-card: sets --spot-x / --spot-y on pointermove
 * - .field-card: sets --tilt-rx / --tilt-ry on pointermove
 * - .hero-seam-mark .seam-shape: per-shape 3D tilt + color shift on hover
 * - .principle, .pipeline-step: adds .is-shaking on pointerdown
 *
 * Respects prefers-reduced-motion (exits early).
 * Zero dependencies, passive listeners only.
 */

/** Per-shape hover config: 3D transform + color swap */
const SHAPE_CONFIG: Record<string, { transform: string; color: string }> = {
  'seam-dot-group': {
    transform: 'perspective(400px) translateZ(16px) scale(1.1)',
    color: 'var(--signal-light)',
  },
  'seam-orbit-group': {
    transform: 'perspective(400px) translateZ(12px) rotateY(-12deg) scale(1.05)',
    color: 'var(--signal-light)',
  },
  'seam-square-group': {
    transform: 'perspective(400px) translateZ(14px) rotateX(-8deg) scale(1.05)',
    color: 'var(--signal-light)',
  },
  'seam-triangle-group': {
    transform: 'perspective(400px) translateZ(16px) rotateX(8deg) rotateZ(-3deg) scale(1.06)',
    color: 'var(--signal-light)',
  },
  'seam-block-group': {
    transform: 'perspective(400px) translateZ(10px) rotateX(-4deg) rotateY(6deg) scale(1.04)',
    color: 'var(--signal-light)',
  },
};

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

    /* --- Per-shape 3D hover for hero seam --- */
    // <g> elements support CSS transforms (unlike SVG child shapes).
    // Each shape group gets a unique 3D lift + color shift on hover.
    let hoveredShape: HTMLElement | null = null;

    const handleSeamEnter = (e: PointerEvent) => {
      if (!finePointer.matches) return;
      const target = e.target as Element;
      const shape = target.closest('.hero-seam-mark .seam-shape') as HTMLElement | null;
      if (!shape) return;

      // Find which shape group
      const groupClass = ['seam-dot-group', 'seam-orbit-group', 'seam-square-group',
        'seam-triangle-group', 'seam-block-group']
        .find(c => shape.classList.contains(c));
      if (!groupClass) return;

      const config = SHAPE_CONFIG[groupClass];
      hoveredShape = shape;

      // Apply 3D transform to the <g> group
      shape.style.transform = config.transform;
      shape.style.transformOrigin = 'center';
      shape.style.transition = 'transform 200ms var(--ease-out)';

      // Color shift: change the fill of the child shape
      const child = shape.querySelector('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block') as HTMLElement | null;
      if (child) {
        child.style.transition = 'fill 200ms var(--ease)';
        child.style.fill = config.color;
      }

      // Dim sibling shapes
      const mark = shape.closest('.hero-seam-mark');
      if (mark) {
        mark.querySelectorAll('.seam-shape').forEach(sibling => {
          if (sibling !== shape) {
            (sibling as HTMLElement).style.setProperty('opacity', '0.5', 'important');
            (sibling as HTMLElement).style.transition = 'opacity 200ms var(--ease)';
          }
        });
      }
    };

    const handleSeamLeave = (e: PointerEvent) => {
      const target = e.target as Element;
      const shape = target.closest('.hero-seam-mark .seam-shape') as HTMLElement | null;
      if (!shape || shape !== hoveredShape) return;

      // Reset transform
      shape.style.transform = '';
      // Reset color
      const child = shape.querySelector('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block') as HTMLElement | null;
      if (child) {
        child.style.fill = '';
      }

      // Restore siblings
      const mark = shape.closest('.hero-seam-mark');
      if (mark) {
        mark.querySelectorAll('.seam-shape').forEach(sibling => {
          (sibling as HTMLElement).style.removeProperty('opacity');
          (sibling as HTMLElement).style.transform = '';
          const sibChild = sibling.querySelector('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block') as HTMLElement | null;
          if (sibChild) sibChild.style.fill = '';
        });
      }

      hoveredShape = null;
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