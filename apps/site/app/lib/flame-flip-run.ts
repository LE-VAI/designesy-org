// The flame flip's run, loaded on the first trigger only
// (lib/flame-flip.tsx). Ported from a standalone prototype, unchanged in
// behaviour.
//
// A fixed layer with backdrop-filter: invert(1) (globals.css, "The flame
// flip") is clipped to a circle at the centre of the header lockup's mark
// dot, measured now, because the bar's position depends on scroll and width.
// The circle opens to cover the viewport in 620ms, holds 1500ms and closes
// back into the dot in 520ms, all on easeInOutCubic; then the layer is
// hidden again. It never takes a pointer event, so the page stays usable
// through the hold. Grade colours invert with everything else for those 1.5s:
// an accepted cost, not special-cased.
//
// Calm (prefers-reduced-motion, or the site's "Pause motion"): no circle. The
// whole page swaps at once, holds 1500ms and swaps back.

const OPEN_MS = 620;
const HOLD_MS = 1500;
const CLOSE_MS = 520;
const TOTAL_MS = OPEN_MS + HOLD_MS + CLOSE_MS;
/** easeInOutCubic: a move between two on-screen states. */
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

let busy = false;
let layer: HTMLDivElement | null = null;

function isCalm(): boolean {
  try {
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.motion === 'paused'
    );
  } catch {
    return false;
  }
}

/** The centre of the header lockup's mark dot: its largest circle (the
    word's tittle and period are smaller). Top left if no lockup shows. */
function origin(): [number, number] {
  let dot: DOMRect | null = null;
  for (const c of Array.from(document.querySelectorAll('#topbar .wordmark-lockup circle'))) {
    const r = c.getBoundingClientRect();
    if (r.width > 0 && (!dot || r.width > dot.width)) dot = r;
  }
  if (!dot) return [24, 24];
  return [dot.left + dot.width / 2, dot.top + dot.height / 2];
}

function getLayer(): HTMLDivElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'flame-flip';
    layer.setAttribute('aria-hidden', 'true');
    layer.hidden = true;
    document.body.appendChild(layer);
  }
  return layer;
}

/** One flip. A trigger while one is running is ignored. */
export function runFlameFlip(): void {
  if (busy) return;
  busy = true;
  const el = getLayer();
  const done = () => {
    el.hidden = true;
    el.style.clipPath = '';
    busy = false;
  };

  if (isCalm()) {
    el.style.clipPath = 'none';
    el.hidden = false;
    window.setTimeout(done, HOLD_MS);
    return;
  }

  const [x, y] = origin();
  const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2;
  const at = `at ${x}px ${y}px`;
  const shut = `circle(0px ${at})`;
  const open = `circle(${far}px ${at})`;
  el.style.clipPath = shut;
  el.hidden = false;
  const a = el.animate(
    [
      { clipPath: shut, offset: 0, easing: EASE },
      { clipPath: open, offset: OPEN_MS / TOTAL_MS },
      { clipPath: open, offset: (OPEN_MS + HOLD_MS) / TOTAL_MS, easing: EASE },
      { clipPath: shut, offset: 1 },
    ],
    { duration: TOTAL_MS, fill: 'none' },
  );
  a.onfinish = done;
  a.oncancel = done;
}
