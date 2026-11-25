// Spring sampler: one closed-form response for a mass on a damped spring,
// read the same way by every consumer. The spring validator's readouts, its
// chart, its motion-budget row and the CSS it exports all read these
// functions, so no number on the page can disagree with the drawn curve.
//
// Units: stiffness k (N/m), damping coefficient c (N·s/m), mass m (kg); times
// in milliseconds. x(t) is the distance from rest, starting at 1 and at rest
// (x(0) = 1, x'(0) = 0). Progress is 1 - x(t): 0 at the start, 1 at rest.
// Pure: no DOM, no React, no imports.

export interface Spring {
  stiffness: number;
  damping: number;
  mass: number;
}

export type SpringClass = 'underdamped' | 'critically-damped' | 'overdamped';

/** Settle readout: the last time the response leaves +/-2% of rest. */
export const SETTLE_BAND = 0.02;
/** Export duration: the last time the response leaves +/-0.1% of rest. */
export const REST_BAND = 0.001;
/** Step of the backward scan for the last exit, in ms. */
export const SCAN_STEP_MS = 0.1;
/** A damping ratio this close to 1 is read as critically damped. */
export const CRITICAL_TOLERANCE = 1e-6;
export const CHART_MIN_MS = 500;
export const CHART_MAX_MS = 3000;

/** A spring from a damping ratio and a response time in seconds:
 *  k = (2*pi/response)^2 * m and c = 4*pi*ratio*m/response. This is the
 *  response and damping-ratio convention react-spring's AnimationConfig
 *  uses. The contract names a damping ratio and a response for its springs
 *  but no k/c mapping, so this conversion is ours. With ratio = 1 - bounce it
 *  reproduces Apple's worked example, Spring(duration: 0.5, bounce: 0.3)
 *  giving stiffness 157.9 and damping 17.6. */
export function springFromResponse(dampingRatio: number, responseS: number, mass = 1): Spring {
  const omega = (2 * Math.PI) / responseS;
  return { stiffness: omega * omega * mass, damping: 2 * dampingRatio * omega * mass, mass };
}

/** The damping coefficient that gives a stiffness the damping ratio asked
 *  for: c = 2 * ratio * sqrt(k * m). Material's spring tokens give stiffness
 *  and damping ratio. */
export function dampingForRatio(stiffness: number, ratio: number, mass = 1): number {
  return 2 * ratio * Math.sqrt(stiffness * mass);
}

interface Model {
  valid: boolean;
  omega0: number;
  zeta: number;
  cls: SpringClass;
  omegaD: number; // underdamped only
  a: number; // overdamped: the slow pole
  b: number; // overdamped: the fast pole
}

function modelOf(s: Spring): Model {
  const { stiffness: k, damping: c, mass: m } = s;
  const valid = Number.isFinite(k) && Number.isFinite(c) && Number.isFinite(m) && k > 0 && m > 0 && c >= 0;
  if (!valid) return { valid, omega0: NaN, zeta: NaN, cls: 'overdamped', omegaD: 0, a: 0, b: 0 };
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (Math.abs(zeta - 1) < CRITICAL_TOLERANCE) {
    return { valid, omega0, zeta, cls: 'critically-damped', omegaD: 0, a: 0, b: 0 };
  }
  if (zeta < 1) {
    return { valid, omega0, zeta, cls: 'underdamped', omegaD: omega0 * Math.sqrt(1 - zeta * zeta), a: 0, b: 0 };
  }
  // Written as omega0 / (zeta + root) so the slow pole does not cancel.
  const root = Math.sqrt(zeta * zeta - 1);
  return { valid, omega0, zeta, cls: 'overdamped', omegaD: 0, a: omega0 / (zeta + root), b: omega0 * (zeta + root) };
}

