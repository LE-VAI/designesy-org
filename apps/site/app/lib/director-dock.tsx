'use client';

import { useEffect, useRef, type RefObject } from 'react';

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
// The widths where the shell leaves no gutter to park a 44px circle in. Keep
// in step with the "Gutter parking" block in globals.css (its 721 to 1319px
// tier). There the pills come up only at the end of the page, inside the
// footer's dock clearance: 76px of foot (offset, height, gap) less the pill's
// 64px (offset, height) leaves 12px of scroll in which nothing sits under it.
const TUCKED = '(min-width: 721px) and (max-width: 1319.98px)';
const TUCKED_END = 12;

/**
 * Pacing for the two floating pills (Studio and Back), which set
 * data-shown on the pill wherever CSS tucks it away:
 *  - phones: like the browser's own toolbar. Out of the way while the visitor
 *    reads down the page, back as soon as they scroll up, and there at the end
 *    of every page, where the body's bottom padding keeps it clear of content.
 *    It stays tucked over the first screen, which belongs to the page's own
 *    heading and controls (at 375 by 667 it sat on the homepage's Scope
 *    control).
 *  - laptops and tablets with no gutter beside the shell (TUCKED): the phone
 *    pacing. End-of-page only hid the Studio from every 1280 laptop for the
 *    whole read; a scroll up is the visitor stopping to navigate, so the
 *    circle may cross the content edge for that moment, and it leaves again
 *    on the next scroll down.
 *  - wider: CSS parks the pill in the gutter and this does nothing.
 *
 * It also lets Escape dismiss the name tag the compact circles show on hover
 * or focus (WCAG 1.4.13), until the pointer leaves or focus moves.
 */
export function useDockPacing(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const phone = window.matchMedia('(max-width: 720px)');
    const tucked = window.matchMedia(TUCKED);
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
      const toEnd = doc.scrollHeight - (y + window.innerHeight);
      if (toEnd <= (tucked.matches ? TUCKED_END : END)) return show(true);
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
    // The page can grow or shrink under a still scroll position (late
    // content, an opened disclosure), which moves the end without a scroll.
    const grow = new ResizeObserver(onScroll);
    const bind = () => {
      window.removeEventListener('scroll', onScroll);
      grow.disconnect();
      if (phone.matches || tucked.matches) {
        window.addEventListener('scroll', onScroll, { passive: true });
        grow.observe(document.body);
        lastY = window.scrollY;
        update();
      } else {
        show(false);
        el.removeAttribute('data-shown');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (el.matches(':hover') || el === document.activeElement)) {
        el.setAttribute('data-quiet', '');
      }
    };
    const unquiet = () => el.removeAttribute('data-quiet');
    bind();
    phone.addEventListener('change', bind);
    tucked.addEventListener('change', bind);
    document.addEventListener('keydown', onKey);
    el.addEventListener('pointerleave', unquiet);
    el.addEventListener('blur', unquiet);
    return () => {
      phone.removeEventListener('change', bind);
      tucked.removeEventListener('change', bind);
      document.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerleave', unquiet);
      el.removeEventListener('blur', unquiet);
      window.removeEventListener('scroll', onScroll);
      grow.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, active]);
}

/**
 * Director dock: the persistent way into the Studio (designesy.ai.studio, the
 * conversational Director), paired with the Back pill at the bottom-left. Its
 * form follows the room beside the shell (globals.css, "Gutter parking"): a
 * labelled glass pill where the gutter holds one, an icon-only 44px circle
 * that names itself on hover or focus where it holds only that, and tucked
 * away (useDockPacing) where it holds neither, so at rest it never covers the
 * content column. The phone menu carries the Studio link too, so on a phone
 * it is never more than a tap away.
 */
export function DirectorDock() {
  const ref = useRef<HTMLAnchorElement | null>(null);
  useDockPacing(ref);

  // The link sits after the footer, outside every landmark, which axe reports
  // (region): its own labelled nav puts it in one. The nav takes no room, as
  // its only child is position: fixed.
  return (
    <nav aria-label="Studio">
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
    </nav>
  );
}