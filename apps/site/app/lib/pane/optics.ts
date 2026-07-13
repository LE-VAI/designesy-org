/**
 * Pane optics — Designesy true-glass displacement field.
 *
 * Physics stack (ingested, not copied):
 * - kube.io: Snell–Descartes refraction, convex squircle bezel, RG displacement maps
 * - Outpace / Aave: blob: URLs for feImage (WebKit rejects data:), sRGB filters
 * - jh3yy / rdev: edge-weighted displacement, optional chromatic split
 *
 * Designesy differences:
 * - Institutional restraint: low default scale, dark foundation fills
 * - Progressive tiers: frost everywhere; refraction only when capable
 * - Cached maps by shape key; no per-frame rebuild for static chrome
 */

export type PaneProfile = 'convex' | 'squircle' | 'lip' | 'frost';

export type PaneMapOptions = {
  width: number;
  height: number;
  /** Corner radius in px */
  radius: number;
  /** Bezel width as fraction of min(side), 0.04–0.22 typical */
  bezel: number;
  /** Surface profile for rim bend */
  profile?: PaneProfile;
  /** Refractive index of glass (air=1). Real glass ~1.5 */
  ior?: number;
};

export type PaneMapResult = {
  /** blob: URL for feImage (Safari-safe) */
  url: string;
  /** Max displacement magnitude in px (use as feDisplacementMap scale) */
  scale: number;
  width: number;
  height: number;
  revoke: () => void;
};

const mapCache = new Map<string, PaneMapResult>();

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function smootherstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Height profile along normalized distance from outer edge (0) to flat (1). */
function surfaceHeight(x: number, profile: PaneProfile): number {
  const t = clamp(x, 0, 1);
  // Convex circle dome
  const convex = Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
  // Squircle: softer flat→curve (Apple-like)
  const squircle = (1 - (1 - t) ** 4) ** 0.25;
  const concave = 1 - squircle;
  if (profile === 'convex') return convex;
  if (profile === 'lip') {
    return convex * (1 - smootherstep(t)) + concave * smootherstep(t);
  }
  if (profile === 'frost') {
    // Almost flat — residual rim only for subtle edge bend
    return squircle * 0.35;
  }
  return squircle;
}

/**
 * Approximate displacement magnitude from surface slope via Snell's law.
 * Incident ray assumed orthogonal to background plane (kube simplification).
 */
function bendFromDistance(distNorm: number, profile: PaneProfile, ior: number): number {
  const delta = 0.002;
  const y1 = surfaceHeight(distNorm - delta, profile);
  const y2 = surfaceHeight(distNorm + delta, profile);
  const slope = (y2 - y1) / (2 * delta);
  const thetaI = Math.atan(Math.abs(slope));
  const sinT = Math.sin(thetaI) / ior;
  if (sinT >= 1) return 0; // TIR — skip (our UI glass is thin)
  const thetaT = Math.asin(sinT);
  return Math.sin(thetaI - thetaT);
}

/**
 * Signed distance to rounded-rect interior (negative outside, positive inside).
 * We care about distance from outer edge inward across the bezel band.
 */
function distToOuterEdge(
  px: number,
  py: number,
  w: number,
  h: number,
  r: number,
): number {
  // Distance from point to outside of rounded rect ≈ 0 on edge, >0 inside
  const rr = Math.min(r, w / 2, h / 2);
  const cx = clamp(px, rr, w - rr);
  const cy = clamp(py, rr, h - rr);
  // If inside the inner rect (away from corners), use min distance to sides
  const insideX = px > rr && px < w - rr;
  const insideY = py > rr && py < h - rr;
  if (insideX && insideY) {
    return Math.min(px, py, w - px, h - py);
  }
  // Corner regions: distance from corner circle center
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  // Outside rounded corner → negative; inside → rr - d from edge inward... 
  // Edge is at distance rr from corner center. Inward depth = rr - d when d < rr.
  if (d <= rr) return rr - d;
  return -(d - rr);
}

function cacheKey(opts: PaneMapOptions): string {
  const p = opts.profile ?? 'squircle';
  const ior = opts.ior ?? 1.5;
  return [
    Math.round(opts.width),
    Math.round(opts.height),
    Math.round(opts.radius),
    (opts.bezel * 1000).toFixed(0),
    p,
    ior.toFixed(2),
  ].join('x');
}

/**
 * Build an RG displacement map image for a rounded pane.
 * R = X offset, G = Y offset, 128 = neutral. B reserved for specular mask.
 */
