/**
 * Page scroll lock for modal layers: the phone menu and the Find palette.
 *
 * It locks the root element, not body. On phones html sets overflow-x: clip,
 * and once the root's overflow is anything but visible, body's overflow no
 * longer reaches the viewport, so body{overflow:hidden} locked nothing there:
 * the page behind the open menu still scrolled. html[data-scroll-lock] sets
 * overflow: hidden on the root itself (globals.css), which the viewport obeys
 * on every engine, and keeps the scroll position where it was.
 *
 * Reference-counted, so one layer closing never unlocks another that is open.
 */
let depth = 0;

export function lockScroll(): () => void {
  const root = document.documentElement;
  if (depth++ === 0) root.setAttribute('data-scroll-lock', '');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--depth === 0) root.removeAttribute('data-scroll-lock');
  };
}

export function scrollLocked(): boolean {
  return document.documentElement.hasAttribute('data-scroll-lock');
}

/**
 * Makes everything outside `keep` inert while a modal layer is open: each
 * sibling of `keep` and of every ancestor up to body, except the elements in
 * `spare` (a scrim that has to stay tappable). Returns the undo. Elements
 * that were already inert are left as they were.
 */
export function inertOutside(keep: Element, spare: (Element | null)[] = []): () => void {
  const changed: HTMLElement[] = [];
  const skip = new Set<Element>(spare.filter(Boolean) as Element[]);
  for (let node: Element | null = keep; node && node !== document.body; node = node.parentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children)) {
      if (sib === node || skip.has(sib) || !(sib instanceof HTMLElement)) continue;
      if (sib.inert || /^(SCRIPT|STYLE|TEMPLATE|LINK|META)$/.test(sib.tagName)) continue;
      sib.inert = true;
      changed.push(sib);
    }
  }
  return () => changed.forEach((el) => (el.inert = false));
}
