'use client';

import { useEffect } from 'react';
import { bind, play } from 'cuelume';
import { triggerHapticForCue, warmHaptics } from './haptics-engine';

type CueName =
  | 'chime'
  | 'sparkle'
  | 'droplet'
  | 'bloom'
  | 'whisper'
  | 'tick'
  | 'press'
  | 'release'
  | 'toggle'
  | 'success';

const SOUND_NAMES = new Set<string>([
  'chime',
  'sparkle',
  'droplet',
  'bloom',
  'whisper',
  'tick',
  'press',
  'release',
  'toggle',
  'success',
]);

/** Ignore post-touch synthetic mouse events (iOS/Android compatibility mouse). */
const SYNTHETIC_MOUSE_GUARD_MS = 700;

function resolveCue(el: Element, attr: string, fallback: CueName): CueName {
  const requested = el.getAttribute(attr);
  if (requested && SOUND_NAMES.has(requested)) {
    return requested as CueName;
  }
  return fallback;
}

function isFinePointerMedia() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function playSense(cue: CueName, withHaptic = true) {
  play(cue);
  if (withHaptic) triggerHapticForCue(cue);
}

/**
 * Mounts once in the root layout. Calls bind() on the document
 * to delegate all data-cuelume-* attributes. Idempotent —
 * safe across route transitions in the Next.js app router.
 *
 * Cuelume v0.1.0 gaps closed here:
 * 1. press/release are mouse-only — touch/pen get no action cues.
 * 2. Hover-only targets are silent on coarse pointers; map to one tap.
 * 3. Middle-click / auto-scroll can spam hover cues.
 * 4. Post-touch synthetic mouse must not double-fire (hybrid devices).
 *
 * Haptics (web-haptics): paired with press / tap / release only — never
 * fine-pointer hover. Preference and support live in haptics-engine.
 */
export function CuelumeBinder() {
  useEffect(() => {
    warmHaptics();

    let middleDown = false;
    let activeTouchPress: Element | null = null;
    let lastTouchLikeAt = -Infinity;

    const isSyntheticMouseAfterTouch = (e: PointerEvent | MouseEvent) => {
      const pointerType = 'pointerType' in e ? e.pointerType : 'mouse';
      if (pointerType !== 'mouse') return false;
      return performance.now() - lastTouchLikeAt < SYNTHETIC_MOUSE_GUARD_MS;
    };

    const markTouchLike = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        lastTouchLikeAt = performance.now();
      }
    };

    const guardButton = (e: PointerEvent) => {
      if (e.button !== 0) {
        e.stopImmediatePropagation();
        if (e.type === 'pointerdown' && e.button === 1) middleDown = true;
        if (e.type === 'pointerup' || e.type === 'pointercancel') {
          middleDown = false;
        }
        return true;
      }
      return false;
    };

    const onPointerDownCapture = (e: PointerEvent) => {
      if (guardButton(e)) return;
      markTouchLike(e);

      if (isSyntheticMouseAfterTouch(e)) {
        e.stopImmediatePropagation();
        return;
      }

      if (!(e.target instanceof Element)) return;

      // Desktop fine mouse: Cuelume owns press sound; add light haptic only
      // if the device still supports vibration (rare hybrids).
      if (e.pointerType === 'mouse' && isFinePointerMedia()) {
        const pressEl = e.target.closest('[data-cuelume-press]');
        if (pressEl && document.contains(pressEl)) {
          const cue = resolveCue(pressEl, 'data-cuelume-press', 'press');
          // Sound via Cuelume mouse path; haptic only (no second sound).
          triggerHapticForCue(cue);
        }
        return;
      }

      const pressEl = e.target.closest('[data-cuelume-press]');
      if (!pressEl || !document.contains(pressEl)) return;

      activeTouchPress = pressEl;
      const cue = resolveCue(pressEl, 'data-cuelume-press', 'press');
      playSense(cue, true);
    };

    const onPointerUpCapture = (e: PointerEvent) => {
      if (guardButton(e)) return;
      markTouchLike(e);

      if (isSyntheticMouseAfterTouch(e)) {
        e.stopImmediatePropagation();
        return;
      }

      // Fine mouse release: Cuelume plays sound; pair haptic for success/release.
      if (e.pointerType === 'mouse' && isFinePointerMedia()) {
        if (!(e.target instanceof Element)) return;
        const releaseEl = e.target.closest('[data-cuelume-release]');
        if (releaseEl && document.contains(releaseEl)) {
          const cue = resolveCue(releaseEl, 'data-cuelume-release', 'release');
          triggerHapticForCue(cue);
        }
        activeTouchPress = null;
        return;
      }

      const pressHost = activeTouchPress;
      if (!pressHost) return;

      activeTouchPress = null;
      if (!document.contains(pressHost)) return;

      if (pressHost.hasAttribute('data-cuelume-release')) {
        const cue = resolveCue(pressHost, 'data-cuelume-release', 'release');
        playSense(cue, true);
      }
    };

    const onPointerCancel = () => {
      activeTouchPress = null;
      middleDown = false;
    };

    const onPointerEnterCapture = (e: PointerEvent) => {
      if (middleDown || isSyntheticMouseAfterTouch(e)) {
        e.stopImmediatePropagation();
      }
    };

    /**
     * Coarse-pointer tap feedback for hover-only targets (nav, brand, footer).
     * Fine-pointer keeps Cuelume's pointerenter path only (sound, no haptic).
     */
    const onClickCapture = (e: MouseEvent) => {
      if (typeof e.button === 'number' && e.button !== 0) return;
      if (isFinePointerMedia()) return;
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('[data-cuelume-press]')) return;

      const hoverEl = e.target.closest('[data-cuelume-hover]');
      if (!hoverEl || !document.contains(hoverEl)) return;

      const cue = resolveCue(hoverEl, 'data-cuelume-hover', 'tick');
      playSense(cue, true);
    };

    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('pointerup', onPointerUpCapture, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('pointerenter', onPointerEnterCapture, true);
    document.addEventListener('click', onClickCapture, true);

    bind();

    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
      document.removeEventListener('pointerup', onPointerUpCapture, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('pointerenter', onPointerEnterCapture, true);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return null;
}
