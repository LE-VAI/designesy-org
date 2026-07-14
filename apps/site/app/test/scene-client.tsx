'use client';

import { useState, useRef } from 'react';

/**
 * Designesy-themed effect cells — each demonstrates a different
 * hover/tap animation using contract tokens. Click or hover to see
 * what's available.
 */

const EFFECTS = [
  { id: 'pulse', label: 'Pulse', desc: 'Scale up + signal glow on hover' },
  { id: 'lift', label: 'Lift', desc: 'TranslateY + border brighten' },
  { id: 'signal-bar', label: 'Signal bar', desc: 'Left border grows from bottom' },
  { id: 'fill', label: 'Fill', desc: 'Signal-dim background sweeps in' },
  { id: 'glow-text', label: 'Glow text', desc: 'Text brightens to signal-light' },
  { id: 'shake', label: 'Shake', desc: 'Quick horizontal jitter on tap' },
  { id: 'flip', label: 'Flip', desc: 'Card flips to reveal description' },
  { id: 'orbit', label: 'Orbit', desc: 'Signal dot orbits the cell' },
  { id: 'expand', label: 'Expand', desc: 'Border expands outward on hover' },
  { id: 'ripple', label: 'Ripple', desc: 'Ripple from tap point' },
  { id: 'scrim', label: 'Scrim', desc: 'Dark scrim fades, signal shows through' },
  { id: 'breath', label: 'Breath', desc: 'Slow opacity pulse (like wordmark)' },
  { id: 'sweep', label: 'Sweep', desc: 'Signal line scans across horizontally' },
  { id: 'tilt', label: 'Tilt', desc: '3D tilt toward cursor position' },
  { id: 'underline', label: 'Underline', desc: 'Signal underline grows under label' },
  { id: 'spotlight', label: 'Spotlight', desc: 'Radial glow follows cursor' },
  { id: 'slide', label: 'Slide', desc: 'Label slides, desc slides in from left' },
  { id: 'border-trace', label: 'Border trace', desc: 'Border draws itself sequentially' },
  { id: 'press', label: 'Press', desc: 'Cell sinks down with shadow' },
  { id: 'glow-ring', label: 'Glow ring', desc: 'Sonar ping rings outward' },
];

function EffectCell({ effect }: { effect: (typeof EFFECTS)[number] }) {
  const [tapped, setTapped] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const [pings, setPings] = useState<{ id: number }[]>([]);
  const [tilt, setTilt] = useState<{ rx: string; ry: string } | null>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const handleTap = (e: React.PointerEvent<HTMLDivElement>) => {
    setTapped(true);
    setTimeout(() => setTapped(false), 400);

    if (effect.id === 'ripple') {
      const rect = e.currentTarget.getBoundingClientRect();
      const id = Date.now();
      setRipples((prev) => [
        ...prev,
        { x: e.clientX - rect.left, y: e.clientY - rect.top, id },
      ]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
    }

    if (effect.id === 'glow-ring') {
      const id = Date.now();
      setPings((prev) => [...prev, { id }]);
      setTimeout(() => setPings((prev) => prev.filter((p) => p.id !== id)), 800);
    }
  };

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (effect.id === 'tilt' && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      setTilt({ rx: `${py * -16}deg`, ry: `${px * 16}deg` });
    }
    if (effect.id === 'spotlight' && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      setSpot({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleLeave = () => {
    setTilt(null);
    setSpot(null);
  };

  const tiltStyle = effect.id === 'tilt' && tilt
    ? { transform: `perspective(500px) rotateX(${tilt.rx}) rotateY(${tilt.ry})` }
    : undefined;

  return (
    <div
      ref={cellRef}
      onPointerDown={handleTap}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      data-effect={effect.id}
      className={`effect-cell effect-${effect.id}${tapped ? ' is-tapped' : ''}`}
      style={
        effect.id === 'spotlight' && spot
          ? { '--spot-x': `${spot.x}px`, '--spot-y': `${spot.y}px` } as React.CSSProperties
          : tiltStyle
      }
    >
      {(effect.id === 'flip') && (
        <div className="effect-flip-inner">
          <div className="effect-flip-front">
            <span className="effect-label">{effect.label}</span>
          </div>
          <div className="effect-flip-back">
            <span className="effect-desc">{effect.desc}</span>
          </div>
        </div>
      )}
      {effect.id !== 'flip' && (
        <>
          <span className="effect-label">{effect.label}</span>
          <span className="effect-desc">{effect.desc}</span>
        </>
      )}
      {effect.id === 'orbit' && (
        <span className="effect-orbit-dot" aria-hidden="true" />
      )}
      {effect.id === 'signal-bar' && (
        <span className="effect-signal-bar" aria-hidden="true" />
      )}
      {effect.id === 'ripple' && ripples.map((r) => (
        <span
          key={r.id}
          className="effect-ripple"
          style={{ left: r.x, top: r.y }}
          aria-hidden="true"
        />
      ))}
      {effect.id === 'glow-ring' && pings.map((p) => (
        <span key={p.id} className="effect-glow-ring-ping" aria-hidden="true" />
      ))}
    </div>
  );
}

export default function SceneClient() {
  return (
    <div className="effect-grid">
      {EFFECTS.map((effect) => (
        <EffectCell key={effect.id} effect={effect} />
      ))}
    </div>
  );
}