/**
 * Pane optics — true-glass displacement field.
 *
 * The map encodes rim refraction: center stays near-neutral (128,128),
 * edges carry strong RG offsets so feDisplacementMap bends the backdrop.
 * Without visible bend at the rim, this is frost — not glass.
 */

export type PaneProfile = 'convex' | 'squircle' | 'lip' | 'rim';

export type PaneMapOptions = {
  width: number;
  height: number;
  radius: number;
  /** Bezel width as fraction of min(side). Wider = more visible rim glass. */
  bezel: number;
  profile?: PaneProfile;
  ior?: number;
  /** Amplifies encoded vector magnitudes before normalize (visual gain). */
  gain?: number;
};

export type PaneMapResult = {
  url: string;
  /** Suggested feDisplacementMap scale in px */
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

/** Height profile: 0 at outer edge, 1 at flat center. */
function surfaceHeight(x: number, profile: PaneProfile): number {
  const t = clamp(x, 0, 1);
  const convex = Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
  const squircle = (1 - (1 - t) ** 4) ** 0.25;
  if (profile === 'convex') return convex;
  if (profile === 'lip') {
    const concave = 1 - squircle;
    return convex * (1 - smootherstep(t)) + concave * smootherstep(t);
  }
  if (profile === 'rim') {
    // Steep near edge, flat center — maximum readable rim bend
    return 1 - (1 - t) ** 2.4;
  }
  return squircle;
}

/**
 * Snell bend magnitude from surface slope.
 * kube simplification: view ray orthogonal to background plane.
 */
function bendFromDistance(distNorm: number, profile: PaneProfile, ior: number): number {
  if (distNorm >= 1) return 0;
  const delta = 0.0015;
  const y1 = surfaceHeight(distNorm - delta, profile);
  const y2 = surfaceHeight(distNorm + delta, profile);
  const slope = Math.abs((y2 - y1) / (2 * delta));
  const thetaI = Math.atan(slope);
  const sinT = Math.sin(thetaI) / ior;
  if (sinT >= 1) return Math.sin(thetaI); // cap near TIR
  const thetaT = Math.asin(sinT);
  return Math.sin(thetaI - thetaT);
}

/** Inward depth from rounded-rect edge (0 on edge, >0 inside, <0 outside). */
function distToOuterEdge(
  px: number,
  py: number,
  w: number,
  h: number,
  r: number,
): number {
  const rr = Math.min(r, w / 2, h / 2);
  const cx = clamp(px, rr, w - rr);
  const cy = clamp(py, rr, h - rr);
  const insideX = px > rr && px < w - rr;
  const insideY = py > rr && py < h - rr;
  if (insideX && insideY) {
    return Math.min(px, py, w - px, h - py);
  }
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d <= rr) return rr - d;
  return -(d - rr);
}

function cacheKey(opts: PaneMapOptions): string {
  const p = opts.profile ?? 'rim';
  const ior = opts.ior ?? 1.5;
  const gain = opts.gain ?? 1;
  return [
    Math.round(opts.width),
    Math.round(opts.height),
    Math.round(opts.radius),
    (opts.bezel * 1000).toFixed(0),
    p,
    ior.toFixed(2),
    gain.toFixed(2),
  ].join('x');
}

/**
 * Build RG displacement map.
 * R = X, G = Y, 128 = neutral. B = rim energy (debug / specular helper).
 */
export function buildPaneMap(options: PaneMapOptions): PaneMapResult {
  const key = cacheKey(options);
  const hit = mapCache.get(key);
  if (hit) return hit;

  const width = Math.max(16, Math.round(options.width));
  const height = Math.max(16, Math.round(options.height));
  const radius = Math.max(0, options.radius);
  const profile = options.profile ?? 'rim';
  const ior = options.ior ?? 1.5;
  const gain = options.gain ?? 1.35;
  const minSide = Math.min(width, height);
  const bezelPx = clamp(options.bezel, 0.06, 0.42) * minSide;

  const htmlCanvas = document.createElement('canvas');
  htmlCanvas.width = width;
  htmlCanvas.height = height;
  const ctx = htmlCanvas.getContext('2d', { willReadFrequently: true });

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
      // Peak bend just inside the edge, fall to zero at flat center
      const edgeWeight = 1 - smootherstep(distNorm);
      const bend = bendFromDistance(distNorm, profile, ior) * edgeWeight;

      // Gradient of depth field → inward normal
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

      // Convex glass: refract backdrop toward center along inward normal
      const mag = bend * bezelPx * gain;
      const vx = -gx * mag;
      const vy = -gy * mag;
      vectors[i] = vx;
      vectors[i + 1] = vy;
      const m = Math.hypot(vx, vy);
      if (m > maxMag) maxMag = m;
    }
  }

  // Ensure the map uses full channel range so feDisplacementMap scale means something
  if (maxMag < 0.0001) maxMag = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vi = (y * width + x) * 2;
      const pi = (y * width + x) * 4;
      const vx = vectors[vi] / maxMag;
      const vy = vectors[vi + 1] / maxMag;
      data[pi] = clamp(Math.round(128 + vx * 127), 0, 255);
      data[pi + 1] = clamp(Math.round(128 + vy * 127), 0, 255);
      const edge = Math.hypot(vectors[vi], vectors[vi + 1]) / maxMag;
      data[pi + 2] = clamp(Math.round(edge * 255), 0, 255);
      data[pi + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const dataUrl = htmlCanvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1] ?? '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'image/png' });
  const url = URL.createObjectURL(blob);

  // Display scale: enough px of bend to read on real UI sizes
  const displayScale = clamp(maxMag * 1.15, 28, 72);

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

/** Presets — wide bezels + rim profile so bend is not a rumor. */
export const PANE_PRESETS = {
  sheet: {
    width: 640,
    height: 120,
    radius: 0,
    bezel: 0.28,
    profile: 'rim' as PaneProfile,
    gain: 1.5,
  },
  card: {
    width: 360,
    height: 220,
    radius: 16,
    bezel: 0.26,
    profile: 'rim' as PaneProfile,
    gain: 1.45,
  },
  chip: {
    width: 180,
    height: 56,
    radius: 28,
    bezel: 0.34,
    profile: 'rim' as PaneProfile,
    gain: 1.4,
  },
  lens: {
    width: 320,
    height: 160,
    radius: 32,
    bezel: 0.32,
    profile: 'rim' as PaneProfile,
    gain: 1.6,
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