/** Distance from rest at time t (seconds). */
function distance(md: Model, t: number): number {
  const { omega0: w, zeta: z } = md;
  if (md.cls === 'underdamped') {
    const wd = md.omegaD;
    return Math.exp(-z * w * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
  }
  if (md.cls === 'critically-damped') {
    return (1 + w * t) * Math.exp(-w * t);
  }
  const { a, b } = md;
  return (b * Math.exp(-a * t) - a * Math.exp(-b * t)) / (b - a);
}

/** Progress at tMs: 0 at the start, 1 at rest. Unclamped, so an overshoot
 *  reads above 1. */
export function progressAt(s: Spring, tMs: number): number {
  const md = modelOf(s);
  if (!md.valid) return NaN;
  return 1 - distance(md, tMs / 1000);
}

/** A time (seconds) past which |x| can no longer exceed the band. */
function horizonS(md: Model, band: number): number {
  const { omega0: w, zeta: z } = md;
  if (md.cls === 'underdamped') {
    // |x| <= e^(-z*w*t) / sqrt(1 - z^2)
    return Math.max(0, Math.log(1 / (band * Math.sqrt(1 - z * z))) / (z * w));
  }
  if (md.cls === 'critically-damped') {
    // (1 + u) e^(-u/2) <= 2 e^(-1/2) < 1.214, so x <= 1.214 e^(-u/2)
    return Math.max(0, (2 * Math.log(1.214 / band)) / w);
  }
  // x <= (b / (b - a)) e^(-a t)
  const { a, b } = md;
  return Math.max(0, Math.log(b / ((b - a) * band)) / a);
}

function lastExit(md: Model, band: number): number {
  if (md.cls === 'underdamped' && md.zeta === 0) return Infinity;
  const step = SCAN_STEP_MS / 1000;
  let i = Math.ceil(horizonS(md, band) / step);
  while (i > 0 && Math.abs(distance(md, i * step)) <= band) i--;
  if (i === 0 && Math.abs(distance(md, 0)) <= band) return 0;
  // The crossing lies between sample i (outside) and i + 1 (inside).
  let lo = i * step;
  let hi = (i + 1) * step;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(distance(md, mid)) > band) lo = mid;
    else hi = mid;
  }
  return hi * 1000;
}

/** The last time (ms) the response leaves +/-band of rest, read on the
 *  analytic response: a backward scan from a horizon past which no exit is
 *  possible, in 0.1 ms steps, then bisected inside the last step. Infinity
 *  when the spring has no damping. */
export function lastExitMs(s: Spring, band: number): number {
  const md = modelOf(s);
  if (!md.valid) return NaN;
  return lastExit(md, band);
}

/** First time (seconds) progress reaches the target, on [lo, hi], where
 *  progress rises monotonically. */