export function buildPaneMap(options: PaneMapOptions): PaneMapResult {
  const key = cacheKey(options);
  const hit = mapCache.get(key);
  if (hit) return hit;

  const width = Math.max(8, Math.round(options.width));
  const height = Math.max(8, Math.round(options.height));
  const radius = Math.max(0, options.radius);
  const profile = options.profile ?? 'squircle';
  const ior = options.ior ?? 1.5;
  const minSide = Math.min(width, height);
  const bezelPx = clamp(options.bezel, 0.03, 0.35) * minSide;

  // Offscreen canvas
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

  const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d', {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

  if (!ctx) {
    // Degenerate empty map
    const empty = new Blob();
    const url = URL.createObjectURL(empty);
    const result: PaneMapResult = {
      url,
      scale: 0,
      width,
      height,
      revoke: () => {
        URL.revokeObjectURL(url);
        mapCache.delete(key);
      },
    };
    mapCache.set(key, result);
    return result;
  }

  const image = ctx.createImageData(width, height);
  const data = image.data;

  // First pass: compute vector field + max magnitude
  const vectors = new Float32Array(width * height * 2);
  let maxMag = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 2;
      const depth = distToOuterEdge(x + 0.5, y + 0.5, width, height, radius);

      if (depth < 0) {
        // Outside pane — no displacement
        vectors[i] = 0;
        vectors[i + 1] = 0;
        continue;
      }

      // Distance from edge normalized across bezel (0 at edge → 1 at flat)
      const distNorm = clamp(depth / bezelPx, 0, 1);

      // In the flat center, bend → 0
      const bend = distNorm >= 1 ? 0 : bendFromDistance(distNorm, profile, ior);

      // Direction: inward normal ≈ from nearest edge toward center
      const nx = x + 0.5 - width / 2;
      const ny = y + 0.5 - height / 2;
      // Prefer true edge gradient: push along outward normal * -1 (inward)
      // Approximate outward normal via distance field gradient
      const e = 0.75;
      const ddx =
        distToOuterEdge(x + 0.5 + e, y + 0.5, width, height, radius) -
        distToOuterEdge(x + 0.5 - e, y + 0.5, width, height, radius);
      const ddy =
        distToOuterEdge(x + 0.5, y + 0.5 + e, width, height, radius) -
        distToOuterEdge(x + 0.5, y + 0.5 - e, width, height, radius);
      let gx = ddx;
      let gy = ddy;
      const glen = Math.hypot(gx, gy) || 1;
      gx /= glen;
      gy /= glen;

      // Displacement points along surface gradient (rim bend)
      // Magnitude scaled later; direction is gradient of depth (inward)
      const mag = bend * bezelPx;
      // Outward visual refraction for convex glass pushes content toward center
      const vx = -gx * mag;
      const vy = -gy * mag;
      vectors[i] = vx;
      vectors[i + 1] = vy;
      const m = Math.hypot(vx, vy);
      if (m > maxMag) maxMag = m;

      // Silence unused center vec warning path
      void nx;
      void ny;
    }
  }

  // Avoid divide-by-zero; tiny maps
  if (maxMag < 0.0001) maxMag = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vi = (y * width + x) * 2;
      const pi = (y * width + x) * 4;
      const vx = vectors[vi] / maxMag;
      const vy = vectors[vi + 1] / maxMag;
      // 128 neutral; map [-1,1] → [1,255]
      data[pi] = clamp(Math.round(128 + vx * 127), 0, 255);
      data[pi + 1] = clamp(Math.round(128 + vy * 127), 0, 255);
      // Blue = edge energy (specular helper / debug)
      const edge = Math.hypot(vectors[vi], vectors[vi + 1]) / maxMag;
      data[pi + 2] = clamp(Math.round(edge * 255), 0, 255);
      data[pi + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  let blob: Blob;
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    // OffscreenCanvas — sync path unavailable; use toDataURL fallback via temporary
    // We need sync for first paint: draw to HTML canvas instead when Offscreen.
  }

  // Always go through HTML canvas for reliable toBlob sync-ish via dataURL→blob
  const htmlCanvas = document.createElement('canvas');
  htmlCanvas.width = width;
  htmlCanvas.height = height;
  const hctx = htmlCanvas.getContext('2d');
  if (!hctx) {
    const url = URL.createObjectURL(new Blob());
    const result: PaneMapResult = {
      url,
      scale: maxMag,
      width,
      height,
      revoke: () => {
        URL.revokeObjectURL(url);
        mapCache.delete(key);
      },
    };
    mapCache.set(key, result);
    return result;
  }
  hctx.putImageData(image, 0, 0);

  // Prefer blob synchronously via dataURL decode (WebKit-safe for feImage)
  const dataUrl = htmlCanvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1] ?? '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  blob = new Blob([arr], { type: 'image/png' });

  const url = URL.createObjectURL(blob);
  const result: PaneMapResult = {
    url,
    scale: maxMag,
    width,
    height,
    revoke: () => {
      URL.revokeObjectURL(url);
      mapCache.delete(key);
    },
  };
  mapCache.set(key, result);
  return result;
}

/** Preset map sizes for institutional chrome (avoid per-element rebuilds). */
export const PANE_PRESETS = {
  /** Sticky topbar sheet */
  sheet: { width: 512, height: 96, radius: 0, bezel: 0.14, profile: 'frost' as PaneProfile },
  /** Card / field */
  card: { width: 320, height: 200, radius: 12, bezel: 0.12, profile: 'squircle' as PaneProfile },
  /** Chip / toggle / pill */
  chip: { width: 160, height: 48, radius: 24, bezel: 0.22, profile: 'squircle' as PaneProfile },
  /** Soft lens for lab demos */
  lens: { width: 280, height: 120, radius: 28, bezel: 0.18, profile: 'squircle' as PaneProfile },
} as const;

export function clearPaneMapCache() {
  for (const entry of mapCache.values()) {
    try {
      entry.revoke();
    } catch {
      // ignore
    }
  }
  mapCache.clear();
}
