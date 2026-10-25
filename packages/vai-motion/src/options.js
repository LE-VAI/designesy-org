// @vai/motion — options
//
// How every principle reads its options.
//
// An option that is left out, or passed as undefined, takes the
// principle's default. A wrapper can pass its own unset options on:
// settleAll(els, { stagger }) with stagger undefined staggers by 80ms.
//
// An option whose default is a number must be a finite number, and
// duration must be 0 or more. Anything else ('80ms', null, NaN) throws a
// TypeError before the principle writes a style. A time that is not a
// number would make every frame's progress NaN; the browser ignores
// opacity 'NaN', so the element would stay hidden in its from-state while
// the promise resolved as if it had landed.

// Merge opts over a principle's defaults and check the numbers.
// @param defaults  the principle's defaultOptions
// @param opts      the caller's options (may be undefined or null)
// @returns a new options object
export function readOptions(defaults, opts) {
  const o = { ...defaults };
  for (const [key, value] of Object.entries(opts ?? {})) {
    if (value !== undefined) o[key] = value;
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value !== 'number') continue;
    const given = o[key];
    if (typeof given !== 'number' || !Number.isFinite(given)) {
      const got = typeof given === 'string' ? JSON.stringify(given) : String(given);
      throw new TypeError(`@vai/motion: ${key} must be a finite number; got ${got}`);
    }
  }
  if (o.duration < 0) throw new TypeError(`@vai/motion: duration must be 0 or more; got ${o.duration}`);
  return o;
}
