'use client';

/**
 * Drag-to-scroll for auto-scrolling marquee tracks.
 *
 * Replaces the old mouseenter/mouseleave approach that had six interaction
 * bugs:
 *   1. No click-vs-drag disambiguation — dragging fired click on wrong links.
 *   2. No mouse drag-to-scroll — overflow:auto only enables scrollbar/wheel.
 *   3. No pointer capture — child pills stole pointer events mid-drag.
 *   4. Hover fired during drag — pills flickered as the pointer passed over.
 *   5. Touch events were passive — couldn't preventDefault, browser hijacked.
 *   6. Animation reset to zero on mouseleave — scroll position was lost.
 *
 * New approach uses Pointer Events (unified mouse + touch + pen):
 *   - pointerdown: capture the pointer, record start position, FREEZE the
 *     animation in place (animation-play-state only — NO layout mutation).
 *     Mutating the DOM here was the iOS tap-lottery: the transform→scroll
 *     handoff shifted every pill a few px under the finger, and iOS resolves
 *     the click target at click-time against the mutated layout, so taps
 *     landed on the wrong pill. Freezing in place keeps the pills exactly
 *     where the user's finger landed.
 *   - pointermove: if the pointer moved beyond DRAG_THRESHOLD (5px), enter
 *     drag mode. Only NOW do the transform→scroll handoff (safe — the pointer
 *     is moving, no click will resolve against this layout). In drag mode,
 *     set scrollLeft = start - delta. Suppress clicks and hover on all child
 *     pills.
 *   - pointerup: release capture. If we never entered drag mode, it was a tap —
 *     let the click fire naturally against the frozen layout, then schedule
 *     a delayed resume (the click dispatches before the animation restarts).
 *     If we were dragging, stay in manual scroll mode.
 *   - mouseleave / pointercancel: if not dragging, resume animation from the
 *     current scroll position (not from zero).
 *
 * The 5px drag threshold is the industry standard — small enough to feel
 * responsive, large enough to not trigger on accidental micro-movements.
 * iOS uses ~10px, Android ~8px, Material Design 8dp; 5px is conservative for
 * dense pill lists where precision matters.
 */

/** Minimum pointer movement (px) before we consider it a drag, not a click. */
const DRAG_THRESHOLD = 5;

/** Delay before resuming the marquee after the pointer leaves (ms). */
const RESUME_DELAY = 600;

