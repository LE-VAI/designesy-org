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
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

      // Field card spotlight + tilt
      const fieldCard = target.closest<HTMLElement>('.field-card');
      if (fieldCard) {
        const rect = fieldCard.getBoundingClientRect();
        fieldCard.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
        fieldCard.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);

        if (finePointer.matches) {
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
        fieldCard.style.removeProperty('--spot-x');
        fieldCard.style.removeProperty('--spot-y');
      }
      const surfaceCard = target.closest<HTMLElement>('.surface-card');
      if (surfaceCard) {
        surfaceCard.style.removeProperty('--tilt-rx');
        surfaceCard.style.removeProperty('--tilt-ry');
        surfaceCard.style.removeProperty('--spot-x');
        surfaceCard.style.removeProperty('--spot-y');
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

    /* --- Hero seam: per-shape color shift + magnetic drift + pulse + click burst --- */
    let activeMark: HTMLElement | null = null;
    let pulseAnimating = false;
    let burstAnimating = false;

    // v3 scatter field: pulse ring radii follow the new dot geometry
    // (dot r=11 at cx164 cy34; pulse ring starts r=30, expands to r=58).
    const PULSE_START_R = 30;
    const PULSE_MAX_R = 58;

    const triggerDotPulse = (mark: HTMLElement) => {
      if (pulseAnimating) return;
      const pulse = mark.querySelector<HTMLElement>('.seam-dot-pulse');
      if (!pulse) return;
      pulseAnimating = true;

      // Use SVG attribute animation via rAF
      let r = PULSE_START_R;
      let opacity = 0.8;
      const start = performance.now();
      const duration = 600;

      const animate = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        r = PULSE_START_R + (PULSE_MAX_R - PULSE_START_R) * eased;
        opacity = 0.8 * (1 - eased);

        pulse.setAttribute('r', String(r));
        pulse.style.setProperty('opacity', String(opacity), 'important');
        pulse.style.setProperty('stroke-width', String(1.5 + eased * 1.5), 'important');

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          pulse.setAttribute('r', String(PULSE_START_R));
          pulse.style.removeProperty('opacity');
          pulse.style.removeProperty('stroke-width');
          pulseAnimating = false;
        }
      };
      requestAnimationFrame(animate);
    };

    // Click burst — spawn a temporary ring from the clicked shape's own
    // position and expand+fade it. One at a time; skip under reduced-motion
    // (decorative, not feedback).
    const triggerBurst = (mark: HTMLElement, shape: HTMLElement) => {
      if (burstAnimating || reducedMotion) return;
      const svg = mark as unknown as SVGSVGElement;
      // read the shape's own geometry for the ring center
      const svgRect = svg.getBoundingClientRect();
      const shapeRect = shape.getBoundingClientRect();
      // convert viewport px → SVG user units via the viewBox scale
      const viewBox = svg.viewBox.baseVal;
      const scaleX = viewBox.width / svgRect.width;
      const scaleY = viewBox.height / svgRect.height;
      const cx = (shapeRect.left + shapeRect.width / 2 - svgRect.left) * scaleX;
      const cy = (shapeRect.top + shapeRect.height / 2 - svgRect.top) * scaleY;
      const r0 = Math.max(shapeRect.width, shapeRect.height) * Math.max(scaleX, scaleY) * 0.9;

      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', String(cx));
      ring.setAttribute('cy', String(cy));
      ring.setAttribute('r', String(r0));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#3358e8');
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('opacity', '0.7');
      ring.setAttribute('pointer-events', 'none');
      svg.appendChild(ring);
      burstAnimating = true;

      const start = performance.now();
      const duration = 550;
      const maxR = r0 * 3.2;
      const animate = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        ring.setAttribute('r', String(r0 + (maxR - r0) * eased));
        ring.setAttribute('opacity', String(0.7 * (1 - eased)));
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          ring.remove();
          burstAnimating = false;
        }
      };
      requestAnimationFrame(animate);
    };

    const resetMark = (mark: HTMLElement) => {
      mark.querySelectorAll<HTMLElement>('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block')
        .forEach(s => {
          s.style.removeProperty('fill');
          s.style.removeProperty('transform');
        });
      const pulse = mark.querySelector<HTMLElement>('.seam-dot-pulse');
      if (pulse) {
        pulse.setAttribute('r', String(PULSE_START_R));
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

      // Apply: closest shape gets color shift + magnetic drift toward the
      // cursor. The drift is capped at 8px and eases out as the cursor nears
      // the centroid, so the element feels grabbed, not shoved.
      shapes.forEach(shape => {
        if (shape === closest) {
          shape.style.setProperty('fill', '#3358e8', 'important');
          if (!reducedMotion) {
            const sr = shape.getBoundingClientRect();
            const sx = sr.x + sr.width / 2;
            const sy = sr.y + sr.height / 2;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            const dist = Math.max(Math.hypot(dx, dy), 1);
            const cap = 8;
            const pull = Math.min(cap, dist * 0.18);
            shape.style.setProperty(
              'transform',
              `translate(${(dx / dist) * pull}px, ${(dy / dist) * pull}px)`,
              'important',
            );
          }
        } else {
          shape.style.removeProperty('fill');
          shape.style.removeProperty('transform');
        }
      });

      // Trigger pulse ring when dot is hovered (skip under reduced-motion —
      // the pulse is a decorative animation, not interaction feedback)
      if (isDotClosest && !reducedMotion) {
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

    // Click burst — fires on any shape press when fine-pointer, decorative.
    const handleSeamPress = (e: PointerEvent) => {
      if (!finePointer.matches) return;
      const target = e.target as Element;
      const mark = target.closest<HTMLElement>('.hero-seam-mark');
      if (!mark) return;
      const shape = target.closest<HTMLElement>('.seam-dot, .seam-orbit, .seam-square, .seam-triangle, .seam-block');
      if (!shape) return;
      triggerBurst(mark, shape);
    };

    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointermove', handleSeamMove, { passive: true });
    document.addEventListener('pointerout', handleLeave, { passive: true });
    document.addEventListener('pointerout', handleSeamOut, { passive: true });
    document.addEventListener('pointerdown', handleShake, { passive: true });
    document.addEventListener('pointerdown', handleSeamPress, { passive: true });

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointermove', handleSeamMove);
      document.removeEventListener('pointerout', handleLeave);
      document.removeEventListener('pointerout', handleSeamOut);
      document.removeEventListener('pointerdown', handleShake);
      document.removeEventListener('pointerdown', handleSeamPress);
    };
  }, []);

  return null;
}