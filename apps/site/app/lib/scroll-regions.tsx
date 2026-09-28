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
 * Added once to the root layout. A ResizeObserver keeps each box right as
 * widths change; a MutationObserver finds new boxes after client navigation.
 * Attributes the page set itself are never touched.
 */
const SELECTOR = '.dx-table-box, pre, [data-scroll-region]';
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
      });
    };
    scan();
    let frame = 0;
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), scan()));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
