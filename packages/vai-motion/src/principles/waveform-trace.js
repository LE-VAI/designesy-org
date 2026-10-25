// @vai/motion — principle: waveform-trace
//
// A data line PLOTS itself across the surface — a yellow trace drawing
// itself left-to-right, SETI/radio-wave inspired (per 37signals direction).
// The signal arrives and stays. It does not scan, it does not sweep.
//
// Retired: scan-beam / signal-sweep — matched 3 named 2026 slop tells
// (fake-liveness pulse, decorative motion without meaning, generic tech trope).
// Every AI generator produces scanner beams by default. This is the authored
// alternative: a trace with direction, meaning, and a resting state.
//
// Contract backing: motion §ten_standards (entrance, opacity, transform-only)
// Provenance: VAI aesthetic audit 2026-08-09
// Reduced motion: tier 1 — REMOVE (decorative; the arrival matters, not the plot).
// The delay goes too: the trace is drawn at once.

import { EASE, prefersReducedMotion, resolveDuration } from '../reduced-motion.js';
import { readEase } from '../easing.js';
import { readOptions } from '../options.js';
import { claim, frames } from '../frames.js';

export const waveformTrace = {
  name: 'waveform-trace',
  tier: 'tier1',
  description:
    'A data line plots itself across the surface — signal arrives, then rests.',
  defaultOptions: {
    duration: 600, // contract --duration (primary entrance)
    ease: EASE.default,
    delay: 0,
    stroke: 'currentColor',
    strokeWidth: 2,
  },

  // Animate an SVG path drawing itself (stroke-dashoffset trick). The path
  // stays hidden for `delay` ms. With duration 0 it is drawn at once, or
  // after `delay` if there is one.
  // @param path  SVGPathElement
  // @param opts  { duration, ease, delay, stroke, strokeWidth }
  // @returns Promise<void>
  async plotPath(path, opts = {}) {
    const o = readOptions(this.defaultOptions, opts);
    const ease = readEase(o.ease);
    const duration = resolveDuration(this.tier, o.duration);
    const delay = prefersReducedMotion() ? 0 : o.delay;
    const length = path.getTotalLength();
    path.style.stroke = o.stroke;
    path.style.strokeWidth = String(o.strokeWidth);
    path.style.fill = 'none';
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;

    if (duration === 0 && delay <= 0) {
      claim(path);
      path.style.strokeDashoffset = '0';
      return;
    }

    await frames(path, performance.now() + delay, duration, (t) => {
      path.style.strokeDashoffset = String(length * (1 - ease(t)));
    });
  },

  // Animate a container's left edge drawing a trace (CSS-based fallback for
  // non-SVG surfaces). Adds the .vai-waveform class. The trace stays at 0
  // for `delay` ms, as plotPath() does.
  // @param el     HTMLElement
  // @param opts   { duration, ease, delay }
  async drawLine(el, opts = {}) {
    const o = readOptions(this.defaultOptions, opts);
    const ease = readEase(o.ease);
    const duration = resolveDuration(this.tier, o.duration);
    const delay = prefersReducedMotion() ? 0 : o.delay;
    el.classList.add('vai-waveform');
    if (duration === 0 && delay <= 0) {
      claim(el);
      el.classList.add('vai-waveform--done');
      return;
    }
    const landed = await frames(el, performance.now() + delay, duration, (t) => {
      el.style.setProperty('--vai-trace-progress', String(ease(t)));
    });
    if (landed) el.classList.add('vai-waveform--done');
  },
};
