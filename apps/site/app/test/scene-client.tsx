'use client';

import { useState } from 'react';

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
];

function EffectCell({ effect }: { effect: (typeof EFFECTS)[number] }) {
  const [tapped, setTapped] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

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
  };

  return (
    <div
      onPointerDown={handleTap}
      data-effect={effect.id}
      className={`effect-cell effect-${effect.id}${tapped ? ' is-tapped' : ''}`}
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