function crossing(md: Model, target: number, lo: number, hi: number): number {
  for (let n = 0; n < 60; n++) {
    const mid = (lo + hi) / 2;
    if (1 - distance(md, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface SpringReading {
  valid: boolean;
  omega0: number;
  zeta: number;
  /** 0 unless underdamped. */
  omegaD: number;
  classification: SpringClass;
  /** e^(-pi*zeta/sqrt(1-zeta^2)) * 100; 0 unless underdamped. */
  overshootPct: number;
  /** pi/omegaD in ms; 0 unless underdamped. */
  peakMs: number;
  /** Last exit from +/-2% of rest. */
  settleMs: number;
  /** Last exit from +/-0.1% of rest: the exported curve's duration. */
  restMs: number;
  /** 10% to 90% of the way, for every class. */
  riseMs: number;
}

export function readSpring(s: Spring): SpringReading {
  const md = modelOf(s);
  if (!md.valid) {
    return {
      valid: false, omega0: NaN, zeta: NaN, omegaD: 0, classification: 'overdamped',
      overshootPct: 0, peakMs: 0, settleMs: 0, restMs: 0, riseMs: 0,
    };
  }
  const under = md.cls === 'underdamped';
  // Progress rises monotonically up to the first peak (underdamped) or, for
  // the other classes, all the way; the 10% band horizon is past 90%.
  const upper = under ? Math.PI / md.omegaD : horizonS(md, 0.1);
  const t10 = crossing(md, 0.1, 0, upper);
  const t90 = crossing(md, 0.9, 0, upper);
  return {
    valid: true,
    omega0: md.omega0,
    zeta: md.zeta,
    omegaD: md.omegaD,
    classification: md.cls,
    overshootPct: under ? Math.exp((-Math.PI * md.zeta) / Math.sqrt(1 - md.zeta * md.zeta)) * 100 : 0,
    peakMs: under ? (Math.PI / md.omegaD) * 1000 : 0,
    settleMs: lastExit(md, SETTLE_BAND),
    restMs: lastExit(md, REST_BAND),
    riseMs: (t90 - t10) * 1000,
  };
}

/** The chart's time domain: long enough for the whole exported curve (the
 *  rest point) and a quarter past the settle point, from 500 ms to 3 s. */
export function chartDomainMs(r: SpringReading): number {
  if (!Number.isFinite(r.settleMs)) return CHART_MAX_MS;
  return Math.min(Math.max(Math.ceil(r.restMs), 1.25 * r.settleMs, CHART_MIN_MS), CHART_MAX_MS);
}

/** Evenly spaced progress samples over the domain, unclamped. */
export function sampleResponse(s: Spring, durationMs: number, samples: number): { t: number; x: number }[] {
  const md = modelOf(s);
  const out: { t: number; x: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * durationMs;
    out.push({ t, x: md.valid ? 1 - distance(md, t / 1000) : NaN });
  }
  return out;
}

export type LinearResult =
  | { ok: true; durationMs: number; easing: string; stops: number }
  | { ok: false; reason: 'never' | 'too-long' | 'too-many-stops' };

const round = (v: number, places: number) => {
  const r = Number(v.toFixed(places));
  return r === 0 ? 0 : r; // no "-0"
};

/** The spring as a CSS linear() easing, timed to its rest point.
 *  Stops are chosen so the rounded curve stays within `bound` of the true
 *  progress at every sample (at most about 2000 samples across the
 *  duration). Values are rounded to 3 decimals and positions to 3 decimal
 *  percent; the first stop is 0 and the last is exactly 1. */
export function linearEasing(
  s: Spring,
  r: SpringReading,
  opts: { bound?: number; maxStops?: number; maxMs?: number } = {},
): LinearResult {
  const bound = opts.bound ?? 0.002;
  const maxStops = opts.maxStops ?? 120;
  const maxMs = opts.maxMs ?? CHART_MAX_MS;
  if (!r.valid || !Number.isFinite(r.restMs)) return { ok: false, reason: 'never' };
  const T = Math.max(1, Math.ceil(r.restMs));
  if (T > maxMs) return { ok: false, reason: 'too-long' };
  const md = modelOf(s);
  const n = Math.min(2000, Math.max(200, Math.ceil(T / 0.5)));
  const ts: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * T;
    ts.push(t);
    ys.push(1 - distance(md, t / 1000));
  }
  // A stop at sample i: [value, position in ms after rounding the percent].
  const stopAt = (i: number): [number, number] => {
    if (i === 0) return [0, 0];
    if (i === n) return [1, T];
    return [round(ys[i], 3), (round((ts[i] / T) * 100, 3) / 100) * T];
  };
  const fits = (i: number, j: number) => {
    const [v0, p0] = stopAt(i);
    const [v1, p1] = stopAt(j);
    for (let k = i; k <= j; k++) {
      const u = p1 > p0 ? Math.min(1, Math.max(0, (ts[k] - p0) / (p1 - p0))) : 0;
      if (Math.abs(v0 + (v1 - v0) * u - ys[k]) > bound) return false;
    }
    return true;
  };
  const chosen = [0];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    // Even one sample apart, rounding can miss the bound on a steep stretch;
    // such a curve would need finer stops than this export writes.
    if (!fits(i, j)) return { ok: false, reason: 'too-many-stops' };
    while (j < n && fits(i, j + 1)) j++;
    chosen.push(j);
    i = j;
    if (chosen.length > maxStops) return { ok: false, reason: 'too-many-stops' };
  }
  const parts = chosen.map((k) => {
    if (k === 0) return '0';
    if (k === n) return '1';
    const [v] = stopAt(k);
    return `${v} ${round((ts[k] / T) * 100, 3)}%`;
  });
  return { ok: true, durationMs: T, easing: `linear(${parts.join(', ')})`, stops: chosen.length };
}

/** Progress of a cubic-bezier(x1, y1, x2, y2) easing at time fraction p. */
export function cubicBezierProgress(p: number, x1: number, y1: number, x2: number, y2: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const bez = (u: number, a: number, b: number) => 3 * a * u * (1 - u) * (1 - u) + 3 * b * u * u * (1 - u) + u * u * u;
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 50; n++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < p) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

/** A time in whole milliseconds; "never" when it is not finite. */
export function formatMs(ms: number): string {
  return Number.isFinite(ms) ? `${Math.round(ms)}ms` : 'never';
}
