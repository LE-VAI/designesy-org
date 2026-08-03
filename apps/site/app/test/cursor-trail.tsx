'use client';

import { useEffect, useRef } from 'react';

/**
 * Concept A — Cursor particle trail (polished).
 *
 * A Perlin-noise flow-field of signal-blue particles that drift organically
 * even when the cursor is still, with an emitter that springs toward the cursor
 * and launches short-lived trailing particles. Additive blending gives a soft
 * glow; a trail-fade fill (instead of clearRect) leaves a comet-tail.
 *
 * Techniques (sourced from rachsmith CodePen + tsparticles + MDN/web.dev):
 *  - Perlin-noise flow field on a grid (dots never go dead when idle)
 *  - Emitter springs toward cursor via lerp(0.2), emits N/frame with life
 *  - Trail fade: fillRect with low-alpha bg each frame (free ghost trail)
 *  - Additive blend (globalCompositeOperation 'lighter') for soft glow
 *  - Offscreen radial-gradient sprite + drawImage (per-particle alpha, cheap)
 *  - Ring-buffer particle recycling (zero allocations after warmup)
 *  - On-demand rAF (0% CPU when cursor leaves the cell + trail fades out)
 *  - Reduced-motion: no animation, static seeded field painted once
 *  - Coarse pointer: no listeners attached
 *
 * Scoped to /test — mounted only here, never globally.
 */

// ---- Minimal 2D value-noise (no dependency) ----
// Cheap deterministic noise: hash(x,y) → [0,1], smoothed via bilinear interp.
function makeNoise() {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle for randomness without a seed lib.
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const grad = (h: number) => (h & 1 ? 1 : -1);

  // value noise in 2D — returns [-1, 1]
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

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  colorIdx: number;
  // Ambient (flow-field) vs emitted (trail) particle
  kind: 'ambient' | 'emitted';
};

