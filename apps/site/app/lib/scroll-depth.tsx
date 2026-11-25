'use client';

import { useEffect } from 'react';

/**
 * Scroll-driven depth: the hero constellation's parallax.
 *
 * Sets --scroll-y (current scrollY in px) on each .hero-seam-mark from one
 * passive scroll listener, rAF-throttled; the mark's CSS drifts it up at 0.3x
 * scroll speed (globals.css, "Scroll-driven parallax").
 *
 * The variable is written on the marks, never on <html>, and only while a
 * mark is on the page. It used to be written on the root every scrolled
 * frame, with --scroll-progress and --scroll-velocity beside it (neither had
 * a reader). A custom property on the root is inherited by every element, so
 * each write invalidated style for the whole document, and the next layout
 * read in the frame (the dock's pacing) paid for it in script. Measured on a
 * 390x844 phone at 4x CPU throttle, scrolling the landing from the hero into
 * the inspect section: 83 frames over 50 ms per pass with the root writes,
 * 3 to 5 without. That was the one-time jitter between the score hero and the
 * verify console on a phone.
 *
 * Zero dependencies. Respects prefers-reduced-motion (exits early: the mark
 * stays put, the var unset and the calc's fallback 0px). The collection is
 * live, so a mark that mounts after a client navigation is picked up.
 */
export function ScrollDepth() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const marks = document.getElementsByClassName('hero-seam-mark');
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = `${window.scrollY}px`;
      for (let i = 0; i < marks.length; i++) (marks[i] as HTMLElement).style.setProperty('--scroll-y', y);
    };

    const onScroll = () => {
      if (!frame && marks.length) frame = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
