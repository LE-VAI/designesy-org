/**
 * One stack for every layer that floats over the page: the Find palette, the
 * phone menu, and the Senses popover.
 *
 * WHY ONE STACK
 * Each layer used to own its Escape key, its inert and its focus return, and
 * they disagreed. The palette caught Escape in the capture phase without
 * stopping it, so the phone menu's and the popover's listeners closed too: one
 * key, two layers gone, and focus raced between the palette's return element
 * and the menu's trigger. Ctrl+K with the menu open painted the palette under
 * the menu and its scrim, and the menu's inert then made the palette's own
 * field dead while it held focus.
 *
 * THE RULES
 *   - Only the TOP layer receives Escape. The stack consumes the key (capture
 *     phase, propagation stopped), so nothing underneath ever sees it, and an
 *     Escape that is committing an IME candidate is left alone.
 *   - Everything outside the top MODAL layer is inert (lib/scroll-lock's
 *     inertOutside), recomputed whenever the stack changes, so layers never
 *     undo each other's inert. Layers above that modal layer stay live.
 *   - Focus returns only when the layer leaving IS the top, after inert has
 *     been lifted (an inert element cannot take focus), to the first of its
 *     candidates that actually takes it.
 *   - A layer that yields (the phone menu) closes when a modal layer is about
 *     to open: yieldToModal() closes it and hands back its focus candidates, so
 *     the palette can return focus where the menu would have.
 *
 * Module state, like the scroll lock: there is one page, so one stack.
 */
import { inertOutside } from './scroll-lock';

type FocusTarget = HTMLElement | null | undefined;

export type OverlayLayer = {
  /** Modal layers make everything outside them inert; a popover does not. */
  modal: boolean;
  /** The layer's own element: the part that stays live. */
  element: () => HTMLElement | null;
  /** Elements outside the layer that stay live with it (a tappable scrim). */
  spare?: () => (Element | null)[];
  /** Escape, delivered only while this layer is on top. */
  onEscape: () => void;
  /** Present when this layer closes for a modal layer opening over it. */
  onYield?: () => void;
  /** Where focus goes when this layer leaves from the top, in order. */
  returnFocus?: () => FocusTarget[];
};

export type OverlayHandle = {
  /** Remove the layer. restoreFocus applies only if it was the top layer. */
  release: (opts?: { restoreFocus?: boolean }) => void;
  /** True while this layer is the top of the stack. */
  isTop: () => boolean;
};

type Entry = OverlayLayer & { id: number };

const stack: Entry[] = [];
let nextId = 1;
let undoInert: (() => void) | null = null;

/** Inert follows the top modal layer; any layer above it is spared. */
function syncInert() {
  undoInert?.();
  undoInert = null;
  let i = stack.length - 1;
  while (i >= 0 && !stack[i].modal) i -= 1;
  if (i < 0) return;
  const top = stack[i];
  const el = top.element();
  if (!el) return;
  const above = stack.slice(i + 1).map((e) => e.element());
  undoInert = inertOutside(el, [...(top.spare?.() ?? []), ...above]);
}

function focusFirst(candidates: FocusTarget[]) {
  for (const el of candidates) {
    if (!el || !el.isConnected) continue;
    el.focus({ preventScroll: true });
    // A hidden, inert or display:none element refuses focus silently.
    if (document.activeElement === el) return;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.onEscape();
}

export function pushLayer(layer: OverlayLayer): OverlayHandle {
  const entry: Entry = { ...layer, id: nextId++ };
  if (stack.length === 0) window.addEventListener('keydown', onKeyDown, true);
  stack.push(entry);
  syncInert();
  let released = false;
  return {
    isTop: () => stack[stack.length - 1] === entry,
    release: ({ restoreFocus = false } = {}) => {
      if (released) return;
      released = true;
      const at = stack.indexOf(entry);
      if (at === -1) return;
      const wasTop = at === stack.length - 1;
      stack.splice(at, 1);
      if (stack.length === 0) window.removeEventListener('keydown', onKeyDown, true);
      syncInert();
      if (wasTop && restoreFocus) focusFirst(entry.returnFocus?.() ?? []);
    },
  };
}

/**
 * Close every layer that yields to a modal one (the phone menu, before the
 * palette opens) and return their focus candidates, read when called.
 */
export function yieldToModal(): () => FocusTarget[] {
  const yielded = stack.filter((e) => e.onYield);
  for (const e of yielded) e.onYield?.();
  return () => yielded.flatMap((e) => e.returnFocus?.() ?? []);
}
