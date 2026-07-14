'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Pure-canvas firework sparkle — no three.js dependency.
 * Click anywhere → burst of signal-blue particles + shockwave ring.
 * Uses contract tokens: --signal (#0133cb), --signal-light (#3358e8).
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

export default function Scene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ringsRef = useRef<Ring[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      // Ambient floating dots
      const time = performance.now() / 1000;
      for (let i = 0; i < 25; i++) {
        const x = (Math.sin(time * 0.2 + i * 1.7) * 0.5 + 0.5) * w;
        const y = (Math.cos(time * 0.15 + i * 2.3) * 0.5 + 0.5) * h;
        const alpha = 0.15 + Math.sin(time + i) * 0.1;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(51, 88, 232, ${Math.max(0, alpha)})`;
        ctx.fill();
      }

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

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleClick = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 2 + Math.random() * 4;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 0,
        maxLife: 50 + Math.random() * 30,
        size: 2 + Math.random() * 3,
        color: i % 3 === 0 ? '#3358e8' : '#0133cb',
      });
    }

    ringsRef.current.push({ x, y, radius: 5, life: 0, maxLife: 30 });
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handleClick}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: 'crosshair',
      }}
    />
  );
}