'use client';

/*
  ReadingProgress — thin progress bar at the top of the viewport showing
  scroll position through long-form content. One of the "visual explainers"
  the operator requested.

  Pure CSS+JS, no dependencies. Respects prefers-reduced-motion (removes
  the transition, shows progress without animation).

  Usage:
    <ReadingProgress />
    // Place at the top of any long-form page (docs, methodology, contracts)
*/

import { useEffect, useState } from 'react';

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setProgress(0);
        return;
      }
      const pct = Math.min(Math.max(scrollTop / docHeight, 0), 1);
      setProgress(pct * 100);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div className="reading-progress-track" role="progressbar" aria-label="Reading progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="reading-progress-fill"
        style={{
          width: `${progress}%`,
          transition: reduced ? 'none' : 'width 0.1s linear',
        }}
      />
    </div>
  );
}