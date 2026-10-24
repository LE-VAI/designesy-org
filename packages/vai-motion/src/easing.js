// @vai/motion — easing
//
// One reader for the `ease` option of every principle. It turns a CSS
// easing value into a function of t, so the curve a principle declares is
// the curve it runs.
//
// Accepted values:
//   'cubic-bezier(x1, y1, x2, y2)'   four finite numbers, x1 and x2 in
//                                    [0, 1], as CSS requires
//   'linear' 'ease' 'ease-in' 'ease-out' 'ease-in-out'   (the CSS keywords)
//   a function (t) => progress       used as given, if it returns a
//                                    finite number
//
// The keywords are accepted for parity with CSS. The contract asks for the
// EASE tokens (src/reduced-motion.js) and rules out ease-in on UI motion.
//
// Anything else throws a TypeError, before the principle writes a style.
// It does not fall back to a default curve: a typo, or a token reference
// such as 'var(--ease-out)', would then run a curve nobody chose, and no
// one would see it. That silent substitution is the defect this module
// replaces. A function is called at 0 and 1 when it is read, and on every
// frame; a result that is not a finite number is a TypeError.
//
// t is clamped to [0, 1] before the curve sees it, so a frame that lands
// before a delayed start reads as progress 0.
//
// Accuracy: the bezier is solved by bisection on its parameter s, until the
// interval holding s is narrower than EASE_TOLERANCE (1e-7). The output is
// then within 3e-7 of the exact curve when y1 and y2 are in [0, 1] (the
// curve's slope in s is at most 3 there), and within a proportionally
// larger bound for curves that overshoot. One exception: where x stops
// rising, or nearly stops, partway along the curve (cubic-bezier(1, 0, 0, 1)
// at t = 0.5), rounding in x(s) limits any solver that works in doubles,
// and the error measured there is 3e-6. The ends are exact: 0 at t = 0,
// 1 at t = 1.

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
  if (typeof value === 'function') return readFunction(value);
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'linear') return clamp01;
    if (KEYWORDS.has(text)) return cubicBezier(...KEYWORDS.get(text));
    const m = CUBIC_BEZIER.exec(text);
    if (m) {
      const [x1, y1, x2, y2] = m.slice(1).map(Number);
      // '1e400' parses to Infinity, and an infinite y makes every output NaN.
      const finite = [x1, y1, x2, y2].every(Number.isFinite);
      if (finite && x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1) return cubicBezier(x1, y1, x2, y2);
    }
  }
  const got = typeof value === 'string' ? JSON.stringify(value) : typeof value;
  throw new TypeError(
    `@vai/motion: ease must be cubic-bezier(x1, y1, x2, y2) with x1 and x2 in [0, 1], ` +
      `one of linear, ease, ease-in, ease-out, ease-in-out, or a function of t; got ${got}`,
  );
}

// A function ease. A result that is not a finite number would be written
// as opacity 'NaN' or 'undefined', which the browser ignores, so the
// element would stay hidden while the promise resolved.
function readFunction(fn) {
  const ease = (t) => {
    const p = fn(clamp01(t));
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      throw new TypeError(`@vai/motion: an ease function must return a finite number; got ${String(p)} at t = ${clamp01(t)}`);
    }
    return p;
  };
  ease(0);
  ease(1);
  return ease;
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
  const y = (s) => ((ay * s + by) * s + cy) * s;

  // Find s where x(s) = t. x rises monotonically on [0, 1] because x1 and
  // x2 are in [0, 1], so bisection always converges: 24 halvings bring the
  // interval under 1e-7. It stops on the width of s, not on |x(s) - t|: where
  // the curve is steep, x can be within 1e-7 of t while s, and so the
  // output, is still far off.
  const solve = (t) => {
    let lo = 0;
    let hi = 1;
    while (hi - lo > EASE_TOLERANCE) {
      const mid = (lo + hi) / 2;
      if (x(mid) < t) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  return (t) => {
    const u = clamp01(t);
    if (u === 0 || u === 1) return u;
    return y(solve(u));
  };
}

// NaN maps to 0, so a NaN t cannot pass through as progress.
function clamp01(t) {
  return t >= 1 ? 1 : t > 0 ? t : 0;
}