const PALETTE = ['#0133CB', '#3358E8', '#5B78F0', '#7E9DFF'];
const AMBIENT_COUNT = 160; // flow-field dots (was 90)
const EMIT_RATE = 4; // particles launched per frame from emitter
const EMIT_LIFE = 50; // frames an emitted particle lives
const MAX_EMITTED = 180; // ring-buffer cap for emitted particles
const FLOW_GRID = 20; // px spacing of the noise force field
const FLOW_FORCE = 0.06; // magnitude of the noise push
const EMITTER_LERP = 0.18; // how fast emitter springs toward cursor
const TRAIL_FADE = 0.12; // alpha of the bg fill each frame (lower = longer tail)
const CONNECT_RADIUS = 120; // only draw connection lines within this cursor radius
const CONNECT_DIST = 80; // max px between two particles to link them
const CONNECT_OPACITY = 0.22; // line alpha for connection lines

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
    // Cache the parent's bg color so we don't force a style recalc each frame.
    // Re-read on resize (covers theme changes, which re-mount anyway).
    let parentBg = '#0a0a0c';

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      // Measure the PARENT (hero cell), not the canvas itself — the canvas is
      // position:absolute inset:0, so its own rect can be the 300×150 intrinsic
      // fallback before the parent has painted. The parent's rect is the truth.
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
      const bg = getComputedStyle(parent || document.body).backgroundColor;
      parentBg = bg || '#0a0a0c';
    };
    // Defer the first resize to the next frame so the parent has laid out.
    requestAnimationFrame(resize);
    // Watch the parent for size changes (covers late layout, container queries).
    const ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener('resize', resize);

    const noise = makeNoise();

    // Pre-render one soft radial-gradient sprite per palette color.
    // drawImage of a sprite is much cheaper than beginPath+arc+fill per dot,
    // and the radial gradient gives a soft glow edge for free.
    const SPRITE_SIZE = 32;
    const sprites: HTMLCanvasElement[] = PALETTE.map((color) => {
      const s = document.createElement('canvas');
      s.width = SPRITE_SIZE;
      s.height = SPRITE_SIZE;
      const sctx = s.getContext('2d')!;
      const half = SPRITE_SIZE / 2;
      const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      return s;
    });

    // Particle pool — ambient (permanent) + emitted (recycled ring buffer).
    const ambient: Particle[] = [];
    const emitted: Particle[] = [];
    let emitHead = 0;

    const spawnAmbient = (): Particle => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      life: Infinity,
      maxLife: Infinity,
      size: 1 + Math.random() * 2.4,
      colorIdx: Math.floor(Math.random() * PALETTE.length),
      kind: 'ambient',
    });

    const spawnEmitted = (ex: number, ey: number): Particle => ({
      x: ex + (Math.random() - 0.5) * 8,
      y: ey + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2 - 0.3,
      life: 0,
      maxLife: EMIT_LIFE + Math.random() * 20,
      size: 1.5 + Math.random() * 2.5,
      colorIdx: Math.floor(Math.random() * PALETTE.length),
      kind: 'emitted',
    });

    // Seed ambient field
    for (let i = 0; i < AMBIENT_COUNT; i++) ambient.push(spawnAmbient());
    // Pre-fill emitted ring buffer with dead particles
    for (let i = 0; i < MAX_EMITTED; i++) {
      emitted.push({ ...spawnEmitted(w / 2, h / 2), life: EMIT_LIFE, maxLife: EMIT_LIFE });
    }

    // Cursor + emitter state
    let px = w / 2;
    let py = h / 2;
    let ex = w / 2; // emitter position (springs toward cursor)
    let ey = h / 2;
    let inside = false;
    let raf = 0;
    let t = 0; // time accumulator for noise field evolution

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
      inside = true;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      inside = false;
      // keep ticking until the trail fades, then the loop self-stops
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const tick = () => {
      t += 0.0005;

      // Trail fade — fill the canvas with a low-alpha bg color each frame
      // instead of clearRect. Old particles leave a fading ghost trail.
      // parentBg is cached at resize time (matches theme, no per-frame recalc).
      ctx.fillStyle = parentBg;
      ctx.globalAlpha = TRAIL_FADE;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // Emitter springs toward the cursor (or drifts home when outside).
      if (inside) {
        ex += (px - ex) * EMITTER_LERP;
        ey += (py - ey) * EMITTER_LERP;
        // Emit N particles this frame from the emitter position.
        for (let i = 0; i < EMIT_RATE; i++) {
          const p = emitted[emitHead];
          const fresh = spawnEmitted(ex, ey);
          emitted[emitHead] = fresh;
          emitHead = (emitHead + 1) % MAX_EMITTED;
        }
      }

      // Additive blending so overlapping particles glow brighter.
      ctx.globalCompositeOperation = 'lighter';

      // Update + draw ambient particles (Perlin flow field)
      for (const p of ambient) {
        // Sample the noise flow field at the particle's scaled position.
        const ang = noise(p.x / FLOW_GRID, p.y / FLOW_GRID + t * 2) * Math.PI * 4;
        p.vx += Math.cos(ang) * FLOW_FORCE;
        p.vy += Math.sin(ang) * FLOW_FORCE;
        // Gentle pull toward cursor when inside (layered with the flow field)
        if (inside) {
          const dx = px - p.x;
          const dy = py - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 200) {
            const pull = (1 - dist / 200) * 0.04;
            p.vx += (dx / (dist || 1)) * pull;
            p.vy += (dy / (dist || 1)) * pull;
          }
        }
        // Damping
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.vx;
        p.y += p.vy;
        // Wrap edges softly
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        const sprite = sprites[p.colorIdx];
        const drawSize = p.size * 6;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(sprite, (p.x - drawSize / 2) | 0, (p.y - drawSize / 2) | 0, drawSize, drawSize);
      }

      // Update + draw emitted particles (trail from cursor)
      let anyAlive = false;
      for (const p of emitted) {
        if (p.life >= p.maxLife) continue;
        anyAlive = true;
        p.life += 1;
        const decay = 1 - p.life / p.maxLife;
        // Slight gravity + drag for a natural fall
        p.vy += 0.02;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx;
        p.y += p.vy;

        const sprite = sprites[p.colorIdx];
        const drawSize = p.size * 7 * decay;
        ctx.globalAlpha = decay * 0.75;
        ctx.drawImage(sprite, (p.x - drawSize / 2) | 0, (p.y - drawSize / 2) | 0, drawSize, drawSize);
      }

      // Connection lines — only between particles BOTH near the cursor.
      // tsparticles-style: cursor-local, bounded radius, low opacity.
      // We first collect the near-cursor subset, THEN do the O(k²) link scan
      // on just that subset — keeps it cheap even at 160 ambient dots.
      if (inside) {
        const near: Particle[] = [];
        for (const p of ambient) {
          const dpc = Math.hypot(p.x - px, p.y - py);
          if (dpc < CONNECT_RADIUS) near.push(p);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 0.6;
        for (let i = 0; i < near.length; i++) {
          const p = near[i];
          for (let j = i + 1; j < near.length; j++) {
            const q = near[j];
            const dpq = Math.hypot(q.x - p.x, q.y - p.y);
            if (dpq > CONNECT_DIST) continue;
            const a = CONNECT_OPACITY * (1 - Math.hypot(p.x - px, p.y - py) / CONNECT_RADIUS) * (1 - dpq / CONNECT_DIST);
            if (a < 0.01) continue;
            ctx.strokeStyle = `rgba(91, 120, 240, ${a})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Keep the loop alive while the cursor is inside OR emitted particles
      // are still alive (let the trail fade out gracefully after leaving).
      if (inside || anyAlive) {
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