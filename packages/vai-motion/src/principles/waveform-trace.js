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
// Reduced motion: tier 1 — REMOVE (decorative; the arrival matters, not the plot)

import { EASE, resolveDuration } from '../reduced-motion.js';

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

  // Animate an SVG path drawing itself (stroke-dashoffset trick).
  // @param path  SVGPathElement
  // @param opts  { duration, ease, delay, stroke, strokeWidth }
  // @returns Promise<void>
  async plotPath(path, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    const length = path.getTotalLength();
    path.style.stroke = o.stroke;
    path.style.strokeWidth = String(o.strokeWidth);
    path.style.fill = 'none';
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;

    const duration = resolveDuration(this.tier, o.duration);
    if (duration === 0) {
      path.style.strokeDashoffset = '0';
      return;
    }

    const start = performance.now() + o.delay;
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        path.style.strokeDashoffset = String(length * (1 - eased));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  },

  // Animate a container's left edge drawing a trace (CSS-based fallback for
  // non-SVG surfaces). Adds a temporary .vai-waveform class.
  // @param el     HTMLElement
  // @param opts   { duration, ease, delay }
  async drawLine(el, opts = {}) {
    const o = { ...this.defaultOptions, ...opts };
    const duration = resolveDuration(this.tier, o.duration);
    if (duration === 0) {
      el.classList.add('vai-waveform');
      el.classList.add('vai-waveform--done');
      return;
    }
    el.classList.add('vai-waveform');
    const start = performance.now() + o.delay;
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        el.style.setProperty('--vai-trace-progress', String(eased));
        if (t < 1) requestAnimationFrame(tick);
        else {
          el.classList.add('vai-waveform--done');
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  },
};

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
