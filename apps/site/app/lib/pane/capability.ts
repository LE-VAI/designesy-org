/**
 * Pane capability detection — progressive glass tiers.
 *
 * tier 0: opaque / solid (reduced-transparency or no backdrop-filter)
 * tier 1: frost (blur + edge) — Safari, Firefox, Chromium
 * tier 2: refract (SVG filter as backdrop-filter) — Chromium primarily
 */

export type PaneTier = 0 | 1 | 2;

let cached: PaneTier | null = null;

export function detectPaneTier(): PaneTier {
  if (typeof window === 'undefined') return 0;
  if (cached !== null) return cached;

  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
    cached = 0;
    return cached;
  }

  const probe = document.createElement('div');
  probe.style.backdropFilter = 'blur(1px)';
  const supportsBlur =
    probe.style.backdropFilter === 'blur(1px)' ||
    // @ts-expect-error webkit prefix
    probe.style.webkitBackdropFilter === 'blur(1px)' ||
    CSS.supports?.('backdrop-filter', 'blur(1px)') === true;

  if (!supportsBlur) {
    cached = 0;
    return cached;
  }

  const ua = navigator.userAgent;
  const isSafari =
    /\bSafari\//.test(ua) &&
    !/\bChrome\//.test(ua) &&
    !/\bChromium\//.test(ua) &&
    !/\bEdg\//.test(ua);
  const isFirefox = /\bFirefox\//.test(ua);

  if (isSafari || isFirefox) {
    cached = 1;
    return cached;
  }

  if (
    /\bChrome\//.test(ua) ||
    /\bChromium\//.test(ua) ||
    /\bEdg\//.test(ua) ||
    /\bOPR\//.test(ua)
  ) {
    cached = 2;
    return cached;
  }

  cached = 1;
  return cached;
}

export function resetPaneCapabilityCache() {
  cached = null;
}
