'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient particle field — site-wide cursor-follow background.
 *
 * The clean dot-field aesthetic from /test/cursor-trail.tsx (V3),
 * promoted to a global ambient layer behind every page:
 *
 *  - Fixed full-viewport canvas at z-index 0 (same plane as .ambient-signal)
 *  - ~450 signal-blue dots drift via Perlin-noise flow field
 *  - Cursor pull strengthens when the cursor DWELLS (hovers in place) —
 *    dots gather authoritatively, then ease back to randomness when the
 *    cursor moves on or leaves.
 *  - Staggered fade-in over the first ~2.5s — dots appear organically,
 *    not all at once, with random initial velocities for life from frame 0.
 *  - Two-octave Perlin noise + per-dot phase offsets — less correlated
 *    drift, more natural randomness over time.
 *  - clearRect each frame — no trail build-up, keeps it clean.
 *  - On-demand rAF (0% CPU when idle + animation settles).
 *  - Reads CSS-var palette so it swaps with night/day mode.
 *  - MutationObserver on <html data-theme> rebuilds sprites on toggle.
 *  - Additive blend in dark mode (glow), normal alpha in light mode (ink).
 *  - Mobile: shows the drift field + touch-drag pull (no pointer: fine gate).
 *  - reduced-motion safe (skips the effect entirely).
 *  - Pauses rAF when the tab is hidden (battery).
 *
 * Sits behind all content (z-index 1) but above the opaque body paper,
 * showing through the transparent .site-shell / .surface-page wrappers
 * in exactly the negative space where .ambient-signal already shows.
 */

// ---- Minimal 2D value-noise (no dependency) ----
function makeNoise() {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return function noise(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi] / 127.5 - 1;
    const ab = perm[perm[xi] + yi + 1] / 127.5 - 1;
    const ba = perm[perm[xi + 1] + yi] / 127.5 - 1;
    const bb = perm[perm[xi + 1] + yi + 1] / 127.5 - 1;
    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
  };
}

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  colorIdx: number;
  phase: number;     // per-dot phase offset for less correlated drift
  bornAt: number;    // staggered fade-in start time
};

// Medium density — one dot per ~4,600 px², capped at 450 for performance.
const MAX_COUNT = 450;
const DENSITY = 4600;
const FLOW_GRID = 24;
const FLOW_FORCE = 0.035;
const PULL_RADIUS = 220;
const PULL_STRENGTH = 0.025;
const DAMPING = 0.95;
const SPRITE_SIZE = 24;

// Dwell amplification — when the cursor hovers in place, pull strengthens.
// dwell ramps up while the cursor is still (~750ms to full), and decays
// when it moves or leaves. At full dwell the pull is ~4.5× stronger and
// the radius widens, so dots gather authoritatively around the hover point.
const DWELL_RAMP_MS = 750;
const DWELL_MAX_BOOST = 4.5;
const DWELL_RADIUS_BOOST = 1.5;
const DWELL_DECAY = 0.92;   // per-frame decay when cursor moves / leaves

// Staggered fade-in — dots appear over ~2.5s, not all at once.
const FADE_IN_MS = 2500;
const FADE_IN_SPREAD = 1800;

/**
 * Read the signal palette from CSS variables so it tracks the live theme.
 */
