'use client';

/**
 * Cuelume extension — adds sounds not in the published cuelume@0.1.1 package.
 *
 * The error recipe is a low, descending two-note buzz — a subdued "no" that
 * reads as corrective feedback without being harsh. It mirrors Apple's
 * error haptic (a dull double-tap) in audio form.
 *
 * Uses the same Web Audio API approach as cuelume's engine: synthesizes
 * live on a shared AudioContext, no audio files. If cuelume later adds
 * an `error` recipe natively, this module becomes a no-op.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
  } catch {
    return null;
  }
  return sharedContext;
}

/** A low, descending two-note error cue — like a soft "uh-uh". */
function renderError(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.4;
  master.connect(ctx.destination);

  // First note: 330 Hz (E4) — low, firm
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(330, now);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.0001, now);
  gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc1.connect(gain1).connect(master);
  osc1.start(now);
  osc1.stop(now + 0.17);

  // Second note: 247 Hz (B3) — lower, descending "no"
  const t2 = now + 0.1;
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(247, t2);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.0001, t2);
  gain2.gain.exponentialRampToValueAtTime(0.07, t2 + 0.008);
  gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.16);
  osc2.connect(gain2).connect(master);
  osc2.start(t2);
  osc2.stop(t2 + 0.21);

  // Cleanup
  setTimeout(() => {
    master.disconnect();
  }, 400);
}

/**
 * Play an extended cuelume sound. Currently supports 'error'.
 * Falls back gracefully if Web Audio is unavailable.
 */
export function playExtended(sound: string): void {
  if (sound !== 'error') return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'running') {
    renderError(ctx);
  } else {
    try {
      void ctx.resume().then(() => {
        if (ctx.state === 'running') renderError(ctx);
      }, () => {});
    } catch {
      // Audio blocked — no-op
    }
  }
}

/**
 * Check if a sound name is an extended sound (not in base cuelume).
 * Used by the binder to route to the right engine.
 */
export function isExtendedSound(sound: string): boolean {
  return sound === 'error';
}