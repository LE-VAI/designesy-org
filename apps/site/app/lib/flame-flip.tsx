'use client';

import { useEffect } from 'react';

// The flame flip (brand ledger D69): Ctrl+I, or the keycaps beside the footer
// wordmark, opens a circle from the header logo's dot that inverts the page
// beneath it. Azure #0A94FF and the flame #F56B00 are exact RGB inverses, so
// the inverted page shows the activated brand exactly. It holds 1.5s, closes
// back into the dot, and nothing persists.
//
// This file is all that loads with the page: one keydown listener (the
// layout) and one button (the footer). The overlay, its timing and the origin
// measurement live in flame-flip-run.ts, which is fetched on the first
// trigger, so the flip costs the page nothing until someone asks for it.

function flip() {
  void import('./flame-flip-run').then((m) => m.runFlameFlip());
}

/** Text the shortcut must leave alone: Ctrl+I means italic there. */
const EDITABLE = /^(input|textarea|select)$/i;

/** Ctrl+I, or Command+I, anywhere the browser hands the key to the page.
    Firefox keeps Ctrl+I for Page Info; the footer keycaps are the way in
    there, and the page does not fight the browser for it. Mounted once, in
    the root layout. */
export function FlameFlipShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if ((e.key || '').toLowerCase() !== 'i') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || EDITABLE.test(t.tagName))) return;
      e.preventDefault();
      flip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}

/** The keycaps beside the footer wordmark: a real button, so it is reachable
    by Tab and activated by Enter and Space, with the site's focus ring.
    Named from its content, "Flip to the flame: ctrl i": the hidden lead says
    what it does, and the name contains the visible keycaps, so a voice user
    can say what they see (WCAG 2.5.3 Label in Name; an aria-label of
    "Control I" did not contain "ctrl"). The spaces only reach the name: in
    the inline-flex row they render nothing, and the absolute .sr-only span
    takes no part in the row's gap. */
export function FlameFlipKeys() {
  return (
    <button type="button" className="flip-keys" onClick={flip}>
      <span className="sr-only">Flip to the flame: </span>
      <kbd>ctrl</kbd>{' '}
      <span aria-hidden="true">+</span>{' '}
      <kbd>i</kbd>
    </button>
  );
}
