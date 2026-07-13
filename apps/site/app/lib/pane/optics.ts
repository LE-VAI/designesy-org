/**
 * Pane optics — displacement field for true rim refraction.
 *
 * Map convention (SVG feDisplacementMap):
 *   R = X offset, G = Y offset, 128 = neutral, full swing ±127.
 * Edge-weighted field: center clear, rim bends hard (real glass tell).
 */

export type PaneProfile = 'convex' | 'squircle' | 'rim';

export type PaneMapOptions = {
  width: number;
  height: number;
  radius: number;
  /** Bezel as fraction of min side (0.18–0.40). */
  bezel: number;
  profile?: PaneProfile;
  /** Multiplier on encoded vectors before normalize. */
  gain?: number;
};

export type PaneMapResult = {
  url: string;
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

/** Inward depth from rounded-rect edge. */
function distToOuterEdge(
  px: number,
  py: number,
  w: number,
  h: number,
  r: number,
): number {
  const rr = Math.max(0.001, Math.min(r, w / 2, h / 2));
  const cx = clamp(px, rr, w - rr);
  const cy = clamp(py, rr, h - rr);
  const insideX = px > rr && px < w - rr;
  const insideY = py > rr && py < h - rr;
  if (insideX && insideY) {
    return Math.min(px, py, w - px, h - py);
  }
  const d = Math.hypot(px - cx, py - cy);
  if (d <= rr) return rr - d;
  return -(d - rr);
}

/**
 * Rim displacement magnitude.
 * Uses a glass-like falloff: max at outer lip, zero in flat center.
 * Shape inspired by Snell rim concentration, tuned to read on screen.
 */
function rimMagnitude(distNorm: number, profile: PaneProfile): number {
  if (distNorm >= 1) return 0;
  // distNorm 0 = edge, 1 = past bezel (flat)
  const t = clamp(distNorm, 0, 1);
  // Power curves put energy in the outer band
  if (profile === 'convex') {
    // smooth dome: stronger mid-bezel
    return Math.sin((1 - t) * Math.PI * 0.5) ** 1.2 * (1 - smootherstep(t));
  }
  if (profile === 'squircle') {
    return (1 - t) ** 1.6 * (1 - t * t);
  }
  // rim: sharp lip, clear center
  return (1 - t) ** 1.15 * (1 - smootherstep(t * 0.92));
}

function cacheKey(opts: PaneMapOptions): string {
  return [
    Math.round(opts.width),
    Math.round(opts.height),
    Math.round(opts.radius),
    (opts.bezel * 1000).toFixed(0),
    opts.profile ?? 'rim',
    (opts.gain ?? 1).toFixed(2),
  ].join('x');
}

export function buildPaneMap(options: PaneMapOptions): PaneMapResult {
  const key = cacheKey(options);
  const hit = mapCache.get(key);
  if (hit) return hit;

  const width = Math.max(32, Math.round(options.width));
  const height = Math.max(32, Math.round(options.height));
  const radius = Math.max(0, options.radius);
  const profile = options.profile ?? 'rim';
  const gain = options.gain ?? 1.75;
  const minSide = Math.min(width, height);
  // Bezel must be wide enough for a visible lip on small surfaces
  const bezelPx = clamp(options.bezel, 0.14, 0.45) * minSide;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    const url = URL.createObjectURL(new Blob());
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
  const vectors = new Float32Array(width * height * 2);
  let maxMag = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 2;
      const depth = distToOuterEdge(x + 0.5, y + 0.5, width, height, radius);

      if (depth < 0) {
        vectors[i] = 0;
        vectors[i + 1] = 0;
        continue;
      }

      const distNorm = clamp(depth / bezelPx, 0, 1);
      const mag = rimMagnitude(distNorm, profile) * bezelPx * gain;

      // Inward normal from depth gradient
      const e = 1;
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

      // Convex glass: backdrop pulls toward center along inward normal
      const vx = -gx * mag;
      const vy = -gy * mag;
      vectors[i] = vx;
      vectors[i + 1] = vy;
      const m = Math.hypot(vx, vy);
      if (m > maxMag) maxMag = m;
    }
  }

  if (maxMag < 0.0001) maxMag = 1;

  // Encode full channel range so feDisplacementMap scale is meaningful
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vi = (y * width + x) * 2;
      const pi = (y * width + x) * 4;
      const vx = vectors[vi] / maxMag;
      const vy = vectors[vi + 1] / maxMag;
      data[pi] = clamp(Math.round(128 + vx * 127), 0, 255);
      data[pi + 1] = clamp(Math.round(128 + vy * 127), 0, 255);
      // Blue = rim energy (debug / specular helper)
      data[pi + 2] = clamp(
        Math.round((Math.hypot(vectors[vi], vectors[vi + 1]) / maxMag) * 255),
        0,
        255,
      );
      data[pi + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1] ?? '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'image/png' });
  const url = URL.createObjectURL(blob);

  // Display scale in px — strong enough to read on real UI
  const displayScale = clamp(maxMag * 1.25, 40, 96);

  const result: PaneMapResult = {
    url,
    scale: displayScale,
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

export const PANE_PRESETS = {
  sheet: {
    width: 720,
    height: 128,
    radius: 0,
    bezel: 0.3,
    profile: 'rim' as PaneProfile,
    gain: 1.8,
  },
  card: {
    width: 400,
    height: 240,
    radius: 16,
    bezel: 0.3,
    profile: 'rim' as PaneProfile,
    gain: 1.85,
  },
  chip: {
    width: 200,
    height: 64,
    radius: 32,
    bezel: 0.36,
    profile: 'rim' as PaneProfile,
    gain: 1.7,
  },
  lens: {
    width: 360,
    height: 180,
    radius: 32,
    bezel: 0.34,
    profile: 'rim' as PaneProfile,
    gain: 2.0,
  },
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
