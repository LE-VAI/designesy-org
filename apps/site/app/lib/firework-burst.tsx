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
    let lastTime = 0;
    let lastX = -999;
    let lastY = -999;

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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Shockwave Rings
      ringsRef.current = ringsRef.current.filter((r) => {
        r.life += 1;
        if (r.life >= r.maxLife) return false;
        const progress = r.life / r.maxLife;
        r.radius += 2.8;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(51, 88, 232, ${(1 - progress) * 0.6})`;
        ctx.lineWidth = 2 * (1 - progress);
        ctx.stroke();
        return true;
      });

      // Pure Signal-Blue Particles
      particlesRef.current = particlesRef.current.filter((p) => {
        p.life += 1;
        if (p.life >= p.maxLife) return false;
        const decay = 1 - p.life / p.maxLife;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.09;
        p.vx *= 0.96;
        p.vy *= 0.96;

        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * decay), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = decay;
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
      // Pure Signal Blue Palette — 100% blue tones, ZERO white
      const colors = ['#0133CB', '#3358E8', '#5B78F0', '#7E9DFF'];
      const count = 30;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.3 - 0.15);
        const speed = 1.8 + Math.random() * 3.8;
        particlesRef.current.push({
          x: clientX,
          y: clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.8,
          life: 0,
          maxLife: 32 + Math.random() * 20,
          size: 2.2 + Math.random() * 2.5,
          color: colors[i % colors.length],
        });
      }
      ringsRef.current.push({ x: clientX, y: clientY, radius: 3, life: 0, maxLife: 22 });

      if (animRef.current === 0) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    const handleTrigger = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      // TARGETED FILTER: Fire ONLY on brand wordmark, hero title, open link, score button, or elements with explicit data-firework attribute
      const matched = target.closest(
        '[data-firework="true"], [data-firework], [data-cuelume-press="sparkle"], .wordmark, .wordmark-hero, a[href="/open"], a[href="/score"], .director-dock'
      );
      if (!matched) return;

      const now = performance.now();
      const cx = typeof e.clientX === 'number' && e.clientX !== 0 ? e.clientX : (e as MouseEvent).pageX;
      const cy = typeof e.clientY === 'number' && e.clientY !== 0 ? e.clientY : (e as MouseEvent).pageY;

      // Throttle double-firing from pointerdown + click on same target (300ms window)
      if (now - lastTime < 300 && Math.hypot(cx - lastX, cy - lastY) < 25) {
        return;
      }
      lastTime = now;
      lastX = cx;
      lastY = cy;

      burst(cx, cy);
    };

    window.addEventListener('pointerdown', handleTrigger, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleTrigger, { capture: true });
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