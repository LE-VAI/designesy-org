'use client';

import { useRef, useEffect } from 'react';

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.save();
      ctx.scale(dpr, dpr);

      // Rings
      ringsRef.current = ringsRef.current.filter((r) => {
        r.life += 1;
        if (r.life >= r.maxLife) return false;
        const progress = r.life / r.maxLife;
        r.radius += 3.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(51, 88, 232, ${(1 - progress) * 0.7})`;
        ctx.lineWidth = 2.5 * (1 - progress);
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
        p.vy += 0.14;
        p.vx *= 0.97;
        p.vy *= 0.97;

        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * decay), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = decay;
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      ctx.restore();

      if (particlesRef.current.length > 0 || ringsRef.current.length > 0) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        animRef.current = 0;
      }
    };

    const burst = (clientX: number, clientY: number) => {
      const colors = ['#0133CB', '#3358E8', '#5B78F0', '#9EB0FF', '#FFFFFF'];
      const count = 36;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
        const speed = 2 + Math.random() * 5;
        particlesRef.current.push({
          x: clientX,
          y: clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          life: 0,
          maxLife: 35 + Math.random() * 25,
          size: 2.5 + Math.random() * 3,
          color: colors[i % colors.length],
        });
      }
      ringsRef.current.push({ x: clientX, y: clientY, radius: 4, life: 0, maxLife: 24 });
      ringsRef.current.push({ x: clientX, y: clientY, radius: 2, life: 0, maxLife: 36 });

      if (animRef.current === 0) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    const handleTrigger = (e: MouseEvent | PointerEvent) => {
      const cx = e.clientX;
      const cy = e.clientY;
      if (typeof cx !== 'number' || typeof cy !== 'number') return;
      if (cx === 0 && cy === 0) return;
      burst(cx, cy);
    };

    window.addEventListener('pointerdown', handleTrigger, { capture: true, passive: true });
    window.addEventListener('click', handleTrigger, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleTrigger, { capture: true });
      window.removeEventListener('click', handleTrigger, { capture: true });
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 99999,
      }}
    />
  );
}