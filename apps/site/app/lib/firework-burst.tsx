'use client';

import { useRef, useEffect, useCallback } from 'react';

/**
 * Firework burst overlay — listens for clicks on elements with
 * [data-firework] and spawns a canvas burst at the click point.
 * Pure Canvas 2D, zero dependencies, respects prefers-reduced-motion.
 *
 * Usage: add data-firework to any element. Clicks on that element
 * trigger a signal-blue particle burst + shockwave ring.
 */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type Ring = {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
};

export function FireworkBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ringsRef = useRef<Ring[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Rings
      ringsRef.current = ringsRef.current.filter((r) => {
        r.life += 1;
        if (r.life >= r.maxLife) return false;
        const progress = r.life / r.maxLife;
        r.radius += 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(51, 88, 232, ${(1 - progress) * 0.5})`;
        ctx.lineWidth = 2 * (1 - progress);
        ctx.stroke();
        return true;
      });

      // Particles
      particlesRef.current = particlesRef.current.filter((p) => {
        p.life += 1;
        if (p.life >= p.maxLife) return false;
        const decay = 1 - p.life / p.maxLife;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.vx *= 0.98;
        p.vy *= 0.98;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * decay, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = decay * 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      if (particlesRef.current.length > 0 || ringsRef.current.length > 0) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        animRef.current = 0;
      }
    };

    const burst = (clientX: number, clientY: number) => {
      const count = 40;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speed = 2 + Math.random() * 4;
        particlesRef.current.push({
          x: clientX,
          y: clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 0,
          maxLife: 50 + Math.random() * 30,
          size: 2 + Math.random() * 3,
          color: i % 3 === 0 ? '#3358e8' : '#0133cb',
        });
      }
      ringsRef.current.push({ x: clientX, y: clientY, radius: 5, life: 0, maxLife: 30 });

      if (animRef.current === 0) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-firework]')) return;
      burst(e.clientX, e.clientY);
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
}