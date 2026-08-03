'use client';

import { useEffect, useRef } from 'react';

/**
 * Concept A — Cursor particle trail.
 *
 * A clean field of signal-blue dots that drift gently via Perlin-noise flow
 * and get pulled toward the cursor. The V1 approach — simple, calm, clear —
 * with a better particle system: more dots, smoother motion, subtle
 * size/opacity variation, soft edges. No trail fade, no connection lines,
 * no emitter. Just a refined dot field.
 *
 * Principles (from the Fable 5 particle-hero aesthetic):
 *  - clearRect each frame (no muddy trail build-up)
 *  - particles drift with gentle noise (never dead, never busy)
 *  - soft radial-gradient sprites (not flat circles)
 *  - additive blending for subtle glow where dots overlap
 *  - on-demand rAF (0% CPU when idle + animation settles)
 *  - reduced-motion + coarse-pointer safe
 *
 * Scoped to /test — mounted only here, never globally.
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

const PALETTE = ['#0133CB', '#3358E8', '#5B78F0', '#7E9DFF'];
const COUNT = 220; // more dots than V1's 90, but still clean
const FLOW_GRID = 24;
const FLOW_FORCE = 0.035; // gentle — calm drift, not busy
const PULL_RADIUS = 220;
const PULL_STRENGTH = 0.025;
const DAMPING = 0.95;

export default function CursorTrail() {
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
      const parent = canvas.parentElement;
      const rect = parent
        ? parent.getBoundingClientRect()
        : canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    requestAnimationFrame(resize);
    const ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const noise = makeNoise();

    // Pre-render soft radial-gradient sprites per palette color.
    const SPRITE_SIZE = 24;
    const sprites: HTMLCanvasElement[] = PALETTE.map((color) => {
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

    // Seed the dot field — varied sizes + alphas for depth, not uniform.
    const dots: Dot[] = [];
    for (let i = 0; i < COUNT; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
        size: 1 + Math.random() * 2.8,
        baseAlpha: 0.25 + Math.random() * 0.5,
        colorIdx: Math.floor(Math.random() * PALETTE.length),
      });
    }

    let px = w / 2;
    let py = h / 2;
    let inside = false;
    let raf = 0;
    let t = 0;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
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

      // Additive blend so overlaps glow, but subtle.
      ctx.globalCompositeOperation = 'lighter';

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
        const sprite = sprites[d.colorIdx];
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

    window.addEventListener('pointermove', onMove, { passive: true });
    canvas.parentElement?.addEventListener('pointerleave', onLeave, { passive: true });

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      canvas.parentElement?.removeEventListener('pointerleave', onLeave);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}