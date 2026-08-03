'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient particle field — site-wide cursor-follow background.
 *
 * The same clean dot-field aesthetic from /test/cursor-trail.tsx (V3),
 * promoted to a global ambient layer that lives behind every page:
 *
 *  - Fixed full-viewport canvas at z-index 0 (same plane as .ambient-signal)
 *  - ~450 signal-blue dots drifting via Perlin-noise flow field
 *  - Cursor pull within 220px radius (additive glow where they overlap)
 *  - clearRect each frame — no trail build-up, keeps it clean
 *  - On-demand rAF (0% CPU when idle + animation settles)
 *  - Reads CSS-var palette so it swaps with night/day mode
 *  - MutationObserver on <html data-theme> rebuilds sprites on toggle
 *  - Additive blend in dark mode (glow), normal alpha in light mode (ink)
 *  - reduced-motion + coarse-pointer safe
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
};

// Medium density — one dot per ~4,600 px², capped at 450 for performance.
// The /test cell had 220 dots in 308K px; this scales to full viewport
// without the ~1,480-dot extreme that would hurt performance.
const MAX_COUNT = 450;
const DENSITY = 4600;
const FLOW_GRID = 24;
const FLOW_FORCE = 0.035;
const PULL_RADIUS = 220;
const PULL_STRENGTH = 0.025;
const DAMPING = 0.95;
const SPRITE_SIZE = 24;

/**
 * Read the signal palette from CSS variables so it tracks the live theme.
 * Dark and light themes both define --signal / --signal-light /
 * --signal-access; we derive a 4-step palette from those three plus a
 * brighter tint for depth.
 */
function readPalette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  const signal = styles.getPropertyValue('--signal').trim() || '#0133CB';
  const light = styles.getPropertyValue('--signal-light').trim() || '#3358E8';
  const access = styles.getPropertyValue('--signal-access').trim() || '#5d7bff';
  // A brighter tint for the softest dots — lighten the access color.
  // If it's a hex, shift toward white; otherwise reuse access.
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
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (reduced || !fine.matches) return;

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
    // Call synchronously so w/h are set before dot seeding below.
    resize();

    const noise = makeNoise();

    // Build sprites from the live CSS-var palette (theme-aware).
    let palette = readPalette();
    let sprites = buildSprites(palette);

    // Determine blend mode from current theme: additive glow in dark,
    // normal alpha in light (so dots don't wash out on white).
    const isDark = () =>
      document.documentElement.getAttribute('data-theme') !== 'light';
    let blendMode: GlobalCompositeOperation = isDark() ? 'lighter' : 'source-over';

    // Dot count scales with viewport area, capped at MAX_COUNT.
    const count = Math.min(MAX_COUNT, Math.floor((w * h) / DENSITY));

    // Seed the dot field — varied sizes + alphas for depth, not uniform.
    const dots: Dot[] = [];
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
        size: 1 + Math.random() * 2.8,
        baseAlpha: 0.25 + Math.random() * 0.5,
        colorIdx: Math.floor(Math.random() * palette.length),
      });
    }

    let px = w / 2;
    let py = h / 2;
    let inside = false;
    let raf = 0;
    let t = 0;

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      inside = true;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      inside = false;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const tick = () => {
      t += 0.0004;

      // Clear each frame — no trail build-up, keeps it clean.
      ctx.clearRect(0, 0, w, h);

      // Additive blend in dark mode for glow; normal alpha in light mode.
      ctx.globalCompositeOperation = blendMode;

      let anyMoving = false;
      for (const d of dots) {
        // Perlin-noise flow field — gentle ambient drift.
        const ang = noise(d.x / FLOW_GRID, d.y / FLOW_GRID + t * 2) * Math.PI * 4;
        d.vx += Math.cos(ang) * FLOW_FORCE;
        d.vy += Math.sin(ang) * FLOW_FORCE;

        // Cursor pull — layered on top of the drift, within a radius.
        if (inside) {
          const dx = px - d.x;
          const dy = py - d.y;
          const dist = Math.hypot(dx, dy);
          if (dist < PULL_RADIUS && dist > 0.1) {
            const pull = (1 - dist / PULL_RADIUS) * PULL_STRENGTH;
            d.vx += (dx / dist) * pull;
            d.vy += (dy / dist) * pull;
          }
        }

        // Damping
        d.vx *= DAMPING;
        d.vy *= DAMPING;
        d.x += d.vx;
        d.y += d.vy;

        // Wrap edges softly
        if (d.x < -10) d.x = w + 10;
        if (d.x > w + 10) d.x = -10;
        if (d.y < -10) d.y = h + 10;
        if (d.y > h + 10) d.y = -10;

        const speed = Math.hypot(d.vx, d.vy);
        if (speed > 0.015) anyMoving = true;

        // Alpha brightens slightly with speed — dots glow when pulled.
        const alpha = Math.min(0.85, d.baseAlpha + speed * 0.3);
        const sprite = sprites[d.colorIdx % sprites.length];
        const drawSize = d.size * 6;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, (d.x - drawSize / 2) | 0, (d.y - drawSize / 2) | 0, drawSize, drawSize);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Keep the loop alive while the cursor is inside OR dots are still
      // drifting (let them settle gracefully after the cursor leaves).
      if (inside || anyMoving) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    // Kick the loop once so the seeded field paints.
    raf = requestAnimationFrame(tick);

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave, { passive: true });

    // Watch for theme toggles — rebuild sprites and flip blend mode
    // without re-seeding dots (positions/motion preserved, color swaps).
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      sprites = buildSprites(palette);
      blendMode = isDark() ? 'lighter' : 'source-over';
      // Re-distribute color indices across the new palette length.
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
      document.removeEventListener('pointerleave', onLeave);
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