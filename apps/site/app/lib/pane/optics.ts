/**
 * Pane optics — edge refraction displacement maps.
 *
 * feDisplacementMap: R=X, G=Y, 128=neutral.
 * Center stays neutral; rim carries full-swing offsets so the lip bends structure.
 */

export type PaneProfile = 'rim' | 'convex' | 'squircle';

export type PaneMapOptions = {
  width: number;
  height: number;
  radius: number;
  bezel?: number;
  profile?: PaneProfile;
  gain?: number;
};

export type PaneMapResult = {
  url: string;
  /** Pixel scale for feDisplacementMap (userSpaceOnUse) */
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
  if (px > rr && px < w - rr && py > rr && py < h - rr) {
    return Math.min(px, py, w - px, h - py);
  }
  const d = Math.hypot(px - cx, py - cy);
  return d <= rr ? rr - d : -(d - rr);
}

/** Rim energy 1 at outer lip → 0 past bezel. */
function rimWeight(distNorm: number, profile: PaneProfile): number {
  if (distNorm >= 1) return 0;
  const t = clamp(distNorm, 0, 1);
  if (profile === 'convex') {
    return Math.sin((1 - t) * Math.PI * 0.5) ** 1.1 * (1 - smootherstep(t));
  }
  if (profile === 'squircle') {
    return (1 - t) ** 1.45 * (1 - t * t);
  }
  // rim: hard lip, clear flat
  return (1 - t) ** 0.95 * (1 - smootherstep(t * 0.88));
}

function cacheKey(o: PaneMapOptions): string {
  return [
    Math.round(o.width),
    Math.round(o.height),
    Math.round(o.radius),
    ((o.bezel ?? 0.32) * 1000).toFixed(0),
    o.profile ?? 'rim',
    (o.gain ?? 1).toFixed(2),
  ].join('x');
}

export function buildPaneMap(options: PaneMapOptions): PaneMapResult {
  const key = cacheKey(options);
  const hit = mapCache.get(key);
  if (hit) return hit;

  const width = Math.max(48, Math.round(options.width));
  const height = Math.max(48, Math.round(options.height));
  const radius = Math.max(0, options.radius);
  const profile = options.profile ?? 'rim';
  const gain = options.gain ?? 2.2;
  const minSide = Math.min(width, height);
  const bezelPx = clamp(options.bezel ?? 0.32, 0.16, 0.48) * minSide;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    const url = URL.createObjectURL(new Blob());
    const empty: PaneMapResult = {
      url,
      scale: 0,
      width,
      height,
      revoke: () => {
        URL.revokeObjectURL(url);
        mapCache.delete(key);
      },
    };
    mapCache.set(key, empty);
    return empty;
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
      const mag = rimWeight(distNorm, profile) * bezelPx * gain;

      const e = 1;
      let gx =
        distToOuterEdge(x + 0.5 + e, y + 0.5, width, height, radius) -
        distToOuterEdge(x + 0.5 - e, y + 0.5, width, height, radius);
      let gy =
        distToOuterEdge(x + 0.5, y + 0.5 + e, width, height, radius) -
        distToOuterEdge(x + 0.5, y + 0.5 - e, width, height, radius);
      const glen = Math.hypot(gx, gy) || 1;
      gx /= glen;
      gy /= glen;

      // Inward refraction (convex glass)
      const vx = -gx * mag;
      const vy = -gy * mag;
      vectors[i] = vx;
      vectors[i + 1] = vy;
      maxMag = Math.max(maxMag, Math.hypot(vx, vy));
    }
  }

  if (maxMag < 1e-4) maxMag = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vi = (y * width + x) * 2;
      const pi = (y * width + x) * 4;
      const vx = vectors[vi] / maxMag;
      const vy = vectors[vi + 1] / maxMag;
      data[pi] = clamp(Math.round(128 + vx * 127), 0, 255);
      data[pi + 1] = clamp(Math.round(128 + vy * 127), 0, 255);
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
  const url = URL.createObjectURL(new Blob([arr], { type: 'image/png' }));

  // Pixel displacement — high enough for geometric lip, not mush
  const scale = clamp(maxMag * 1.1, 55, 140);

  const result: PaneMapResult = {
    url,
    scale,
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

/** Static fallbacks when element size is unknown. */
export const PANE_PRESETS = {
  sheet: { width: 800, height: 96, radius: 0, bezel: 0.34, profile: 'rim' as PaneProfile, gain: 2.0 },
  card: { width: 360, height: 200, radius: 16, bezel: 0.32, profile: 'rim' as PaneProfile, gain: 2.1 },
  chip: { width: 200, height: 48, radius: 24, bezel: 0.4, profile: 'rim' as PaneProfile, gain: 1.9 },
  lens: { width: 300, height: 140, radius: 28, bezel: 0.36, profile: 'rim' as PaneProfile, gain: 2.4 },
} as const;

export function clearPaneMapCache() {
  for (const e of mapCache.values()) {
    try {
      e.revoke();
    } catch {
      // ignore
    }
  }
  mapCache.clear();
}
