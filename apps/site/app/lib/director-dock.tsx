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

// The widths where the shell leaves no gutter to park a 44px circle in:
// phones, and the 721 to 1319px tier. Keep in step with the "Gutter parking"
// block in globals.css.
const NO_GUTTER = '(max-width: 1319.98px)';

/**
 * The scroll distance from the end of the page within which the pill, at
 * rest, sits wholly in the room left below the page's last content (the body's
 * and the footer's bottom padding, which exist to clear it): that room less
 * the pill's own foot (its bottom offset, safe-area inset included, and its
 * height). Measured, not written down, so a change to the padding, the pill or
 * the inset moves it too. Negative when a page leaves less room than the pill
 * needs: then the pill does not come up there at all.
 */
function footRoom(pill: HTMLElement): number {
  // The last element in the page's flow: the footer, or main on a page
  // without one. The Studio's own nav is in flow but holds only the fixed
  // pill, so it has no height and is passed over, as are fixed layers.
  let last: Element | null = null;
  for (let c = document.body.lastElementChild; c; c = c.previousElementSibling) {
    const cs = getComputedStyle(c);
    if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute') continue;
    if (c.getBoundingClientRect().height > 0) {
      last = c;
      break;
    }
  }
  if (!last) return 0;
  const lcs = getComputedStyle(last);
  const contentEnd =
    last.getBoundingClientRect().bottom +
    window.scrollY -
    parseFloat(lcs.paddingBottom) -
    parseFloat(lcs.borderBottomWidth);
  const room = document.documentElement.scrollHeight - contentEnd;
  return room - (parseFloat(getComputedStyle(pill).bottom) + pill.offsetHeight);
}

/**
 * Pacing for the two floating pills (Studio and Back), which set
 * data-shown on the pill wherever CSS tucks it away (phones, and laptops and
 * tablets with no gutter beside the shell, NO_GUTTER): the pill comes up only
 * where room is kept for it, at the end of the page (footRoom), and stays
 * tucked everywhere else. It used to come up on any scroll up as well, like
 * the browser's own toolbar, and there it sat on whatever the bottom corner
 * held: on a phone, the score's category values ("Tokens 100" under the pill
 * at 390). No place mid-page is free of content at these widths, so none is
 * safe. The phone menu carries the Studio too, and from 721px Tab still
 * brings the circle up (globals.css, :focus-visible).
 * Wider, CSS parks the pill in the gutter and this does nothing.
 *
 * It also lets Escape dismiss the name tag the compact circles show on hover
 * or focus (WCAG 1.4.13), until the pointer leaves or focus moves.
 */
export function useDockPacing(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const noGutter = window.matchMedia(NO_GUTTER);
    let shown = false;
    let frame = 0;
    const show = (v: boolean) => {
      if (v === shown) return;
      shown = v;
      el.toggleAttribute('data-shown', v);
    };
    const update = () => {
      frame = 0;
      // A modal layer holds the page still; its scroll events are not reading.
      if (document.documentElement.hasAttribute('data-scroll-lock')) return;
      const doc = document.documentElement;
      const toEnd = doc.scrollHeight - (window.scrollY + window.innerHeight);
      show(toEnd <= footRoom(el));
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
      if (noGutter.matches) {
        window.addEventListener('scroll', onScroll, { passive: true });
        grow.observe(document.body);
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
    noGutter.addEventListener('change', bind);
    document.addEventListener('keydown', onKey);
    el.addEventListener('pointerleave', unquiet);
    el.addEventListener('blur', unquiet);
    return () => {
      noGutter.removeEventListener('change', bind);
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