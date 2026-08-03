'use client';

import { useEffect, useRef } from 'react';

/**
 * Concept A — Cursor particle trail.
 *
 * A field of tiny signal-blue dots that drift toward the cursor and lag behind
 * it, leaving a soft comet-tail. Pure canvas, on-demand rAF (0% CPU when the
 * pointer is still), reduced-motion safe (no animation, dots just sit), touch
 * safe (no listeners attached on coarse pointers).
 *
 * Scoped to /test — mounted only here, never globally.
 */

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number; // 0..1 across the signal palette
};

const PALETTE = ['#0133CB', '#3358E8', '#5B78F0', '#7E9DFF'];

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Bail on touch + reduced-motion — no trail at all.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (reduced || !fine.matches) return;

    let dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Seed a field of dots spread across the canvas.
    const COUNT = 90;
    const dots: Dot[] = [];
    for (let i = 0; i < COUNT; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
        size: 1 + Math.random() * 1.8,
        hue: Math.random(),
      });
    }

    // Pointer state — last known cursor in canvas-local coords.
    let px = w / 2;
    let py = h / 2;
    let moved = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
      moved = true;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);

      let anyMoving = false;
      for (const d of dots) {
        // Pull toward the cursor; closer dots pull harder.
        const dx = px - d.x;
        const dy = py - d.y;
        const dist = Math.hypot(dx, dy);
        // Influence radius — beyond this, dots drift home gently.
        const RADIUS = 260;
        if (dist < RADIUS) {
          const force = (1 - dist / RADIUS) * 0.08;
          d.vx += (dx / (dist || 1)) * force;
          d.vy += (dy / (dist || 1)) * force;
        } else {
          // Gentle drift back to a random home position (slow swirl).
          d.vx += (Math.random() - 0.5) * 0.02;
          d.vy += (Math.random() - 0.5) * 0.02;
        }

        // Damping so the trail settles when the cursor stops.
        d.vx *= 0.92;
        d.vy *= 0.92;
        d.x += d.vx;
        d.y += d.vy;

        const speed = Math.hypot(d.vx, d.vy);
        if (speed > 0.02) anyMoving = true;

        // Alpha scales with speed — still dots are faint, moving dots glow.
        const alpha = Math.min(0.85, 0.18 + speed * 0.35);
        const colorIdx = Math.floor(d.hue * PALETTE.length) % PALETTE.length;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE[colorIdx];
        ctx.globalAlpha = alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Keep the loop alive while the cursor is still inside and there's motion.
      if (anyMoving || moved) {
        moved = false; // consume; will be re-set on next pointermove
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    // Kick the loop once so the seeded field paints.
    raf = requestAnimationFrame(tick);

    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
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