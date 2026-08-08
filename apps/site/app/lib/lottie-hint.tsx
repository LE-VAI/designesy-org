'use client';

/*
  LottieHint — lightweight SVG+CSS animation system that delivers the
  visual delight of Lottie without the 2MB runtime cost.

  The site's motion vocabulary is already pure SVG+CSS (ScoreDial,
  RadarChart, ContractHealthRack, CountUp). This extends that vocabulary
  with decorative micro-animations and contextual tip bubbles — the
  "lottie helpers/tips" the operator requested.

  Three animation types:
  1. `pulse` — subtle breathing ring (decorative loop, 2s cycle)
  2. `orbit` — orbiting dot around a center (decorative loop, 3s cycle)
  3. `shimmer` — sweeping highlight across a surface (decorative loop, 2.5s)
  4. `check` — one-shot checkmark draw (success confirmation)
  5. `loading` — spinning arc (async loading state)

  All animations respect prefers-reduced-motion (Tier 1: remove decorative
  loops, Tier 3: keep functional states like loading/check).

  Usage:
    <LottieHint type="pulse" size={48} />
    <LottieHint type="check" size={64} trigger="visible" />
    <LottieHint type="loading" size={32} />

  For contextual tip bubbles:
    <LottieTip text="Try scoring your site — it takes 3 seconds" />
*/

import { useEffect, useRef, useState } from 'react';

type LottieHintType = 'pulse' | 'orbit' | 'shimmer' | 'check' | 'loading';
type Trigger = 'mount' | 'visible';

type LottieHintProps = {
  type: LottieHintType;
  size?: number;
  trigger?: Trigger;
  className?: string;
  /** Color override (defaults to --signal) */
  color?: string;
};

export function LottieHint({
  type,
  size = 48,
  trigger = 'mount',
  className,
  color,
}: LottieHintProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(trigger === 'mount');
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    if (trigger === 'visible' && ref.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setActive(true);
            observer.disconnect();
          }
        },
        { threshold: 0.3 }
      );
      observer.observe(ref.current);
      return () => observer.disconnect();
    }
  }, [trigger]);

  // Functional states (loading, check) stay even with reduced motion;
  // decorative loops (pulse, orbit, shimmer) are removed.
  const isDecorative = type === 'pulse' || type === 'orbit' || type === 'shimmer';
  const shouldAnimate = active && !(reduced && isDecorative);

  const stroke = color || 'var(--signal)';

  return (
    <div
      ref={ref}
      className={`lottie-hint lottie-hint--${type}${shouldAnimate ? ' lottie-hint--active' : ''}${className ? ' ' + className : ''}`}
      style={{ width: size, height: size }}
      aria-hidden={isDecorative ? 'true' : undefined}
      role={type === 'loading' ? 'status' : undefined}
      aria-label={type === 'loading' ? 'Loading' : undefined}
    >
      {type === 'pulse' && (
        <svg viewBox="0 0 48 48" width={size} height={size}>
          <circle cx="24" cy="24" r="8" fill={stroke} opacity="0.15" />
          <circle cx="24" cy="24" r="8" fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.4" className="lottie-hint-pulse-ring" />
          <circle cx="24" cy="24" r="3" fill={stroke} />
        </svg>
      )}

      {type === 'orbit' && (
        <svg viewBox="0 0 48 48" width={size} height={size}>
          <circle cx="24" cy="24" r="16" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.3" />
          <circle cx="24" cy="24" r="3" fill={stroke} opacity="0.4" />
          <circle cx="24" cy="8" r="2.5" fill={stroke} className="lottie-hint-orbit-dot" />
        </svg>
      )}

      {type === 'shimmer' && (
        <svg viewBox="0 0 48 48" width={size} height={size}>
          <rect x="4" y="20" width="40" height="8" rx="4" fill="var(--surface-raised)" />
          <rect x="4" y="20" width="40" height="8" rx="4" fill="none" stroke="var(--line)" strokeWidth="0.5" />
          <rect x="4" y="20" width="12" height="8" rx="4" fill={stroke} opacity="0.6" className="lottie-hint-shimmer-sweep" />
        </svg>
      )}

      {type === 'check' && (
        <svg viewBox="0 0 48 48" width={size} height={size}>
          <circle cx="24" cy="24" r="20" fill="none" stroke={stroke} strokeWidth="2" opacity="0.2" />
          <path
            d="M14 24 L21 31 L34 18"
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lottie-hint-check-path"
            style={{ strokeDasharray: shouldAnimate ? '30 30' : 'none', strokeDashoffset: shouldAnimate ? '30' : '0' }}
          />
        </svg>
      )}

      {type === 'loading' && (
        <svg viewBox="0 0 48 48" width={size} height={size}>
          <circle cx="24" cy="24" r="18" fill="none" stroke="var(--line)" strokeWidth="2" opacity="0.2" />
          <circle
            cx="24"
            cy="24"
            r="18"
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="28 113"
            className="lottie-hint-loading-arc"
          />
        </svg>
      )}
    </div>
  );
}

/*
  LottieTip — contextual hint bubble with an animated icon.
  Shows a short tip text next to a pulsing indicator dot.
  Dismissible (stores dismissal in sessionStorage).

  Usage:
    <LottieTip text="Hover any score dial to see the breakdown" />
    <LottieTip text="Press Ctrl+K to search" position="top" />
*/
type LottieTipProps = {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  dismissible?: boolean;
  className?: string;
};

export function LottieTip({ text, position = 'bottom', dismissible = true, className }: LottieTipProps) {
  const [dismissed, setDismissed] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (dismissible) {
      try {
        const stored = sessionStorage.getItem('lottie-tip-dismissed');
        if (stored === text) setDismissed(true);
      } catch {
        // sessionStorage may be unavailable (private mode) — non-fatal
      }
    }
  }, [text, dismissible]);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('lottie-tip-dismissed', text);
    } catch {
      // Non-fatal
    }
  };

  return (
    <div className={`lottie-tip lottie-tip--${position}${className ? ' ' + className : ''}`}>
      <div className="lottie-tip-dot-wrapper">
        <span className="lottie-tip-dot" />
        {!reduced && <span className="lottie-tip-dot-pulse" />}
      </div>
      <span className="lottie-tip-text">{text}</span>
      {dismissible && (
        <button
          type="button"
          className="lottie-tip-close"
          onClick={handleDismiss}
          aria-label="Dismiss tip"
        >
          ×
        </button>
      )}
    </div>
  );
}