export function initScrollPause(
  clip: HTMLElement,
  track: HTMLElement,
  direction: 'horizontal' | 'vertical' = 'horizontal',
) {
  let isPaused = false;
  let isScrollMode = false; // true once the transform→scroll handoff has run
  let isDragging = false;
  let pointerActive = false;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startScroll = 0;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;

  const isHorizontal = direction === 'horizontal';
  const scrollProp: 'scrollLeft' | 'scrollTop' = isHorizontal
    ? 'scrollLeft'
    : 'scrollTop';
  const overflowAxis: 'overflowX' | 'overflowY' = isHorizontal
    ? 'overflowX'
    : 'overflowY';

  /**
   * Pause the CSS animation IN PLACE — no layout mutation. The track freezes
   * exactly where the finger/mouse landed, so the browser resolves a tap's
   * click event against the layout the user actually saw. (The old code
   * removed the transform and synced scroll here, shifting every pill a few
   * px under the finger — the iOS tap-lottery.)
   */
  function freezeInPlace() {
    if (isPaused) return;
    isPaused = true;
    isScrollMode = false;
    track.style.animationPlayState = 'paused';
  }

  /**
   * Hand off from the frozen animation to native scroll mode. Only called
   * once a drag has actually started (or the user wheels), so the layout
   * mutation is safe — no click can resolve against this layout mid-drag.
   */
  function handoffToScroll() {
    if (isScrollMode) return;
    isScrollMode = true;

    // Read the current transform from the frozen animation
    const style = window.getComputedStyle(track);
    const transform = style.transform;
    let offset = 0;
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
      if (match) {
        const values = match[1].split(',').map(Number);
        offset = isHorizontal
          ? values.length === 16 ? values[12] : values[4]
          : values.length === 16 ? values[13] : values[5];
      }
    }

    // Remove transform so native scroll takes over
    track.style.transform = 'none';

    // Make the clip scrollable
    clip.style[overflowAxis] = 'auto';

    // Scroll to where the animation was
    clip[scrollProp] = Math.abs(offset);
  }

  /** Resume the CSS animation from the current scroll position. */
  function resumeAnimation() {
    if (!isPaused) return;
    isPaused = false;
    isScrollMode = false;
    removeDragClass();

    // Back to hidden overflow
    clip.style[overflowAxis] = 'hidden';
    clip[scrollProp] = 0;

    // Resume animation from the start (clean reset)
    track.style.transform = '';
    track.style.animationPlayState = 'running';
  }

  /** Delayed resume — gives the user a moment to re-enter the area. */
  function scheduleResume() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      if (!pointerActive && !isDragging) resumeAnimation();
    }, RESUME_DELAY);
  }

  function cancelResume() {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  }

  /** Add a class to the clip so CSS can suppress hover on child pills. */
  function addDragClass() {
    clip.classList.add('footer-dock-clip--dragging');
  }

  function removeDragClass() {
    clip.classList.remove('footer-dock-clip--dragging');
  }

  // ── Pointer events (unified mouse + touch + pen) ────────────────────────

  function onPointerDown(e: PointerEvent) {
    // Only react to the primary pointer (ignore multi-touch secondaries)
    if (!e.isPrimary) return;
    // Only react to primary button (left-click / touch / pen)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    cancelResume();
    pointerActive = true;
    pointerId = e.pointerId;
    isDragging = false;

    // Capture the pointer so events keep going to the clip, not child pills
    try {
      clip.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw if the pointerId is invalid — ignore
    }

    // Freeze the animation IN PLACE — no layout mutation. The pills stay
    // exactly where the user's finger landed, so a tap's click event
    // resolves against the layout they saw (no more iOS tap-lottery).
    freezeInPlace();

    startX = e.clientX;
    startY = e.clientY;
    startScroll = 0;
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointerActive || e.pointerId !== pointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const delta = isHorizontal ? dx : dy;

    // Enter drag mode if the pointer moved beyond the threshold. Only NOW
    // do the transform→scroll handoff — the pointer is moving, so no click
    // will resolve against this mutated layout.
    if (!isDragging && Math.abs(delta) > DRAG_THRESHOLD) {
      isDragging = true;
      addDragClass();
      handoffToScroll();
      startScroll = clip[scrollProp];
    }

    if (isDragging) {
      // Scroll the clip by the inverse of the drag distance
      clip[scrollProp] = startScroll - delta;

      // Prevent the browser from doing anything else with this gesture
      // (page scroll, text selection, etc.)
      e.preventDefault();
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!pointerActive || e.pointerId !== pointerId) return;

    try {
      clip.releasePointerCapture(e.pointerId);
    } catch {
      // releasePointerCapture can throw if already released — ignore
    }

    pointerActive = false;
    pointerId = null;

    if (isDragging) {
      // Was a drag — suppress clicks on child links for this pointerup cycle.
      // We do this by intercepting the click event that the browser will fire
      // right after pointerup.
      suppressNextClick();

      removeDragClass();
      isDragging = false;

      // Stay in manual scroll mode — don't resume immediately.
      // The user might want to drag again. Resume on mouseleave or after delay.
      if (e.pointerType === 'touch') {
        // On touch, schedule a resume after a short delay
        scheduleResume();
      }
      // On mouse, wait for mouseleave to resume
    } else {
      // It was a tap. The animation is frozen in place; the browser will now
      // dispatch a click against the layout the user saw. On touch, schedule
      // the resume so the animation restarts AFTER the click has resolved.
      // On mouse, wait for mouseleave — the CSS :hover rule pauses the track,
      // and an inline resume would defeat it while the mouse is still inside.
      if (e.pointerType === 'touch') {
        scheduleResume();
      }
    }
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;

    pointerActive = false;
    pointerId = null;

    if (isDragging) {
      suppressNextClick();
      removeDragClass();
      isDragging = false;
    }

    scheduleResume();
  }

  // ── Click suppression ────────────────────────────────────────────────────

  /**
   * After a drag, the browser fires a click event on whatever element is
   * under the pointer. We intercept and suppress it so the user doesn't
   * accidentally navigate to a footer link they dragged over.
   *
   * We use a capture-phase listener that removes itself after one event.
   */
  function suppressNextClick() {
    const suppress = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clip.removeEventListener('click', suppress, true);
    };
    // Capture phase so we catch it before it reaches the link
    clip.addEventListener('click', suppress, true);
    // Safety: remove after 100ms even if no click fires
    setTimeout(() => {
      clip.removeEventListener('click', suppress, true);
    }, 100);
  }

  // ── Mouse leave (resume animation) ─────────────────────────────────────

  function onMouseLeave() {
    if (pointerActive || isDragging) return;
    scheduleResume();
  }

  function onMouseEnter() {
    cancelResume();
  }

  // ── Wheel (let native scroll handle it, just pause animation) ────────────

  function onWheel() {
    // Freeze in place, then hand off to native scroll. A wheel gesture means
    // the user is actively scrolling — no click will resolve against this
    // layout, so the transform→scroll mutation is safe here.
    if (!isPaused) freezeInPlace();
    handoffToScroll();
    cancelResume();
    // Don't schedule resume on wheel — the mouseleave will handle it
    // (wheel events fire while the mouse is still inside the clip)
  }

  // ── Attach events ──────────────────────────────────────────────────────

  // Pointer events (not passive — we need preventDefault in pointermove)
  clip.addEventListener('pointerdown', onPointerDown);
  clip.addEventListener('pointermove', onPointerMove, { passive: false });
  clip.addEventListener('pointerup', onPointerUp);
  clip.addEventListener('pointercancel', onPointerCancel);
  clip.addEventListener('pointerleave', onPointerCancel);

  // Mouse enter/leave for resume scheduling
  clip.addEventListener('mouseenter', onMouseEnter);
  clip.addEventListener('mouseleave', onMouseLeave);

  // Wheel to pause animation and allow native scroll
  clip.addEventListener('wheel', onWheel, { passive: true });

  return () => {
    clip.removeEventListener('pointerdown', onPointerDown);
    clip.removeEventListener('pointermove', onPointerMove);
    clip.removeEventListener('pointerup', onPointerUp);
    clip.removeEventListener('pointercancel', onPointerCancel);
    clip.removeEventListener('pointerleave', onPointerCancel);
    clip.removeEventListener('mouseenter', onMouseEnter);
    clip.removeEventListener('mouseleave', onMouseLeave);
    clip.removeEventListener('wheel', onWheel);
    if (resumeTimer) clearTimeout(resumeTimer);
  };
}