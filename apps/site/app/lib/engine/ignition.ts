'use client';

// The loading ignition (brand D51, rulings D54): one Azure dot per score
// loader, the run line's lone dot or the four-engine instrument's mark.
//
//   running   the dot breathes: scale 1 -> .86 -> 1 and the fill's opacity
//             1 -> .72 -> 1, 1600ms ease-in-out, looped (globals.css,
//             ig-breathe). Only the fill fades: on light the 1px rim stays at
//             full strength and full width in every frame. The loop is CSS,
//             so the site's pause and reduced motion stop it live.
//   lands     the dot ignites: 320ms, hue swept in OKLCH from Azure (--signal,
//             hue 250.8) up through violet, magenta and red to the flame
//             (--activation, hue 46.7 + 360), lightness and chroma alongside,
//             easeOutQuart. A straight sRGB blend between these two near
//             inverses passes through grey, so the colour is computed per
//             frame here. On light the rim sweeps with it, from
//             --signal-access to --activation-ink, so it never drops out. One
//             flame ring rings out 120ms in (scale 1 -> 1.9, opacity .9 -> 0,
//             700ms easeOutExpo).
//   holds     the flame stays until 1400ms after ignition (320 + 1080), then
//             swaps straight back to Azure, and the fill (never the rim)
//             settles from .55 to 1 over 400ms. No sweep back; breathing
//             resumes only with a new run.
//   calm      reduced motion, or the site's "Pause motion": no breathing, no
//             sweep, no ring, no fade. The flame arrives as an instant swap,
//             holds, and swaps back to Azure.
//
// Orange only when a result lands (D16): an error, or a run with no verdict,
// stops the breath and leaves the dot Azure. One ignition per landing, page
// wide (claimLanding). No colour is written here: every end is read from the
// tokens on the dot itself.

import { useEffect, useRef, type RefObject } from 'react';
import type { Phase } from './types';

export const SWEEP_MS = 320;
export const HALO_DELAY_MS = 120;
export const HALO_MS = 700;
export const COOL_AT_MS = 1400;
export const SETTLE_MS = 400;

const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
const easeOutQuart = (k: number) => 1 - Math.pow(1 - k, 4);

type Oklch = [number, number, number];

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** #rrggbb to OKLCH (L, C, hue in degrees). Null for anything that is not a
    six-digit hex, so a token in another format falls back to the calm path. */
export function hexToOklch(hex: string): Oklch | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => toLin(parseInt(m[1].slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/** OKLCH to #rrggbb, each channel clipped to the sRGB gamut. */
export function oklchToHex(L: number, C: number, H: number): string {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, toGam(v))) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** The sweep's colour at ms after ignition. The hue climbs from the cool end
    to the hot end plus a full turn, so it passes violet, magenta and red;
    the last frame is the hot token itself, exactly. */
export function sweepAt(ms: number, cool: Oklch, hot: Oklch, hotHex: string): string {
  const k = Math.min(1, Math.max(0, ms / SWEEP_MS));
  if (k >= 1) return hotHex;
  const e = easeOutQuart(k);
  const h0 = cool[2];
  const h1 = hot[2] + (hot[2] < h0 ? 360 : 0);
  return oklchToHex(cool[0] + (hot[0] - cool[0]) * e, cool[1] + (hot[1] - cool[1]) * e, (h0 + (h1 - h0) * e) % 360);
}

/** Reduced motion, or the site's "Pause motion" (html[data-motion=paused]). */
export function isCalm(): boolean {
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.motion === 'paused'
  );
}

let landing = false;

/**
 * One ignition per result landing, page wide. A landing is one React commit:
 * every lamp that sees it runs its effect in the same synchronous flush,
 * before any microtask, so the first lamp claims it and the rest stay Azure.
 * The claim lapses at the next microtask, ready for the next landing.
 */
export function claimLanding(): boolean {
  if (landing) return false;
  landing = true;
  queueMicrotask(() => {
    landing = false;
  });
  return true;
}

/**
 * Lights the dot when a run lands with a verdict. The dot carries
 * data-lamp: absent at rest (Azure), "sweep" while the colours are written
 * per frame (--ig-fill, and --ig-rim for the light rim), "lit" while the
 * flame holds. The fill is the dot's ::before; the halo is the flame ring
 * behind the dot.
 */
export function useIgnition(
  dotRef: RefObject<HTMLElement | null>,
  haloRef: RefObject<HTMLElement | null>,
  phase: Phase,
  landed: boolean,
  enabled: boolean,
) {
  const was = useRef(phase);

  useEffect(() => {
    const before = was.current;
    was.current = phase;
    const dot = dotRef.current;
    const halo = haloRef.current;
    if (!enabled || !dot || !halo) return;
    if (!(phase === 'done' && before === 'running' && landed)) return;
    if (!claimLanding()) return;

    const css = getComputedStyle(dot);
    const read = (name: string) => css.getPropertyValue(name).trim();
    const fillHex = [read('--signal'), read('--activation')];
    const rimHex = [read('--signal-access'), read('--activation-ink')];
    const fill = fillHex.map(hexToOklch);
    const rim = rimHex.map(hexToOklch);
    const timers: number[] = [];
    const anims: Animation[] = [];
    let raf = 0;
    let cancelled = false;

    const write = (fillValue: string, rimValue: string) => {
      dot.style.setProperty('--ig-fill', fillValue);
      dot.style.setProperty('--ig-rim', rimValue);
    };
    const rest = () => {
      dot.removeAttribute('data-lamp');
      dot.style.removeProperty('--ig-fill');
      dot.style.removeProperty('--ig-rim');
    };

    if (isCalm() || fill.includes(null) || rim.includes(null)) {
      // An instant swap each way: no sweep, no ring, no fade.
      dot.setAttribute('data-lamp', 'lit');
      timers.push(window.setTimeout(rest, COOL_AT_MS));
    } else {
      const [fillCool, fillHot] = fill as Oklch[];
      const [rimCool, rimHot] = rim as Oklch[];
      const start = performance.now();
      dot.setAttribute('data-lamp', 'sweep');
      write(fillHex[0], rimHex[0]);
      const step = () => {
        if (cancelled) return;
        const t = performance.now() - start;
        if (t >= SWEEP_MS) {
          dot.style.removeProperty('--ig-fill');
          dot.style.removeProperty('--ig-rim');
          dot.setAttribute('data-lamp', 'lit');
          return;
        }
        write(sweepAt(t, fillCool, fillHot, fillHex[1]), sweepAt(t, rimCool, rimHot, rimHex[1]));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      anims.push(
        halo.animate(
          [
            { opacity: 0.9, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.9)' },
          ],
          { duration: HALO_MS, delay: HALO_DELAY_MS, easing: EXPO },
        ),
      );
      timers.push(
        window.setTimeout(() => {
          cancelAnimationFrame(raf);
          rest();
          // The fill settles; the rim, on light, is at full strength throughout.
          anims.push(
            dot.animate([{ opacity: 0.55 }, { opacity: 1 }], {
              duration: SETTLE_MS,
              easing: 'ease-out',
              pseudoElement: '::before',
            }),
          );
        }, COOL_AT_MS),
      );
    }

    // A new run (or leaving) before the cool: back to Azure at once, so the
    // breath starts from the resting dot.
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      anims.forEach((a) => a.cancel());
      rest();
    };
  }, [phase, landed, enabled, dotRef, haloRef]);
}
