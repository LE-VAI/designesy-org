// @vai/motion — frame loop
//
// The one requestAnimationFrame loop the principles draw on.
//
// draw(t) is called once per animation frame, with t the linear progress
// from `start` (a performance.now() time) over `duration` ms, clamped to
// [0, 1]. Before start, t is 0. The last call has t = 1. With duration 0,
// t goes from 0 to 1 on the first frame at or after start.
//
// One run per element: a new run on an element (frames() or claim())
// stops the run before it, which draws nothing more. Two runs would
// otherwise write the same styles on alternate frames.
//
// The promise resolves true after the t = 1 frame, and false if the run
// stopped first: a newer run took the element, or live() returned false.
// If draw throws (for example, an ease function that returns NaN), no
// further frame is drawn and the promise rejects with that error. It never
// stays pending.

const current = new WeakMap(); // element → its newest run

// Mark a new run on an element, stopping any older one before its next
// frame. A principle that lands at once, with no frames, calls this.
// @param el  the element the run writes to
// @returns the new run
export function claim(el) {
  const run = {};
  current.set(el, run);
  return run;
}

// @param el        the element the run writes to
// @param start     performance.now() time at which t leaves 0
// @param duration  ms from start to t = 1 (0 or more)
// @param draw      (t) => void, writes the frame's styles
// @param live      () => boolean, read before each frame; false stops the run
// @returns Promise<boolean>  true when it reached t = 1, false if stopped
export function frames(el, start, duration, draw, live = () => true) {
  const run = claim(el);
  return new Promise((resolve, reject) => {
    const tick = (now) => {
      if (current.get(el) !== run || !live()) {
        resolve(false);
        return;
      }
      const t =
        duration > 0 ? Math.min(1, Math.max(0, (now - start) / duration)) : now >= start ? 1 : 0;
      try {
        draw(t);
      } catch (err) {
        reject(err);
        return;
      }
      if (t < 1) requestAnimationFrame(tick);
      else resolve(true);
    };
    requestAnimationFrame(tick);
  });
}
