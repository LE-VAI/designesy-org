'use client';

import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

function readTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return 'dark';
}

function persistTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* storage blocked: the attribute and cookie still carry it */
  }
}

/**
 * The site theme as state, shared by every control that switches it.
 *
 * toggle(origin) flips light and dark. Where the browser has view transitions
 * (and the visitor has not asked for reduced motion), the new theme is revealed
 * as a circle growing from `origin`: the pointer position when the switch was
 * clicked, or the centre of the control when it was pressed from the keyboard.
 * Otherwise the swap is instant. Each instance observes html[data-theme], so
 * two controls on one page never disagree.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
    const mo = new MutationObserver(() => setTheme(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const toggle = useCallback(async (origin?: { x: number; y: number }) => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduced || !origin) {
      persistTheme(next);
      setTheme(next);
      return;
    }
    const { x, y } = origin;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    await doc.startViewTransition(() => {
      flushSync(() => {
        persistTheme(next);
        setTheme(next);
      });
    }).ready;
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
    );
  }, []);

  return { theme, mounted, toggle };
}

/** The pointer position of a click, or the element's centre for a keyboard press. */
export function originOf(e: { clientX: number; clientY: number; detail: number; currentTarget: Element }) {
  if (e.detail > 0 && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
