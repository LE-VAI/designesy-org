// @vai/motion — easing
//
// One reader for the `ease` option of every principle. It turns a CSS
// easing value into a function of t, so the curve a principle declares is
// the curve it runs.
//
// Accepted values:
//   'cubic-bezier(x1, y1, x2, y2)'   x1 and x2 in [0, 1], as CSS requires
//   'linear' 'ease' 'ease-in' 'ease-out' 'ease-in-out'   (the CSS keywords)
//   a function (t) => progress       used as given
//
// Anything else throws a TypeError, before the principle writes a style.
// It does not fall back to a default curve: a typo, or a token reference
// such as 'var(--ease-out)', would then run a curve nobody chose, and no
// one would see it. That silent substitution is the defect this module
// replaces.
//
// t is clamped to [0, 1] before the curve sees it, so a frame that lands
// before a delayed start reads as progress 0.
//
// Accuracy: the bezier is solved for x by Newton's method, with bisection
// as the fallback, until x is within EASE_TOLERANCE (1e-7) of t. The ends
// are exact: 0 at t = 0, 1 at t = 1.

export const EASE_TOLERANCE = 1e-7;

// CSS Easing Functions Level 1, the keyword values.
const KEYWORDS = new Map([
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-in', [0.42, 0, 1, 1]],
  ['ease-out', [0, 0, 0.58, 1]],
  ['ease-in-out', [0.42, 0, 0.58, 1]],
]);

const NUMBER = '\\s*([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?)\\s*';
const CUBIC_BEZIER = new RegExp(`^cubic-bezier\\(${NUMBER},${NUMBER},${NUMBER},${NUMBER}\\)$`);

// Read an `ease` option.
// @param value  CSS easing string, or a function of t
// @returns (t: number) => number
export function readEase(value) {
  if (typeof value === 'function') return (t) => value(clamp01(t));
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'linear') return clamp01;
    if (KEYWORDS.has(text)) return cubicBezier(...KEYWORDS.get(text));
    const m = CUBIC_BEZIER.exec(text);
    if (m) {
      const [x1, y1, x2, y2] = m.slice(1).map(Number);
      if (x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1) return cubicBezier(x1, y1, x2, y2);
    }
  }
  const got = typeof value === 'string' ? JSON.stringify(value) : typeof value;
  throw new TypeError(
    `@vai/motion: ease must be cubic-bezier(x1, y1, x2, y2) with x1 and x2 in [0, 1], ` +
      `one of linear, ease, ease-in, ease-out, ease-in-out, or a function of t; got ${got}`,
  );
}

function cubicBezier(x1, y1, x2, y2) {
  // Each axis as a polynomial in s: ((a·s + b)·s + c)·s, from (0,0) to (1,1).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s) => ((ax * s + bx) * s + cx) * s;
  const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
  const y = (s) => ((ay * s + by) * s + cy) * s;

  // Find s where x(s) = t. x rises monotonically on [0, 1] because x1 and
  // x2 are in [0, 1], so bisection always converges.
  const solve = (t) => {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = x(s) - t;
      if (Math.abs(err) < EASE_TOLERANCE) return s;
      const slope = dx(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= err / slope;
      if (s < 0 || s > 1) break;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 60; i++) {
      const err = x(s) - t;
      if (Math.abs(err) < EASE_TOLERANCE) break;
      if (err > 0) hi = s;
      else lo = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (t) => {
    const u = clamp01(t);
    if (u === 0 || u === 1) return u;
    return y(solve(u));
  };
}

function clamp01(t) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}
