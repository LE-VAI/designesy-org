'use client';

import { useEffect } from 'react';

/**
 * Sideways scroll boxes a keyboard can reach. A table or code block wider than
 * its column scrolls inside its own box (the page never scrolls sideways), and
 * a box that scrolls has to take focus, or a keyboard cannot bring its hidden
 * columns into view (WCAG 2.1.1). Only a box that overflows at the current
 * width gets the tab stop, named after what it holds, so nobody meets a stop
 * where nothing scrolls; the stop goes again if a wider screen makes it fit.
 *
 * Every sideways scroller it watches also carries data-overflow while its
 * content runs past its edge: the edge fade in globals.css keys off it, so a
 * box that fits never gets a mask (a mask puts the box on its own layer,
 * where text loses subpixel antialiasing on Windows).
 *
 * Added once to the root layout. A ResizeObserver keeps each box right as
 * widths change; a MutationObserver finds new boxes after client navigation.
 * Attributes the page set itself are never touched.
 */
const SELECTOR = '.dx-table-box, pre, .eg-path, .dx-toc ol, .score-category-chips, .score-filter-segmented, [data-scroll-region]';
// The boxes that take a keyboard stop of their own; the rest hold links.
const FOCUS = '.dx-table-box, pre, [data-scroll-region]';
const MARK = 'data-scroll-focus';

function nameOf(el: HTMLElement): string {
  const own = el.getAttribute('data-scroll-region');
  if (own) return own;
  const caption = el.querySelector('caption')?.textContent?.trim();
  if (caption) return caption;
  return el.tagName === 'PRE' ? 'Code sample' : 'Table';
}

function sync(el: HTMLElement) {
  const over = el.scrollWidth > el.clientWidth + 1;
  el.toggleAttribute('data-overflow', over);
  if (!el.matches(FOCUS)) return;
  const added = (el.getAttribute(MARK) || '').split(' ').filter(Boolean);
  if (over && !added.length) {
    if (el.hasAttribute('tabindex')) return;
    const mine = ['tabindex'];
    el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) {
      el.setAttribute('role', 'region');
      mine.push('role');
    }
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      el.setAttribute('aria-label', nameOf(el));
      mine.push('aria-label');
    }
    el.setAttribute(MARK, mine.join(' '));
  } else if (!over && added.length) {
    added.forEach((a) => el.removeAttribute(a));
    el.removeAttribute(MARK);
  }
}

export function ScrollRegions() {
  useEffect(() => {
    const watched = new WeakSet<Element>();
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = (e.target as HTMLElement).closest(SELECTOR) as HTMLElement | null;
        if (box) sync(box);
      }
    });
    const scan = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        // Sync NOW, on the first pass. Without this the stop was added only
        // when some box happened to resize later, so a code block that already
        // overflowed at load had no keyboard stop until then. That made axe's
        // scrollable-region-focusable fire intermittently: /docs/mcp at 390
        // failed one sweep and passed the next, same viewport, same commit
        // (2026-10-04). Overflow is not a resize — see the second fix below.
        sync(el);
      });
    };
    scan();
    let frame = 0;
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), scan()));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // OVERFLOW IS NOT A RESIZE. ResizeObserver watches the BORDER BOX, and a
    // block box keeps its width while its content overflows — so a wide code
    // sample, or the same sample when the font settles late, never produced a
    // callback and never got its stop. These three re-check everything at the
    // moments the answer can change for reasons ResizeObserver cannot see:
    // webfonts landing, the viewport changing, and the first idle frame after
    // hydration. Each pass is cheap (a scrollWidth read per box) and sync() is
    // idempotent, so a box that fits still loses its stop.
    const resyncAll = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach(sync);
    };
    if ('fonts' in document && document.fonts) {
      document.fonts.ready.then(resyncAll).catch(() => {});
    }
    window.addEventListener('resize', resyncAll);
    const idle = requestAnimationFrame(resyncAll);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', resyncAll);
      cancelAnimationFrame(idle);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
