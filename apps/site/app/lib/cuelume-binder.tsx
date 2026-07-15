'use client';

import { useEffect } from 'react';
import { bind, play } from 'cuelume';
import { triggerHapticForCue, warmHaptics } from './haptics-engine';
import { playExtended, isExtendedSound } from './cuelume-extend';

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
  | 'success'
  | 'error';

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
  'error',
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

function isCoarsePointer() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function playSense(cue: CueName, withHaptic = true) {
  if (isExtendedSound(cue)) {
    playExtended(cue);
  } else {
    play(cue as Parameters<typeof play>[0]);
  }
  if (withHaptic) triggerHapticForCue(cue);
}

/**
 * Mounts once in the root layout. Calls bind() on the document
 * to delegate all data-cuelume-* attributes. Idempotent —
 * safe across route transitions in the Next.js app router.
 *
 * Mobile fixes:
 * 1. Audio unlock on first pointerdown within user gesture
 * 2. Touch/pen get press/release cues (Cuelume v0.1.0 gap)
 * 3. Hover-only targets map to one tap on coarse pointers
 * 4. Middle-click / auto-scroll spam guard
 * 5. Post-touch synthetic mouse guard
 */
export function CuelumeBinder() {
  useEffect(() => {
    warmHaptics();

    let middleDown = false;
    let activeTouchPress: Element | null = null;
    let lastTouchLikeAt = -Infinity;
    let audioUnlocked = false;

    // Install mobile volume boost on coarse-pointer devices
    // (handled via a GainNode injected into cuelume's audio graph)
    // NOTE: Volume boost disabled until cuelume exposes a volume API.
    // The audio unlock below is the critical fix for mobile.

    /**
     * Mobile audio unlock: on the very first pointerdown, call play()
     * to force Cuelume's internal AudioContext.resume() within the
     * user gesture. Without this, the first tap's cue fires resume()
     * but the recipe renders too late (after the gesture window closes
     * on some mobile browsers). This silent unlock ensures the context
     * is already running by the time real cues fire.
     */
    const unlockAudio = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      play('tick');
    };

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
      unlockAudio();
      if (guardButton(e)) return;
      markTouchLike(e);

      if (isSyntheticMouseAfterTouch(e)) {
        e.stopImmediatePropagation();
        return;
      }

      if (!(e.target instanceof Element)) return;

      // Desktop fine mouse: Cuelume owns press sound; add light haptic only.
      // Extended sounds (error) are not in cuelume's recipe set, so the
      // binder must play them itself on desktop too.
      if (e.pointerType === 'mouse' && isFinePointerMedia()) {
        const pressEl = e.target.closest('[data-cuelume-press]');
        if (pressEl && document.contains(pressEl)) {
          const cue = resolveCue(pressEl, 'data-cuelume-press', 'press');
          if (isExtendedSound(cue)) {
            playExtended(cue);
          }
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
        return;
      }

      // Desktop: play extended hover sounds (error) that cuelume can't handle
      if (e.pointerType === 'mouse' && isFinePointerMedia()) {
        if (!(e.target instanceof Element)) return;
        const hoverEl = e.target.closest('[data-cuelume-hover]');
        if (hoverEl && document.contains(hoverEl)) {
          const cue = resolveCue(hoverEl, 'data-cuelume-hover', 'chime');
          if (isExtendedSound(cue)) {
            playExtended(cue);
          }
        }
      }
    };

    /**
     * Coarse-pointer tap feedback for hover-only targets (nav, brand, footer).
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