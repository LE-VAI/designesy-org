'use client';

/**
 * Cuelume extension — adds sounds not in the published cuelume package.
 *
 * Original: error recipe (v0.1.1) — low descending two-note buzz.
 * Expanded (v0.2.0, 2026-08-08): score-reveal arpeggios, check pass/fail
 * ticks, processing loop, plus warning/info/blocked/retry cues.
 *
 * All sounds synthesize live on a shared AudioContext — no audio files.
 * If cuelume later adds any of these natively, the matching recipe here
 * becomes a no-op.
 *
 * Design language: sine waves for calm/positive, triangle for neutral UI,
 * square for sharp alerts, sawtooth reserved for harsh error only.
 * Envelope: 2-5ms attack (legible but not aggressive), 40-400ms release.
 * All notes pitched in C major for harmonic compatibility across cues.
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

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Plays a single oscillator note with an exponential envelope.
 * Type-safe access to AudioParam methods that require timing precision.
 */
function playNote(
  ctx: AudioContext,
  opts: {
    freq: number;
    type: OscillatorType;
    start: number;       // seconds from now
    duration: number;    // seconds
    gain: number;         // peak gain (0–1)
    attack?: number;     // attack ms (default 5)
    destination: AudioNode;
  },
) {
  const { freq, type, start, duration, gain, attack = 5, destination } = opts;
  const t0 = ctx.currentTime + start;
  const atk = attack / 1000;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/**
 * Creates a simple reverb impulse response for ConvolverNode.
 * decay in seconds, predelay in ms. Returns an AudioBuffer.
 */
function makeImpulse(ctx: AudioContext, decay: number, predelayMs: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const predelay = Math.floor((predelayMs / 1000) * rate);
  const length = Math.floor(decay * rate) + predelay;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      if (i < predelay) {
        data[i] = 0;
      } else {
        const t = (i - predelay) / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2);
      }
    }
  }
  return impulse;
}

// ── Original: error ──────────────────────────────────────────────────────

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

// ── Feedback family: warning, info, blocked, retry ───────────────────────

/** A single medium tone — "heads up, not blocking". */
function renderWarning(ctx: AudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);
  playNote(ctx, { freq: 440, type: 'triangle', start: 0, duration: 0.15, gain: 0.06, destination: master });
  setTimeout(() => master.disconnect(), 300);
}

/** A brief high blip — "you should know this". */
function renderInfo(ctx: AudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);
  playNote(ctx, { freq: 660, type: 'sine', start: 0, duration: 0.08, gain: 0.05, destination: master });
  setTimeout(() => master.disconnect(), 200);
}

/** Two low square pulses — "can't proceed". */
function renderBlocked(ctx: AudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.3;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  master.connect(filter).connect(ctx.destination);
  playNote(ctx, { freq: 165, type: 'square', start: 0, duration: 0.1, gain: 0.06, destination: filter });
  playNote(ctx, { freq: 165, type: 'square', start: 0.15, duration: 0.1, gain: 0.06, destination: filter });
  setTimeout(() => { master.disconnect(); filter.disconnect(); }, 400);
}

/** A rising pair — "try again". */
function renderRetry(ctx: AudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);
  playNote(ctx, { freq: 330, type: 'sine', start: 0, duration: 0.1, gain: 0.05, destination: master });
  playNote(ctx, { freq: 440, type: 'sine', start: 0.1, duration: 0.1, gain: 0.05, destination: master });
  setTimeout(() => master.disconnect(), 300);
}

// ── Score-reveal arpeggios (the hero moment) ─────────────────────────────

/**
 * Grade-reveal arpeggios — mapped to score outcome.
 * Pitch rises with grade quality. A grade earns reverb; F stays dry.
 *
 * F (0-49):  Single 220Hz sine, 400ms, no reverb — somber, restrained.
 * D (50-69): Descending pair 330→220Hz triangle, 300ms — mild disappointment.
 * C (70-84): Neutral single 440Hz sine, 200ms — flat, informational.
 * B (85-94): Ascending pair 440→660Hz triangle, 300ms — positive.
 * A (95-100): Ascending arpeggio C4→E4→G4→C5, triangle, 800ms, small-room reverb.
 * A+ (100):  Same arpeggio + 1320/1760Hz harmonic overtones, sine, 800ms, large-room reverb.
 */