function readPalette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  const signal = styles.getPropertyValue('--signal').trim() || '#0133CB';
  const light = styles.getPropertyValue('--signal-light').trim() || '#3358E8';
  const access = styles.getPropertyValue('--signal-access').trim() || '#5d7bff';
  let bright = '#7E9DFF';
  if (access.startsWith('#')) {
    const r = parseInt(access.slice(1, 3), 16);
    const g = parseInt(access.slice(3, 5), 16);
    const b = parseInt(access.slice(5, 7), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.35);
    bright = `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
  }
  return [signal, light, access, bright];
}

function buildSprites(palette: string[]): HTMLCanvasElement[] {
  return palette.map((color) => {
    const s = document.createElement('canvas');
    s.width = SPRITE_SIZE;
    s.height = SPRITE_SIZE;
    const sctx = s.getContext('2d')!;
    const half = SPRITE_SIZE / 2;
    const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    return s;
  });
}

export function AmbientParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    // Mobile/touch support: show the drift field on touch devices too.
    // The old (hover: hover) and (pointer: fine) gate is removed — touch
    // devices get the Perlin drift field and pull dots toward touch-drag.

    let dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      w = Math.max(1, window.innerWidth);
      h = Math.max(1, window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const noise = makeNoise();

    let palette = readPalette();
    let sprites = buildSprites(palette);

    const isDark = () =>
      document.documentElement.getAttribute('data-theme') !== 'light';
    let blendMode: GlobalCompositeOperation = isDark() ? 'lighter' : 'source-over';

    const count = Math.min(MAX_COUNT, Math.floor((w * h) / DENSITY));

    const now = performance.now();
    const dots: Dot[] = [];
    for (let i = 0; i < count; i++) {
      // Staggered birth time — each dot fades in at a random point over
      // FADE_IN_SPREAD ms, starting at FADE_IN_MS - FADE_IN_SPREAD so the
      // first dots appear quickly and the rest trickle in organically.
      const bornAt = now + Math.random() * FADE_IN_SPREAD - (FADE_IN_SPREAD - FADE_IN_MS);
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        // Random initial velocity — life from frame 0, no synchronous start.
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: 1 + Math.random() * 2.8,
        baseAlpha: 0.25 + Math.random() * 0.5,
        colorIdx: Math.floor(Math.random() * palette.length),
        phase: Math.random() * 1000,
        bornAt,
      });
    }

    let px = w / 2;
    let py = h / 2;
    let inside = false;
    let raf = 0;
    let t = 0;

    // Dwell tracking — ramps up when cursor is still, decays when moving.
    let dwell = 0;
    let lastMoveTime = 0;
    let lastMoveX = -9999;
    let lastMoveY = -9999;

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      inside = true;
      // If the cursor barely moved since last event, treat it as dwelling
      // (the dwell value keeps ramping). If it moved significantly, reset
      // the dwell ramp start.
      const movedDist = Math.hypot(px - lastMoveX, py - lastMoveY);
      if (movedDist > 6) {
        lastMoveTime = performance.now();
        lastMoveX = px;
        lastMoveY = py;
      }
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      inside = false;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    // Touch release: on mobile, pointerup/pointercancel fire when the finger
    // lifts, but pointerleave does NOT reliably fire afterward. Without
    // this, `inside` stays true forever after a tap, the dwell ramps to
    // max, and dots stay clumped at the last touch point (the "stuck"
    // bug). Desktop mouse pointerup (button release) must NOT reset
    // inside — the cursor is still hovering — so we gate on pointerType.
    // Also reset the dwell ramp so dots disperse immediately on release
    // instead of lingering at max pull.
    const onTouchRelease = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      inside = false;
      lastMoveTime = 0;
      dwell = 0;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      } else {
        // Resume — kick the loop if it was running.
        if (raf === 0) raf = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      t += 0.0004;
      const frameNow = performance.now();

      // Dwell ramp: if the cursor is inside and hasn't moved significantly
      // for a while, ramp dwell toward DWELL_MAX_BOOST. Otherwise decay.
      if (inside && frameNow - lastMoveTime > 80) {
        const dwellMs = frameNow - lastMoveTime;
        const ramp = Math.min(1, dwellMs / DWELL_RAMP_MS);
        dwell = Math.min(DWELL_MAX_BOOST, 1 + ramp * (DWELL_MAX_BOOST - 1));
      } else if (!inside) {
        dwell *= DWELL_DECAY;
        if (dwell < 0.01) dwell = 0;
      } else {
        // Cursor is moving — ease dwell back toward 1 (normal pull).
        dwell = dwell + (1 - dwell) * 0.08;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = blendMode;

      let anyMoving = false;
      for (const d of dots) {
        // Two-octave Perlin noise + per-dot phase offset — less correlated
        // drift, more natural randomness over time. The second octave adds
        // higher-frequency variation so dots don't all flow in the same
        // direction at once.
        const nx = d.x / FLOW_GRID + d.phase;
        const ny = d.y / FLOW_GRID + t * 2 + d.phase;
        const ang1 = noise(nx, ny) * Math.PI * 4;
        const ang2 = noise(nx * 2.3 + 50, ny * 2.3 + 50) * Math.PI * 4;
        const ang = ang1 * 0.7 + ang2 * 0.3;
        d.vx += Math.cos(ang) * FLOW_FORCE;
        d.vy += Math.sin(ang) * FLOW_FORCE;

        // Cursor pull — amplified by dwell. When hovering, pull is
        // stronger and the radius widens, so dots gather authoritatively.
        if (inside) {
          const dx = px - d.x;
          const dy = py - d.y;
          const dist = Math.hypot(dx, dy);
          const radius = PULL_RADIUS * (1 + (dwell - 1) * (DWELL_RADIUS_BOOST - 1));
          if (dist < radius && dist > 0.1) {
            const pull = (1 - dist / radius) * PULL_STRENGTH * dwell;
            d.vx += (dx / dist) * pull;
            d.vy += (dy / dist) * pull;
          }
        }

        d.vx *= DAMPING;
        d.vy *= DAMPING;
        d.x += d.vx;
        d.y += d.vy;

        if (d.x < -10) d.x = w + 10;
        if (d.x > w + 10) d.x = -10;
        if (d.y < -10) d.y = h + 10;
        if (d.y > h + 10) d.y = -10;

        const speed = Math.hypot(d.vx, d.vy);
        if (speed > 0.015) anyMoving = true;

        // Staggered fade-in — each dot fades in over ~500ms from its
        // bornAt time. Before birth, skip drawing entirely.
        const age = frameNow - d.bornAt;
        if (age < 0) continue;
        const fadeIn = Math.min(1, age / 500);
        if (fadeIn <= 0) continue;

        const alpha = Math.min(0.85, (d.baseAlpha + speed * 0.3) * fadeIn);
        const sprite = sprites[d.colorIdx % sprites.length];
        const drawSize = d.size * 6;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, (d.x - drawSize / 2) | 0, (d.y - drawSize / 2) | 0, drawSize, drawSize);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Keep the loop alive while the cursor is inside, dots are moving,
      // dwell is settling, or dots are still fading in.
      const anyFadingIn = dots.some((d) => frameNow - d.bornAt < 500);
      if (inside || anyMoving || dwell > 0.01 || anyFadingIn) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    raf = requestAnimationFrame(tick);

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onTouchRelease, { passive: true });
    window.addEventListener('pointercancel', onTouchRelease, { passive: true });
    document.addEventListener('pointerleave', onLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibility, { passive: true });

    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      sprites = buildSprites(palette);
      blendMode = isDark() ? 'lighter' : 'source-over';
      for (const d of dots) {
        if (d.colorIdx >= palette.length) d.colorIdx = d.colorIdx % palette.length;
      }
      if (raf === 0) raf = requestAnimationFrame(tick);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onTouchRelease);
      window.removeEventListener('pointercancel', onTouchRelease);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      themeObserver.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}