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

function isCoarsePointer() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function playSense(cue: CueName, withHaptic = true) {
  play(cue);
  if (withHaptic) triggerHapticForCue(cue);
}

/**
 * Mobile audio boost: intercepts AudioContext.destination connections and
 * routes them through a shared GainNode at 1.8x on coarse-pointer devices.
 */
function installMobileVolumeBoost(boost: number): (() => void) | null {
  if (typeof AudioNode === 'undefined') return null;

  const proto = AudioNode.prototype as Record<string, unknown>;
  const originalConnect = proto.connect as (...args: unknown[]) => AudioNode;
  let boostGain: GainNode | null = null;

  const patched = function (this: AudioNode, destination: unknown, ...args: unknown[]) {
    // Detect AudioDestinationNode by duck-typing maxChannelCount
    if (
      destination &&
      typeof destination === 'object' &&
      'maxChannelCount' in (destination as Record<string, unknown>)
    ) {
      const ctx = (this as unknown as { context: AudioContext }).context;
      if (ctx && !boostGain) {
        boostGain = ctx.createGain();
        boostGain.gain.value = boost;
        originalConnect.call(boostGain, ctx.destination);
      }
      if (boostGain) {
        return originalConnect.call(this, boostGain, ...args);
      }
    }
    return originalConnect.call(this, destination, ...args);
  };

  proto.connect = patched as unknown as (...args: unknown[]) => AudioNode;

  return () => {
    proto.connect = originalConnect;
    if (boostGain) {
      try {
        boostGain.disconnect();
      } catch {
        // noop
      }
    }
  };
}

/**
 * Mounts once in the root layout. Calls bind() on the document
 * to delegate all data-cuelume-* attributes. Idempotent —
 * safe across route transitions in the Next.js app router.
 *
 * Mobile fixes:
 * 1. Audio unlock on first pointerdown within user gesture
 * 2. Volume boost on mobile (1.8x via GainNode intercept)
 * 3. Touch/pen get press/release cues (Cuelume v0.1.0 gap)
 * 4. Hover-only targets map to one tap on coarse pointers
 * 5. Middle-click / auto-scroll spam guard
 * 6. Post-touch synthetic mouse guard
 */
export function CuelumeBinder() {
  useEffect(() => {
    warmHaptics();

    let middleDown = false;
    let activeTouchPress: Element | null = null;
    let lastTouchLikeAt = -Infinity;
    let audioUnlocked = false;

    // Install mobile volume boost on coarse-pointer devices
    let uninstallBoost: (() => void) | null = null;
    if (isCoarsePointer()) {
      uninstallBoost = installMobileVolumeBoost(1.8);
    }

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

      // Desktop fine mouse: Cuelume owns press sound; add light haptic only
      if (e.pointerType === 'mouse' && isFinePointerMedia()) {
        const pressEl = e.target.closest('[data-cuelume-press]');
        if (pressEl && document.contains(pressEl)) {
          const cue = resolveCue(pressEl, 'data-cuelume-press', 'press');
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
      if (uninstallBoost) uninstallBoost();
    };
  }, []);

  return null;
}