function renderGradeReveal(ctx: AudioContext, grade: string) {
  const useReverb = grade === 'A' || grade === 'A+';

  // Dry/wet split
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  let wetGain: GainNode | null = null;
  let convolver: ConvolverNode | null = null;

  if (useReverb) {
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(
      ctx,
      grade === 'A+' ? 2.5 : 0.8,   // large vs small room
      grade === 'A+' ? 30 : 10,     // predelay ms
    );
    wetGain = ctx.createGain();
    wetGain.gain.value = grade === 'A+' ? 0.25 : 0.15;
    convolver.connect(wetGain).connect(master);
  }

  const routeTo = (node: AudioNode) => {
    // Dry path
    node.connect(master);
    // Wet path (if reverb)
    if (convolver) node.connect(convolver);
  };

  switch (grade) {
    case 'F':
      // Single low note — somber
      playNote(ctx, { freq: 220, type: 'sine', start: 0, duration: 0.4, gain: 0.07, destination: master });
      break;

    case 'D':
      // Descending pair — mild disappointment
      { const tmp = ctx.createGain(); tmp.gain.value = 0.4; routeTo(tmp);
        playNote(ctx, { freq: 330, type: 'triangle', start: 0, duration: 0.12, gain: 0.06, destination: tmp });
        playNote(ctx, { freq: 220, type: 'triangle', start: 0.12, duration: 0.18, gain: 0.06, destination: tmp });
        setTimeout(() => tmp.disconnect(), 500); }
      break;

    case 'C':
      // Neutral single — flat, informational
      playNote(ctx, { freq: 440, type: 'sine', start: 0, duration: 0.2, gain: 0.05, destination: master });
      break;

    case 'B':
      // Ascending pair — positive
      { const tmp = ctx.createGain(); tmp.gain.value = 0.4; routeTo(tmp);
        playNote(ctx, { freq: 440, type: 'triangle', start: 0, duration: 0.12, gain: 0.06, destination: tmp });
        playNote(ctx, { freq: 660, type: 'triangle', start: 0.12, duration: 0.18, gain: 0.06, destination: tmp });
        setTimeout(() => tmp.disconnect(), 500); }
      break;

    case 'A':
      // Ascending arpeggio C4→E4→G4→C5 — celebratory
      { const tmp = ctx.createGain(); tmp.gain.value = 0.4; routeTo(tmp);
        const notes = [262, 330, 392, 524];
        notes.forEach((f, i) => {
          playNote(ctx, { freq: f, type: 'triangle', start: i * 0.15, duration: 0.25, gain: 0.06, destination: tmp });
        });
        setTimeout(() => tmp.disconnect(), 1000); }
      break;

    case 'A+':
      // Same arpeggio + harmonic overtones — the jaw-drop moment
      { const tmp = ctx.createGain(); tmp.gain.value = 0.4; routeTo(tmp);
        const notes = [262, 330, 392, 524];
        notes.forEach((f, i) => {
          playNote(ctx, { freq: f, type: 'triangle', start: i * 0.15, duration: 0.3, gain: 0.05, destination: tmp });
        });
        // Harmonic overtones layered on top
        playNote(ctx, { freq: 1320, type: 'sine', start: 0.45, duration: 0.35, gain: 0.04, destination: tmp });
        playNote(ctx, { freq: 1760, type: 'sine', start: 0.5, duration: 0.3, gain: 0.03, destination: tmp });
        setTimeout(() => tmp.disconnect(), 1200); }
      break;
  }

  // Cleanup
  setTimeout(() => {
    master.disconnect();
    if (wetGain) wetGain.disconnect();
    if (convolver) convolver.disconnect();
  }, 1500);
}

// ── Check pass/fail (micro-ticks during scoring) ────────────────────────

/** A brief bright blip — one check passed. */
function renderCheckPass(ctx: AudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);
  playNote(ctx, { freq: 880, type: 'sine', start: 0, duration: 0.04, gain: 0.03, attack: 2, destination: master });
  setTimeout(() => master.disconnect(), 100);
}

/** A soft low thud — one check failed. */
function renderCheckFail(ctx: AudioContext) {
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);
  playNote(ctx, { freq: 220, type: 'triangle', start: 0, duration: 0.06, gain: 0.04, attack: 2, destination: master });
  playNote(ctx, { freq: 110, type: 'triangle', start: 0.03, duration: 0.06, gain: 0.03, attack: 2, destination: master });
  setTimeout(() => master.disconnect(), 150);
}

// ── Processing loop (while checks are running) ───────────────────────────

let processingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a gentle processing loop — a low triangle pulse at 500ms intervals.
 * Used while the score engine runs checks. Gain is very low (0.15) —
 * "something is happening" without being annoying.
 */
function startProcessingLoop(ctx: AudioContext): void {
  stopProcessingLoop();
  const pulse = () => {
    const master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);
    playNote(ctx, { freq: 330, type: 'triangle', start: 0, duration: 0.08, gain: 0.025, attack: 3, destination: master });
    setTimeout(() => master.disconnect(), 150);
  };
  pulse(); // play immediately
  processingTimer = setInterval(pulse, 500);
}

/** Stop the processing loop. */
function stopProcessingLoop(): void {
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Play an extended cuelume sound.
 * Supports: error, warning, info, blocked, retry, grade-reveal,
 *            check-pass, check-fail, processing-start, processing-stop.
 */
export function playExtended(sound: string): void {
  const ctx = getContext();
  if (!ctx) return;

  const play = () => {
    switch (sound) {
      case 'error':         renderError(ctx); break;
      case 'warning':       renderWarning(ctx); break;
      case 'info':          renderInfo(ctx); break;
      case 'blocked':       renderBlocked(ctx); break;
      case 'retry':         renderRetry(ctx); break;
      case 'check-pass':    renderCheckPass(ctx); break;
      case 'check-fail':    renderCheckFail(ctx); break;
      case 'processing-start': startProcessingLoop(ctx); break;
      case 'processing-stop':  stopProcessingLoop(); break;
      default: break;
    }
  };

  if (ctx.state === 'running') {
    play();
  } else {
    try {
      void ctx.resume().then(() => {
        if (ctx.state === 'running') play();
      }, () => {});
    } catch {
      // Audio blocked — no-op
    }
  }
}

/**
 * Play a grade-reveal arpeggio for the given grade ('A' through 'F', or 'A+').
 * This is the hero acoustic moment — fires when the score animation completes.
 */
export function playGradeReveal(grade: string): void {
  const ctx = getContext();
  if (!ctx) return;

  const play = () => renderGradeReveal(ctx, grade);

  if (ctx.state === 'running') {
    play();
  } else {
    try {
      void ctx.resume().then(() => {
        if (ctx.state === 'running') play();
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
  return [
    'error', 'warning', 'info', 'blocked', 'retry',
    'check-pass', 'check-fail',
    'processing-start', 'processing-stop',
  ].includes(sound);
}