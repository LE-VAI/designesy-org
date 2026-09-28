'use client';

import { useEffect, useRef } from 'react';

export const STUDIO_HREF = 'https://designesy.ai.studio/';
export const STUDIO_LABEL = 'Ask the Studio (opens designesy.ai.studio in a new tab)';

/** Geometric quote glyph: two rounded strokes, reads as "speak/ask" without
    being a literal chat bubble. Shared by the dock and the phone menu. */
export function StudioGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 5.5v3a1 1 0 0 0 1 1h1.5a0.5 0.5 0 0 1 0.5 0.5v1a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V5.5a0.5 0.5 0 0 1 0.5-0.5H3" />
      <path d="M9 5.5v3a1 1 0 0 0 1 1h1.5a0.5 0.5 0 0 1 0.5 0.5v1a1 1 0 0 1-1 1H10a2 2 0 0 1-2-2V5.5a0.5 0.5 0 0 1 0.5-0.5H9" />
    </svg>
  );
}

// Phone pacing: the pill tucks away after this much downward travel, comes
// back after this much upward travel, and always shows this close to the end.
const DOWN = 12;
const UP = 28;
const END = 96;

/**
 * Director dock: the persistent way into the Studio (designesy.ai.studio, the
 * conversational Director). A labelled glass pill at the bottom-right, paired
 * with the Back pill at the bottom-left. The label is always visible: it used
 * to appear only on hover beside an unlabelled circle.
 *
 * On phones it behaves like the browser's own toolbar: out of the way while
 * the visitor reads down the page, back as soon as they scroll up, and there
 * at the end of every page, where the body's bottom padding keeps it clear of
 * content. It stays tucked over the first screen, which belongs to the page's
 * own heading and controls (at 375 by 667 it sat on the homepage's Scope
 * control). The phone menu carries the Studio link too, so it is never more
 * than a tap away. Wider screens keep the pill in place, untouched.
 */
export function DirectorDock() {
  const ref = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const phone = window.matchMedia('(max-width: 720px)');
    let lastY = window.scrollY;
    let down = 0;
    let up = 0;
    let shown = false;
    let frame = 0;
    const show = (v: boolean) => {
      if (v === shown) return;
      shown = v;
      el.toggleAttribute('data-shown', v);
    };
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      // A modal layer holds the page still; its scroll events are not reading.
      if (document.documentElement.hasAttribute('data-scroll-lock')) return;
      const doc = document.documentElement;
      if (y + window.innerHeight >= doc.scrollHeight - END) return show(true);
      if (y < window.innerHeight * 0.6) return show(false);
      if (dy > 0) {
        up = 0;
        down += dy;
        if (down > DOWN) show(false);
      } else if (dy < 0) {
        down = 0;
        up -= dy;
        if (up > UP) show(true);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const bind = () => {
      window.removeEventListener('scroll', onScroll);
      if (phone.matches) {
        window.addEventListener('scroll', onScroll, { passive: true });
        lastY = window.scrollY;
        update();
      } else {
        show(false);
        el.removeAttribute('data-shown');
      }
    };
    bind();
    phone.addEventListener('change', bind);
    return () => {
      phone.removeEventListener('change', bind);
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <a
      ref={ref}
      className="director-dock"
      href={STUDIO_HREF}
      target="_blank"
      rel="noopener noreferrer"
      data-cuelume-hover="bloom"
      data-cuelume-press="tick"
      aria-label={STUDIO_LABEL}
    >
      <StudioGlyph />
      <span className="director-dock-label">
        <span className="director-dock-label-lead">Ask the </span>Studio
      </span>
    </a>
  );
}