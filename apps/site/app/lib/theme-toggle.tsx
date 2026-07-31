'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return 'dark';
}

function persistTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try { localStorage.setItem('theme', theme); } catch {}
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const ref = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  const toggle = useCallback(async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!doc.startViewTransition || prefersReducedMotion || !ref.current) {
      persistTheme(next);
      setTheme(next);
      return;
    }

    const { top, left, width, height } = ref.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const maxRadius = Math.hypot(
      Math.max(left, window.innerWidth - left),
      Math.max(top, window.innerHeight - top),
    );

    await doc.startViewTransition(() => {
      flushSync(() => {
        persistTheme(next);
        setTheme(next);
      });
    }).ready;

    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }, [theme]);

  if (!mounted) return <span className="theme-toggle" aria-hidden="true" />;

  return (
    <button
      ref={ref}
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      type="button"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="theme-icon"
      >
        <mask id="moon-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <circle
            className="moon-mask-circle"
            cx="30"
            cy="4"
            r="9"
            fill="black"
          />
        </mask>
        <circle
          className="sun-core"
          cx="12"
          cy="12"
          r="5"
          fill="currentColor"
          mask="url(#moon-mask)"
        />
        <g className="sun-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </g>
      </svg>
    </button>
  );
}
